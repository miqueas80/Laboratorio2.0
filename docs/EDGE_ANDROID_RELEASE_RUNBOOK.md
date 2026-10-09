# NEXUS-X Edge · cierre y aceptación en Android

**Estado:** release candidate EXPERIMENTAL. Esta guía no autoriza fusionar
a `main` ni reemplazar la versión de la exposición.

**Repositorio:** `miqueas80/Laboratorio2.0` · PR #4,
rama `feature/nexus-x-edge-architecture-v1`.

## 1. Obtener el paquete aislado

Abrí la última ejecución correcta de:

https://github.com/miqueas80/Laboratorio2.0/actions/workflows/edge-preview.yml

Descargá el artefacto `nexus-edge-isolated-android-preview`
(en GitHub Actions requiere acceso al repositorio). El archivo expira
después de cinco días.

Extraé su contenido a una carpeta de pruebas independiente.
**No lo copies encima de `main`, no borres IndexedDB, no limpies el
caché ni reemplaces la PWA de la exposición.**

## 2. Servirlo en un origen seguro

En una máquina o Codespace de pruebas:

```bash
cd /ruta/a/nexus-edge
python3 -m http.server 4173 --bind 0.0.0.0
```

Desde la misma máquina podés usar `http://localhost:4173/next/demo.html`.
Desde Android debés utilizar **HTTPS** (por ejemplo, el puerto
reenviado seguro de Codespaces) para que cámara, micrófono, IndexedDB,
OPFS y Service Workers estén habilitados. No publiques secretos.

**Nota:** el paquete es una aplicación web instalable (PWA),
no una APK. Instalá la PWA de prueba desde el menú de Chrome cuando
el navegador lo permita; la app estable tiene otra identidad.

## 3. Preparación offline con el operador presente

Dentro de `next/demo.html`:

1. Confirmá que el inventario contiene 111 registros, nunca 110 ni 112.
2. Elegí **Preparar Edge Lab para modo avión** y autorizá la copia de
   interfaz, inventario y seis documentos originales. El caché de
   cada archivo se compara con SHA-256. Al prepararlos, los binarios
   PDF, DOCX y XLSX quedan descargables offline.
3. Elegí **Preparar visión local** (MobileCLIP-S0, PP-OCRv6 y WASM)
   y **Preparar voz Vosk** por separado. Se requieren permisos
   explícitos y espacio suficiente; no se purga nada automáticamente.
4. El modelo semántico multilingüe de aproximadamente 140 MB
   es **opcional** y se instala conscientemente; BM25 funciona sin él.
5. Cerrá la PWA, activá el modo avión, abrila nuevamente sin red.

## 4. Pruebas físicas de aceptación

- **Inventario y documentos:** 111 IDs únicos y seis fuentes con texto
  indexado; buscar `formación de óxidos`, comprobar que la evidencia
  remite a `Formación de óxidos.docx`. Descargar offline
  `QUÍMICA (1) (1).pdf` y comprobar que abre el original.
- **QR físico:** leer `NEXUS-X-0001` con la cámara Android y
  comprobar estado confirmado por código exacto. Luego probar
  una imagen sin QR para impedir confirmaciones falsas.
- **Lens sin QR:** probar vaso, Erlenmeyer, probeta y microscopio
  y casos negativos (esmalte, cosmético, envase médico). Toda
  clasificación visual queda como hipótesis; no debe asignar
  composición, CAS ni concentración desde una fotografía.
- **Voz:** sin Internet, permitir micrófono y decir
  `Nexus, abrí inventario y buscá ácido nítrico`. Comprobar
  reconocimiento, acción y respuesta audible si hay voz TTS
  española local. Repetir con ruido y al cortar/reabrir la app.
- **Sincronización:** emparejar dos teléfonos en la misma red local,
  comparar el código de seis cifras por un canal fiable y verificar
  tareas Yjs concurrentes tras desconexión y reconexión.
  Los pares no deben poder modificar inventario sin autorización.
- **Rendimiento:** cargar los 100.001 registros sintéticos, tocar
  `Medir FPS desplazando inventario` y anotar promedio y p95.
  Para el criterio estricto se exige **promedio >= 60 FPS y
  p95 <= 16,67 ms**. Medir además la RAM TOTAL del navegador con
  una herramienta válida para Android: el uso de almacenamiento
  de CacheStorage no equivale a RAM.
- **Seguridad química:** cotejar las incompatibilidades con las
  SDS auténticas y una persona competente. Una sustancia con
  evidencia desconocida debe permanecer en `revisión requerida`.
- **Respaldo:** verificar recuperación de las 111 fichas y los seis
  originales desde copias de seguridad antes de considerar
  cualquier migración real.

## 5. Exportar la prueba de aceptación

En el panel **Control de aceptación · Android**, cargá las mediciones
obtenidas y marcá solamente las pruebas que realmente realizaste.
Pulsá `Evaluar condiciones reales` y exportá el JSON de auditoría.
El archivo contiene booleanos de evidencia y métricas agregadas:
**no contiene fotografías, audio, contenido químico, contraseñas,
claves API ni textos documentales**.

Si el estado es `NOT_READY`, la aplicación **NO está aceptada**
para sustituir producción. El código solo genera
`READY_FOR_HUMAN_RELEASE_REVIEW` cuando pasan las 14 condiciones;
esa etiqueta sigue necesitando aprobación humana final.

## 6. Volver atrás sin perder datos

Si una prueba falla:

1. Detener la escucha, cámara y sincronización experimental.
2. No fusionar PR #4 y no sobrescribir el repositorio principal.
3. Cerrar la PWA experimental. La versión estable
   https://miqueas80.github.io/Laboratorio2.0/
   continúa siendo la referencia.
4. Adjuntar el informe de aceptación **sin datos privados**
   al seguimiento de la PR para corregir únicamente el subsistema fallido.

### Cobertura ya verificada de manera automatizada

- QR NEXUS real con jsQR en Chromium.
- Vosk real y MobileCLIP/OCR real sobre WASM, con recarga sin red
  en Chromium.
- BM25 sobre los seis originales y sus 134 fragmentos recuperando
  evidencia después de reiniciar offline.
- Original PDF de 8.487.276 bytes recuperado desde CacheStorage
  y verificado por SHA-256.
- Pruebas Node, WebRTC cifrado y Yjs en dos pares virtuales.

**No verificado por estas pruebas:** cámara y micrófono físicos,
precisión de Lens y wake-word ambiental real, memoria total Android,
dos teléfonos reales, disponibilidad xKiro en la expo y auditoría
profesional SDS. Este límite es explícito y no debe presentarse como 100%.
