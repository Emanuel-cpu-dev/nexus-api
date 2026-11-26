# Nexus

Red social de escritorio (Electron + React) con chat, llamadas WebRTC, pantalla compartida, salas de video sincronizado y feed tipo Humand.

## Estado

- Backend desplegado y funcionando en **`https://nexus-api-cdxi.onrender.com`** (Render, plan Free).
- Repo: `https://github.com/Emanuel-cpu-dev/nexus-api`.
- Cliente compilado en `C:\Nexus\dist-electron\Nexus-Portable.exe` (72 MB), apuntando a la URL de Render.
- Node portable 22.14.0 en `C:\Nexus\.node22` (el Node del sistema es 20.19.5 y **no sirve** para `node:sqlite`).
- Comparte el `.exe`: tus amigos lo abren, crean su cuenta y te pasan su código. No necesitan servidor propio.

> Verificado contra Render: registro, amistad, Socket.IO sobre HTTPS/WSS y DM entregado una vez a cada lado.

## Arrancar el servidor local

Doble clic en `INICIAR-SERVIDOR-LOCAL.bat`, o:

```powershell
$env:Path='C:\Nexus\.node22;'+ $env:Path
npm start
```

Comprobación:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

## Render

El despliegue ya está hecho. `RENDER.md` documenta cómo se creó y cómo cambiar la URL si algún día Render te asigna otra.

Para recompilar el `.exe` con una URL distinta:

```powershell
.\REBUILD-CON-URL.ps1 -Url 'https://TU-URL.onrender.com'
```

También puedes cambiar la URL sin recompilar: en la pantalla de login o en Configuración.

## Estructura

- `server/`: API REST, Socket.IO, SQLite (`node:sqlite`).
- `electron/`: ventana de escritorio y permisos de captura de pantalla.
- `app/`: interfaz React + Vite.
- `render.yaml`: Blueprint de Render (plan gratis).
- `electron-builder.config.cjs`: generación del portable y del instalador NSIS.

## Llamadas

WebRTC con STUN de Google. El servidor solo relaya la señalización; el audio/video va directo entre participantes. Si hay un firewall estricto, añade un TURN en Configuración (JSON).

## Nota importante sobre SQLite en Render gratis

Render Free no garantiza disco persistente: los datos pueden reiniciarse tras un deploy o suspensiones. Para un despliegue definitivo con historial permanente, usa un disco persistente o una base de datos administrada. El stack solicitado (SQLite) se mantiene sin cambios.
