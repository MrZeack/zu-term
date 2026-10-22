# JWT y refresh

**Leer cuando:** se emitan, almacenen, roten o revoquen access o refresh, cookies de sesión, logout o `/auth/me`. Cliente: [FE](frontend-api-client.md); sesión de servidor sin JWT: [SES](sessions-csrf.md).

## TOK-1. Duración y almacenamiento

Access JWT de 5–15 minutos con `sub` y `type: 'access'`, firmado con su propio secreto. Refresh de 7 días con caducidad absoluta de sesión de unos 30 días: 32 bytes aleatorios o JWT con `jti`. En DB guarda solo su SHA-256, con `userId`, `familyId`, `expiresAt` y `revokedAt`. Si ambos son JWT, cada uno tiene su secreto y la estrategia valida el `type` esperado.

**Comprobación:** `tokenHash` en DB son 64 caracteres hex, nunca empiezan por `eyJ`; un access no sirve como refresh ni a la inversa.

## TOK-2. Transporte

- Refresh solo en cookie `HttpOnly`, `Secure` en producción (CFG-3), `SameSite=Strict` o `Lax` y `Path=<prefijo-global>/auth`. Sin el prefijo (p. ej. `/v1/auth`) el navegador no envía la cookie y el refresh falla.
- `POST /auth/refresh` lo lee de la cookie: si el DTO lo exige en el body, el navegador nunca podrá refrescar. Nunca se devuelve en JSON.
- Access solo en memoria (store) y en el JSON; ningún token en `localStorage` ni `sessionStorage`.

**Comprobación:** `Set-Cookie` del login incluye `HttpOnly`, `SameSite` y `Path=/v1/auth`; el JSON no contiene `refreshToken`; refresh solo con la cookie da 200; `rg` no encuentra `(local|session)Storage` con tokens en `apps/web/src`.

## TOK-3. Rotación y reutilización

- Cada refresh revoca el usado y crea un sucesor de su familia en una transacción con actualización condicional (`tokenHash`, `revokedAt` nulo y vigente). Comprobar `revokedAt` fuera de la transacción y actualizar solo por `id` permite dos sucesores válidos.
- Si la actualización no afecta filas, es reutilización: revoca toda la familia, emite `auth.refresh_reuse_detected` (LOG-6) y responde 401. La revocación de la familia debe persistir aunque la petición se rechace, así que no puede deshacerse con la transacción del rechazo.

**Comprobación:** dos refresh simultáneos con la misma cookie dan exactamente un 200 y un 401; después, el antiguo y el sucesor reciben 401.

## TOK-4. Logout

`POST /auth/logout` usa la cookie de refresh y no exige access vigente, que puede haber caducado. Revoca el token o su familia en DB y borra la cookie con los mismos `Path` y `SameSite`. Si recibe access, liga la revocación al `userId` para impedir revocar tokens ajenos. El cliente limpia su estado aunque falle; el éxito lo determina el servidor.

**Comprobación:** logout con access caducado da 200/204 y un refresh posterior con la misma cookie da 401.

## TOK-5. Usuario restaurado

`/auth/me` exige access y devuelve `SafeUser` (AUTH-4). `/auth/refresh` devuelve `{ accessToken, user }`, o el cliente llama a `/auth/me` después; si no, al recargar no se recupera el usuario.

## TOK-6. Higiene

Una tarea programada elimina tokens caducados o revocados tras un plazo definido. Nunca registres tokens, ni completos ni en fragmentos; identifícalos por ID o prefijo del hash ([LOG-4](logging.md)). Cambiar o restablecer la contraseña revoca todas las familias del usuario (AUTH-8).
