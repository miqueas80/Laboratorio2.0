#!/usr/bin/env python3
"""Produce a READ-ONLY, provenance-checked search snapshot of the six original docs.
Requires pypdf==5.9.0 for PDF extraction. Never writes/updates source files.
No OCR or LLM; unreadable scanned PDF pages are explicitly reported as such.
"""
import argparse
import hashlib
import io
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "documents-manifest.json"
EXPECTED = {
    "Formación de óxidos.docx",
    "QUÍMICA (1) (1).pdf",
    "Sustancias_Lab. de CN_.xlsx",
    "Sustancias_Lab_BASE_NEXUS-X.docx",
    "Unidad 4 - Formulacion y nomenclatura.pdf",
    "Archivos/Copia_Reacciones de formación de compuestos inorgánicos -1.pdf",
}
MAX_FILE_CHARS = 650_000
MAX_TOTAL_CHARS = 2_500_000
NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
}

def sha_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def compact(text):
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", str(text))
    return text.replace("\r\n", "\n").replace("\r", "\n").strip()

def docx_text(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        xml = z.read("word/document.xml")
        if len(xml) > 18 * 1024 * 1024:
            raise ValueError("DOCX XML too large")
        root = ET.fromstring(xml)
        paragraphs = []
        for p in root.findall(".//w:p", NS):
            line = "".join((t.text or "") for t in p.findall(".//w:t", NS)).strip()
            if line: paragraphs.append(line)
        return "\n".join(paragraphs)

def xlsx_text(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        strings=[]
        if "xl/sharedStrings.xml" in z.namelist():
            xml=z.read("xl/sharedStrings.xml")
            if len(xml)>10*1024*1024: raise ValueError("Shared strings too large")
            root=ET.fromstring(xml)
            strings=["".join((t.text or "") for t in si.findall(".//m:t", NS))
                     for si in root.findall("m:si", NS)]
        parts=sorted(p for p in z.namelist()
                     if re.fullmatch(r"xl/worksheets/sheet\d+\.xml",p))
        lines=[];total=0
        for sheet in parts[:25]:
            xml=z.read(sheet)
            if len(xml)>16*1024*1024:raise ValueError("Spreadsheet XML too large")
            lines.append("HOJA: "+sheet.split("/")[-1])
            root=ET.fromstring(xml)
            for row in root.findall(".//m:sheetData/m:row",NS):
                values=[]
                for cell in row.findall("m:c",NS):
                    value=cell.find("m:v",NS)
                    if cell.get("t")=="inlineStr":
                        v="".join((t.text or "") for t in cell.findall(".//m:t",NS))
                    elif value is None:v=""
                    elif cell.get("t")=="s":
                        try:v=strings[int(value.text)]
                        except (IndexError,ValueError,TypeError):v=""
                    else:v=value.text or ""
                    if v.strip():values.append(v[:300])
                if values:
                    line=" | ".join(values)
                    total+=len(line)
                    if total>MAX_FILE_CHARS:break
                    lines.append(line)
            if total>MAX_FILE_CHARS:break
        return "\n".join(lines)

def pdf_text(data):
    from pypdf import PdfReader
    reader=PdfReader(io.BytesIO(data),strict=False)
    if reader.is_encrypted:
        try:reader.decrypt("")
        except Exception:raise ValueError("Encrypted PDF")
    lines=[];total=0
    for number,page in enumerate(reader.pages[:180],1):
        try:content=page.extract_text() or ""
        except Exception:content=""
        content=compact(content)
        if content:
            lines.append(f"PÁGINA {number}\n{content}")
            total+=len(content)
        if total>MAX_FILE_CHARS:break
    return "\n\n".join(lines)

def run(out):
    manifest=json.loads(MANIFEST.read_text(encoding="utf-8"))
    specs=manifest.get("documents",[])
    if len(specs)!=6 or {entry.get("path") for entry in specs}!=EXPECTED:
        raise ValueError("Canonical six document manifest changed unexpectedly")
    documents=[]
    for entry in specs:
        path=entry["path"]
        source=(ROOT/path).resolve()
        if not source.is_file() or not source.is_relative_to(ROOT.resolve()):
            raise ValueError("Missing/unsafe document "+path)
        raw=source.read_bytes()
        if len(raw)!=entry["size"] or sha_blob(raw)!=entry["revision"]:
            raise ValueError("Original document provenance mismatch: "+path)
        try:
            if path.lower().endswith(".docx"):text=docx_text(raw)
            elif path.lower().endswith(".xlsx"):text=xlsx_text(raw)
            elif path.lower().endswith(".pdf"):text=pdf_text(raw)
            else:raise ValueError("Extension not supported")
            error=None
        except Exception as exc:
            text="";error=str(exc)[:160]
        text=compact(text)
        limit=min(MAX_FILE_CHARS,MAX_TOTAL_CHARS-sum(len(d["text"]) for d in documents))
        truncated=len(text)>limit
        text=text[:max(0,limit)]
        documents.append({
            "path":path,"name":path.split("/")[-1],
            "type":path.split(".")[-1].lower(),
            "sha256":hashlib.sha256(raw).hexdigest(),
            "blobRevision":entry["revision"],
            "originalBytes":len(raw),
            "text":text,
            "textCharacters":len(text),
            "extractionStatus":"error" if error else "no-text" if not text else "truncated" if truncated else "text",
            "extractionError":error
        })
    snapshot={"schema":"nexus-edge-canonical-documents-v1","version":1,
              "provenance":"Canonical Git blobs checked against documents-manifest.json",
              "documents":documents}
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(snapshot,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(json.dumps({"documents":len(documents),
        "indexedTextChars":sum(len(d["text"]) for d in documents),
        "entries":[{"path":d["path"],"chars":d["textCharacters"],
                    "status":d["extractionStatus"]} for d in documents],
        "output":str(out),"bytes":out.stat().st_size},ensure_ascii=False))
    if all(not d["text"] for d in documents):
        raise RuntimeError("No canonical document text was recoverable")

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--out",required=True)
    parser.add_argument("--copy-originals",help="Optional isolated distribution directory")
    args=parser.parse_args()
    run(pathlib.Path(args.out).resolve())
    if args.copy_originals:
        import shutil
        destination=pathlib.Path(args.copy_originals).resolve()
        destination.mkdir(parents=True,exist_ok=True)
        for relative in EXPECTED:
            target=destination/relative
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(ROOT/relative,target)
        shutil.copy2(MANIFEST,destination/"documents-manifest.json")
        print("Copied exactly six canonical binaries without modifying originals")
