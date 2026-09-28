> Estado vigente (28/09/2026): candidata de consolidación, todavía sin desplegar.
> Consultar [informe y gates](docs/CONSOLIDACION.md) y [checkpoint](docs/CHECKPOINT.md).
> El contenido siguiente se conserva como documentación histórica.

# NEXUS-X — V11 GOLD FINAL · EXPOSICIÓN

Base congelada: V11 AGENTE IA POTENCIA REAL.

## Objetivo terminado

NEXUS-X mantiene una arquitectura Local-First y un único ejecutor operativo (`executeAssistantAction`) para que texto, voz y Gemini controlen funciones reales de la aplicación. No se añadió un modo demo ni una capa paralela de simulación.

## Correcciones y refuerzos finales

- Executor único con resultados normalizados (`ok`, `action`, `result/data/results`, `error`, `duration`).
- Secuencias: éxito solo si todos los pasos terminan correctamente; se detiene ante el primer fallo.
- Parser local para español natural, variantes rioplatenses y órdenes encadenadas.
- Navegación, inventario, documentos, investigación, QR, cámara, calendario, exportación, sincronización, web y voz conectados al executor real.
- `chat` obsoleto eliminado del registro de acciones.
- Búsquedas no abren fichas automáticamente; `open_item` y actualizaciones requieren coincidencia suficientemente precisa.
- Eliminaciones de inventario y calendario requieren confirmación explícita.
- Esquemas Gemini incluyen `confirm` para operaciones destructivas.
- Creación de inventario evita duplicados por nombre + fórmula.
- Integridad del inventario no queda atada permanentemente a 111 registros.
- Auditoría interna de las últimas 40 acciones del agente, disponible mediante estado.
- Sincronización GitHub devuelve éxito, parcialidad o error real al agente; no informa falsos positivos.
- OCR/visión mantiene una política conservadora: una identificación visual solo puede convertirse en coincidencia local verificada con confianza y evidencia suficientes.
- Cámara automática penaliza ultra-wide y prioriza principal/teleobjetivo, manteniendo selección manual.
- Voz conserva wake word `Nexus`, reinicio automático y barge-in para interrumpir síntesis.
- Corrección estructural del uso DOM: `document.createElement` no se usa directamente; el acceso se centraliza en `DOM`.
- Service Worker conserva los recursos esenciales para funcionamiento local/caché.

## Verificación robusta ejecutada

1. `node --check app.js` — OK.
2. `node validate.mjs` — OK: 111 registros, 111 IDs únicos, 0 errores.
3. `node agent-regression.mjs` — OK: acciones, herramientas, executor, seguridad destructiva, cámara, voz y parser.
4. `node final-audit.mjs` — OK: 24 verificaciones finales, 0 fallos.
5. Se volvió a comprobar la estructura del ZIP después de empaquetar y se ejecutaron las pruebas desde la copia extraída.

## Verificación secundaria y límites reales

La validación automatizada no puede sustituir una prueba física de cámara/micrófono ni una llamada real a Gemini porque dependen del navegador, permisos de hardware, conectividad y API Key. No se declara una prueba E2E de hardware que no haya sido ejecutada.

Si una dependencia externa falla, las rutas locales de inventario, estado, navegación y documentos indexados permanecen separadas de Gemini/web siempre que esos datos ya estén disponibles localmente.

## Regla de mantenimiento

No reemplazar `app.js` completo para futuras funciones. Toda ampliación debe integrarse en el executor central y volver a ejecutar:

- `node validate.mjs`
- `node agent-regression.mjs`
- `node final-audit.mjs`
- `node --check app.js`

No agregar funciones de demostración que no formen parte del producto real.
