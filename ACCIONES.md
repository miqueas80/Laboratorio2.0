# Registro de acciones NEXUS-X

Extraído de ActionRegistry el 28/09/2026. Asterisco: obligatorio.

Respuesta compartida: `{ok, action, duration, data?, result?, error?}`; secuencias incluyen `results`.
Errores declarados: parámetros inválidos, acción inexistente, origen no autorizado, confirmación requerida y fallo de operación. Se devuelven mensajes explicativos; no se ejecuta código remoto.

| Identificador | Descripción | Permisos | Parámetros |
|---|---|---|---|
| `open_view` | Abrir cualquier módulo de NEXUS-X. | local:read | view:string * |
| `search_inventory` | Buscar sustancias, materiales, fórmulas, IDs o ubicaciones en el inventario local. | local:read | query:string * |
| `open_item` | Buscar y abrir una ficha del inventario. | local:read | query:string * |
| `search_documents` | Buscar en documentos indexados. | local:read | query:string * |
| `open_document` | Buscar y abrir un documento indexado. | local:read | query:string * |
| `research` | Ejecutar una investigación local-first. | local:read | query:string * |
| `open_qr` | Abrir QR/cámara. | local:read | steps:array * (sequence) |
| `start_camera` | Abrir QR e iniciar cámara. | device:permission | steps:array * (sequence) |
| `stop_camera` | Detener cámara. | local:read | steps:array * (sequence) |
| `analyze_camera` | Capturar una imagen y analizarla mediante NEXUS LENS. | local:read; network:conditional | expand:boolean |
| `open_lens` | Abrir NEXUS LENS. | local:read | steps:array * (sequence) |
| `start_lens_camera` | Solicitar permiso e iniciar la cámara de NEXUS LENS. | device:permission | steps:array * (sequence) |
| `stop_lens_camera` | Detener la cámara de NEXUS LENS. | local:read | steps:array * (sequence) |
| `analyze_lens_camera` | Capturar una imagen y resolverla local-first; expand permite ampliar un resultado exacto bajo petición. | local:read; network:conditional | expand:boolean |
| `identify_lens_code` | Resolver un código NEXUS contra IndexedDB, inventario, catálogo y documentos locales. | local:read | code:string * |
| `get_lens_context` | Consultar el último contexto normalizado generado por NEXUS LENS. | local:read | — |
| `open_calendar` | Abrir calendario. | local:read | steps:array * (sequence) |
| `create_calendar_event` | Crear evento local. | local:write | date:string *; text:string * |
| `delete_calendar_event` | Eliminar evento local por fecha y texto. Requiere confirm:true solo después de una confirmación explícita del usuario. | local:write | date:string *; text:string *; confirm:boolean |
| `sync_repository` | Sincronizar repositorio configurado. | network | steps:array * (sequence) |
| `export_inventory` | Exportar inventario CSV. | local:read | steps:array * (sequence) |
| `export_report` | Exportar informe. | local:read | steps:array * (sequence) |
| `toggle_web` | Activar o desactivar Internet/búsqueda web. | local:read | enabled:boolean * |
| `web_search` | Buscar información externa actual cuando sea necesario o solicitado. | network | query:string * |
| `get_inventory` | Consultar inventario local. | local:read | query:string |
| `create_inventory_item` | Crear un registro de inventario con los datos proporcionados. | local:write | name:string *; formula:string; physicalState:string; presentation:string; originalPackage:string; expiry:string; location:string; notes:string; originalNumber:string |
| `update_inventory_item` | Actualizar campos de una ficha existente por ID o nombre. | local:write | query:string *; name:string; formula:string; physicalState:string; presentation:string; originalPackage:string; expiry:string; location:string; notes:string; originalNumber:string |
| `delete_inventory_item` | Eliminar una ficha existente. Requiere confirm:true solo después de una confirmación explícita del usuario. | local:write | query:string *; confirm:boolean |
| `get_documents` | Consultar documentos indexados. | local:read | query:string |
| `get_activity` | Consultar actividad reciente. | local:read | steps:array * (sequence) |
| `get_state` | Consultar estado actual. | local:read | steps:array * (sequence) |
| `status` | Ejecutar diagnóstico de integridad. | local:read | steps:array * (sequence) |
| `diagnostics` | Mostrar diagnóstico detallado. | local:read | steps:array * (sequence) |
| `clear_chat` | Limpiar conversación. | local:read | steps:array * (sequence) |
| `start_voice` | Activar vigilancia global de voz. | device:permission | steps:array * (sequence) |
| `stop_voice` | Detener vigilancia global de voz. | local:read | steps:array * (sequence) |
| `sequence` | Ejecutar hasta ocho acciones validadas, en orden. | local:read | steps:array * (sequence) |
