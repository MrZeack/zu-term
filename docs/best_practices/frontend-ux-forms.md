# Formularios y UX

**Leer cuando:** se creen vistas, formularios, listas, filtros, búsqueda o acciones destructivas.

## UX-1. Validación compartida

- Las reglas del cliente son las del contrato importado de `shared` (CON-1); no se duplican entre formularios, salen de `shared` o de la lógica pura del módulo (`client-form.ts`). Los 400 por campo de la API se muestran junto a cada campo.
- Contraseñas con `PasswordSchema` ([AUTH-7](passwords-login.md)): la regla visible antes de escribir ("Mínimo 15 caracteres. Puedes usar espacios y cualquier símbolo"), `maxlength` = `PASSWORD_MAX_LENGTH`, pegar y `autocomplete` permitidos y opción de mostrar u ocultar; sin exigir mayúsculas, dígitos ni símbolos.

## UX-2. Envío único

El botón queda `disabled` con spinner mientras `submitting` es verdadero y el handler ignora llamadas en curso. Si un hijo emite el evento, el padre controla `submitting`: `await emit()` no espera al handler.

**Comprobación:** dos `submit()` concurrentes sobre un API falso producen una sola llamada.

## UX-3. Estados de datos

Cada lista, detalle, dashboard o perfil tiene estados de carga, error (con acción de reintento), vacío y contenido. El vacío distingue "no hay datos" de "no hay resultados con estos filtros".

**Comprobación (E2E-7):** un test por estado `loading`, `error`, `empty` y `data`, forzado con `browser.route`.

## UX-4. Búsqueda

Debounce de 300–400 ms; la petición anterior se cancela con `AbortController`, para que una respuesta lenta no pise una más reciente. Los filtros viven en la query string (compartible y estable al recargar).

**Comprobación:** con timers simulados, escribir `a`, `ab`, `abc` y avanzar 350 ms produce un solo fetch.

## UX-5. Paridad API

Todo filtro, orden o paginación que soporte el backend tiene un control en la UI.

**Comprobación:** antes de cerrar la feature, cada campo del DTO de query tiene su control en el componente de filtros.

## UX-6. Adaptación y tema

Mobile-first; controles con `<label>` asociado, foco visible y errores con `aria-live`. El modo oscuro sigue `prefers-color-scheme`, se puede cambiar a mano y la preferencia va en `localStorage`, lo único que se guarda ahí; nunca tokens.

## UX-7. Accesibilidad de formularios

- Componentes de campo comunes (`core/forms/TextField.vue`, `SelectField.vue`) con `id`, `<label for>` (o `sr-only`), marca de obligatorio con `aria-hidden`, `aria-invalid` y `aria-describedby` hacia ayuda y error. `maxlength` igual al límite del contrato.
- Tras un envío fallido, el foco pasa al primer `[aria-invalid="true"]` (tras `nextTick`).
- Mensajes con `role="alert"` (errores) y `role="status"` (carga y éxito); tablas con `<caption>`, aunque sea `sr-only`.

**Comprobación:** tras un envío inválido, `document.activeElement` es el primer campo con `aria-invalid="true"`.

## UX-8. Destrucción informada

La confirmación de borrado muestra qué se pierde o desvincula ("3 cotizaciones quedarán sin cliente") con conteos que la API devuelve en el detalle (`usage`). Si el servidor bloquea el borrado (409 por uso), la UI explica el motivo con el mensaje de ese código.
