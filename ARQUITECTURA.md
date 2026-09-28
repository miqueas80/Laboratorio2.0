# NEXUS-X — arquitectura consolidada en la rama de trabajo

Estado: candidata local, pendiente de validación y publicación. Fuente:
`miqueas80/laboratorio`. No se creó una aplicación alternativa ni un backend.
La UI, los nueve módulos y los documentos maestros existentes se conservaron.
El estado de cierre está en [CONSOLIDACION.md](CONSOLIDACION.md).

## Arranque y estado

`index.html` carga `app.js`, que conserva su IIFE y servicios existentes.
`boot()` comparte una promesa, y `bind()` registra los eventos una sola vez.
Se configura UI → inventario local → documentos de IndexedDB → estado
READY/DEGRADED → Service Worker y sincronización opcionales. Una excepción
documental no impide abrir inventario. Gemini y OCR no participan del arranque.

`state.inventory` refleja el último inventario validado y guardado. El estado
por dominio sigue dentro de `state`: documentos, vista, QR, visión, búsqueda,
conexión externa habilitada, historial de agente y auditoría. `health` registra
fallos; `diagnosticSnapshot` conserva fecha y resultados de la comprobación.
Los eventos de Storage actualizan lecturas de otras pestañas sin pisar un
formulario abierto. BroadcastChannel, cuando está disponible, notifica cambios
documentales para releer IndexedDB. No hay sincronización entre dispositivos.

## Persistencia y recuperación

| Datos | Ubicación | Política |
|---|---|---|
| Inventario | LocalStorage `nexus_x_inventory_v1` | Fuente persistente; validación y escritura antes de publicar el resultado |
| Versión anterior | `nexus_x_inventory_recovery_v1` | Copia antes de editar, eliminar o reemplazar |
| Protección al restaurar | `nexus_x_before_restore_v1` | Conserva el estado previo incluso si falla el intercambio de copias |
| Documentos y originales | IndexedDB `NEXUS_X_DOCUMENTS_V2`, versión 3, store `documents`, keyPath `path` | Texto, chunks, relaciones, Blob y metadatos; transacción confirmada antes de informar guardado |
| Calendario | LocalStorage, clave existente `nexus_x_calendar_v1` | Fecha válida; confirmación humana antes de eliminar |
| Favoritos y consultas | Claves existentes `nexus_x_favorites_v1`, `nexus_x_queries_v1` | Fallos opcionales no detienen búsqueda; favoritos no cambian si no se guardan |
| Gemini | Sesión; opcional `nexus_gemini_api_key_v1` | No hay clave incrustada en el repositorio |
| Recursos de aplicación | CacheStorage | Shell por ámbito y versión; independiente de datos del usuario |

No se borra ninguna base existente ni se cambia su esquema. Al abrir una versión
anterior de IndexedDB sólo se crea el store si falta; no se recrean stores.
Un JSON de inventario corrupto permanece intacto; la base maestra sirve como
lectura y las escrituras quedan bloqueadas hasta recuperar explícitamente.
El inventario local vacío también es válido. `inventory.json` sólo inicializa
una instalación sin datos o atiende una restauración confirmada.

El control de versión de LocalStorage detecta escrituras previas de otra pestaña.
No equivale a una transacción entre pestañas: deben evitarse ediciones de
inventario simultáneas en varias pestañas. Documentos locales nuevos usan
`add`, no `put`, para que una colisión concurrente falle sin sobrescribir.
El usuario puede reintentar después de recargar el índice.

Ajustes → Recuperar copia anterior intercambia versiones sin borrar los datos
antes de protegerlos. Exportar inventario genera CSV; Exportar informe incluye
inventario completo, texto y metadatos documentales, pero no binarios. El visor
permite descargar el original. Las copias locales no sustituyen un respaldo
fuera del navegador. Limpiar datos del sitio, desinstalar o la política del
navegador pueden eliminar información; no hay servidor de respaldo.

## NEXUS IA y acciones

Texto y voz pasan por el resolver local y `ActionRegistry`. El registro conserva
35 acciones, parámetros, descripción, permisos, respuesta y errores posibles.
[ACCIONES.md](ACCIONES.md) enumera el contrato extraído del registro real.
`executeAssistantAction()` valida el plan completo antes de llamar a los
servicios internos, comprueba permisos y devuelve resultados observables.

