# Contrato de no regresión — 28/09/2026

Fuente canónica: `miqueas80/laboratorio`, rama `main`, commit
`67e6a80e03b040951903d85b9646c493717a1723`, árbol
`bb448f56a9685365625875b27332a98481bcc1ed`.
Sitio observado: https://miqueas80.github.io/laboratorio/.
La copia estaba limpia. Se creó la rama local de respaldo
`baseline/2026-09-28-before-consolidation` y la rama de trabajo
`consolidate/local-first`. GitHub rechazó crear el respaldo remoto con
403 `Resource not accessible by integration`. No se modificó producción.

## Evidencia previa a cualquier cambio de aplicación

- Chrome remoto, interfaz pública real, arranque y recarga: 111 registros,
  111 IDs, 85 fórmulas, 10 ubicaciones. Todas las nueve vistas abren.
- Alta sintética `QA-CONSOLIDACION-20260928`: la UI pasó a 112 registros;
  después de recargar volvió a 111. El código `loadMaster()` descarga el
  JSON y sobrescribe LocalStorage en cada arranque. El fallback además
  exige exactamente 111 filas, rechazando inventarios modificados.
- Chat, texto exacto `Nexus, abre inventario.`: responde «IA no configurada.
  En Ajustes pegá la API Key una sola vez» y permanece en NEXUS IA.
  `bind()` llama a `aiQuery()`, no a `assistantAsk()`.
- Búsqueda `acido nitrico`: un resultado, `NEXUS-X-0001`, HNO3, Estante 1.
- Investigación `ácido nítrico`: un material y dos documentos; pestañas
  respuesta/evidencia/claims/grafo/auditoría abren. Grafo: 16 nodos y 16
  relaciones. El ranking suma relaciones a fragmentos que no coinciden.
- Sincronización automática: 5/6 documentos compatibles indexados. Word
  falla: referencia a `JSZipReady`, función inexistente. El PDF de 8,49 MB
  queda excluido silenciosamente por el límite de 6 MB.
- PDF «Unidad 4»: visor renderiza páginas reales; XLSX y tres Markdown
  aparecen en documentos y sobreviven a recarga mediante IndexedDB.
- QR manual `NEXUS-X-0001`: muestra ficha correcta y botón Abrir ficha.
- Consola observada: errores de la extensión del navegador, no atribuibles
  a la aplicación. El error DOCX queda dentro de la sincronización parcial.
- Scripts originales: `validate.mjs`, `agent-regression.mjs`,
  `final-audit.mjs` (24/24), `qr-vision-regression.mjs` (23/23) pasan.
  Son principalmente comprobaciones de texto del código; no verifican
  persistencia real ni el enlace del botón del chat.

## Matriz inicial

