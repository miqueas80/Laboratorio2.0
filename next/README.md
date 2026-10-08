# NEXUS-X Edge · Arquitectura experimental (PR #4)

**Proyecto productivo preservado.** Esta rama no altera `main`, `app.js`,
`sw.js`, los 111 registros ni los seis documentos originales. Los módulos
`next/` se ejecutan por decisión explícita desde `next/demo.html` en un
servidor que sirva ESTA rama, no desde la URL de producción actual.

## Qué se implementó

- **BM25 + HNSW**: `search-core.js`, `hnsw.js`, `search-worker.js` y
  `search-client.js`; la búsqueda vectorial usa embeddings reales solo si
  el llamador los proporciona y comprueba las dimensiones.
- **Fabric con evidencia**: `document-fabric.js`, `document-source.js`,
  `fabric-client.js`, `semantic-fabric.js`; consulta en solo lectura los
  documentos ya indexados por NEXUS, conserva nombres, rutas y fragmentos,
  y no inventa citas científicas.
- **Embeddings multilingües opcionales**: `embedding-worker.js`,
  `embedding-client.js`, `model-provisioner.js`, `semantic-sw.js`.
  Usan `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (384 dimensiones)
  con ONNX cuantizado q8. Todos los archivos deben quedar locales; la
  inferencia deshabilita cualquier descarga remota.
- **Virtualización y métricas**: `virtual-list.js`, `benchmarks.js`;
  pruebas sintéticas de 100.001 ítems y mediciones FPS vía rAF, sin
  afirmar que el equipo alcanzó 60 FPS o menos de 80 MB.
- **Datos separados**: `storage.js` (IndexedDB experimental, operaciones
  atómicas, OPFS y migración copy-only) y `dexie-adapter.js` (adaptador
  aislado para Dexie.js inyectado por la aplicación hospedadora).
- **Seguridad química**: `chemical-engine.js` valida checksum CAS,
  metadatos GHS y algunas reglas de segregación ÚNICAMENTE con una SDS
  de procedencia explícita. No certifica el almacenamiento.
- **Agente**: `agent-dag.js` y `inspection-dag.js` preparan pasos,
  validan dependencias y escriben el calendario experimental mediante
  una transacción única si hay confirmación. No hacen rollback de efectos
  físicos, interfaces o servicios externos.
- **P2P opcional**: `sync-core.js`, `sync-controller.js`,
  `p2p-crypto.js`, `manual-webrtc.js`: CRDT tipo registro LWW,
  diario durable, señalización manual sin servidor, canal cifrado
  y código de verificación comparado entre operadores. **No es Yjs
  ni Automerge; aún falta resolver colecciones colaborativas complejas.**
- **Visión y voz**: `lens-preprocess-worker.js` y `voice-guard.js`
  son módulos optativos; la detección por energía NO es un wake-word
  entrenado y no sustituye Vosk.
- **Telemetría**: `telemetry.js` limita y sanea los eventos locales.

## Preparación de un modelo multilingüe, sin obligar a la expo a descargarlo

La PWA operativa funciona sin estos recursos extra. La instalación ES opcional
y requiere consentimiento explícito. Los pesos ONNX cuantizados pesan
aproximadamente 118 MB y el tokenizer unos 17 MB: más runtime y CacheStorage
incrementan mucho el espacio exigido, por lo que **no se autoinstalan**.

**En un Codespace o entorno de compilación y solo en la rama experimental:**

1. Instalar localmente la versión auditada y fija:
   `npm install --no-save --ignore-scripts @huggingface/transformers@3.8.1`
2. Copiar la biblioteca y su runtime ONNX matching:
   `node scripts/vendor-edge-transformers.mjs`
3. Servir esta rama en una web HTTPS o `localhost`. Para publicarla
   definitivamente hay que incluir `next/vendor/` en la distribución;
   hoy **no** se incluyó en el repositorio de producción.
4. Abrir `next/demo.html`, comprobar recursos y elegir conscientemente
   «Preparar modelo multilingüe». El instalador descarga archivos desde
   Hugging Face únicamente esa vez y verifica SHA-256 de los dos ficheros
   más grandes. `next/semantic-sw.js` sirve los archivos cacheados
   bajo el mismo origen después de que la pestaña quede controlada.
5. Recargar, comprobar `installed` y activar búsqueda híbrida de documentos.

**Importante:** `next/vendor` no forma parte de esta PR; no se ha realizado
ninguna inferencia real del modelo en Android. Al publicar los archivos del
runtime deben auditarse la licencia y los checksums. En caso de falta de
memoria o cuotas, no instales el modelo: el Fabric continúa por BM25.
GitHub impide incluir el archivo individual de pesos de ~118 MB
directamente en un commit normal.

## Verificar

- `npm test`: regresiones existentes y tests nuevos
  (`next-edge.test.mjs`, `next-edge-advanced.test.mjs`,
  `next-fabric.test.mjs`, `next-resilience.test.mjs`).
- `node --check` en todos los módulos de `next/`, obligatorio en CI.
- `next/demo.html` desde un servidor local para probar BM25, 100.001
  registros sintéticos, virtualización, FPS, documentos, DAG y WebRTC.
- Pruebas físicas entre DOS equipos Android en una misma Wi-Fi, modo avión
  y reinicio de aplicación; el código WebRTC no puede garantizar conexión
  cuando la red bloquea candidatos ICE locales o mDNS.

## Pendientes que no se deben confundir con funciones ya validadas

1. Publicar la distribución del runtime local Transformers.js y probar
   **embeddings efectivos** es-AR + consultas sobre los seis documentos.
2. Calibración científica de rankings, evaluación de precisión de HNSW
   y benchmark real de 100k, objetivo 60 FPS / menos de 80 MB.
3. Migración productiva con Dexie + backups, manejo de cuotas y política OPFS.
4. Validar en persona las incompatibilidades de almacenamiento con fichas
   SDS legítimas y aprobación del responsable de seguridad.
5. Integración transaccional del DAG en el Action Registry real, sin
   convertir herramientas externas en falsas operaciones atómicas.
6. Motor Yjs/Automerge de colaboración por campo/colección y políticas de
   autenticación de laboratorios; actualmente solo LWW verificado.
7. Keyword spotter entrenado, barge-in de TTS con control de eco y mejoras
   de precisión de Lens sin QR.
8. Revisión profesional de seguridad del Cloudflare Gateway, cuyo despliegue
   es independiente del GitHub Pages frontend.

**No fusionar ni activar esta rama por tener CI verde.** Requiere respaldo
verificado, ensayos Android y decisión de publicación después de la expo.


## Resultados medidos en CI del 8 de octubre de 2026

- `NEXUS Voice V2 regression`: 176/176 pruebas aprobadas después de la
  reestructuración del caché semántico y del índice BM25.
- `NEXUS Edge local embedding runtime`: se instaló realmente la dependencia
  fija `@huggingface/transformers@3.8.1`, se copiaron sus archivos ONNX WASM
  locales y la importación ESM pasó. Artefacto temporal del runtime:
  https://github.com/miqueas80/Laboratorio2.0/actions/runs/37836106369
  (retención de 3 días, requiere acceso al repositorio).
- `NEXUS Edge 100k desktop benchmark`: 100.001 filas sintéticas,
  construcción BM25 545 ms, memoria incremental 51,30 MiB, heap de Node
  78,08 MiB, RSS total 150,76 MiB, latencia de consulta p95 16,75 ms.
  https://github.com/miqueas80/Laboratorio2.0/actions/runs/37836674104
  **Estos resultados son de Node en Linux, NO son medidas de Android ni de
  60 FPS.** El total RSS sigue por encima de 80 MiB.
- `next/model-provisioner.js` exige SHA-256 de `tokenizer.json` y del ONNX
  cuantizado incluso para los hits previos de caché, valida sintácticamente
  los metadatos JSON y solo después escribe un recibo de instalación final.
  `semantic-sw.js` no sirve modelos sin dicho recibo.
- `NEXUS Edge real Spanish embedding inference`: workflow independiente
  para cargar el ONNX real y validar tres textos en un Chromium con peticiones
  remotas bloqueadas. No debe declararse completo salvo que el workflow quede
  en verde; una importación ESM aislada no demuestra inferencia.

Para probar el laboratorio desde un Codespace sin alterar la expo:
`git checkout feature/nexus-x-edge-architecture-v1`, preparar y copiar el
runtime según la sección anterior, servir con `python3 -m http.server 4173`
y acceder a `http://localhost:4173/next/demo.html` desde ese entorno.
Si se quiere usar Service Worker, acceder por `localhost` o HTTPS.


