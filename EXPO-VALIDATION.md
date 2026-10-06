# Expo: validación pendiente en Android

Base de la rama: `28de9c24d9b3b1a15d0ba4c59f382f7a044ccf73`. Main, inventario y documentos productivos intactos.

## Automatizado — 2026-10-06

- PASS: 86 tests Node (73 generales + 13 Lens); regresión del agente, 37 acciones y 36 tools.
- PASS Chromium 133: proceso cerrado y reabierto con perfil persistente y red deshabilitada; shell, 111 registros, seis documentos IndexedDB y caché de modelos.
- PASS inferencia WASM real: fotografías independientes de Erlenmeyer y vaso, sin QR; hipótesis, no identidad química confirmada.
- PASS jsQR real: `NEXUS-X-0001`, confirmado localmente, documentos relacionados y ficha habilitada.
- PASS Vosk real con audio sintético: «Nexus, abrí inventario y buscá ácido nítrico» → agente → búsqueda. Detener/reactivar también pasó.
- Fusión inventario/catálogo/documentos, degradación y xKiro opcional: pruebas aisladas. TTS/interrupción: simulados, no voz humana.

Repetición: `npm ci && npm test`. Dependencias de desarrollo, sin Node en producción.
Navegador: instalar Playwright sólo en el entorno de pruebas y ejecutar `npm run test:offline-browser`; admite `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` y `CHROMIUM_ARGS_JSON`.

## Preparar y probar el teléfono

1. Servir **esta rama** por HTTPS con todos sus archivos; la URL productiva sigue en main hasta una publicación autorizada.
2. Con Internet, abrir NEXUS, permitir almacenamiento persistente y esperar **6/6 documentos disponibles**.
3. En Ajustes, pulsar **Preparar voz offline** y **Preparar visión offline**; esperar los estados listos. Descarga local total de motores/modelos: 113,8 MB, además de documentos y shell.
4. Instalar/descargar una voz española local en los ajustes TTS de Android. Usar **Probar voz**; si no hay voz local instalada, NEXUS lo informa.
5. Activar modo avión, cerrar todas las ventanas de NEXUS y volver a abrir la PWA. Tocar **Activar una vez** para habilitar el micrófono.
6. Decir «Nexus, abrí inventario y buscá ácido nítrico». Verificar búsqueda y respuesta hablada; interrumpir con «Nexus» y repetir tras detener/reactivar.
7. En Lens, permitir cámara trasera y analizar un objeto centrado (Erlenmeyer/vaso), después un QR NEXUS. Verificar ficha y documentos offline.
8. Reactivar Internet: comprobar ampliación xKiro si está configurado, conservando el resultado local ante errores.

Pendiente físico: acento/ruido y micrófono, TTS, cámara/iluminación, latencia, memoria/temperatura y WebGPU. Sólo WASM fue ejecutado en este entorno. No se incluyen OCR/GHS ni detección multióbjeto. Dos categorías tienen evidencia fotográfica automatizada; las demás requieren validación. No borrar los datos del sitio después de prepararlo.
