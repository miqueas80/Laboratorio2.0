# NEXUS Hardware 2.0 — monitoreo local

Integrado sobre el firmware ESP32 BLE v5, sin modificar la placa ni el módulo de voz original.

## Uso

1. En Chrome para Android (HTTPS), abrí NEXUS IA y tocá **Conectar ESP32** en el panel NEXUS Hardware.
2. Confirmá las lecturas de BME280 con **Actualizar mediciones**.
3. En **NEXUS Hardware 2.0**, elegí un intervalo de 30 segundos, 1, 2 o 5 minutos.
4. Tocá **Iniciar monitoreo**. Cada ciclo registra temperatura, presión y humedad localmente.
5. El gráfico permite consultar 24 horas, 7 días o 14 días. **Exportar CSV** guarda los valores visibles en el historial del dispositivo.
6. Opcionalmente, configurá reglas de umbral `mayor que` o `menor que` con acción **Solo mostrar alerta**. Para accionar uno de los dos LED se requiere confirmación explícita al crear la regla.

## Datos, seguridad y límites

- Se usa **IndexedDB del navegador** para las mediciones y `localStorage` para reglas e intervalo. Las claves están aisladas por la ruta de la aplicación. No se envían datos a servidores.
- Se conservan hasta **5.000 muestras** y hasta **14 días**; la depuración se realiza periódicamente. Exportá el CSV para archivarlas durante más tiempo.
- Las reglas se evalúan **solamente durante una sesión de monitoreo iniciada manualmente**, con Bluetooth conectado y la página en primer plano.
- Las acciones se disparan al cruzar el umbral, **no al cargar la página** ni cuando el valor permanece del mismo lado del umbral.
- Las acciones de LED deshabilitadas por defecto requieren autorización al crear la regla. La respuesta del firmware debe confirmar el cambio; no se inventan confirmaciones.
- Desconectar la ESP32, cerrar la pestaña o enviar la aplicación a segundo plano detiene el monitoreo. Una PWA web **no garantiza supervisión permanente en segundo plano**.
- Con BMP280, que no mide humedad, el valor se almacena como ausente; no se inventa un porcentaje.
- **No incluye MQ-5** ni gases, alarmas críticas, relés o cargas eléctricas de red. Es una herramienta educativa, no un sistema de seguridad certificado.

## Verificación

```sh
npm ci
npm test
```

Pruebas incluidas: historial IndexedDB y CSV; sensores válidos y ausentes; reglas desarmadas; umbrales de subida/bajada; desconexión; control del ciclo activo; interfaz con jsdom.

**La prueba con la ESP32 física debe realizarse después de cada despliegue.**