| Capacidad | Baseline | Evidencia / dependencia / estado |
|---|---|---|
| Arranque y segunda carga online | FUNCIONA | UI real; `boot`, `loadMaster`, JSON |
| Navegación, nueve paneles | FUNCIONA | `setView`, botones `data-view` |
| Inventario y búsqueda sin acentos | FUNCIONA | UI real, 111 filas, filtro local |
| Alta y formulario | FUNCIONA PARCIALMENTE | Alta real, desaparece al recargar |
| Edición/eliminación persistente | ROTA | Mismo guardado sobrescrito por `loadMaster` |
| Datos inválidos y duplicados | FUNCIONA PARCIALMENTE | ID obligatorio; ID existente en alta sobrescribe |
| Favoritos e historial | NO VERIFICABLE | LocalStorage; no ejercicio completo en navegador |
| Filtros de ubicación/estado | FUNCIONA PARCIALMENTE | UI y implementación presentes; cobertura a ampliar |
| Investigación y pestañas | FUNCIONA | Consulta y todas las pestañas, UI real |
| Evidencia adversarial | ROTA | Checkbox sólo aparece en auditoría, no busca contradicciones |
| Búsqueda documental | FUNCIONA PARCIALMENTE | Contenido sí; nombre/metadatos no; plurales insuficientes |
| Grafo | FUNCIONA PARCIALMENTE | Render real; enlaces demasiado amplios |
| Documentos persistidos | FUNCIONA | 5 recuperados tras recarga en navegador |
| Guardado con IndexedDB fallida | ROTA | `putDoc` captura error, luego informa éxito |
| Importación PDF y visor | FUNCIONA PARCIALMENTE | Visor comprobado; importación depende de CDN |
| Word desde repositorio | ROTA | `JSZipReady` no definida; 5/6 indexados |
| Word maestro / Excel manual | NO VERIFICABLE | No ejercicio completo; reemplazo sin confirmación |
| TXT/MD/CSV/XLS locales | FUNCIONA PARCIALMENTE | XLS cae como texto; tipo arbitrario aceptado |
| Duplicados documentales | ROTA | Mismo nombre reemplaza sin preguntar |
| Archivos dañados / grandes | FUNCIONA PARCIALMENTE | Catch por archivo; validación inconsistente |
| NEXUS mediante chat | ROTA | Orden local exige clave y no ejecuta |
| Parser y executor locales | FUNCIONA PARCIALMENTE | Pruebas parser pasan; parámetros/permisos incompletos |
| Confirmación destructiva del agente | FUNCIONA PARCIALMENTE | Boolean del modelo basta para autorizar |
| Gemini exitoso / visión remota | NO VERIFICABLE | Sin credencial autorizada para ensayo real |
| Gemini no configurado | FUNCIONA PARCIALMENTE | Mensaje real; bloquea innecesariamente chat local |
| Router LOCAL/EXTERNO/HÍBRIDO | ROTA | No clasificación explícita; contexto amplio al modelo |
| QR manual | FUNCIONA | Resultado real de inventario |
| Cámara QR / cámara Visión | NO VERIFICABLE | Separación y handlers presentes; sin hardware físico |
| OCR / voz / micrófono | NO VERIFICABLE | Opcionales por CDN/API del navegador |
| Informes e integridad | FUNCIONA | Resumen de 111/111 observado |
| CSV / exportación de informe | NO VERIFICABLE | Generadores presentes; blobs documentales no exportables como JSON |
| Calendario modal / paleta | NO VERIFICABLE | Implementación presente; calendario resumen estático |
| Ajustes | FUNCIONA PARCIALMENTE | UI real; modelo anunciado sin prueba; clave persistente |
| Service Worker | FUNCIONA PARCIALMENTE | Core precache; borra caches ajenas del mismo origen |
| Offline / actualización SW | NO VERIFICABLE | Sin corte de red real aún; CDN fuera del precache |
| Android vertical/horizontal | NO VERIFICABLE | Sin dispositivo Android; CSS responsive existe |
| Accesibilidad | FUNCIONA PARCIALMENTE | Muchos labels sin `for`; modales sin foco/ARIA |
| Diagnóstico almacenamiento/SW | ROTA | Sólo integridad y configuración; no prueba almacenamiento |
| Quota / eviction | ROTA | Guardados ignoran fallo; no política ni diagnóstico |
| Rutas `/laboratorio/` | FUNCIONA | Arranque/JSON/app/manifest relativos en sitio real |
| Código muerto | CÓDIGO MUERTO | `geminiPlanAction`, `looksLikeControlIntent` sin llamadas |

## Fuentes de verdad y puntos de integración originales

`app.js` es una IIFE Vanilla JS. `index.html` contiene UI y CSS. No build ni
framework. Inventario: `state.inventory` + LocalStorage
`nexus_x_inventory_v1`. Documentos: `state.docs` + IndexedDB
`NEXUS_X_DOCUMENTS_V2`, versión 3, store `documents`, keyPath `path`.
Calendario, favoritos, consultas, repositorio y Gemini usan claves propias
de LocalStorage. Eventos: click/input/change/keydown, online/offline,
beforeunload, eventos de cámara/voz. No backend para núcleo local.

## Orden de corrección y criterio de conservación

1. Guardado/arranque/confirmaciones y recuperación sin borrar claves.
2. Documentos: transacciones, validación, parsing y dependencias locales.
3. Conectar el chat al executor existente, validar acciones y router.
4. Service Worker, diagnóstico y accesibilidad conservando identidad.
5. Repetir scripts existentes y pruebas de comportamiento/fallas nuevas.

La clasificación final debe separar ejecución en navegador, DOM simulado,
API simulada y revisión estática. Una prueba simulada no certifica Android,
hardware, API real ni un despliegue no realizado.
