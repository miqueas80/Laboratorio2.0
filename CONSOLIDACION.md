# NEXUS-X — informe de consolidación y gate pendiente

28/09/2026 · Repositorio canónico: `miqueas80/laboratorio` · Ruta `/laboratorio/`.

**Resultado:** código integrado en la rama `consolidate/local-first`, conservando
la aplicación existente. Candidata para revisión/despliegue; **no se declara
consolidación de producción** porque no fue posible publicar ni comprobar la
versión modificada en Chrome offline y Android.

## Baseline encontrado

Producción `67e6a80e03b040951903d85b9646c493717a1723`: nueve vistas, 111 registros,
85 fórmulas, diez ubicaciones, búsqueda de inventario, investigación, PDF y QR
manual operativos. Cinco documentos persistían después de recarga. Alta de un
registro era visible, pero desaparecía al recargar. El chat no ejecutaba
“Nexus, abre inventario” sin Gemini. El baseline completo, observado antes de
modificar código, permanece en [BASELINE.md](BASELINE.md).

## Problemas encontrados y corregidos

| Problema real | Corrección |
|---|---|
| Arranque sobrescribía inventario con JSON maestro | Prioridad de datos locales, incluido inventario vacío; restauración explícita |
| Escrituras fallidas podían anunciar éxito | Estado/UI sólo después de persistencia confirmada; transacciones IndexedDB |
| Referencia JSZipReady inexistente | Lector local compartido, probado con Word maestro real |
| Excel: encabezados variados y filas vacías | Importa 111 registros reales; 128 filas físicas incluyen 17 vacías |
| Duplicados/simultaneidad documental sobrescribían originales | Cola, sufijos y `add` atómico para documentos nuevos |
| Nombre/documentos/plurales insuficientes | Ranking normalizado por inventario, contenido y metadatos |
| Chat no llegaba al executor | Resolver y Action Registry únicos, validación y permisos |
| Confirmación booleana remota permitía borrar | Origen remoto denegado y confirmación humana del objetivo |
| Gemini podía ocupar el control local | Router LOCAL/EXTERNO/HÍBRIDO; fallos remotos aislados |
| Service Worker eliminaba cachés ajenas y mezclaba versiones | Scope + versión, instalación completa, sin activar sobre pestañas antiguas |
| CDN requerida para lectores básicos | JSZip, SheetJS, jsQR y PDF.js/worker locales y precacheados |
| Quota de historial frenaba investigación | Fallo secundario informado sin impedir resultados locales |
| “Desactiva Internet” podía activar Internet | Resolver corregido y prueba de ida/vuelta |
| Estados visuales fijos | Agenda, alertas de fechas e integridad calculadas |
| PDF previo podía pintar sobre un documento nuevo | Cancelación por generación del visor y liberación al cerrar |
| Recuperación podía dejar memoria distinta de disco | Protección de ambas versiones y actualización del estado comprometido |
| CSV podía contener fórmulas ejecutables | Neutralización al exportar; HTML y enlaces externos tratados como no confiables |

## Conservado

Se mantienen navegación, paneles, formularios, inventario, filtros, favoritos,
calendario, Word/Excel/PDF/CSV/TXT/MD, investigación, evidencia, claims, grafo,
auditoría, QR, Visión/OCR, voz, exportaciones y sincronización del repositorio.
`inventory.json`, `catalogo_maestro.json` y originales documentales no fueron
modificados. La interfaz mantiene la identidad existente; no hay nuevo framework,
backend ni aplicación paralela.

## Incorporado

Registro de 35 acciones con contrato; router local; lectores en worker; protección
de recuperaciones; cola documental; diagnóstico real; solicitud explícita de
persistencia; iconos PWA PNG; rutas/cachés por ámbito; controles de foco y labels;
ajustes de pantallas pequeñas; notificación de cambios entre pestañas; pruebas
de fallos y continuidad. No se añadieron embeddings ni una IA simulada.

## Eliminado

