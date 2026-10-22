# Migración incremental

**Leer cuando:** se reimplemente o reemplace un sistema existente por partes, compartiendo su base o conviviendo con él; baseline en [DB-3](database-migrations.md).

## MIG-1. Verticales completas

- Migra una funcionalidad completa por hito (contrato → API → web → pruebas → documentación), nunca una reescritura simultánea.
- Antes de implementar, inventaría el legacy de la vertical: rutas, vistas, reglas, permisos, textos y casos de error.
- Hito terminado con `make check`, `make smoke` y `make e2e` en verde, auditoría de dependencias limpia, aislamiento entre tenants (TEN-5) y documentación actualizada.

## MIG-2. Caracterización

- Fija el comportamiento del legacy con pruebas de caracterización y vectores generados por él (hashes, CSV, cálculos, paginación, mensajes).
- Compara con una copia de producción: mismas filas, orden y totales; cada diferencia se explica o se corrige.
- Lo que escribe el sistema nuevo se lee y valida con el legacy (modelos, serializadores, formularios) para que ambos convivan.

## MIG-3. Diferencias deliberadas

Por defecto se copia exactamente: textos, reglas, paginación y permisos. Solo se corrigen fallos de seguridad (IDOR, asignación masiva, enumeración), validación (500 ante entradas inválidas) o pérdida de datos. Cada diferencia va en la tabla "Diferencias intencionales con el legacy" de la feature (`Legacy | Nuevo | Motivo`); las que cambian el negocio llevan su fecha de confirmación.

## MIG-4. Convivencia

- Solo tablas y columnas existentes en producción; las propias llevan prefijo (`<app>_*`) y las migraciones no alteran las del legacy (DB-1).
- Datos compartidos en un formato que el legacy entiende (p. ej. hashes en su formato, AUTH-6) y con sus mismos valores por defecto. Las sesiones del legacy no se leen ni modifican.
- Límites de validación desde las columnas reales (longitud en caracteres, precisión, nulabilidad), no desde sus formularios.
- Fechas con la semántica del legacy (p. ej. UTC interpretado en su `TIME_ZONE`), centralizada en `core/time/`.

## MIG-5. Datos protegidos

La copia de producción vive fuera de Git, la base escucha solo en loopback y `.env` tiene `0600`. Las pruebas escriben solo datos sintéticos (TEST-9) y se niegan a correr con `NODE_ENV=production`. Conectar con producción exige respaldo verificado, credenciales separadas para runtime y migraciones y aprobación explícita.

## MIG-6. Avance

`docs/PROGRESS.md` contiene resumen, hitos con estado, inventario del legacy (área, rutas, estado, hito), pendientes transversales (hito, prioridad, referencia), decisiones con fecha y motivo, riesgos con mitigación y la checklist de MIG-7. Se actualiza al cerrar cada hito o tomar una decisión.

## MIG-7. Paso a producción

- [ ] Hitos completados y comparados con el legacy sobre una copia de producción.
- [ ] Staging con copia reciente y pruebas de carga.
- [ ] Credenciales separadas y de mínimo privilegio para runtime y migraciones.
- [ ] HTTPS, cookies `Secure` con `__Host-`, `TRUST_PROXY` configurado y rate limit distribuido (RL-5).
- [ ] Respaldo verificado justo antes de registrar el baseline en producción.
- [ ] Rollback probado y periodo de convivencia con el legacy.
- [ ] Monitoreo, alertas y runbook.
