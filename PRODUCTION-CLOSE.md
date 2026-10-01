# Cierre de producción — Laboratorio2.0

Base: `main` en `efbec54f12afc9c167a5157c3c83ebf4996d9a2a`.
Rama de seguridad local: `safety/production-close-20261001`.
Rama de cierre: `close/production-20261001`.
Versión única: `2026.10.01-r27-production` (app y SW).
No se hizo merge ni se modificó main.

## Archivos y cambios

| Archivos | Cambio |
|---|---|
| `app.js` | Recuperación mediante manifiesto same-origin, caché IndexedDB primero, sin enumeración GitHub. No genera copias históricas visibles. Interruptor único, abortado de consultas externas al apagar, health/models automáticos, selección confirmada, reconexión, failover, cooldown de 12 minutos y Retry-After. Elimina lectura de credenciales del cliente. |
| `documents-manifest.json` | Seis rutas y revisiones calculadas de los archivos reales de producción; conserva el PDF de Archivos. |
| `sw.js` | Misma versión que app, manifiesto en shell, sin precache de documentos ni skipWaiting/clients.claim. |
| `index.html` | Sólo cambia el texto del botón de diagnóstico del Gateway; sin rediseño. |
| `cloudflare/worker.js`, `cloudflare/package.json`, `cloudflare/wrangler.jsonc` | Worker con origen oficial, métodos, JSON, límite de 3 MiB durante lectura, whitelist del payload, timeout upstream de 25 segundos, errores sanitizados, Retry-After expuesto por CORS y limitador opcional. |
| `harness.mjs`, `diagnostics.test.mjs`, `documents.test.mjs`, `hostile.test.mjs`, `persistence.test.mjs`, `gemini.test.mjs`, `gemini-failover.test.mjs`, `lens-regression.mjs`, `service-worker.test.mjs` | Actualiza fixtures y contratos obsoletos de la suite existente al xKiro/Office actual; preserva pruebas de aislamiento, persistencia, concurrencia, fallos y Lens. |
| `production-close.test.mjs`, `worker-close.test.mjs` | Regresiones del cierre, usando los seis binarios reales y PDF.js/JSZip/SheetJS locales. |
| `tools/browser-production-close.mjs` | Prueba adicional Chromium, pendiente por limitación del entorno. Gateway simulado en ese script; no simula la extracción de documentos. |
| `PRODUCTION-CLOSE.md` | Resultados y pendientes. |

Inventario, catálogo, seis documentos, jsQR, PDF.js y document-worker son idénticos al HEAD base.

## Evidencia de pruebas

`npm test`: salida 0. Validación de inventario sin errores, regresiones del agente, 24 comprobaciones de final-audit, 13 pruebas de Lens y 64 pruebas *.test.mjs; cero fallos/cancelaciones/omisiones.
`node --check`: app.js (en npm test), sw.js, document-worker.js, cloudflare/worker.js y script Chromium. `git diff --check`: sin errores.

La suite original del HEAD también fallaba: el harness intentaba exportar geminiGenerate, ya inexistente en producción. Se corrigieron las pruebas al contrato vigente, sin reintroducir Gemini ni cambiar modelos reales.

