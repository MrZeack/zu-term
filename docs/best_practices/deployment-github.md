# Variables y secretos en GitHub

**Leer cuando:** se configure producción con `gh` o se revise el workflow remoto.

## GH-1. Contrato y alcance

- Documenta nombres, uso y alcance de variables y secretos; mantén coherencia entre configuración y jobs.
- Separa transporte público y credenciales secretas. Todo valor expuesto por el bundler es público; preserva la integridad de la llave SSH del servidor.
- Selecciona repositorio y Environment explícitos. Evita nombres duplicados entre alcances y no uses variables del Environment para seleccionarlo.

**Comprobación:** autenticación, destino y valores públicos coinciden con el manifiesto; listar secrets confirma presencia, no validez. Distingue fallos de red de autenticación.

## GH-2. Carga segura

- Valida según [ENVPROD](deployment-env.md), confirma exclusión de Git y respeta el alcance autorizado: cargar reemplaza el secret.
- Transfiere mediante stdin o archivos protegidos, sin argumentos sensibles, impresión ni trazas shell.
- No presupongas que GitHub enmascara valores internos de un secret estructurado. Separa credenciales cuando requieran acceso o rotación independientes.

**Comprobación:** entradas inválidas detienen la carga; destino correcto y logs sin filtraciones con datos sintéticos. Referencias: [carga de secretos](https://cli.github.com/manual/gh_secret_set), [seguridad en Actions](https://docs.github.com/en/actions/reference/security/secure-use).

## GH-3. Identidad SSH

- Host y puerto ubican al servidor; verifica la huella de su llave por un canal independiente confiable.
- Conserva la entrada verificada para el puerto correspondiente; rechaza llaves desconocidas o distintas y documenta su renovación.

**Comprobación:** la huella coincide con la autorizada y una llave inesperada aborta. Referencia: [ssh-keyscan](https://man.openbsd.org/ssh-keyscan).

## GH-4. Estado publicado

- Revisa ramas y protecciones del Environment según plan y visibilidad; no asumas protecciones por crearlo.
- Verifica el workflow remoto, su SHA y resultado. La versión local no prueba publicación.
- Valida secretos mediante conexión, contrato, autenticación y health que comuniquen solo éxito o fallo; no intentes recuperarlos ni descargues logs sensibles.

**Comprobación:** rama, SHA y job coinciden con el despliegue previsto. Referencias: [Environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables).
