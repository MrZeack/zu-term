# Importación y exportación

**Leer cuando:** se implemente una exportación o importación CSV u otro archivo tabular, o una descarga.

## IO-1. Exportar con visibilidad

- La exportación aplica la misma visibilidad y filtros que el listado (TEN-3), nunca "toda la organización" por ser descarga.
- Rango de fechas `YYYY-MM-DD` validado, interpretado en la zona del negocio e inclusivo en ambos extremos (día final completo).
- Respuesta con `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="…"` y `Cache-Control: no-store`; los errores siguen en JSON (CON-4).
- Columnas, encabezados, comillas, saltos `\r\n` y fechas se fijan con un test de caracterización.

**Comprobación:** la exportación devuelve esas tres cabeceras y un usuario restringido solo exporta lo que ve en el listado.

## IO-2. Fórmulas CSV

Antes de escribir cada celda, antepone `'` a los valores que, tras espacios o controles iniciales, empiezan por `=` o `@`, o por `+`/`-` seguidos de letras. Teléfonos y números negativos quedan intactos.

**Comprobación:** `=HYPERLINK(…)` y ` @SUM(A1)` reciben `'`; `+52 55 1234 5678` y `-12.5` no cambian.

## IO-3. Importación acotada

- El navegador parsea, permite mapear columnas y valida cada fila con el contrato; el servidor revalida todo (CON-5).
- Máximo de filas por envío (p. ej. 500) y límite de payload acorde (HTTP-6).
- El parser tolera BOM UTF-8, saltos `\r\n`, `\n` y `\r`, comillas escapadas, saltos dentro de comillas y líneas vacías, con tests de cada caso.
- Transacción que bloquea el agregado padre (`SELECT … FOR UPDATE` de la organización) para que dos importaciones simultáneas no dupliquen (DB-4).
- Regla de duplicados explícita y documentada (p. ej. por correo: existentes se omiten y dentro del archivo gana la última fila).
- El resultado informa `successful`, `skipped` y `failed` y queda en un historial con usuario y fecha. Se ofrece un archivo de ejemplo descargable.

**Comprobación:** dos importaciones simultáneas del mismo archivo no crean duplicados y un lote por encima del máximo se rechaza sin escrituras.
