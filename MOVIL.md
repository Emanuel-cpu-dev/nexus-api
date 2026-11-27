# Nexus en Android (APK)

La APK es un envoltorio nativo (Capacitor/WebView) que abre la misma interfaz que ya está en Render:

`https://nexus-api-cdxi.onrender.com`

No cambia el backend ni el `.exe` de escritorio: la interfaz se actualiza sola desde Render con cada `git push`. Los cambios nativos (como los avisos en segundo plano) sí requieren instalar la APK nueva una sola vez; después llegan solos con el botón **Actualizar**. Las cuentas, amistades y mensajes son los mismos.

Cuando haya una APK nueva, la app muestra un aviso con un botón **Actualizar**: se toca y ella misma descarga e instala la versión nueva. No hace falta abrir links ni pasar otro archivo. Los cambios de interfaz siguen llegando solos, sin actualizar la APK.

Si ya tenés la versión 1.2, 1.3 o 1.4 instalada, no necesitás el link: al abrir Nexus aparece el cartel para pasar a la 1.5. Además, el celular recibe una **notificación de actualización obligatoria** aunque la app esté cerrada; al tocarla abre Nexus directamente en el aviso. El link de descarga queda solo para instalar por primera vez o para alguien que se haya quedado en una versión sin actualizador.

## Instalar en el celular

1. Mejor: abrir en el celular `https://nexus-api-cdxi.onrender.com/Nexus.apk` con Chrome. Si se pasa por WhatsApp, mandar `Nexus.apk` suelto (no el ZIP).
2. Abrir el archivo desde Descargas con la app Archivos.
3. Si Android pide permiso: **Configuración → Permitir instalación de aplicaciones desconocidas**.
4. Si aparece Play Protect: **Más información → Instalar de todos modos**.
5. Abrir Nexus y aceptar permisos de **cámara**, **micrófono** y **notificaciones** cuando salten. El permiso de notificaciones es necesario para que lleguen los avisos con la app cerrada.

## Qué funciona y qué no

- ✅ Chat, amigos, códigos, estados, comunidad, “Ver juntos” y videollamadas (WebRTC nativo del WebView).
- ✅ Llamadas de hasta **5 participantes**: se pueden invitar amigos desde la propia llamada y todos se escuchan. Si sale uno, la sala sigue con los demás; el anfitrión puede **Finalizar sala** desde los controles.
- ✅ La llamada se puede **minimizar** con el botón **－**: sigue sonando y podés usar el resto de la app; volvés a tocar la barrita flotante para abrirla.
- ✅ Audio en llamadas; si no arranca, tocar **🔊 Activar sonido** dentro de la llamada.
- ✅ En los comentarios se ve quién escribió cada uno: nombre, usuario y hace cuánto, además del avatar y el texto.
- ✅ “Recordarme”: viene activado por defecto en PC y celular; al abrir Nexus entrás solo con tu usuario. Si cerrás sesión a propósito, ahí sí se borran los datos guardados.
- ✅ Fotos de perfil y archivos guardados dentro de SQLite: ya no desaparecen cuando Render hace un deploy.
- ✅ Notificaciones de mensajes, solicitudes y llamadas aunque la app esté en segundo plano: suenan, vibran y al tocarlas abren el chat o la llamada. Android muestra una notificación discreta de “Nexus activo” mientras el servicio sigue prendido.
- ✅ Interfaz responsive: menú abajo, chats a pantalla completa con botón ←, tarjetas y llamadas adaptadas al celular.
- ✅ **Tirar hacia abajo para actualizar** (como Instagram) en Inicio, Amigos, Chats, Ver juntos, Comunidades, Perfil y Configuración.
- ✅ Ícono y pantalla de carga con el logo violeta de Nexus, igual que en la PC.
- ✅ La hora, batería y barra del celular ya no tapan la interfaz: el contenido se dibuja por debajo del área segura del sistema.
- ✅ Actualizador integrado: aviso dentro de la app con botón **Actualizar** (descarga e instala desde Render). Versión actual: 1.5. La actualización 1.5 es obligatoria y también se avisa con una notificación del celular.
- ✅ Si la foto de perfil se perdió en un deploy anterior, volvela a subir una vez en **Mi perfil**; desde ahora queda guardada en la base.
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

Para publicar una actualización: subir el `versionCode` en `mobile/android/app/build.gradle`, actualizar `mobile-release.json` con el mismo número y notas, compilar, copiar la APK y hacer `git push`. La app detectará el cambio y mostrará el aviso.

**Importante:** conservar `mobile/android/app/nexus.keystore` y su `keystore.properties` (están ignorados por git). Si se pierden, la próxima APK tendrá otra firma y Android pedirá desinstalar la anterior antes de actualizar.
