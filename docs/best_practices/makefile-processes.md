# Makefile y procesos

**Leer cuando:** se cree o modifique el Makefile, los scripts de arranque o parada, o la gestión de PIDs y logs. Implementa "Ejecución e infraestructura" de AGENTS con `ROOT_DIR`, `FRONTEND_PORT`, `BACKEND_PORT`, `DB_PORT`, `RUN_DIR=.run` y `LOG_DIR=logs`. Una app Flutter arranca con `flutter run --pid-file` ([FLT-2](flutter-stack.md)).

## MK-1. Preflight

`make up` comprueba todas las herramientas (`node`, `pnpm`, `docker`, `lsof`, `curl`, `openssl`) y todos los puertos del proyecto antes de instalar, migrar o arrancar nada. Un puerto ocupado termina con código distinto de 0, mensaje claro y nada arrancado. Vite usa `--strictPort` para no cambiar de puerto en silencio.

**Comprobación:** con `BACKEND_PORT` ocupado por otro proceso, `make up` sale con código distinto de 0 y `FRONTEND_PORT` sigue sin listener.

## MK-2. Solo procesos propios

- Con archivos PID, antes de cada `kill` se verifica la identidad: el comando o el cwd del proceso contienen `ROOT_DIR`, comparado como texto literal (`grep -F`), no como regex. Un PID antiguo reutilizado por otro programa no se toca.
- Se termina el árbol (hijos primero) con TERM, espera de hasta 5 s y luego KILL.
- Prohibido: `pkill` (incluido `pkill -P` sin verificar), `killall`, `kill $(lsof -ti :puerto)` y `fuser -k`.

**Comprobación:** `rg "pkill|killall|lsof -ti|fuser -k" Makefile scripts/` queda vacío; un proceso ajeno lanzado fuera de `ROOT_DIR` con su PID escrito en `.run/backend.pid` sigue vivo tras `make down`.

## MK-3. Idempotencia

- Dos `make up` seguidos: el segundo sale con 0, informa que ya está activo, no duplica procesos y no borra ni reescribe los PID.
- Dos `make down` seguidos: ambos salen con 0 y el segundo informa que no había nada que detener.
- Con un solo servicio vivo, `up` arranca el que falta o falla con mensaje claro, sin dejar huérfanos.

**Comprobación:** el contenido de `.run/*.pid` es idéntico tras dos `make up`.

## MK-4. Readiness y reversión

- Tras arrancar, espera con timeout (~60 s) a `GET /health/ready` (HTTP-7) y a la página del frontend. Si no responden, ejecuta `down` de lo arrancado, muestra las últimas líneas del log y sale con código distinto de 0.
- Nunca `|| true` en install, build, migrate o seed: un fallo detiene `up`.
- El seed solo corre si la DB está vacía, decidido por una consulta y no por la existencia de un archivo, y no borra datos.

**Comprobación:** `rg` no encuentra `|| true` tras install, build, migrate, seed ni prisma en `Makefile` y `scripts/`.

## MK-5. Logs y estado

- Un archivo por servicio (`logs/backend.log`, `logs/frontend.log`) con el JSON de `stdout` (LOG-1).
- `make logs` muestra un encabezado por servicio y se queda siguiendo en vivo los últimos logs como `tail -f`; puede formatear con `pino-pretty` sin modificar el archivo.
- `make status` muestra PID, puerto y resultado de `/health/ready` por servicio y sale con 0 aunque el proyecto esté detenido.

## MK-6. Parada completa

**Comprobación:** tras `make down`, `lsof` no muestra listeners en `FRONTEND_PORT` ni `BACKEND_PORT`, no hay procesos cuyo comando contenga `ROOT_DIR` y no quedan `.run/*.pid`.

## MK-7. Verificación funcional y carga

- `make verify-api` (curl) usa emails únicos por ejecución, obtiene tokens e IDs de las respuestas y prueba el refresh por cookie (como el navegador), la reutilización del token antiguo y el aislamiento entre usuarios. Sale con código distinto de 0 al primer fallo y nunca imprime tokens, cookies ni contraseñas, ni en fragmentos (LOG-4).
- `make verify-load` hace ≥ 50 peticiones con concurrencia ≥ 5 a un GET autenticado y exige que el 100 % devuelva el código esperado, sin 5xx, errores de conexión ni timeouts.

## MK-8. Entorno antes de dependencias

- Un target `env`, previo a `install`, `up`, `test`, `smoke` y `e2e`, comprueba `node`, `pnpm` y `docker`, que Node coincide con `.nvmrc` (≥ 24.8, STACK-1) y que `.env` existe o se crea (CFG-4), y aplica `chmod 600 .env`.
- El Makefile exporta `E2E_TELEMETRY_DISABLED=1` (E2E-1); `make e2e` sigue E2E-9.
- Si hay una instalación fija de Node (p. ej. el keg `node@24` de Homebrew en `/opt/homebrew/opt/node@24/bin`), se antepone al `PATH` del Makefile sin modificar el Node global.

## MK-9. Datos persistentes

`make down` detiene las apps y ejecuta `docker compose down` sin `-v`: el volumen de la DB se conserva. Si guarda datos costosos de restaurar (copia de producción), se declara `external: true` y lo crea un target propio (`db-volume`). Borrar datos es un target aparte y explícito, nunca parte de `down`, `restart` ni `up`.

**Comprobación:** `rg` no encuentra `compose … down` con `-v` ni `--volumes` en `Makefile` y `scripts/`.

## MK-10. Arranque robusto

- `umask 077` antes de crear PID y logs; el PID se escribe en un temporal y se mueve con `mv`.
- El proceso se lanza con `nohup … </dev/null >>"$LOG" 2>&1 &`. Tras ~0,5 s se comprueba que sigue vivo y que su comando contiene el marcador esperado; si no, se detiene, se borra el PID, se muestran las últimas 30 líneas del log y se sale con error.
- Si `start` falla a mitad, un `trap … ERR` detiene lo ya arrancado. Un PID existente de otro programa no se reutiliza ni se mata: se aborta con mensaje (MK-2).

## MK-11. Test operativo

`scripts/operations.test.sh`, en CI y antes de cerrar cambios del Makefile o scripts, falla si: falta `up`, `down`, `logs` o `status`; aparece `pkill` o `killall`; un script no pasa `bash -n`; Compose define algo más que recursos externos (p. ej. solo `db`); un puerto de Compose no está ligado a `127.0.0.1`; o `.env` no está ignorado o una migración sí lo está.

## MK-12. Recuperación de DB

**Comprobación:** con el stack levantado, `docker compose restart db && docker compose up -d --wait db`; `/health/ready` vuelve a responder y `.run/backend.pid` conserva el mismo PID vivo.