- Orígenes admitidos: local, UI y voz. El origen remoto no puede ejecutar acciones.
- Tipos, enumeraciones, campos requeridos y campos desconocidos se validan.
- Secuencias: máximo ocho pasos por secuencia, profundidad limitada, orden
  determinista y detención al primer fallo.
- Borrar requiere intención explícita, objetivo inequívoco y confirmación
  humana. El campo `confirm:true` no sustituye al diálogo del navegador.
- No se usa `eval` ni `new Function` sobre salidas de modelos.
- El agente invoca servicios existentes; no genera selectores ni código DOM.
  Los renderizadores internos de la aplicación actualizan la UI.

Son órdenes locales comprobadas “Nexus, abre inventario”, “Nexus, busca ácido
nítrico” y “Nexus, muéstrame documentos sobre átomos”. No se presenta un modelo
lingüístico local inexistente: el resolver es determinista y el conocimiento
proviene de inventario y documentos. Consultas desconocidas reciben orientación;
las ambiguas no abren ni eliminan arbitrariamente una ficha.

## Búsqueda local

Normaliza acentos y mayúsculas, omite términos funcionales frecuentes, tolera
parciales y una reducción sencilla de plurales. El ranking prioriza ID, nombre,
fórmula, coincidencia completa y texto. Busca metadatos y fragmentos de documentos;
las relaciones por sí solas no inventan una coincidencia textual.

Se conserva el grafo, claims, evidencia, auditoría e investigación. La revisión
adversarial usa reglas verificables (campos vacíos, posibles duplicados, fechas,
advertencias textuales), y declara que no es validación científica. No se añadió
un índice semántico ni embeddings: no había un motor local disponible y no son
requisito para la búsqueda textual funcional.

## Router y Gemini

LOCAL: navegación, inventario, documentos y operaciones internas. No consulta
Gemini, incluso con Internet habilitado. EXTERNO: consulta externa explícita,
actualidad o explicación general. HÍBRIDO: ejecuta primero el tramo local y
consulta después el externo. La respuesta etiqueta LOCAL y EXTERNA.

Gemini requiere red, clave personal y habilitación de Internet en el chat.
El modelo se descubre mediante la API. La generación tiene timeout y no
recorre bucles de reintentos ni ejecuta llamadas de función del modelo.
Sin clave, con HTTP inválido, timeout o respuesta vacía, el núcleo sigue activo.
La ausencia de fuentes de grounding se muestra; no se afirma actualidad.

Un híbrido transmite como máximo tres nombres/fórmulas pertinentes, sin notas,
ubicaciones ni inventario completo. Preguntar en el visor envía como máximo seis
fragmentos, 12.000 caracteres, del documento seleccionado; no envía el PDF
completo. La visión remota requiere activación externa y envía la imagen elegida.
Contextos y consultas tienen límites de tamaño. No se transmiten historiales
locales enteros. El texto remoto se representa como texto escapado.

La búsqueda web histórica de Investigación conserva sus proveedores
Jina/Google y DuckDuckGo con fallos acotados. No funciona offline. OCR/Tesseract
sigue siendo opcional y descarga motor/idiomas externos; no es parte del núcleo
sin conexión. Reconocimiento de voz depende de lo que soporte el navegador y
puede requerir conexión aun cuando la acción resultante sea local.

Una clave usada desde GitHub Pages es visible para scripts de ese origen y para
el propietario del dispositivo. El modo por defecto es sesión; “Recordar” es
explícito. No se puede ocultar una credencial privada del operador de un frontend.
Para una clave de servicio compartida se necesitaría un intermediario seguro;
no se añadió porque el núcleo no lo necesita. Nunca guardar una clave real en git.

## Documentos y trabajo pesado

Se validan extensión, nombre, tamaño (16 MiB), firmas de binarios y contenido.
TXT/MD/CSV se leen como texto; PDF.js extrae por página con cesión al event loop;
Word y Excel usan `document-worker.js` si Web Workers está disponible. Sus
lectores se sirven desde `vendor/`. El fallback mantiene lectura local cuando
falta Worker, con límites de texto. Se reutiliza la extracción en las importaciones
maestras: el Excel real pasó de dos lecturas a una.

