# CI/CD con GitHub Actions

**Leer cuando:** se configure CI/CD o se empaqueten releases.

Complementa [TEST](testing-ci.md), [GH](deployment-github.md), [DEP](deployment.md) y [DB](database-migrations.md).

## CD-1. CI independiente de producción

- En pushes y PR, instala con lockfile congelado y ejecuta generación DB cuando aplique, tests, tipos, lint y build.
- Usa configuración sintética completa, sin secretos de producción. Prueba lógica pura sin DB e integración y migraciones con PostgreSQL efímero compatible; SQLite o validar esquemas no sustituyen esa cobertura.

**Comprobación:** CI pasa sin `.env` local; build web completo y migraciones desde cero y desde el esquema anterior cuando aplique.

## CD-2. Condiciones y permisos

- Despliega tras CI exitoso desde la rama aprobada al Environment previsto. No expongas secretos a código o artefactos de PR no confiables.
- Declara permisos mínimos por job; fija acciones externas a revisiones inmutables y revisa actualizaciones.
- Serializa por proyecto y entorno, sin cancelar migraciones activas. Define timeouts y recuperación si el runner pierde contacto.

**Comprobación:** dependencias, eventos, ramas, permisos, concurrencia y protecciones impiden despliegues indebidos. Referencia: [seguridad en Actions](https://docs.github.com/en/actions/reference/security/secure-use).

## CD-3. Artefacto completo

- Publica el mismo artefacto construido y verificado; identifica SHA, runtime y lockfile, con valores públicos correctos para el frontend.
- Incluye dependencias de ejecución, paquetes compartidos, symlinks y cliente DB generado cuando aplique. Empaqueta con una lista explícita que excluya secretos, dumps y logs.

**Comprobación:** inspección del listado y extracción en una ruta limpia permiten arranque, imports internos y health con el runtime requerido.

## CD-4. Secretos, SSH y migraciones

- Materializa secretos desde el entorno del paso, sin interpolarlos en shell. Usa archivos temporales privados, permisos restrictivos y limpieza garantizada; no imprimas valores ni actives trazas.
- Valida configuración y destino. Usa llave específica y host key verificada, rechazando cambios; valida transporte e identificadores antes de comandos remotos.
- Si DB escucha en loopback, migra en el servidor o por túnel local restringido que falle si no puede abrirse. Limpia únicamente su PID; un fallo detiene la migración.
- Separa credenciales de migración y ejecución; limita acceso al paso requerido. Aplica backups y cambios compatibles, sin resets ni sincronización directa de esquema en producción.

**Comprobación:** fixtures demuestran ausencia de secretos en logs y artefactos; configuración, host key o túnel inválidos abortan y limpian recursos.

## CD-5. Activación y rollback

- Transfiere a una release nueva con configuración compatible; preserva la activa y usa rutas de ejecución independientes del PATH SSH.
- Activa atómicamente y recarga solo el proceso propio. Verifica readiness local y salud pública de backend y DB con reintentos y timeout.
- Ante fallo, restaura release y configuración anteriores, verifica salud y comunica fallo a Actions aunque la recuperación funcione. Conserva evidencia y la última release funcional.

**Comprobación:** ensaya un artefacto defectuoso y el primer despliegue sin release previa; otros procesos quedan intactos y el job informa el fallo.

## CD-6. Trazabilidad y recuperación de datos

- Relaciona workflow publicado, ejecución y SHA activo; distingue fallo de CI, deploy omitido y deploy fallido. Conserva logs sin secretos y documenta permisos de edición.
- Si una migración impide volver al código anterior, detén la activación y aplica el plan de recuperación: restaurar una release no restaura datos.

**Comprobación:** [GH-4](deployment-github.md) y health confirman la versión operativa; el handoff registra evidencia y límites.
