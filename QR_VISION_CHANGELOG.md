# NEXUS-X — QR + Visión/OCR R2

## Correcciones

- QR y Visión/OCR usan estados de cámara independientes.
- El escáner QR ya no comparte el flujo OCR.
- La detección QR usa `BarcodeDetector` cuando está disponible y `jsQR` como respaldo, incluso si `BarcodeDetector` existe pero no encuentra el código.
- El escaneo de vídeo ejecuta `jsQR` sobre fotogramas de cámara para mejorar compatibilidad con webcams de escritorio.
- Al detectar un QR, `processQr()` detiene inmediatamente todas las pistas de la cámara y limpia `video.srcObject` antes de presentar el resultado.
- El resultado QR no guarda ni muestra una captura del código.
- Se creó el módulo independiente `Visión NEXUS-X`.
- La cámara de Visión requiere permiso explícito y mantiene su propio `MediaStream`.
- OCR, imagen y PDF quedaron dentro del módulo Visión.
- El agente NEXUS-X puede abrir, iniciar, detener y analizar el módulo de Visión.
- `analyze_camera` quedó dirigido al módulo Visión para evitar que el OCR vuelva a interferir con el escáner QR.
- Se incrementó la versión del caché del Service Worker para evitar que GitHub Pages conserve la aplicación anterior.

## Verificación

- `node --check app.js`: OK
- `node validate.mjs`: OK
- `node agent-regression.mjs`: OK
- `node final-audit.mjs`: 24/24 OK
- `node qr-vision-regression.mjs`: 23/23 OK
- Inventario: 111 registros, 111 IDs únicos y canónicos.

Las pruebas automáticas no sustituyen una prueba física con una webcam/micrófono reales y los permisos del navegador.