La cola serializa indexaciones locales; homónimos distintos reciben sufijos y
los duplicados se conservan sin sobrescribir. El SHA se usa cuando Web Crypto
está disponible, con comparación de nombre/texto/tamaño como respaldo. Las
revisiones del repositorio conservan una versión documental anterior. La carga
general muestra progreso y permite cancelación; las importaciones maestras no
exponen aún la misma cancelación integral. Una falla no bloquea la carga siguiente.

El visor PDF descarta renders obsoletos y libera el documento al cerrar. Sigue
renderizando páginas progresivamente; memoria de PDFs enormes y Android requieren
perfilado real. No se afirma rendimiento de dispositivo basándose en jsdom.

## Offline / GitHub Pages

Todas las rutas propias son relativas a `/laboratorio/`. Manifest con scope,
id e iconos PNG 192/512 más el SVG original. No se requiere compilación para servir.

`sw.js` instala 14 recursos esenciales (HTML, JS, manifest, iconos, inventario,
worker, JSZip, SheetJS, jsQR y PDF.js con su worker). El conjunto debe completarse
para instalar la nueva versión. La caché usa ámbito + versión. HTML y lectores
permanecen en la misma versión; no se reemplazan aisladamente en segundo plano.
La activación sólo retira cachés antiguas de ese ámbito y nunca toca IndexedDB
o LocalStorage. Las cachés heredadas sin ámbito no se purgan automáticamente.

No se fuerza `skipWaiting`. Al quedar una actualización lista, cerrar todas las
pestañas de NEXUS-X y volver a abrir permite la activación coherente. “Buscar
actualización” comprueba la red sin afirmar que ya se actualizó. Cambiar cualquier
recurso CORE requiere incrementar VERSION en SW y APP_VERSION en app.js.

Con instalación y datos locales completos se esperan navegación, inventario,
búsqueda, calendario, documentos guardados e importación local sin Internet.
La comprobación automatizada del SW se ejecutó en simulación; falta la prueba
de instalación/offline/actualización en Chrome real tras publicar la candidata.
No se precargan todos los PDFs del repositorio: deben sincronizarse o importarse.

## Quota, diagnóstico y seguridad

`navigator.storage.estimate()` informa capacidad si existe. Ante falta de espacio
sólo se purgan cachés con prefijo regenerable del proyecto. Nunca se purgan
inventarios, documentos únicos, originales, copias ni el shell offline. Ajustes
puede solicitar persistencia mediante gesto del usuario; el navegador decide.

“Comprobar” verifica escritura/lectura de una clave de prueba, IndexedDB y su
conteo, recursos esperados de caché, SW y control de la página, inventario,
documentos, registro NEXUS, Gemini y versión. Red es una indicación de
`navigator.onLine`, no una prueba de Internet. Gemini sólo indica respuesta
recibida después de una petición completada; la clave no se imprime.

La UI escapa datos externos; los enlaces externos sólo aceptan HTTP(S). CSV
neutraliza celdas que puedan ejecutarse como fórmulas. Se impiden objetos
embebidos, formularios salientes y cambios de base mediante CSP acotada.
PDF.js se actualizó desde la versión vulnerable original y desactiva evaluación.
Licencias y hashes de lectores están en `vendor/`. Los hashes verificaron los
bytes conservados; no se modifican bundles para quitar espacios cosméticos.

## Validación y mantenimiento

`npm ci && npm test` ejecuta comprobaciones heredadas y pruebas Node/jsdom con
fake-indexeddb. Estas dependencias sólo se usan en desarrollo. La app no carga npm,
jsdom ni fixtures. Los fixtures y fallos simulados nunca aparecen como producción.

Evidencia: `docs/evidence/node-tests.txt`, baseline y reporte de consolidación.
Ante una regresión, recuperar el bloque concreto de git, sin resetear los datos
locales. Probar únicamente lo afectado y registrar checkpoint. No tomar los
README históricos que dicen “FINAL” como evidencia de aprobación de producción.
