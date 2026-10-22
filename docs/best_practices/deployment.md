# Despliegue en servidores compartidos

**Leer cuando:** se prepare un despliegue o se revise producción.

## DEP-1. Identidad y contrato

- Documenta servidor, dominio, SSH, identificador, directorios, procesos, base, roles, runtime, puertos y Environment. Conserva el esquema de puertos del proyecto.
- Valida identificadores y rutas bajo la raíz autorizada. No derives nombres PostgreSQL de slugs sin validación ni reutilices recursos de otros proyectos.
- Mantén el manifiesto sin secretos en infraestructura y el procedimiento de release en la aplicación.

**Comprobación:** inventario, configuración y workflow coinciden; entradas inválidas o rutas fuera del alcance se rechazan.

## DEP-2. Responsabilidades y alcance

- [Ansible](deployment-ansible.md) aprovisiona; [Actions](deployment-actions.md) publica releases. [GitHub](deployment-github.md) almacena transporte y secretos; no sustituye al inventario ni al vault.
- Aplica únicamente cambios autorizados al host y proyecto previstos. Una revisión o tarea documental no autoriza desplegar; una autorización vigente no requiere confirmación repetida.
- Revisa las tareas antes de ejecutarlas; limitar hosts no impide modificar recursos ajenos.

**Comprobación:** cada operación identifica recursos afectados y responsable; hosts, tareas y diff no sensible respetan el alcance.

## DEP-3. Evidencia del estado

- Compara antes y después runtimes, procesos, PIDs, releases, huellas SSH, configuración no secreta y salud de proyectos afectados.
- Registra fecha, SHA, acciones y resultados esperados sin secretos ni hashes de contraseñas. Compara credenciales dentro del servidor comunicando solo igualdad o diferencia.
- Distingue infraestructura lista, release publicada y API saludable. Investiga cambios ajenos al proyecto.

**Comprobación:** la evidencia identifica la versión activa y demuestra salud del backend y preservación de otros proyectos; TLS o una página provisional no bastan.

## DEP-4. Publicación y recuperación

- Revisa alcance; aprovisiona y verifica aislamiento; prepara [configuración](deployment-env.md); publica el workflow; ejecuta CI, migraciones y activación; comprueba salud.
- Respeta las autorizaciones de commit y push. Verifica el workflow remoto antes de asumir autodespliegue.
- Conserva la release anterior y su configuración. Diseña migraciones compatibles y ensaya restauraciones: recuperar código no revierte datos.

**Comprobación:** artefacto, ejecución y release comparten SHA; un fallo controlado permite recuperar el servicio en un entorno de ensayo.
