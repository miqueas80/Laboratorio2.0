"""Build only: ONNX text embeddings. No text model is shipped to the phone.
Usage: python scripts/build-visual-prototypes.py /path/to/pinned/model/files
Requires onnxruntime==1.22.0, tokenizers==0.21.4, numpy.
"""
import sys, json, pathlib, hashlib
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

root = pathlib.Path(__file__).resolve().parents[1]
source = pathlib.Path(sys.argv[1])
categories = json.loads((root / 'offline/lab-categories.json').read_text())
tokenizer = Tokenizer.from_file(str(source / 'tokenizer.json'))
tokenizer.enable_padding(length=77, pad_id=0)
tokenizer.enable_truncation(max_length=77)
options = ort.SessionOptions()
options.intra_op_num_threads = 2
session = ort.InferenceSession(str(source / 'text_model.onnx'), options, providers=['CPUExecutionProvider'])
for item in categories:
    prompts = [f'A photo of {item["en"]}.', f'A close-up photo of {item["en"]}.', f'A photo of {item["en"]} on a laboratory table.']
    tokens = tokenizer.encode_batch(prompts)
    feeds = {'input_ids': np.array([t.ids for t in tokens], dtype=np.int64)}
    if any(i.name == 'attention_mask' for i in session.get_inputs()):
        feeds['attention_mask'] = np.array([t.attention_mask for t in tokens], dtype=np.int64)
    vectors = session.run(None, feeds)[0]
    vectors /= np.linalg.norm(vectors, axis=-1, keepdims=True)
    vector = vectors.mean(axis=0)
    vector /= np.linalg.norm(vector)
    item['embedding'] = np.round(vector, 7).tolist()
payload = {'model': 'MobileCLIP-S0', 'revision': '757d59c9c6870a76a4b0306f05f5061bca15c39f', 'textEncoderSHA256': hashlib.sha256((source/'text_model.onnx').read_bytes()).hexdigest(), 'dimension': 512, 'classes': categories}
(root / 'offline/v1/vision/prototypes.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')))
print(f'{len(categories)} prototypes generated; {sum(not x.get("reject", False) for x in categories)} laboratory categories')
