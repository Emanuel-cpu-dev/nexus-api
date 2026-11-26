# Pasos exactos para poner Nexus en Render (plan gratis)

Hoy no hay cuenta de GitHub ni de Render iniciada en este equipo, así que este paso web no se puede hacer desde la terminal. Son 5 minutos:

## 1. Crear cuenta

1. Abre https://render.com y pulsa **Get Started**.
2. Regístrate con **GitHub** (si no tienes GitHub, crea una cuenta en https://github.com/signup primero).
3. Confirma el email.

## 2. Subir el código

1. En GitHub pulsa **+ → New repository**. Nombre: `nexus-api`. Déjalo privado o público (da igual).
2. No marques "Add a README" (el repo local ya tiene el suyo). Crea el repo.
3. En PowerShell:

```powershell
cd C:\Nexus
git remote add origin https://github.com/TU_USUARIO/nexus-api.git
git push -u origin HEAD
```

Si te pide credenciales, usa un **Personal Access Token** de GitHub como contraseña.

## 3. Crear el Web Service

1. En Render → **New + → Web Service**.
2. Conecta el repo `nexus-api` → **Connect**.
3. Rellena:
   - **Name:** `nexus-api`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** `Free`
4. En **Environment Variables** añade:

| Key | Value |
|---|---|
| `NODE_VERSION` | `22.14.0` |
| `PUBLIC_URL` | `https://nexus-api.onrender.com` (lo ajustarás tras el paso 5) |
| `DATA_DIR` | `./data` |

5. Pulsa **Create Web Service**. Espera a que aparezca **Live** (primer despliegue: 2-5 min).

## 4. Probar el backend

Abre en el navegador:

```
https://TU-URL.onrender.com/api/health
```

Debe mostrar algo como:

```json
{"ok":true,"time":"2026-..."}
```

> En el plan gratis, si nadie entra durante un rato el servicio se duerme; la primera petición puede tardar ~50 segundos.

## 5. Fijar la URL en el `.exe`

Cuando ya tengas la URL definitiva, en PowerShell:

```powershell
cd C:\Nexus
.\REBUILD-CON-URL.ps1 -Url 'https://TU-URL.onrender.com'
```

Listo: comparte `C:\Nexus\dist-electron\Nexus-Portable.exe`. Si alguien tiene una versión anterior, en la pantalla de login puede pegar la URL en **URL del servidor**.

## Persistencia

El plan gratis de Render no garantiza disco persistente: al reiniciar, la base SQLite puede volver a empezar. Si quieres historial permanente, contrata un disco persistente en Render o migra a Postgres (cambia el stack; no se ha hecho).
