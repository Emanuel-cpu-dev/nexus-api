# Heph en Android (APK)

La APK es un envoltorio nativo (Capacitor/WebView) que abre la misma interfaz que ya está en Render:

`https://nexus-api-cdxi.onrender.com`

No cambia el backend ni el `.exe` de escritorio: la interfaz se actualiza sola desde Render con cada `git push`. Los cambios nativos (como los avisos en segundo plano) requieren instalar la APK nueva una sola vez; después la propia app la descarga en segundo plano y avisa cuando está lista. Las cuentas, amistades y mensajes son los mismos.

Cuando haya una APK nueva, la app la **descarga sola en segundo plano** y muestra un aviso cuando ya está lista: se toca **Instalar** (o la notificación) y se abre el instalador. Android siempre pide la confirmación final; ninguna app normal puede saltearla. No hace falta abrir links ni pasar otro archivo. Los cambios de interfaz siguen llegando solos, sin actualizar la APK.

Si ya tenés una versión anterior instalada, no necesitás el link: al abrir Heph aparece el cartel para pasar a la 1.23. Además, el servidor manda una **notificación de actualización obligatoria** apenas entra la app y la repite cada minuto mientras siga abierta, aunque hayas sacado la notificación anterior. Al tocarla abre Heph directamente en el aviso. El cartel no tiene botón de cerrar y solo desaparece cuando la app informa que ya instaló la versión nueva. El link de descarga queda solo para instalar por primera vez o para alguien que se haya quedado en una versión sin actualizador.

## Instalar en el celular

1. Mejor: abrir en el celular `https://nexus-api-cdxi.onrender.com/Nexus.apk` con Chrome. Si se pasa por WhatsApp, mandar `Nexus.apk` suelto (no el ZIP).
2. Abrir el archivo desde Descargas con la app Archivos.
3. Si Android pide permiso: **Configuración → Permitir instalación de aplicaciones desconocidas**.
4. Si aparece Play Protect: **Más información → Instalar de todos modos**.
5. Abrir Heph y aceptar permisos de **cámara**, **micrófono** y **notificaciones** cuando salten. El permiso de notificaciones es necesario para que lleguen los avisos con la app cerrada.

## Qué funciona y qué no

- ✅ Chat, amigos, códigos, estados, comunidad, historias y videollamadas (WebRTC nativo del WebView).
- ✅ Llamadas de hasta **5 participantes**: se pueden invitar amigos desde la propia llamada y todos se escuchan. Si sale uno, la sala sigue con los demás; el anfitrión puede **Finalizar sala** desde los controles.
- ✅ La llamada se puede **minimizar** con el botón **－**: sigue sonando y podés usar el resto de la app; volvés a tocar la barrita flotante para abrirla.
- ✅ Audio en llamadas; si no arranca, tocar **🔊 Activar sonido** dentro de la llamada.
- ✅ En los comentarios se ve quién escribió cada uno: nombre, usuario y hace cuánto, además del avatar y el texto.
- ✅ “Recordarme”: viene activado por defecto en PC y celular; al abrir Heph entrás solo con tu usuario. Si cerrás sesión a propósito, ahí sí se borran los datos guardados.
- ✅ Fotos de perfil y archivos guardados dentro de SQLite: ya no desaparecen cuando Render hace un deploy.
- ✅ Notificaciones de mensajes, solicitudes y llamadas aunque la app esté en segundo plano: suenan, vibran y al tocarlas abren el chat o la llamada. Android muestra una notificación discreta de “Heph activo” mientras el servicio sigue prendido.
- ✅ Interfaz responsive: menú abajo, chats a pantalla completa **dentro de la app** con botón ←, tarjetas y llamadas adaptadas al celular.
- ✅ **Tirar hacia abajo para actualizar** (como Instagram) en Inicio, Amigos, Chats, Comunidades, Perfil y Configuración.
- ✅ Ícono y pantalla de carga con el logo Heph (la H y la palabra HEPH), igual que en la PC.
- ✅ La hora, batería y barra del celular ya no tapan la interfaz: el contenido se dibuja por debajo del área segura del sistema.
- ✅ Actualizador integrado: descarga en segundo plano, aviso cuando está lista e instalación con un toque desde la notificación o el botón **Instalar**. Versión actual: 1.23. La actualización 1.23 es obligatoria, no se puede cerrar y se vuelve a avisar hasta que la app informe que ya está actualizada.

