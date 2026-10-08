# NEXUS-X Edge · puerta de salida a producción

**PR #4 | rama experimental | NO FUSIONAR ANTES DE LA EXPO**

Este documento diferencia código escrito, resultados automáticos y aceptación
en hardware. Un check verde de GitHub no convierte un prototipo en un laboratorio
químico certificado ni garantiza 60 FPS en todos los teléfonos.

## Evidencia disponible (8 de octubre de 2026)

| Dimensión | Validación realizada | Evidencia | Estado de entrega |
|---|---|---|---|
| Inventario canónico | 111 registros leídos desde una copia cacheada sin tocar el original | Browser offline: https://github.com/miqueas80/Laboratorio2.0/actions/runs/37838343563 | Experimento Chromium OK |
| Embeddings multilingües | Modelo ONNX q8, 384 dimensiones, Web Worker con conexión bloqueada | https://github.com/miqueas80/Laboratorio2.0/actions/runs/37837465076 | Experimento Chromium OK |
| Reinicio sin Internet | Recarga offline de interfaz y motor, inferencia local y snapshot de 111 registros | https://github.com/miqueas80/Laboratorio2.0/actions/runs/37838343563 | Experimento Chromium OK |
| 100.001 registros | Worker BM25, DOM virtual: 16–24 nodos, scroll profundo | https://github.com/miqueas80/Laboratorio2.0/actions/runs/37840611987 | Chromium OK |
| Rendimiento 60 FPS | 60 FPS promedio con 100.001 filas, desplazamiento activo; p95 16,7 ms y criterio estricto no aprobado | https://github.com/miqueas80/Laboratorio2.0/actions/runs/37842461900 | **NO APROBADO / Android sin medir** |
| Memoria total 80 MiB | Node heap 78,08 MiB; RSS total 150,76 MiB | https://github.com/miqueas80/Laboratorio2.0/actions/runs/37836674104 | **NO APROBADO / Android sin medir** |
| Orquestación DAG y agente | Pregunta «abrí inventario y buscá ácido nítrico» → registro NEXUS-X-0001, sin mutación | https://github.com/miqueas80/Laboratorio2.0/actions/runs/37840611987 | Prototipo OK |
| WebRTC cifrado | ECDH, AES-GCM, dos bases IndexedDB y reproducción del estado | https://github.com/miqueas80/Laboratorio2.0/actions/runs/37839498129 | Chromium loopback OK |
| Yjs concurrente | Distintos campos editados offline, reconciliación, persistencia, WebRTC cifrado | https://github.com/miqueas80/Laboratorio2.0/actions/runs/37840196186 | Chromium loopback OK |
| Seguridad química | CAS checksum, GHS y unas pocas incompatibilidades basadas en SDS declaradas como verificadas | Pruebas unitarias de PR #4 | **Solo asesoramiento; validación profesional pendiente** |
| Lens visual sin QR | Modelo MobileCLIP-S0 y OCR PP-OCRv6 Tiny cargaron en Chromium, inferencia visual y recarga sin red verificadas; precisión física no medida | https://github.com/miqueas80/Laboratorio2.0/actions/runs/37845072935 | **Motor verificado / precisión Android pendiente** |
| Voz ambiental | Vosk WASM iniciado realmente en Chromium con WAV/micrófono virtual, wake de transcript y orden local; detector KWS entrenado y Android pendientes | https://github.com/miqueas80/Laboratorio2.0/actions/runs/37844591928 | **Motor verificado / wake neural y Android pendientes** |
| Gateway xKiro | Servicio externo opcional; errores de terceros no equivalen a fallo local | — | **Pruebas actuales/secretos y resiliencia pendientes** |

## Pruebas obligatorias en dos teléfonos Android (PENDIENTES)

- [ ] Congelar versión estable para la expo en `main`.
- [ ] Exportar respaldos del inventario, los seis documentos y los registros
      de tareas ANTES de migrar. Comprobar restauración sobre un dispositivo de prueba.
- [ ] Instalar Edge Lab en un origen HTTPS aislado y preparar shell/modelo con
      consentimiento explícito; verificar cuotas de almacenamiento.
- [ ] Cerrar navegador, activar modo avión, volver a abrir: inventario de 111,
      documentos indexados, modelo semántico, voz y QR. No depender de CDNs.
- [ ] Probar `Nexus, abrí inventario y buscá ácido nítrico`, conversación local
      y respuesta hablada con micrófono Vosk en dos versiones Android/Chrome.
- [ ] Probar Lens SIN QR en probeta, vaso, matraz y microscopio, con objetos
      negativos y riesgos de falsos positivos. El nombre de una sustancia
      nunca puede deducirse por el aspecto de un líquido.
- [ ] Medir FPS p50/p95 con 100.001 registros en la interfaz REAL de Android,
      y memoria total del navegador con instrumentación adecuada; anotar
      configuración, temperatura y número de pruebas.
- [ ] Conectar dos teléfonos a una LAN sin Internet; intercambiar oferta
      WebRTC manual, confirmar códigos diferentes a simple vista, editar
      tareas concurrentes, cortar Wi-Fi y reconectar. Probar permisos.
- [ ] Verificar que un par sin autorización no puede modificar inventario,
      que los borrados requieren confirmación y que los secretos nunca pasan
      al frontend.
- [ ] Validar las reglas CAS/GHS y segregación con un responsable de
      laboratorio y SDS de procedencia comprobada; evaluar también los
      materiales SIN SDS (resultado «desconocido», jamás «seguro»).
