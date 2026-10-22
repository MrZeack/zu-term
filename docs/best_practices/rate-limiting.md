# Rate limiting

**Leer cuando:** se expongan endpoints públicos, de auth o costosos, proxies o varias instancias.

## RL-1. Límites por capas

| Alcance | Límite inicial | Clave |
|---|---|---|
| Global | 100 req/60 s, ajustado al uso real de la SPA (RL-5) | IP |
| `POST /v1/auth/login` | 10 fallidos/15 min | IP + identificador normalizado |
| `POST /v1/auth/login`, todas las cuentas | 50 fallidos/15 min | IP |
| `POST /v1/auth/register` | 5 req/15 min | IP |
| `POST /v1/auth/refresh` | 30 req/60 s | IP |
| Recuperar contraseña o reenviar emails | 3 req/15 min | IP + email |

Estos valores son la referencia de todas las guías; un límite global solo no basta. El límite por IP de login frena el relleno de credenciales que rota de cuenta, que IP + identificador no detecta. Lee los límites del entorno validado (CFG-5), no fijos en código, para ajustarlos en tests. En auth, 1000 req/min o más equivale a no tener límite. El limitador de login va después de `express.json`, que ya parseó el identificador.

## RL-2. Respuesta

Devuelve 429 con `Retry-After` y emite `auth.rate_limited` en `warn` (LOG-6). La UI muestra la espera ("Demasiados intentos, espera N s") y no reintenta automáticamente.

**Comprobación:** con credenciales erróneas, diez intentos dan 401 y el undécimo 429 con `Retry-After`.

## RL-3. IP y proxy

Activa `trust proxy` solo con un proxy inverso conocido y el número exacto de saltos; sin proxy, cualquiera puede variar `X-Forwarded-For` y saltarse el límite.

**Comprobación:** sin proxy configurado, doce intentos con `X-Forwarded-For` distinto dan 429 desde el undécimo.

## RL-4. Prueba automatizada

Al menos una prueba HTTP de rutas o smoke (TEST-8) verifica el 429 de login con un límite configurado bajo.

## RL-5. Contrato y almacén

- El 429 usa la envoltura de [CON-4](shared-contracts.md) con código estable (`RATE_LIMITED`, `AUTH_RATE_LIMITED`) y cabeceras `RateLimit` estándar (`standardHeaders: 'draft-8'`, `legacyHeaders: false`).
- Login cuenta solo fallos (`skipSuccessfulRequests: true`). El global se ajusta al tráfico real de la SPA (una vista lanza varias peticiones), con mínimo y máximo validados y valor documentado.
- El almacén en memoria solo vale con una instancia; varias réplicas exigen Redis o Valkey, y su ausencia bloquea el paso a producción.

**Comprobación:** logins correctos no consumen cupo y el 429 conserva la envoltura y el código.