Se retiró el planificador remoto de acciones que ya no tenía un llamador útil,
su contexto amplio y el prompt de control Gemini. El executor y sus acciones se
conservaron. Se reemplazó la carga remota obligatoria de lectores por versiones
locales; PDF.js vulnerable 3.11.174 fue sustituido por 4.10.38 y
`isEvalSupported:false`. OCR opcional mantiene su dependencia externa. No se
retiró ningún módulo funcional para hacer pasar pruebas.

## Arquitectura final de esta candidata

Se conserva `app.js` y se separan responsabilidades mediante servicios internos,
registro/validación, resolver/router, persistencia y renderizadores.
`document-worker.js` aísla lectores pesados; `sw.js` controla recursos offline;
`vendor/` fija bibliotecas y licencias. [ARQUITECTURA.md](ARQUITECTURA.md) detalla
almacenamiento, recuperación, seguridad, red y mantenimiento.
[ACCIONES.md](ACCIONES.md) documenta todas las acciones reales.

## Pruebas ejecutadas y evidencia

- Suite completa: **42/42 pruebas de comportamiento**, además de validación,
  regresión de agente, 24 comprobaciones de auditoría heredada y 23 de QR/Visión.
- Verificación adicional del último aislamiento de BroadcastChannel: **1/1**.
  Total: **43 casos de comportamiento aprobados**, sin saltados ni TODOs de test.
- Word maestro real: JSZip, 111 IDs y campos correctos. Excel real: 111 registros;
  lector instrumentado pasó de dos ejecuciones por importación a una.
- IndexedDB v2 → v3 conserva documento previo; reapertura recupera los guardados.
- PDF.js y worker locales extrajeron los PDF reales: Unidad 4, 20 páginas y
  31.498 caracteres; QUÍMICA, 13 páginas y sólo 11 caracteres extraíbles.
  Este último requiere OCR opcional para búsqueda por contenido; se conserva
  el original y la UI informa esa cobertura limitada.
- Hashes de todas las dependencias locales coinciden. No se detectaron patrones
  de claves privadas/API reales en las fuentes principales. `npm audit --omit=dev`
  informó cero hallazgos, pero no audita los bundles de `vendor/`.
- Perfil focalizado: Excel antes, dos parseos/533 ms en este entorno Node; después,
  un parseo verificado. No se extrapola esa cifra al rendimiento Android.

Las pruebas DOM utilizan jsdom/fake-indexeddb y el SW usa un entorno simulado.
La prueba de PDF es extracción en Node, no renderizado visual móvil. Los escenarios
Gemini usan respuestas/fallos simulados exclusivamente en tests. La aplicación
no contiene esos mocks. Evidencia íntegra en [evidence/node-tests.txt](evidence/node-tests.txt),
[evidence/optional-channel.txt](evidence/optional-channel.txt),
[evidence/idb-upgrade.txt](evidence/idb-upgrade.txt) y
[evidence/pdf-readers.txt](evidence/pdf-readers.txt).

## Regresiones y hallazgos durante el cierre

La prueba hostil detectó diagnóstico obsoleto tras falla de IndexedDB: se reparó
el estado DEGRADED y se repitió el caso. Se corrigieron antes de cerrar las
colisiones documentales, el historial con cuota, el comando de desactivación y
el tratamiento opcional de BroadcastChannel. Las pruebas pertinentes pasaron.
No se observaron regresiones en las capacidades cubiertas; la equivalencia
funcional total con producción aún requiere el recorrido manual final.

## Gate de producción

