# Hardening de servidores

**Leer cuando:** se audite, endurezca o reinicie un servidor, o se exponga un servicio detrás de CDN, VPN o un agente con herramientas.

Alcance y evidencia: [DEP](deployment.md); aprovisionamiento: [ANS](deployment-ansible.md).

## SRV-1. Auditoría antes de cambiar

- Audita en solo lectura y sin imprimir valores: configuración efectiva (`sshd -T`), puertos en escucha, firewall, cuentas con shell, UID 0, sudo, `authorized_keys` y sus restricciones, parches, reinicio pendiente y permisos de archivos sensibles.
- Contrasta lo revisado en el repositorio con el estado vivo y desde fuera (puertos, cabeceras, TLS, rutas sensibles).
- Confirma cada hallazgo antes de reportarlo: un 200 puede ser el fallback de una SPA y un permiso 777 puede ser un symlink. Clasifica por impacto y separa los hallazgos verificados de los inferidos del código.
- Registra los hosts que no se pudieron auditar en vivo como pendientes; no los des por conformes.

**Comprobación:** cada hallazgo cita evidencia viva o archivo, y los falsos positivos quedan descartados con prueba.

## SRV-2. Acceso SSH y cuentas

- Usa solo llaves y bloquea root. Declara `AllowUsers` por host e impide aplicarlo si el administrador no está incluido. Desactiva el reenvío X11 y de agente, limita los intentos y el tiempo de login, y concede el reenvío de puertos solo con `Match` por usuario.
- Valida con `sshd -t`, mantén una sesión abierta durante el reinicio de sshd y verifica un login nuevo de cada cuenta permitida. Conserva los permisos que trae la distribución en `sshd_config.d`.
- Bloquea las cuentas por defecto de la imagen cloud: contraseña bloqueada, `nologin`, cuenta expirada y sin reglas sudo en `sudoers` ni en los archivos de cloud-init.
- Las llaves de despliegue llevan `restrict`, `command=` o `from=` y una identidad por proyecto; un usuario de despliegue compartido entre aplicaciones contradice ANS-3.
- Usa una política de fail2ban homogénea en todos los hosts, con backend del journal y baneo incremental.

**Comprobación:** `sshd -T` muestra la política; la cuenta por defecto no inicia sesión ni eleva privilegios; un usuario fuera de `AllowUsers` es rechazado y los permitidos entran.

## SRV-3. Exposición de red

- Niega todo por defecto. Un servicio que escucha en loopback no lleva reglas de firewall remotas; administra bases de datos y paneles por túnel SSH o desde la fuente mínima.
- No confíes en la IP de un gateway compartido: los peers de una VPN con NAT, o cualquier proceso del gateway, heredan esa confianza. Elimina los peers sin uso o sin `allowed-ips`.
- Un origen detrás de CDN acepta solo los rangos oficiales del CDN y loopback, evaluados sobre la IP de conexión real. Toma la IP del cliente de la cabecera del CDN solo desde esos rangos y sobrescribe `X-Real-IP`, `X-Forwarded-For` y la cabecera del CDN antes de pasar al backend: el proxy reenvía por defecto las que manda el cliente. Rate limit ([RL-3](rate-limiting.md)) y auditoría usan esa IP.
- Revisa los rangos del CDN contra su fuente oficial con fecha de verificación.

**Comprobación:** el acceso directo al origen da 403, incluso con la cabecera del CDN falsificada; por el CDN responde igual que antes; el log y el rate limit registran la IP real del cliente.

## SRV-4. Parches y reinicios

- Las actualizaciones automáticas no activan un kernel nuevo: comprueba el reinicio pendiente y el kernel en ejecución frente al instalado.
- Reinicia los hosts de uno en uno, con un despliegue no en curso. Antes, confirma que los servicios están habilitados y que el estado guardado del gestor de procesos coincide con lo que está en línea.
- Después de cada reinicio verifica kernel, SELinux o AppArmor, servicios, procesos de las aplicaciones, puertos y salud pública antes de pasar al siguiente host.

**Comprobación:** no queda reinicio pendiente y la evidencia de DEP-3 coincide antes y después.

## SRV-5. Secretos en el host

- Los archivos de entorno en el servidor tienen permisos `0600` del usuario del proceso. Quien los escribe (workflow, script) usa `umask 077` y fija el modo explícitamente; el aprovisionamiento lo reaplica.
- Ningún secreto en `ExecStart`, en argumentos ni en unidades legibles por todos: usa `EnvironmentFile` privado o credenciales de systemd.
- Instala binarios con versión fija y checksum; no ejecutes `curl | sh` ni uses `latest`.

**Comprobación:** `find` de archivos de entorno legibles por otros queda vacío (resuelve los symlinks antes de concluir), y `ps` y las unidades no muestran secretos.

## SRV-6. Agentes con herramientas

- Un agente LLM con terminal, archivos o web expuesto a mensajería o webhooks corre con un usuario dedicado, sin sudo ni acceso a llaves o al home del administrador, y bajo endurecimiento de systemd.
- La lista de usuarios autorizados es obligatoria y se valida al desplegar; vacía, el despliegue falla. Los comandos de riesgo requieren aprobación humana.
- Trata como hostil el contenido que el agente lee de la web o de mensajes (prompt injection): no le concedas más privilegio que el que aceptarías dar a ese contenido.

**Comprobación:** un remitente no autorizado es ignorado y, desde el agente, `sudo -n true` falla y no se pueden leer archivos del administrador.
