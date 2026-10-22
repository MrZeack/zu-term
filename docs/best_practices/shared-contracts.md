# Contratos compartidos

**Leer cuando:** se cree o cambie un endpoint, un esquema de entrada o salida, el código que consume la API o lógica común a API y web; expresa con Zod las reglas de [VAL](input-validation.md).

## CON-1. Contrato primero

Cada body, query y respuesta externa es un esquema Zod en `packages/shared/src/contracts/<feature>.ts`, escrito antes del controller e importado por API y web. Los tipos salen del esquema (`z.input` para lo que envía el cliente, `z.output` para lo normalizado), sin interfaces duplicadas a mano.

## CON-2. Entrada estricta

Todo objeto de entrada usa `.strict()`: una clave desconocida es 400, no se ignora. Campos de servidor (`id`, `organizationId`, `createdBy`, auditoría) nunca están en un esquema de entrada. Los límites salen de la columna real (`varchar(100)` → 100) y todo array tiene `.max()`. Cada campo pasa a su columna por un mapeo explícito, nunca por spread del body.

**Comprobación:** el esquema rechaza una clave extra como `organizationId` y un array por encima de su máximo.

## CON-3. Normalización

- Entrada: `trim`, controles convertidos en espacios en campos de una línea y `\r\n` → `\n` en multilínea, antes de validar. Longitudes en code points, como `varchar(n)`, no `.length`.
- Respuesta: solo comprueba límites de columna, para que datos existentes que no cumplen reglas nuevas sigan legibles.
- Validadores reutilizables en `packages/shared/src/validation/`: `requiredText(max)`, `optionalText(max)` (por defecto `''`), `multiLineText(max)`, `storedText(max)` y formatos como email. Las contraseñas no se recortan ni normalizan como texto: usan `PasswordSchema` ([AUTH-7](passwords-login.md)).

**Comprobación:** `requiredText(5)` convierte `'  ab\tc '` en `'ab c'` y `requiredText(2)` acepta dos emoji.

## CON-4. Respuestas uniformes

- Éxito: `{ success: true, data }`; listado paginado: `data: { items, page, limit, total, totalPages }` (VAL-3). Error: `{ success: false, error: { code, message, details } }`. `ErrorResponseSchema`, `EmptySuccessResponseSchema` y `pageSchema(Item)` viven en `shared`.
- `code` es estable y en mayúsculas (`CLIENT_NOT_FOUND`, `VALIDATION_ERROR`) y es lo que traduce la web; `message` es técnico y no se muestra.
- Validación: `details.issues: [{ path, code }]` con tope (p. ej. 50) y sin eco de los valores enviados.
- Ruta inexistente, CORS rechazado, rate limit, JSON inválido y payload excesivo usan la misma envoltura. Toda respuesta lleva `x-request-id` (LOG-3).

**Comprobación:** un valor inválido único enviado no aparece en la respuesta de error; `/v1/no-existe` devuelve `"success":false`.

## CON-5. Cada frontera valida

- Controller: `Schema.parse` de body y query antes del servicio. IDs de ruta con parser propio: entero decimal canónico, positivo y en rango (`^[1-9]\d{0,9}$` y ≤ 2147483647 para `INT`).
- Servicio: vuelve a parsear su entrada, porque también lo llaman tests, scripts y otros servicios.
- Repositorio: construye cada salida con el esquema de respuesta, para que un dato fuera de contrato falle en el servidor y no en el navegador.
- Web: el cliente HTTP valida la entrada antes de enviarla y la respuesta al recibirla (WEB-1).

**Comprobación:** los IDs `0`, `01`, `-1`, `1e3`, `2147483648` y `abc` dan 400.

## CON-6. Dominio puro

- Cálculos, políticas, formatos y parsers sin I/O son funciones puras: sin Express, Vue ni Prisma, y con reloj y aleatoriedad recibidos por parámetro. Si web y API necesitan el mismo resultado (totales, validaciones, CSV), viven en `packages/shared`.
- Dinero en la unidad mínima entera (centavos) o decimal exacto (`Prisma.Decimal`, strings); nunca `number` flotante acumulado. Redondeo explícito (p. ej. half-even) en un solo punto.

**Comprobación:** tablas de casos con límites y vectores del sistema de referencia si existe; un precio de `'2.675'` totaliza `'2.68'` (con float y `toFixed(2)` daría `'2.67'`).
