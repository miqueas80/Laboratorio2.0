Local engine dependencies (no CDN or hosted inference at runtime):

- vosk-browser 0.0.8, Apache-2.0. JavaScript bundle includes its WASM worker.
  https://github.com/ccoreilly/vosk-browser
  https://registry.npmjs.org/vosk-browser/-/vosk-browser-0.0.8.tgz
- vosk-model-small-es-0.42, Apache-2.0, AC Technologies LLC.
  https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip
  Repackaged as USTAR inside gzip; weights unchanged. PAX tar archives failed in the browser extractor.
  License text: `v1/voice/VOSK-LICENSE`.
- ONNX Runtime Web 1.22.0, MIT, Microsoft. License: `v1/vision/ORT-LICENSE`.
  https://github.com/microsoft/onnxruntime/tree/v1.22.0
- MobileCLIP-S0, Apple, converted ONNX weights from Xenova/mobileclip_s0,
  immutable revision `757d59c9c6870a76a4b0306f05f5061bca15c39f`.
  https://huggingface.co/Xenova/mobileclip_s0/tree/757d59c9c6870a76a4b0306f05f5061bca15c39f
  Original model license retained in `v1/vision/MOBILECLIP-LICENSE`.
  https://github.com/apple/ml-mobileclip

Only the FP32 image encoder runs on the phone. Text embeddings for 35 laboratory
categories and five rejection categories are computed at build time using the
matching text encoder. Cosine similarity is not an accuracy percentage. This is
zero-shot classification of one centered object, not a trained object detector.
No multi-object bounding boxes, OCR or GHS classifier are included in this release.

No production inventory record or document was used as a fabricated training image.
Visual references are created explicitly by the user in a separate IndexedDB database.