| Criterio | Estado real |
|---|---|
| Arranque consistente | Aprobado Node, incluido almacenamiento degradado; navegador final pendiente |
| Ruta `/laboratorio/` | Rutas/recursos comprobados; despliegue final pendiente |
| Navegación / inventario | Aprobados DOM; baseline real conservado en fuente |
| Documentos / JSZip / Excel | Aprobados con archivos reales y fallos controlados |
| Persistencia / datos anteriores | Aprobados local y migración IDB; datos maestros sin cambios |
| Búsqueda local y tres órdenes NEXUS | Aprobadas sin solicitudes externas |
| Action Registry | Validación, permisos y secuencias aprobados |
| Gemini desacoplado | Siete escenarios de fallo aprobados; credencial real pendiente |
| Service Worker y offline | Ciclo/recursos aprobados en simulador; navegador real pendiente |
| Operaciones destructivas | Confirmación real y copia previa verificadas |
| Secretos | Sin patrones de secretos incrustados en fuentes revisadas; clave de usuario explícita |
| Android vertical/horizontal/touch | Pendiente; CSS ajustado, sin dispositivo físico |
| Consola y Network finales | Sin excepciones inesperadas en pruebas; inspección de versión desplegada pendiente |
| Regresión completa | Automática aprobada; manual completa pendiente |
| Sin regresiones críticas conocidas | En pruebas cubiertas; no equivale a certificación de producción |

No se marca ningún gate pendiente como aprobado. No se demuestra todavía
`FUNCIONALIDAD_FINAL >= FUNCIONALIDAD_BASELINE` para los flujos de hardware ni
para todas las condiciones de navegador. Sí se corrigieron fallos reproducidos
de pérdida de datos, falsas escrituras y control local, con pruebas específicas.

## Limitaciones reales y siguiente acción

1. GitHub negó crear la rama de respaldo con **403 Resource not accessible by
   integration**. No se intentó sortear ese permiso; no hay push, PR ni despliegue.
2. El navegador rechazó el servidor local con `ERR_BLOCKED_BY_CLIENT`. Impide
   comprobar visualmente esta candidata, su offline real y sus recursos de red.
3. Faltan Android físico, cámara/micrófono, OCR con permisos y Gemini con clave
   válida autorizada. No se presupone reconocimiento de voz offline.
4. LocalStorage detecta revisiones ya guardadas, pero no proporciona transacciones
   entre pestañas para inventario. Evitar edición simultánea en varias pestañas.
5. Los binarios requieren descarga desde el visor para respaldo externo. El
   informe JSON no es una restauración automática de todas las bases. Las copias
   locales no protegen contra borrado completo del sitio o pérdida del dispositivo.
6. PDFs de muchas páginas pueden consumir memoria considerable en el visor;
   queda pendiente el perfilado con hardware real. Índice semántico no implementado.
7. Las importaciones maestras conservan confirmación y aislamiento, pero no la
   misma cancelación integral de la carga documental general.

**Siguiente acción concreta:** habilitar escritura de la conexión GitHub para
`miqueas80/laboratorio`; publicar esta rama revisada en el repositorio canónico;
comprobar instalación, segunda carga, hard refresh, cierre/reapertura, offline,
red lenta, reconexión y actualización del SW; repetir flujos en Android y revisar
consola/Network. No reiniciar auditorías o implementación ya cubiertas.

## Producción

La consulta final de GitHub del 28/09/2026 confirma que `main` sigue en `67e6a80`.
El sitio público no contiene estas correcciones todavía. Estado reproducible en
[evidence/production.json](evidence/production.json). El paquete entregado contiene
el código completo del repositorio modificado, un parche binario integrado y
un bundle incremental de commits para retomar sin perder la historia.

## Casos de comportamiento, uno por uno

