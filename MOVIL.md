# Nexus en Android (APK)

La APK es un envoltorio nativo (Capacitor/WebView) que abre la misma interfaz que ya está en Render:

`https://nexus-api-cdxi.onrender.com`

No cambia el backend, no cambia el `.exe` de escritorio y **no hay que reenviar la APK cuando hagamos un `git push`**: la interfaz se actualiza sola desde Render. Las cuentas, amistades y mensajes son los mismos.

## Instalar en el celular

1. Mejor: abrir en el celular `https://nexus-api-cdxi.onrender.com/Nexus.apk` con Chrome. Si se pasa por WhatsApp, mandar `Nexus.apk` suelto (no el ZIP).
2. Abrir el archivo desde Descargas con la app Archivos.
3. Si Android pide permiso: **Configuración → Permitir instalación de aplicaciones desconocidas**.
4. Si aparece Play Protect: **Más información → Instalar de todos modos**.
5. Abrir Nexus y aceptar permisos de **cámara** y **micrófono** cuando salten.

## Qué funciona y qué no

- ✅ Chat, amigos, códigos, estados, comunidad, “Ver juntos” y videollamadas (WebRTC nativo del WebView).
- ✅ Audio en llamadas; si no arranca, tocar **🔊 Activar sonido** dentro de la llamada.
- ✅ “Recordarme”: la sesión queda guardada en el celular y los tokens también viven en la SQLite del server.
- ✅ Interfaz responsive: menú abajo, chats a pantalla completa con botón ←, tarjetas y llamadas adaptadas al celular.
- ✅ **Tirar hacia abajo para actualizar** (como Instagram) en Inicio, Amigos, Comunidades, Perfil y Configuración.
- ✅ Ícono y pantalla de carga con el logo violeta de Nexus, igual que en la PC.
- ❌ **Compartir pantalla** no está disponible en el WebView de Android; la app muestra un aviso claro. Para compartir pantalla se usa la versión de escritorio.

## Compilar de nuevo (Windows)

Herramientas usadas (quedan en `C:\Nexus\.mobile-tools`, fuera del repo):

- JDK 21 (Temurin) — Capacitor 7 compila con Java 21
- Android SDK: `platform-tools`, `platforms;android-35`, `build-tools;35.0.0`
- Node 22 (`C:\Nexus\.node22`)

```powershell
cd C:\Nexus
npm run build:web
cd mobile
$env:Path='C:\Nexus\.node22;'+ $env:Path
$env:JAVA_HOME='C:\Nexus\.mobile-tools\jdk21\jdk-21.0.13.1+2'
$env:ANDROID_HOME='C:\Nexus\.mobile-tools\android-sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
npx cap sync android
.\android\gradlew.bat -p android assembleRelease --no-daemon
```

Los íconos y el splash se generan desde el `.ico` de la PC con `.\generate-icons.ps1` (dentro de `mobile`). No hace falta editar PNG a mano.

La APK firmada queda en `mobile/android/app/build/outputs/apk/release/app-release.apk`. Copiarla a `C:\Nexus\Nexus.apk`.

**Importante:** conservar `mobile/android/app/nexus.keystore` y su `keystore.properties` (están ignorados por git). Si se pierden, la próxima APK tendrá otra firma y Android pedirá desinstalar la anterior antes de actualizar. Si se sube de versión, aumentar `versionCode` en `mobile/android/app/build.gradle`.
