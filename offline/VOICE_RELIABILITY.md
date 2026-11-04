# NEXUS Voice V3 — reconocimiento local medible

## Qué cambia

Se conserva el motor Vosk WASM instalado (sin servicios de reconocimiento remotos). Se puede elegir en el panel **NEXUS IA → Control por voz**:

- **Comandos precisos**: el modo anterior y predeterminado. Utiliza la gramática española de comandos e inventario, con un indicador `[unk]` para palabras ajenas.
- **Español libre (experimental)**: utiliza los mismos pesos de Vosk pero sin restringir la gramática al listado de frases. Puede resultar mejor para pronunciaciones y órdenes espontáneas, o peor para comandos específicos. Se necesita comparar en un Android real.

Al cambiar el modo, se detiene la escucha activa para evitar mezclar decodificadores o ejecutar órdenes a medio reconocer. Debe volver a pulsarse **Activar**.

## Diagnóstico de sesión

- **Escuchando**: última hipótesis parcial (puede cambiar).
- **Transcripción final**: resultado de Vosk cuando detecta fin de expresión.
- **Confianza acústica**: promedio de las puntuaciones por palabra que devuelve Vosk cuando se admiten `setWords` y datos `conf`. No es una probabilidad calibrada de que la intención sea correcta, por lo que **no se utiliza como umbral automático para ejecutar acciones**.
- Los textos no se guardan en localStorage, IndexedDB ni se envían a ningún servicio.

La detección de «Nexus» está anclada al comienzo de la expresión, con opcionales «hola», «che», «oye» y «ey»; se admiten transcripciones «nexo(s)». Las menciones incidentales dentro de una frase no activan el sistema.

## Prueba guiada de precisión (sin acciones)

1. Con un teléfono Android compatible, abrí NEXUS IA y elegí **Comandos precisos**.
2. Tocá **Iniciar prueba de reconocimiento** y pronunciá las cinco frases que aparecen, cada una en una sola emisión.
3. No se ejecuta ninguna orden ni se acciona ningún LED durante esta prueba. El micrófono se detiene al finalizar o cancelar.
4. Anotá el porcentaje de **errores de palabras** (sustituciones, omisiones e inserciones, dividido por palabras esperadas).
5. Cambiá a **Español libre** y repetí las mismas frases en condiciones comparables.

Para evaluar objetivamente, usá el mismo teléfono, distancia al micrófono y ruido ambiental. Un resultado mejor en cinco frases es solo una primera indicación: deben repetirse pruebas con más pronunciaciones y ruido real. La prueba no asegura una mejora de reconocimiento, únicamente proporciona una medida inicial.

## Limitaciones y seguridad

- PWA y reconocimiento continuo requieren la app en primer plano: Android puede suspender pestañas o audio en segundo plano.
- `free` no requiere otro modelo ni conexiones externas, pero puede aumentar errores o tardar más.
- La síntesis de voz y el reconocimiento de voz son subsistemas distintos; escuchá la respuesta TTS del teléfono de forma independiente.
- Los comandos físicos siguen requiriendo wake word y confirmación de la ESP32 por BLE en funcionamiento normal.
- No se incorpora MQ-5, ni se altera firmware ESP32 v5, registros de inventario o documentos.