| Requisito | Resultado y alcance |
|---|---|
| 1. Sintaxis JavaScript | PASS: node --check. |
| 2–3. Inventario e IDs | PASS: 111 registros, 111 IDs válidos y únicos. |
| 4. Carga normal 6/6 | PASS: segundo sync lee manifiesto y reutiliza seis binarios indexados. |
| 5. Instalación limpia 6/6 | PASS: boot con IndexedDB nuevo, procesamiento real de los seis archivos y persistencia. Entorno DOM/IndexedDB simulado; no Chromium. |
| 6. GitHub API 403 | PASS: API bloqueada, boot no la invoca; sync sigue dando 6/6 tras un 403. |
| 7–8. Descargas y Archivos | PASS real: HTTP 200 para las seis URLs de GitHub Pages, incluido Archivos. Tamaños coinciden. |
| 9. Reinicio offline | PASS: segundo contexto recupera seis documentos, texto y blobs desde el mismo IndexedDB sin red; shell probado mediante simulación de SW. |
| 10. Internet OFF | PASS: inventario/búsqueda local intactos; sin solicitudes web, chat o visión externa; cancela health pendiente sin iniciar models. |
| 11. ON automático | PASS: click inicia health/models y selecciona un ID confirmado. |
| 12. /health | PASS unitario y HTTP 200 real del Worker publicado. |
| 13. /models | PASS unitario y HTTP 200 real; 141 modelos, 68 free. |
| 14. Reconexión | PASS: evento online con ON reintenta; OFF no reconecta. |
| 15. Secretos | PASS frontend sin credenciales; pruebas Worker verifican secreto sólo upstream y errores redactados. No se inspeccionaron Secrets de Cloudflare. |
| 16. Versiones | PASS: APP_VERSION === VERSION. |
| 17. QR/jsQR | PASS regresiones de fallback/decodificación y jsQR local sin cambios. Cámara física pendiente. |
| 18. Lens local | PASS: 13 regresiones (incluyendo fallback, permiso y pipeline local), sin quitar Lens. Cámara física pendiente. |
| 19–20. Búsquedas | PASS: ácido nítrico y búsqueda documental sobre los textos reales indexados; persistencia offline. |

Prueba real adicional: POST /chat/completions con modelo cohere/aya-expanse-32b, confirmado por /models: HTTP 200, respuesta “OK.”. Sin enviar API key desde cliente.
Las verificaciones HTTP corresponden al Worker ya publicado; NO prueban que el Worker reforzado de esta rama esté desplegado.

## Pendientes y límites

- La integración GitHub rechazó crear la rama remota con HTTP 403: “Resource not accessible by integration”. Las ramas y el commit están locales. No hay PR remoto.
- Chromium no estaba instalado. La descarga oficial de Playwright falló por archivo inválido/truncado. El script de navegador queda SIN EJECUTAR; no se afirma PASS de un navegador real ni de cámara física.
- El Worker reforzado no fue desplegado: no hay conexión autenticada de Cloudflare en esta sesión. Para publicarlo: desde `cloudflare/`, configurar el secreto con `npx wrangler secret put XKIRO_API_KEY` y desplegar con `npx wrangler deploy`. Conservar la credencial exclusivamente en Worker Secrets. El binding NEXUS_RATE_LIMITER es opcional; si existe, se utiliza.
- El SW nuevo espera a que se cierren todas las pestañas; además, al venir del SW antiguo con activación agresiva, la prueba de actualización en un navegador real sigue siendo necesaria.
- PDF.js emitió advertencias de fuentes estándar en Node; la extracción de todos los PDFs terminó con texto y fragmentos persistidos.

## Revisión y merge

1. Publicar la rama de cierre y abrir PR contra main, sin merge automático.
2. Publicar/verificar el Worker reforzado y repetir el flujo en navegador real antes del merge.
3. Revisar cambios y hacer merge explícitamente. Cerrar todas las pestañas para adoptar el shell nuevo.
4. Validar borrado total de datos del sitio → 111 registros → 6 documentos → OFF/ON → desconexión/reconexión.

El bundle de entrega sólo contiene el commit de cierre y requiere el HEAD base ya disponible en el clon:

```sh
git fetch NEXUS-X-production-close.bundle close/production-20261001:close/production-20261001
git switch close/production-20261001
npm ci
npm test
git push -u origin close/production-20261001
```

El ZIP de cambios contiene únicamente archivos modificados/nuevos y el parche; no sustituye los documentos ni el inventario. Aplicar el parche desde el HEAD base con `git apply NEXUS-X-production-close.patch`, sin superponer ambos métodos.
