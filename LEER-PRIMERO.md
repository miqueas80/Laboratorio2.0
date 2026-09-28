# NEXUS-X: código completo y parche de consolidación

Repositorio existente: https://github.com/miqueas80/laboratorio
Base: 67e6a80e03b040951903d85b9646c493717a1723
Candidata: bf4f0cd813616f2d089c45bc6bcc7b5147b34a28
Rama: consolidate/local-first

## Contenido

- laboratorio/: código completo del repositorio, originales, bibliotecas locales,
  pruebas y documentación; sin node_modules ni credenciales.
- consolidacion.patch: diferencia binaria integrada respecto de la base indicada.
- continuidad.bundle: commits incrementales para recuperar esta misma rama.
- MANIFIESTO.json: identificación y hashes de los artefactos.

## Estado

43 casos de comportamiento aprobados, además de scripts heredados. No se
publicó: GitHub rechazó escritura con 403. El navegador bloqueó el servidor
local; Android y offline real siguen pendientes. No es un cierre certificado.
Informe completo: laboratorio/docs/CONSOLIDACION.md.
Siguiente acción: laboratorio/docs/CHECKPOINT.md.

## Continuidad segura

Si el workspace actual está disponible, continuar en su rama; no aplicar nada
de este paquete encima. Para recuperar trabajo perdido en un clon que contenga
la base indicada:

    git fetch /ruta/continuidad.bundle refs/heads/consolidate/local-first:refs/heads/consolidate/local-first
    git switch consolidate/local-first

No forzar una rama existente ni resetear cambios. El parche se puede revisar
con `git apply --stat consolidacion.patch`; `git apply --check` fue comprobado
sobre la base. No aplicar parche y bundle a la vez.

La carpeta laboratorio contiene los archivos que corresponden a la RAÍZ del
repositorio existente; no crear una subcarpeta laboratorio dentro de él. La app
sigue siendo estática y sus rutas resuelven bajo /laboratorio/. No necesita npm
para funcionar; npm ci y npm test son para desarrollo/verificación.

Publicar únicamente tras revisar la rama y disponer de permisos del repositorio.
Conservar los datos del navegador. No limpiar IndexedDB, LocalStorage ni cachés
como procedimiento de actualización. El nuevo SW espera el cierre de todas las
pestañas de la versión anterior para evitar mezclar recursos.