- ✅ El **horóscopo del Inicio** es una historia de **12 signos**: foto y texto real del día que cambian solos, se cierra con **✕**, **Escape** o al llegar al último. Tocá la imagen (o **📖 Leer**) para ver general, amor, trabajo, salud, dinero, consejo y compatibilidad con letra grande: el auto-avance se pausa mientras leés. Podés dar ❤️, escribir 💬 y tocar **↗️ Compartir** para poner tu signo en tu propia historia con un mensaje opcional (mg). Al abrir la app en un día nuevo avisa sola.
- ✅ El nombre de la app es **Heph** y el icono es la **H** estilizada con la palabra HEPH, en escritorio y Android. La marca visible dice **HEPH** y debajo **·conectados·**, con letra elegante y centrada en el inicio del celular, el menú, el login y la carga.
- ✅ Los archivos para compartir siguen llamándose `Nexus-Portable.exe` y `Nexus.apk` para no romper las actualizaciones ni las cuentas.
- ✅ Tus historias muestran el **texto/mensaje** que les pusiste al compartirlas.
- ✅ Las fotos de perfil se recortan siempre en un **círculo perfecto**: aunque una foto tenga transparencia o una proporción rara, no se ve ovalada ni tapa el nombre en las historias.
- ✅ Las **llamadas son más livianas**: video a resolución moderada, menos cuadros por segundo y pantallas de video optimizadas para usar menos CPU y batería. Siguen funcionando con 5 participantes, filtros y compartir pantalla con audio.
- ✅ Botón **atrás** como en Instagram/Facebook/LinkedIn: vuelve al chat, al perfil o a la pantalla anterior y recién en el **Inicio** sale de la app.
- ✅ **Ubicación en tiempo real** en la sección 📍: un amigo te la muestra solo si te da permiso; podés pedirla, ver el mapa, revocar el acceso o dejar de compartir la tuya.
- ✅ Heph queda **dentro de un contenedor**, no en pantalla completa del sistema: arriba y abajo se reserva el espacio de la hora, la señal, el WiFi y los 3 botones del Android. Ni los títulos ni el menú inferior quedan tapados.
- ✅ Si la foto de perfil se perdió en un deploy anterior, volvela a subir una vez en **Mi perfil**; desde ahora queda guardada en la base.
- ✅ El teclado del celular ya no tapa lo que escribís: el campo del chat queda arriba del teclado y la interfaz se achica con él.
- ✅ Desde el Inicio se puede tocar **➕ Agregar** en la publicación de alguien para mandarle la solicitud de amistad sin entrar a su perfil.
- ✅ Se pueden **repostear** publicaciones con **🔁**; aparece la original incrustada y se puede deshacer tocando de nuevo.
- ✅ En **🔔 Avisos** (menú y Mi perfil) aparecen juntos los MG y las menciones, con badge de cantidad.
- ✅ Escribí **@** en una publicación o en el pie de una foto para etiquetar a alguien: aparecen sugerencias, al etiquetado le llega un aviso y al tocarlo se abre la publicación.
- ✅ Los badges de **🔔 Avisos** se apagan al abrir la pantalla (como Instagram) y no vuelven al recargar; solo suman lo que llegue después.
- ✅ En el chat se pueden mandar fotos de la galería o sacarlas con la **📷 cámara**. La opción **👁️ Una sola vez** entrega la imagen una única vez y no deja una URL pública.
- ✅ En **Inicio** se pueden publicar **historias** (foto o video, se borran en 24 h), ver las de amigos y tocar **Ver quién la vio** en las propias.
- ✅ Las publicaciones también se pueden hacer con foto tomada con la cámara.
- ✅ En las videollamadas hay filtros (Natural, B/N, Sepia, Frío, Cálido) y desenfoque; el otro participante ve el video ya filtrado.
- ✅ Si una llamada se corta por la red, se renegocia sola; al prender la cámara de nuevo se vuelve a abrir aunque se haya apagado antes.
- ✅ La PC se actualiza con el cartel **Actualizar** dentro de la app, sin descargar otro `.exe`.
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

Si en esta máquina no está instalado `@capacitor/cli` (`npx cap` falla), alcanza con copiar `C:\Nexus\app\dist\index.html` y `C:\Nexus\app\dist\assets\*` a `mobile\android\app\src\main\assets\public\` (borrando los assets viejos) antes de compilar. El resto de la configuración de Capacitor ya está en el repo.

Los íconos y el splash se generan desde el `.ico` de la PC con `.\generate-icons.ps1` (dentro de `mobile`). No hace falta editar PNG a mano.

La APK firmada queda en `mobile/android/app/build/outputs/apk/release/app-release.apk`. Copiarla a `C:\Nexus\Nexus.apk`.

Para publicar una actualización: subir el `versionCode` en `mobile/android/app/build.gradle`, actualizar `mobile-release.json` con el mismo número y notas, compilar, copiar la APK y hacer `git push`. La app detectará el cambio y mostrará el aviso.

**Importante:** conservar `mobile/android/app/nexus.keystore` y su `keystore.properties` (están ignorados por git). Si se pierden, la próxima APK tendrá otra firma y Android pedirá desinstalar la anterior antes de actualizar.
