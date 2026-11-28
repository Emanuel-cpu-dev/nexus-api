# Render — despliegue realizado

## Estado actual

| Dato | Valor |
|---|---|
| Repo | `https://github.com/Emanuel-cpu-dev/nexus-api` |
| Servicio | `nexus-api` (Web Service, Node, plan Free, Oregon) |
| Service ID | `srv-dc4b2p15efls73div91g` |
| URL pública | **`https://nexus-api-cdxi.onrender.com`** |
| Health check | `https://nexus-api-cdxi.onrender.com/api/health` → `{"ok":true,...}` |
| Start Command | `npm start` |
| Build Command | `npm install && npm run build:web` |
| Branch | `main` |

Variables de entorno configuradas en Render:

| Key | Value |
|---|---|
| `NODE_VERSION` | `22.14.0` |
| `PUBLIC_URL` | `https://nexus-api-cdxi.onrender.com` |
| `DATA_DIR` | `./data` |
| `BACKUP_KEY` | (secreto local, no se muestra) |
| `OWNER_USERNAME` | `emaggi22` |

## Verificación funcional realizada

Contra la URL pública se probaron: registro de dos usuarios, solicitud y aceptación de amistad, conexión Socket.IO por HTTPS/WSS y mensaje directo entregado una sola vez a cada destinatario. Todo pasó.

## Actualizaciones sin reenviar el `.exe`

La interfaz React ya no vive dentro del `.exe`: Render la compila (`npm run build:web`) y la sirve en `https://nexus-api-cdxi.onrender.com/`. El `.exe` es solo una ventana Electron que abre esa URL y, si no hay conexión, usa una copia local de respaldo incluida en el archivo.

Consecuencia: para publicar una mejora o corrección alcanza con:

```powershell
cd C:\Nexus
git add .; git commit -m 'Descripcion del cambio'; git push
```

Render hace el deploy automático y todos ven la versión nueva al reiniciar Nexus. No hay que enviar otro `.exe`. Solo haría falta recompilarlo si cambiara la URL pública o si se modificara `electron/main.cjs`.

## Si algún día cambia la URL

1. En Render → tu servicio → copia la URL nueva.
2. Actualiza `PUBLIC_URL` en Render → **Save, rebuild, and deploy**.
3. En este equipo ejecuta:

```powershell
cd C:\Nexus
.\REBUILD-CON-URL.ps1 -Url 'https://NUEVA-URL.onrender.com'
```

4. Repite el push GitHub si cambiaste archivos:

```powershell
git add .; git commit -m 'Actualizar URL de Render'; git push
```

## Persistencia de cuentas entre deploys

Render Free no tiene disco persistente, pero Nexus guarda la base fuera del servicio:

- La rama `data` del repo contiene `data/nexus.db`.
- Al arrancar, `server/restore.js` descarga esa copia (con cache-busting y validación de cabecera SQLite) antes de abrir la base.
- Cada 2 minutos una automatización local consulta `GET /api/backup?key=…` (copia consistente con `VACUUM INTO`) y actualiza la rama `data` solo si cambió.
- Por eso las cuentas, contraseñas, códigos de amigo, amistades y mensajes sobreviven a cada `git push`. No hay que crear usuarios nuevos.

La URL quedó fija en `https://nexus-api-cdxi.onrender.com`. Los tokens de “Recordarme” están en la tabla `tokens` de esa base, así que la sesión también sobrevive al reinicio.

## Configuración solo para el dueño

El usuario `emaggi22` (variable `OWNER_USERNAME`) o la cuenta cuyo correo **verificado** sea `ema.maggio.mdm@gmail.com` (variable `OWNER_EMAIL`) ve los campos de URL del servidor y TURN (JSON) habilitados. Cualquier otro usuario ve ese bloque en gris, con `disabled`/`readOnly` y el botón “Solo el dueño puede guardar”. El estado `isOwner` viaja en `/api/bootstrap`.

Nadie puede escribir `email` ni `email_verified_at` desde la API: esos campos solo se completan después de validar un código enviado al buzón o un token firmado por Google. Por eso el correo del dueño no se puede usurpar cambiando el perfil.

## Ingreso de usuarios nuevos

Las cuentas nuevas entran con **Google** o con un **código de 6 números enviado al correo**. Las cuentas anteriores siguen usando usuario y contraseña. Para activarlo en Render, cargar estas variables en el dashboard (sin pegarlas en el chat):

- `GOOGLE_CLIENT_ID`: ID de cliente web de Google Cloud.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: SMTP gratuito (por ejemplo Outlook/Hotmail en `smtp.office365.com:587`).
- `OWNER_EMAIL`: `ema.maggio.mdm@gmail.com` (valor por defecto en el código).

`GET /api/auth/config` dice qué opciones están listas. El código vence en 10 minutos, permite 5 intentos y como máximo 3 envíos por correo cada 15 minutos.

## Aviso

El plan Free se duerme tras inactividad: la primera petición puede tardar ~50 segundos. La persistencia depende de que la automatización de respaldo siga activa; si se detuviera, la última copia en la rama `data` sería la que se restaure.

## Cómo se creó (referencia)

GitHub CLI portátil en `C:\Nexus\.tools\gh.exe` (login por dispositivo con la sesión del usuario); repo creado en la web; `git push -u origin main`; Render → New → Web Service → repo `nexus-api` → Node → Free → variables → Deploy.
