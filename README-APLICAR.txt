NEXUS-X — VOICE r31 / FREE SPEECH + CONVERSACIÓN
Base esperada: main r30 b18f1d53a8c1d0132d5292ebe11a56a127d824fd
Versión resultante: 2026.10.07-r31-voice-conversation

OBJETIVO
- Recuperar dictado libre con Vosk offline (sin gramática cerrada).
- Hacer que NEXUS vuelva a responder por voz después de ejecutar una acción.
- Mantener TTS 100% local sin red, pero permitir una voz española del dispositivo/servicio cuando hay conexión.
- Agregar conversación multiturno para calendario/tareas.
- Entender hoy, mañana, pasado mañana, días de la semana, DD/MM y “9 de octubre”.
- Mantener wake word Nexus y la interrupción mientras NEXUS habla.
- NO tocar NEXUS Lens, OCR ni modelos visuales.

APLICACIÓN SEGURA
1) Extraé este ZIP dentro de la raíz del Codespace/repo Laboratorio2.0.
2) Desde la raíz del repo ejecutá:

   python3 NEXUS-Voice-r31/apply-nexus-voice-r31.py

El instalador:
- exige working tree limpio;
- verifica que HEAD derive del r30 esperado;
- si estás en main crea automáticamente la rama voice-r31-conversation;
- modifica sólo app.js, offline/core.js, sw.js y harness.mjs;
- agrega voice-r31.test.mjs;
- ejecuta node --check, git diff --check y npm test;
- si algo falla restaura los archivos automáticamente;
- NO hace commit;
- NO hace push;
- NO toca main después de crear la rama.

PRUEBAS FÍSICAS CLAVE
A. “Nexus, abrí inventario.”
   Esperado: abre inventario Y responde oralmente una sola vez.

B. “Nexus, buscá ácido nítrico.”
   Esperado: reconoce dictado libre, ejecuta búsqueda y responde por voz.

C. “Nexus, agregá una tarea.”
   NEXUS: “¿Qué tarea querés agregar?”
   Usuario: “Preparar reactivos.”
   NEXUS: “¿Para qué día...?”
   Usuario: “Mañana.”
   Esperado: evento creado y confirmación oral, sin repetir “Nexus” en cada respuesta.

D. “Nexus, recordame el viernes revisar el inventario.”
   Esperado: crea evento directamente.

E. ONLINE
   Con Internet, NEXUS puede usar una voz española disponible aunque no sea local y puede volver a conversar con xKiro para consultas no deterministas.

F. OFFLINE
   Preparar voz offline -> modo avión -> cerrar/reabrir PWA -> repetir A/B.
   ASR: Vosk local, sin red.
   TTS: sólo voz española local instalada en Android.

CRITERIO DE MERGE
Sólo si npm test queda PASS y las pruebas A-F funcionan físicamente.
Después: commit/push de voice-r31-conversation y merge controlado a main.