| Archivo | Caso | Resultado |
|---|---|---|
| actions.test.mjs | registro rechaza acciones, parámetros, fechas y secuencias inválidos antes de ejecutar | APROBADO |
| actions.test.mjs | una respuesta remota no obtiene permisos locales aunque declare confirm=true | APROBADO |
| actions.test.mjs | el boolean confirm no reemplaza la confirmación real del usuario | APROBADO |
| actions.test.mjs | una secuencia válida conserva orden y un fallo de guardado detiene el resto | APROBADO |
| diagnostics.test.mjs | diagnóstico usa almacenamiento y datos reales sin afirmar offline ni revelar clave | APROBADO |
| diagnostics.test.mjs | fallos de almacenamiento y APIs opcionales quedan visibles sin perder navegación | APROBADO |
| documents.test.mjs | rechaza vacío, formato no permitido, PDF falso y tamaño excesivo | APROBADO |
| documents.test.mjs | un archivo dañado no bloquea la siguiente carga y los homónimos no se sobrescriben | APROBADO |
| documents.test.mjs | Word maestro real se lee con JSZip local, conserva 111 IDs y separa observaciones | APROBADO |
| documents.test.mjs | Excel original se lee con SheetJS local e importa nombres no vacíos | APROBADO |
| gemini.test.mjs | router: controles de Internet son locales y el híbrido busca antes de consultar fuera | APROBADO |
| gemini.test.mjs | Gemini: no configurado, offline, 403, 500, timeout, JSON y respuesta inválidos no dañan el núcleo | APROBADO |
| gemini.test.mjs | documento: sólo extractos limitados, sin subir binario ni ejecutar salida remota | APROBADO |
| hostile.test.mjs | notificación opcional denegada no bloquea arranque ni guardado documental | APROBADO |
| hostile.test.mjs | cambio entre pestañas actualiza lecturas y protege un formulario en edición | APROBADO |
| hostile.test.mjs | offline/cuota: investigación no depende de guardar historial ni puede mentir sobre favoritos | APROBADO |
| hostile.test.mjs | órdenes rápidas y repetidas no acumulan listeners ni activan Internet al desactivarlo | APROBADO |
| hostile.test.mjs | cargas concurrentes homónimas no sobrescriben y persisten ambas | APROBADO |
| hostile.test.mjs | dos pestañas con índice obsoleto no sobrescriben un documento local | APROBADO |
| hostile.test.mjs | quota: sólo se eliminan cachés derivadas propias | APROBADO |
| hostile.test.mjs | arranque idempotente con IndexedDB caída conserva inventario y navegación | APROBADO |
| persistence.test.mjs | actualización IndexedDB de v2 a v3 preserva documentos preexistentes | APROBADO |
| persistence.test.mjs | el arranque conserva altas y ediciones locales antes de consultar red | APROBADO |
| persistence.test.mjs | inventario vacío guardado es un estado válido, no reinstala 111 filas | APROBADO |
| persistence.test.mjs | quota: no se publica un alta ni se cierra el formulario si el guardado falla | APROBADO |
| persistence.test.mjs | IndexedDB fallida no se anuncia como documento persistido | APROBADO |
| persistence.test.mjs | texto del chat ejecuta navegación local sin API key | APROBADO |
| persistence.test.mjs | datos corruptos se preservan y bloquean sobrescrituras | APROBADO |
| persistence.test.mjs | conflicto entre pestañas no sobrescribe una versión más nueva | APROBADO |
| persistence.test.mjs | un alta con ID existente no modifica ese registro | APROBADO |
| persistence.test.mjs | guardar edición crea una copia anterior y sobrevive a reapertura | APROBADO |
| persistence.test.mjs | una transacción documental confirmada se recupera de IndexedDB | APROBADO |
| safety-ui.test.mjs | restauración: fallo de la segunda copia no deja memoria divergente ni pierde la versión previa | APROBADO |
| safety-ui.test.mjs | restauración: no reemplaza inventario si no puede proteger la versión actual | APROBADO |
| safety-ui.test.mjs | CSV neutraliza fórmulas ejecutables; entradas HTML siguen siendo texto | APROBADO |
| safety-ui.test.mjs | modales asocian títulos, mantienen foco y restauran el control de origen | APROBADO |
| safety-ui.test.mjs | visor: apertura antigua de PDF no reemplaza el documento elegido después | APROBADO |
| search.test.mjs | inventario: acentos, palabras parciales y plural conservan el resultado real | APROBADO |
| search.test.mjs | documentos: nombre, contenido y plural; relaciones no inventan coincidencias | APROBADO |
| search.test.mjs | las tres órdenes exigidas se resuelven localmente y abren la vista real | APROBADO |
| service-worker.test.mjs | PWA: instalación local completa, navegación /laboratorio/ y lectores disponibles sin red | APROBADO |
| service-worker.test.mjs | PWA: activación sólo retira cachés del ámbito propio | APROBADO |
| service-worker.test.mjs | PWA: actualización incompleta conserva versión anterior y no fuerza activación | APROBADO |
