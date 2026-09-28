# Lectores locales

Se conservan las bibliotecas utilizadas por la aplicación, servidas ahora
desde el mismo repositorio. No son dependencias del arranque del inventario.

| Biblioteca | Versión | Fuente |
|---|---|---|
| PDF.js (legacy build) | 4.10.38 | paquete oficial npm `pdfjs-dist@4.10.38` |
| JSZip | 3.10.1 | paquete oficial npm `jszip@3.10.1` |
| jsQR | 1.4.0 | paquete oficial npm `jsqr@1.4.0` |
| SheetJS | 0.20.3 | https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js |

Licencias adjuntas; `checksums.json` fija SHA-256 de archivos recibidos.
PDF.js 3.11.174 se reemplaza por una versión posterior al parche de
GHSA-wgrm-67xf-hhpq. Además se usa `isEvalSupported:false` en cada apertura.
Referencia: https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq

OCR Tesseract sigue siendo opcional, con descarga externa a demanda. No se
incluyen sus modelos de idioma como requisito del núcleo.
