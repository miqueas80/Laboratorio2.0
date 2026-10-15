# NEXUS-X — Programa de modernización web sin regresiones
Fecha de inicio: 2026-10-15
Rama experimental: `feature/nexus-web-quality-20261015`
Producción: `main` sin cambios.

## Principio innegociable
La base NEXUS-X existente es la referencia funcional. No sustituir arquitectura Local-First, no rediseñar interfaces, no quitar funcionalidades, no migrar frameworks como requisito de una mejora. Todo cambio entra en rama, se valida y requiere aprobación antes de fusionar. Ninguna prueba sintética sustituye validación física Android.

## Punto de partida comprobado en el repositorio
- PWA instalable con service worker, shell offline versionado y precarga atómica.
- Motores locales de voz y visión opcionales; descarga de modelos independiente del núcleo.
- Agente, inventario, documentos, QR, Lens, PWA y pruebas automatizadas ya existentes.
- `APP_VERSION` y versión SW deben permanecer sincronizadas.
- No hay evidencia de validación física completa en Android en este corte.
- La batería de pruebas actual no equivale a demostrar escalabilidad provincial, accesibilidad WCAG ni seguridad institucional.

## Barrera de calidad para cada mejora
1. Capturar SHA inicial de `main` y crear rama desde ese estado.
2. Registrar función y comportamiento esperado antes de tocar código.
3. Incorporar regresión automatizada que reproduzca el problema.
4. Implementar cambio mínimo; no tocar datasets, documentos ni inventario original.
5. Ejecutar `npm ci --ignore-scripts`, `npm test`, comprobación de sintaxis y test de navegador offline.
6. Validar manualmente Android: inicio frío, modo avión, recarga, cámara, micrófono, búsqueda, persistencia y recuperación.
7. Mantener posibilidad de rollback. No publicar ni hacer merge automático.
8. Probar el instalador institucional desde datos vacíos y desde datos creados por un operador (sin sobrescribirlos).

## Priorización técnica

### P0 — Obligatorio antes de distribución institucional
- Aislamiento verificable por escuela (preferentemente **origen HTTPS distinto para cada institución**), gestión de acceso y controles de permisos; no confiar solo en la ruta URL.
- Política de recuperación/backup de inventarios y documentos, exportación y restauración comprobadas, sin borrado por actualización.
- Asegurar que edición limpia no contenga ficheros escolares, índices derivados ni secretos y que el historial distribuido sea limpio.
- Enrutamiento de IA con manejo de fallos y desconexión, sin enviar datos institucionales a terceros por defecto.
- Accesibilidad teclado, lector de pantalla, contraste y sensibilidad al movimiento.
- CI, pruebas de regresión, pruebas browser y matriz Android reproducibles.

### P1 — Rendimiento y experiencia web moderna
- Medir arranque y consumo de memoria en celulares de gama media antes de optimizar; reportar percentiles y dispositivos.
- Carga diferida de motores grandes, procesamiento fuera del hilo principal, control de cuota y cancelación, sin eliminar las capacidades offline.
- Actualizaciones atómicas, recuperación de caché y diagnóstico comprensible para usuarios.
- Auditorías de rendimiento y accesibilidad con métricas de versiones comparables.

### P2 — Escala provincial opcional (sin dependencia del núcleo local)
- Identidad, organizaciones, perfiles y reglas institucionales.
- Sincronización opt-in con conflictos explícitos, copia local de trabajo y trazabilidad.
- Malla documental federada opt-in: solo material autorizado; inventarios siempre privados por institución.
- Observabilidad agregada y respetuosa de privacidad, actualizaciones controladas y pilotos escalonados.

## Riesgo de aislamiento entre escuelas
La API `localStorage` y `IndexedDB` están aisladas por **origen**, NO por ruta URL. La aplicación actual utiliza claves constantes como `nexus_x_inventory_v1` y `NEXUS_X_DOCUMENTS_V2`. Por tanto, **no desplegar varias escuelas en distintas rutas del mismo host y asumir separación de datos**.

Mitigación inmediata: orígenes HTTPS separados para cada escuela; validar también cookies, service workers, modelos, gateways y permisos. Si se decide alojar múltiples instituciones en un mismo origen, diseñar namespacing por tenant y migración transaccional de datos existentes, con pruebas de no fuga, antes del despliegue.

## Criterios de salida de esta primera etapa
- CI ejecuta la suite anterior completa y las nuevas barreras web.
- Ningún cambio funcional en `main`.
- Checklist de riesgos de datos y Android claramente identificado.
- Las mejoras de runtime siguientes se incorporarán en commits independientes medibles, nunca en una reescritura.
