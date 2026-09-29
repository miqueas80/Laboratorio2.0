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

NEXUS LENS no carga Tesseract ni un motor OCR separado. La percepción sigue un
flujo local-first: código NEXUS/QR y contexto local primero; si no existe una
identificación exacta y el usuario habilitó Internet, una única captura puede
analizarse mediante el proveedor visual multimodal configurado. El texto visible,
las fórmulas, los pictogramas y otros rasgos se interpretan dentro de ese mismo
análisis visual, no como una función OCR independiente.

## Proveedor visual de NEXUS LENS

Lens procesa la cámara localmente y envía una única captura sólo cuando no hay
una identificación local exacta, Internet está habilitado y existe un proveedor
configurado. La opción actual `gemini-byok` reutiliza exclusivamente la clave
personal ingresada por el usuario en Ajustes; el repositorio no contiene claves.

Para una instalación institucional con una clave privada del servidor debe
configurarse en tiempo de ejecución `window.NEXUS_CONFIG.lensVisionProxy` con
la URL HTTPS de un proxy autenticado. Ese proxy conserva el secreto fuera de
GitHub Pages y debe aceptar `{task, image, context}` y devolver
`{analysis, model}`. No se admite incluir credenciales en la URL. Las imágenes
no se guardan en caché: sólo se cachea durante 30 minutos el resultado derivado
asociado a su huella.
