# Checkpoint de continuidad — 28/09/2026

Repositorio canónico: `miqueas80/laboratorio`. Rama local: `consolidate/local-first`.
Baseline recuperable: `baseline/2026-09-28-before-consolidation` → `67e6a80`.
No reconstruir, no volver a importar maestros ni resetear almacenamiento.

## COMPLETADO

- Baseline de producción, matriz inicial y pruebas originales preservados.
- Inventario local primero; guardados confirmados, respaldo previo y recuperación;
  detección de conflictos; eventos de estado entre pestañas sin pisar formularios.
- IndexedDB versión 3 conserva documentos existentes; prueba de upgrade v2 → v3.
- JSZip/Word y SheetJS/Excel reales: 111 registros. Excel tiene 128 filas físicas,
  de las que 17 están vacías. Lectura del libro una sola vez por importación.
- Lectores locales, procesamiento en worker, límites, duplicados, cola y colisiones
  entre pestañas sin sobrescritura. Originales descargables desde el visor.
- Búsqueda local normalizada; tres comandos obligatorios NEXUS ejecutados sin red.
- Action Registry (35 acciones), Intent Resolver local y permisos; confirmación
  humana para eliminar. Secuencias validadas, detenidas ante el primer fallo.
- Gemini externo aislado; router LOCAL/EXTERNO/HÍBRIDO, contexto mínimo, clave de
  sesión por defecto. Fallos simulados no bloquean inventario, documentos ni UI.
- Service Worker por ámbito/versión con lectores en caché; actualización completa,
  sin purgar datos ni cachés ajenas. Pruebas del SW en simulador, no E2E offline.
- Diagnóstico real, quota, petición explícita de persistencia; estados del panel
  calculados, labels/foco/teclado y CSS de pantallas pequeñas.
- Exportación CSV protegida, informe con inventario/recuperaciones/texto; XSS de
  entradas probado como texto. PDF obsoleto no reemplaza el documento abierto.
- Auditoría hostil: cargas simultáneas, cuota, acciones repetidas, API ausente,
  almacenamiento caído, Gemini inválido y permisos remotos.
- Suite final: 42 casos de comportamiento + un caso final de aislamiento opcional,
  todos aprobados. Scripts heredados aprobados. Evidencia en `docs/evidence/`.
- Ambos PDF reales leídos con PDF.js local. QUÍMICA tiene sólo 11 caracteres
  extraíbles: se conserva, se avisa y puede ampliarse con OCR opcional.
- Arquitectura, 35 acciones, matriz de gates e informe detallado documentados.

## PENDIENTE / BLOQUEOS REALES

- **Producción:** GitHub devolvió 403 `Resource not accessible by integration` al
  crear una rama. No eludir permisos. `main` continúa en `67e6a80`; no hubo push,
  PR ni despliegue. La publicación exige acceso de escritura de esa conexión.
- **Navegador:** servidor local rechazado con `ERR_BLOCKED_BY_CLIENT`. La versión
  modificada no tiene verificación visual, offline ni Network reales.
- **Android:** orientación, teclado, touch, cámara/micrófono y OCR físicos pendientes.
- **Gemini real:** falta credencial autorizada; los siete escenarios son tests.
- Perfil de memoria en PDFs enormes y uso prolongado móvil pendiente.
- Restricciones actuales detalladas en `docs/CONSOLIDACION.md`: LocalStorage no
  ofrece transacciones intertab; informe no restaura automáticamente binarios;
  cancelación de importaciones maestras y semántica avanzada no incorporadas.

## SIGUIENTE ACCIÓN

Habilitar escritura para `miqueas80/laboratorio`, revisar/publicar esta rama y
probar el gate final en `/laboratorio/`: instalación, recarga, hard refresh,
reapertura, offline/online/red lenta, actualización SW y Android. Comparar con
`docs/BASELINE.md` y corregir únicamente lo que falle. No repetir auditorías
completas ni reimplementar bloques ya cubiertos por pruebas.

El paquete de continuidad incluye código completo, parche binario y bundle
incremental de esta rama. Usarlo sólo para recuperar el trabajo si se pierde el
workspace; no crear un NEXUS-X paralelo. `npm ci && npm test` ejecuta las pruebas.
