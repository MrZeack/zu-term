# Configuración segura de producción

**Leer cuando:** se prepare configuración o se roten credenciales.

Complementa [CFG](secrets-config.md); el mecanismo de preparación pertenece al proyecto.

## ENVPROD-1. Contrato validado

- Documenta claves, formatos y diferencias entre entornos para aplicación y build web; las plantillas no contienen credenciales.
- Valida con el esquema de la aplicación: rechaza claves faltantes, placeholders, puertos inválidos y URLs u orígenes inconsistentes.
- Genera secretos independientes con entropía suficiente y una fuente criptográfica. Conserva credenciales existentes salvo rotación prevista.
- Usa el parser de configuración, sin evaluación shell; codifica credenciales en URLs. Preparar archivos no cambia contraseñas PostgreSQL.

**Comprobación:** datos sintéticos completos pasan; entradas incompletas o mal formadas fallan sin revelar valores, incluidos requisitos del build.

## ENVPROD-2. Archivos protegidos

- Excluye configuración sensible de Git, artefactos y reportes. Usa directorios controlados y acceso exclusivo del propietario.
- Evita sobrescrituras y symlinks inesperados. Una configuración incompleta o inválida detiene carga y despliegue.
- Coordina cambios y rotaciones con sus consumidores; cambiar secretos de sesión puede cerrar sesiones.

**Comprobación:** archivos ignorados y no versionados, permisos restrictivos y configuración previa intacta ante fallos o symlinks.

## ENVPROD-3. Fuente autorizada

- Obtén credenciales vigentes de infraestructura; evita copias desincronizadas y extrae solo lo necesario del vault.
- No expongas secretos en argumentos, historial, terminal ni logs. Revisa ambos extremos de una transferencia, incluidos errores y callbacks.
- Mantén la integración con el inventario en infraestructura, sin rutas personales ni nombres internos en la aplicación.

**Comprobación:** credenciales sintéticas con caracteres especiales se transfieren correctamente; los errores detienen el flujo sin filtraciones.

## ENVPROD-4. Preparación y publicación separadas

- Preparar configuración no modifica recursos externos. Publicación y cambios de credenciales respetan su alcance autorizado; carga en GitHub según [GH-2](deployment-github.md).
- Si automatizas, prueba aleatoriedad, codificación, duplicados, placeholders, permisos y preservación de archivos con datos sintéticos.
- Verifica conectividad y autenticación por separado, sin revelar credenciales.

**Comprobación:** configuración inválida no puede publicarse; pruebas y artefactos no contienen configuración real.