- [ ] Repetir regresiones reales del Service Worker de producción y de
      IndexedDB antes de cualquier fusión.

## Criterios de publicación

1. Todas las pruebas automatizadas relevantes en verde en un HEAD exacto.
2. Benchmarks medidos en dispositivos objetivo; el umbral de 60 FPS y
   menos de 80 MB **no se presuponen**.
3. Migración reversible y respaldo verificado, sin afectar los 111 registros
   ni los seis documentos canónicos.
4. Chequeos químicos aprobados por una persona con competencia y documentación.
5. Revisión de permisos/seguridad del Cloudflare Worker, sin claves embebidas.
6. Publicación canary y rollback documentado, nunca push a `main` directamente.

## Distribución técnica

La rama experimental tiene módulos fuente y tests. **No incluye** los ~118 MB
de pesos ONNX ni los bundles opcionales de Transformers.js/Yjs en los commits.
Los flujos GitHub Actions producen artefactos temporales de bibliotecas locales
con versiones fijadas; deben copiarse e instalarse explícitamente en el origen
de prueba antes de usarlos. Este proceso evita CDNs durante inferencia y
modificaciones accidentales de la versión estable.


## Refuerzo 100k y químico — CI verificada el 8 de octubre

- El renderizado virtual ahora reutiliza nodos DOM, evita renderizar cuando
  el rango visible no cambió y registra métricas de reutilización. La carga
  de 100.001 registros en Chromium completó el índice y desplazamiento.
- Se agregó medición activa de scroll a 100.001 registros: **60 FPS promedio**,
  pero p95 16,7 ms y `metTarget: false`. La tasa real de Android continúa
  desconocida.
- `chemical-worker.js` ejecuta advertencias químicas fuera del hilo principal;
  `chemical-client.js` soporta cancelación y tiempo límite, con reinicio
  solo a petición. El ensayo en Chromium analizó 100.001 sustancias
  intencionalmente sin SDS y reportó `unresolved:100001`,
  `reviewRequired:true` en 17 ms de cálculo Worker (sin contar clonación/
  transmisión). No declaró ninguna como segura.
- El motor químico ahora limita alertas masivas, indica cuando el reporte
  se trunca y reconoce SDS, zona de almacenaje o clases de peligro ausentes.
  Nunca autentica por sí mismo una SDS: `verified:true` sigue siendo una
  declaración del operador, no una firma del fabricante.
- El HEAD de esta etapa completó **214/214 pruebas automatizadas** en CI:
  https://github.com/miqueas80/Laboratorio2.0/actions/runs/37842470156
- Ensayo Chromium de desplazamiento y Worker químico:
  https://github.com/miqueas80/Laboratorio2.0/actions/runs/37842461900

Los tests automáticos no reemplazan una inspección por responsables del
laboratorio. Ningún estado químico se considera certificado por NEXUS.

## Etapa Lens/Vosk Edge — 8 de octubre de 2026

La rama experimental reutiliza los **motores locales YA EXISTENTES**
de NEXUS-X: MobileCLIP-S0 (45,5 MB), 49 prototipos visuales entre
categorías de laboratorio y clases negativas; PP-OCRv6 Tiny;
Vosk WASM y su modelo español. **No se entrena ni reempaqueta un
reconocedor ficticio**, y ningún resultado visual por sí solo confirma
una sustancia, composición, concentración ni peligrosidad.

- `next/lens-edge.js` ofrece cámara, archivos de imagen, QR exacto,
  clasificación visual con dos vistas y observación PP-OCR recortada por
  decisión del operador. Las hipótesis visuales siguen siendo hipótesis.
- `next/voice-edge.js` añade órdenes mediante el Vosk local, activación
  «Nexus», control de TTS y supresión de ecos. **No constituye un detector
  neural de wake-word permanente validado con ruido real**.
- El Vosk original necesita `new Function` internamente. Edge lo
  ejecuta en `next/voice-frame.html`, una página dedicada con CSP menos
  restrictiva, sin habilitar `unsafe-eval` en `next/demo.html`.
  La página dedicada **comparte origen**, por lo que NO es una barrera
  de seguridad equivalente a un origen separado.
- `offline/edge-sw.js`, con alcance `/offline/`, sirve las entradas
  de modelo previamente preparadas y verificadas mediante el mecanismo
  `NexusOffline.prepare` sin borrar cachés de producción.
- Prueba real MobileCLIP + OCR en Chromium WASM (muestras sintéticas):
  https://github.com/miqueas80/Laboratorio2.0/actions/runs/37844651892
- Prueba de Lens tras **recarga con Internet totalmente desactivado**:
  https://github.com/miqueas80/Laboratorio2.0/actions/runs/37845072935
- Prueba de Vosk con micrófono simulado reproduciendo WAV local, sin
  solicitudes a servidores externos, y con control del agente local:
  https://github.com/miqueas80/Laboratorio2.0/actions/runs/37844591928
- Pruebas automatizadas nuevas de evidencia visual y wake/voz:
  **227/227 sin fallos**, GitHub Actions
  https://github.com/miqueas80/Laboratorio2.0/actions/runs/37845081085

**Sigue prohibido publicar el producto como 100% listo.** Falta ensayar
imágenes y objetos físicos desconocidos, falsos positivos (por ejemplo,
cosméticos y envases de medicamentos), voz en ambientes ruidosos,
persistencia real Android, permisos de audio/cámara, carga de memoria,
un medidor de confianza calibrado con dataset independiente, y validación
de seguridad química basada en SDS auténticas. Los seis documentos no
están precargados en la demo aislada; deben provenir de IndexedDB legítimo.
