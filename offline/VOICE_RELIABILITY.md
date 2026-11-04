# NEXUS Voice V4 — español natural, offline y medible

## Qué se implementó

El perfil inicial de reconocimiento en instalaciones nuevas es **Español completo (reconocimiento libre)**. Se mantiene la selección manual **Comandos precisos (compatible)** para casos donde la gramática restringida de Vosk reconozca mejor términos concretos. Si el usuario ya eligió y guardó `commands`, esa preferencia se respeta.

**Importante:** ambos perfiles usan el mismo modelo de Vosk de ~40 MB y la misma implementación WASM local. `free` elimina la restricción del vocabulario de comandos, pero **NO es otro modelo acústico** ni se puede garantizar que reconozca mejor palabras raras, ruido, acentos o una conversación general.

Se agregó `offline/voice-language.js` (capa lingüística local en español argentino), que amplía las expresiones aceptadas mediante reglas deterministas que se convierten en acciones del Action Registry existente:

- Consultas de temperatura, humedad y presión con formulaciones naturales.
- Encendido y apagado de **un LED claramente identificado** (GPIO 18 o GPIO 19) con verbos y numerales habituales. Las negaciones, interrogantes sobre cómo funciona algo, acciones sobre múltiples LED e ID ambiguos no se ejecutan como comandos físicos.
- Navegación por inventario, documentos, calendario, ajustes, inicio y Lens.
- Búsquedas de sustancias y documentos, preservando la consulta reconocida.
- Las preguntas de definición científica («qué es la temperatura») no se confunden con lecturas del sensor.

El motor sigue Local-First: no sube audio o transcripciones, no solicita servicios de reconocimiento externos y no toca la ESP32 ni su firmware.

## Diagnóstico y evaluación en Android

En **NEXUS IA → Control por voz** se muestran la hipótesis parcial, la transcripción final y la confianza acústica cuando Vosk la entrega. Esa cifra NO es una probabilidad calibrada de que la intención esté bien interpretada ni habilita acciones por sí sola.

La **prueba guiada** de cinco frases mide el porcentaje de errores de palabra sin ejecutar comandos de laboratorio. Elegí «Español completo», realizá la prueba, anotá el porcentaje y repetila en «Comandos precisos» bajo condiciones semejantes. No se conserva historial ni audio de la prueba.

## Alcance pendiente

Esta entrega mejora la comprensión de lenguaje natural a partir de texto reconocido, y amplía el decodificador de voz predeterminado. No reemplaza el modelo acústico ni certifica una mejora en la tasa de reconocimiento real. Para superar el techo de Vosk en español espontáneo sería necesario integrar y probar un modelo ASR mayor (por ejemplo Whisper multilingüe ONNX), verificar los recursos de memoria/WebGPU en el teléfono y preparar/cachear TODOS sus archivos para modo avión. No se ha incorporado ni validado ese modelo adicional; la PWA original debe seguir ligera y arrancar offline.

## Garantías de compatibilidad

La selección del modo se guarda en el navegador; cambiarla detiene la escucha activa para evitar sesiones mezcladas. La palabra «Nexus» sigue siendo necesaria al principio, salvo una segunda intervención dentro de una ventana de espera. Las acciones físicas exigen identificador exacto y confirmación BLE de la ESP32, igual que antes. El MQ-5 permanece excluido.
