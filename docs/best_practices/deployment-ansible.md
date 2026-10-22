# Aprovisionamiento con Ansible

**Leer cuando:** se prepare o modifique infraestructura compartida.

Contrato y evidencia: [DEP](deployment.md). Inventario y playbooks pertenecen al repositorio de infraestructura.

## ANS-1. Alcance por proyecto

- Usa roles parametrizados para una aplicación. `--limit` restringe hosts, no recursos.
- Valida identificadores, dominio y rutas antes de elevar privilegios. No borres recursos desconocidos ni mezcles actualizaciones generales.
- Revisa sintaxis, hosts, tareas y diff no sensible; check mode depende del módulo y no prueba funcionamiento.
- Si el diff muestra cambios no previstos (deriva entre repositorio y servidor), no apliques el playbook completo: aplica solo el cambio autorizado, alinea el código y registra la deriva para investigarla.
- Activa `host_key_checking`; las llaves de host se verifican como en [GH-3](deployment-github.md).

**Comprobación:** las tareas solo afectan al proyecto autorizado; no se muestran secretos en diff. Referencia: [check y diff](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_checkmode.html).

## ANS-2. Secretos cifrados

- Cifra archivos o variables con Vault; entrega la clave por un canal independiente. Un nombre `*.vault.yml` no implica cifrado: una prueba falla si algún vault no empieza por la cabecera `$ANSIBLE_VAULT;`.
- Lee la contraseña del vault desde el llavero del sistema mediante un script fuera del repositorio (`vault_password_file`); guarda una copia en un gestor de contraseñas y documenta cómo ver, editar, crear y cambiar la clave del vault.
- Mantén el vault como fuente autorizada de credenciales PostgreSQL; rótalas de forma coordinada, nunca en cada release.
- Restringe permisos, usa `no_log` y desactiva diff sensible. Revisa debug, callbacks y logs. Cualquier máscara sobre salidas se prueba con datos sintéticos antes de usarla con valores reales.
- Si un secreto llegó a Git: rótalo, porque cifrarlo después no lo protege. Para limpiar el historial, busca cada valor en todas las ramas (incluidas rutas renombradas), respalda con un espejo, reemplaza los valores en todo el historial, verifica cero apariciones y publica con `--force-with-lease` sobre el SHA remoto esperado. Después pide al proveedor que purgue las referencias en caché y vuelve a clonar los clones existentes.

**Comprobación:** el descifrado exige clave, la prueba rechaza vaults en claro, ninguna salida revela valores y el historial no contiene secretos expuestos. Referencias: [Vault](https://docs.ansible.com/projects/ansible/latest/vault_guide/index.html), [logging](https://docs.ansible.com/projects/ansible/latest/reference_appendices/logging.html).

## ANS-3. Recursos compartidos

- Preserva llaves existentes; usa identidades por proyecto. Documenta el acceso entre directorios si se comparte usuario.
- Instala runtimes por versión con rutas absolutas; no cambies el predeterminado ni reinicies gestores globales.
- Crea solo base y roles propios; separa migración y ejecución sin DDL. Restringe HBA y no expongas PostgreSQL para CI.
- Limita puertos, SELinux y handlers al proyecto. Valida recargas de servicios compartidos y verifica sus clientes.

**Comprobación:** la evidencia de DEP-3 no cambia fuera del alcance y una segunda ejecución es idempotente; comprobaciones sin cambios usan `changed_when: false`.

## ANS-4. Proxy y TLS

- Gestiona únicamente vhost y certificado propios. Valida antes de recargar; si falla, restaura la configuración previa sin detener el servicio.
- Verifica DNS, challenge y renovación; no reemplaces recursos ajenos ni reinicies el servidor.
- Un origen detrás de CDN aplica [SRV-3](server-hardening.md); los reinicios del host siguen [SRV-4](server-hardening.md).

**Comprobación:** configuración válida, certificado con emisor, dominios y vencimiento previstos, renovación ensayada y backend saludable.
