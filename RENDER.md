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
| Build Command | `npm install` |
| Branch | `main` |

Variables de entorno configuradas en Render:

| Key | Value |
|---|---|
| `NODE_VERSION` | `22.14.0` |
| `PUBLIC_URL` | `https://nexus-api-cdxi.onrender.com` |
| `DATA_DIR` | `./data` |

## Verificación funcional realizada

Contra la URL pública se probaron: registro de dos usuarios, solicitud y aceptación de amistad, conexión Socket.IO por HTTPS/WSS y mensaje directo entregado una sola vez a cada destinatario. Todo pasó.

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

## Aviso

El plan Free se duerme tras inactividad: la primera petición puede tardar ~50 segundos. Además, Render Free no garantiza disco persistente; la base SQLite puede reiniciarse tras un deploy. El stack solicitado (SQLite) se mantuvo sin cambios.

## Cómo se creó (referencia)

GitHub CLI portátil en `C:\Nexus\.tools\gh.exe` (login por dispositivo con la sesión del usuario); repo creado en la web; `git push -u origin main`; Render → New → Web Service → repo `nexus-api` → Node → Free → variables → Deploy.