## Verificación real: Web Worker, RAG e Internet desactivado

GitHub Actions ejecutó un navegador Chromium real, cargó el modelo cuantizado
de 118 MB con ONNX/WASM, generó 384 dimensiones y buscó mediante BM25/HNSW
el archivo correcto a partir de una pregunta en español:

https://github.com/miqueas80/Laboratorio2.0/actions/runs/37837465076

Después, el navegador almacenó la interfaz y el runtime experimental
en su propio Service Worker, preparó cinco archivos del modelo, cortó
la red, **recargó la página** y generó otra representación vectorial
sin Internet (resultado `browserOffline.success: true`):

https://github.com/miqueas80/Laboratorio2.0/actions/runs/37837966140

La función `prepareOfflineShell({includeInventory:true})` agrega una
copia canónica de solo lectura de `inventory.json` bajo el scope `next/`
para que el inventario experimental no dependa del SW de producción.
La copia se valida contra 111 IDs únicos y no sustituye al inventario
original. El laboratorio experimental intenta primero leer el
inventario original al estar online y, si no está disponible, usa
el snapshot cacheado. Los documentos permanecen en IndexedDB de origen.

**El prototipo completo sigue pendiente de validación física Android y
de sincronización P2P real entre dos teléfonos; los ensayos anteriores
solo verifican Chromium de escritorio.**
