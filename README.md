# Nexus

Red social de escritorio (Electron + React) con chat, llamadas WebRTC, pantalla compartida, salas de video sincronizado y feed tipo Humand.

## Estado de este equipo

- Node portable 22.14.0 en `C:\Nexus\.node22` (el Node del sistema es 20.19.5 y **no sirve** para `node:sqlite`).
- Backend funcionando en `http://localhost:3000`.
- Cliente compilado en `C:\Nexus\dist-electron\Nexus-Portable.exe`.
- URL fijada en el `.exe`: `http://localhost:3000` (editable en la pantalla de login y en Configuración).

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

## Desplegar en Render (nube)

Lee `RENDER.md`. Es obligatorio para usar la app con amigos desde otros equipos: `localhost` solo funciona en esta PC.

Cuando tengas la URL (por ejemplo `https://nexus-api.onrender.com`), ejecuta:

```powershell
.\REBUILD-CON-URL.ps1 -Url 'https://nexus-api.onrender.com'
```

Eso actualiza `render.yaml`, `.env` y vuelve a generar el `.exe` apuntando a esa URL. También puedes dejar la URL editable en el login.

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
