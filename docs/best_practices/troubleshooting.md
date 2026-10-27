# Diagnóstico por síntoma

**Leer cuando:** algo falla y se busca la causa. Cada fila remite a la regla que lo evita; lee solo esa regla.

| Síntoma | Causa probable | Regla |
|---|---|---|
| El refresh falla en el navegador aunque el login funciona | `Path` de la cookie sin el prefijo global, o el DTO exige el token en el body | TOK-2 |
| Al recargar se pierde el usuario | refresh sin usuario ni llamada a `/auth/me`, o el guard no espera la inicialización | TOK-5, FE-4 |
| Dos refresh simultáneos obtienen sucesores válidos | `revokedAt` comprobado fuera de la transacción | TOK-3 |
| La cookie no viaja en local | web y API mezclan `localhost` y `127.0.0.1` | SES-2, HTTP-1 |
| El rate limit se evade cambiando `X-Forwarded-For` | `trust proxy` activo sin proxy conocido | RL-3 |
| El límite por cuenta de login no cuenta | limitador antes de `express.json` | RL-1 |
| Respuestas 429, 413 o de CORS sin `requestId` ni log | el logger no es el primer middleware | EXP-4 |
| `/clients/export` se interpreta como ID | ruta fija montada después de la parametrizada | EXP-4 |
| Páginas vacías o repetidas al paginar | paginación en memoria después de `skip` | VAL-3 |
| Se rechazan contraseñas válidas o se pierden espacios | normalizadores de texto o `.length` aplicados a contraseñas | AUTH-7, CON-3 |
| Datos antiguos rompen la lectura | esquema de respuesta con reglas de entrada | CON-3 |
| Totales con un centavo de diferencia | dinero en coma flotante | CON-6, FARCH-4 |
| Fechas de negocio corridas un día | fecha derivada de un instante UTC | FARCH-4 |
| `make up` se detiene por drift | cambio de esquema sin migración | DB-2 |
| Vite arranca en otro puerto | falta `strictPort` | WEB-5, MK-1 |
| `make down` deja procesos o mata uno ajeno | PID sin verificar identidad, o `$!` de un subshell | MK-2, FLT-2 |
| `make lint` de Flutter falla solo en una máquina | `dart` del `PATH` distinto al del SDK | FLT-2 |
| "used after being disposed" | notificación tras `dispose()` | FARCH-6 |
| Tests de SQLite se interfieren o llenan la salida de avisos | `databaseFactory` global reasignado | FTEST-4, FARCH-3 |
| Borrar una tabla padre falla en una migración SQLite | claves foráneas activas durante la migración | FDB-1, FDB-2 |
| Base cifrada ilegible tras reinstalar o restaurar | clave perdida o respaldo sin clave envuelta | FDB-5, FDB-6 |
| E2E: `MODEL_UNAVAILABLE` | un paso usa IA | E2E-1 |
| E2E: `CONFIG_LOAD_FAILED` | variable de entorno ausente | E2E-2 |
| E2E: `STEP_NOT_AWAITED` | paso sin `await` | E2E-5 |
| E2E: `ONLY_IN_CI` | `.only` en un test | E2E-9 |
| Release publicada vacía o con versión distinta | workflow disparado por la release o versión tomada del tag | REL-4 |
