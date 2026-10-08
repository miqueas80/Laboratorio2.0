# ENCARGO PARA CODEX — NEXUS IA 2.0 / VOZ DUAL (PRUEBAS EN ANDROID)

> Este archivo es un traspaso de instrucciones. El usuario AUTORIZÓ expresamente crear el repositorio público `miqueas80/NEXUS-X-voice-v2-test` y publicar ahí una COPIA DE PRUEBA. NO autorizó tocar producción. Ejecutá el trabajo y devolvé enlaces/resultados, no un nuevo prompt.

## Fuente verificada

- Repositorio de origen: `https://github.com/miqueas80/Laboratorio2.0`
- Rama que contiene el desarrollo: `feature/nexus-dual-voice-local-intelligence`
- PR de referencia: `https://github.com/miqueas80/Laboratorio2.0/pull/2` (borrador, no fusionar).
- Estado de la rama antes de añadir este archivo: `567216d4befb879ff32c0156a669e3d0d82fe361`.
- La batería GitHub Actions más reciente de ese estado pasó: 128 pruebas, 0 fallos.
- `main` de origen, versión expo: `d9cae3b0f0420b19f3a6e2999424a8679648543c`. **NO MODIFICAR**.

## Objetivo y permiso

Crear un NUEVO repositorio público de pruebas llamado `miqueas80/NEXUS-X-voice-v2-test` y publicar ahí el contenido completo de la rama indicada para poder abrirlo en Chrome/Android e instalar la PWA de ensayo.

Trabajá en tu entorno Codex usando la sesión de GitHub que haya disponible. No necesitás que el usuario pegue ningún código; este archivo contiene todas las instrucciones.

## Barreras ABSOLUTAS

1. **NO** fusionar PR #2 ni modificar `main` de `Laboratorio2.0`.
2. **NO** modificar/desplegar en `miqueas80/Laboratorio2.0`, `miqueas80/NEXUS-X-expo-test`, `miqueas80/Laboratorio.3.0`, otras demos o Cloudflare production.
3. **NO** actualizar ni desplegar el Worker de xKiro, cambiar credenciales, secrets ni su fallback.
4. **NO** modificar ni borrar inventario o documentos canónicos. Comprobar exactamente **111 IDs únicos** y **6 documentos**.
5. **NO** inventar resultados de pruebas, permisos o capacidades. La prueba automatizada no equivale a probar micrófono, TTS y cámara físicos en Android.
6. Si no hay permisos de crear repositorio, **no uses producción como destino alternativo**. Informá con precisión el bloqueo; proporcioná solo el paso mínimo de autorización o creación manual por GitHub web, y continuá luego.

## Procedimiento requerido

1. Comprobar estado de `gh auth status`, `git status -sb`, `git remote -v` y permisos reales; nunca imprimir tokens ni secretos. Si hay trabajo local no confirmado, no lo sobreescribas.
2. Obtener una copia limpia de la rama `feature/nexus-dual-voice-local-intelligence`, incluidas librerías, modelos y archivos binarios que corresponden al repo, sin levantar un backend obligatorio ni CDN nueva.
3. Antes de publicar, crear una variante con **aislamiento completo de datos por PWA de prueba**. CRÍTICO: todas las apps de `miqueas80.github.io` comparten ORIGEN, incluso si están en distintos repositorios/rutas. En la COPIA de prueba:
   - Dar prefijo propio a **todas** las claves de `localStorage`, incluidas inventario, respaldos, favoritos, estados de voz, modelos preferidos, historial, calendario, ajustes y claves históricas; evitar lecturas accidentales de los datos de producción.
   - Usar **nombre de base IndexedDB independiente** (inventario/documentos) sin tocar ni migrar ninguna base existente de origen.
   - Aislar `Cache Storage` y Service Worker por el scope `/NEXUS-X-voice-v2-test/`; no borrar caches de otro proyecto, no llamar `caches.delete` sin comparar su prefijo de scope.
   - Mantener contextos, EventListeners, BroadcastChannel y coordinadores cross-tab independientes, si existen.
   - Fijar rutas relativas, config de repositorio, `manifest.webmanifest` (start_url, scope, iconos), service worker, modelos y assets al NUEVO repositorio; ninguna ruta debe seguir esperando `/Laboratorio2.0/` como path de hosting.
   - No copiar ni usar valores actuales de IndexedDB/localStorage del móvil de producción. Empezar con almacenamiento de prueba propio e importar solo datos canónicos públicos.
   - Validar que ejecutar la nueva PWA **nunca** sobrescribe ni resetea datos originales, ni siquiera en la misma sesión y navegador.
4. Crear el repositorio público `miqueas80/NEXUS-X-voice-v2-test` (solo ese) y subir la copia aislada. Se permite crear y configurar la nueva rama `main` de este repositorio **nuevo**, no la main de producción.
5. Activar GitHub Pages **solo** para ese repositorio nuevo, desde `main` raíz o mediante GitHub Actions, según permita la configuración. Comprobar sitio operativo HTTPS:
   `https://miqueas80.github.io/NEXUS-X-voice-v2-test/`
   **No presentar esta URL como activa hasta comprobar publicación real.**
6. Ejecutar `npm ci --ignore-scripts`, `npm test`, verificación de JavaScript, integridad de inventario/documentos, recursos offline y Service Worker; registrar total aprobado/fallido. Si hay un fallo no publicar o declarar listo hasta corregirlo.
7. Preparar diagnóstico y plan breve de VALIDACIÓN MANUAL ANDROID (usuario la hará):
   - Descarga/preparación inicial de modelos offline en Wi-Fi; cerrar/reabrir PWA, pasar a modo avión, comprobar inventario/documentos.
   - **OFFLINE**: “Nexus, abrí inventario”, “Nexus, buscá ácido nítrico”, “Nexus, ¿y su fórmula?”, “Nexus, abrí Lens”, dentro de Lens “Nexus, iniciá la cámara”, y “Nexus, recordame mañana revisar el inventario”.
   - **ONLINE**: conectar Wi-Fi, activar Internet en la app; repetir órdenes locales idénticas; pregunta libre “Nexus, explicame qué es un átomo” debe dirigirse a xKiro sin contaminarse de transcripciones anteriores.
   - **TRANSICIONES**: online → offline → online sin repetir órdenes ni escuchar eco del TTS; no activar cámara sin permiso; comprobar mensajes si hay denegaciones de cámara/micrófono.
   - Reportar transcripción observada, intención, acción ejecutada y motor activo en cada caso. No pretender que CI simula Android.
8. Entrega: URL real del repositorio nuevo, URL Pages probada, commit de la copia y síntesis de pruebas y limitaciones. Dejar la rama de origen y PR #2 en borrador, sin fusionar.

## Prioridad operativa

Preservar producción y datos > publicar una demo funcional y verificable > aumentar capacidades. Si falta permiso o un requisito de aislamiento, DETENERSE y pedir solo ese paso. Nada de migraciones o limpiezas destructivas.
