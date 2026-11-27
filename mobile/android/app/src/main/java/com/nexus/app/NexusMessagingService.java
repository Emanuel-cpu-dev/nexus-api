package com.nexus.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import io.socket.client.IO;
import io.socket.client.Socket;

/**
 * Mantiene la conexión con Render aunque la app esté en segundo plano y muestra
 * avisos de mensajes y llamadas entrantes. Es un servicio en primer plano con
 * una notificación discreta para que Android no lo mater al cerrar la pantalla.
 */
public class NexusMessagingService extends Service {
    private static final String CH_FOREGROUND = "nexus_foreground";
    // Canales nuevos: los canales de Android no cambian de sonido una vez creados.
    private static final String CH_MESSAGES = "nexus_messages_v2";
    private static final String CH_CALLS = "nexus_calls_v2";
    private static final String CH_MESSAGES_SILENT = "nexus_messages_silent";
    private static final String CH_CALLS_SILENT = "nexus_calls_silent";
    private static final String CH_UPDATES = "nexus_updates";
    private static final String ACTION_UPDATE = "com.nexus.app.UPDATE";
    private static final int UPDATE_NOTIFICATION_ID = 4000;
    private static final long UPDATE_INTERVAL = 15 * 60 * 1000;

    private final AtomicInteger notificationId = new AtomicInteger(2000);
    private final Map<String, Integer> callNotifications = new ConcurrentHashMap<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable updateCheck = new Runnable() {
        @Override
        public void run() {
            checkUpdate();
            handler.postDelayed(this, UPDATE_INTERVAL);
        }
    };
    private Socket socket;
    private String currentToken = "";
    private String currentUrl = "";

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
        startForeground(1000, foregroundNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_UPDATE.equals(intent.getAction())) {
            long version = intent.getLongExtra("versionCode", 0);
            if (version > installedVersion()) {
                showUpdateNotification(
                        intent.getStringExtra("versionName"),
                        intent.getStringExtra("notes"));
            }
        }
        String token = NexusPrefs.token(this);
        String url = NexusPrefs.serverUrl(this);
        if (NexusPrefs.hasToken(this) && token != null && url != null && !url.isEmpty()) {
            if (!token.equals(currentToken) || !url.equals(currentUrl)) connect(token, url);
        } else if (socket != null) {
            socket.disconnect();
            socket = null;
            currentToken = "";
            currentUrl = "";
        }
        scheduleUpdateCheck();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(updateCheck);
        if (socket != null) socket.disconnect();
        socket = null;
        super.onDestroy();
    }

    private void connect(String token, String url) {
        if (socket != null) socket.disconnect();
        currentToken = token;
        currentUrl = url;
        try {
            IO.Options options = new IO.Options();
            options.auth = Collections.singletonMap("token", token);
            options.reconnection = true;
            options.reconnectionDelay = 1000;
            options.reconnectionDelayMax = 10000;
            options.timeout = 10000;

            socket = IO.socket(url, options);
            socket.on("dm:message", args -> onMessage(args));
            socket.on("call:invite", args -> onCall(args));
            socket.on("call:ready", args -> onCallReady(args));
            socket.on("call:ended", args -> onCallEnded(args));
            socket.on("friend:request", args -> onFriendRequest(args));
            socket.on(Socket.EVENT_CONNECT, args -> {
                try {
                    JSONObject version = new JSONObject();
                    version.put("versionCode", installedVersion());
                    socket.emit("app:version", version);
                } catch (Exception ignored) {
                    // Si no se puede informar, el servidor sigue mandando el aviso inicial.
                }
            });
            socket.connect();
        } catch (Exception error) {
            socket = null;
        }
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;

        // Canales viejos sin sonido: se eliminan para que no queden en Ajustes.
        manager.deleteNotificationChannel("nexus_messages");
        manager.deleteNotificationChannel("nexus_calls");

        NotificationChannel foreground = new NotificationChannel(
                CH_FOREGROUND, "Nexus en segundo plano", NotificationManager.IMPORTANCE_LOW);

        NotificationChannel messages = new NotificationChannel(
                CH_MESSAGES, "Mensajes", NotificationManager.IMPORTANCE_HIGH);
        messages.setSound(defaultSound(RingtoneManager.TYPE_NOTIFICATION), audioAttributes(AudioAttributes.USAGE_NOTIFICATION));
        messages.enableVibration(true);
        messages.setVibrationPattern(new long[]{0, 180, 120, 180});

        NotificationChannel calls = new NotificationChannel(
                CH_CALLS, "Llamadas entrantes", NotificationManager.IMPORTANCE_HIGH);
        calls.setSound(defaultSound(RingtoneManager.TYPE_RINGTONE), audioAttributes(AudioAttributes.USAGE_NOTIFICATION_RINGTONE));
        calls.enableVibration(true);
        calls.setVibrationPattern(new long[]{0, 500, 250, 500});

        NotificationChannel messagesSilent = new NotificationChannel(
                CH_MESSAGES_SILENT, "Mensajes silenciosos", NotificationManager.IMPORTANCE_LOW);
        messagesSilent.setSound(null, null);
        messagesSilent.enableVibration(false);

        NotificationChannel callsSilent = new NotificationChannel(
                CH_CALLS_SILENT, "Llamadas silenciosas", NotificationManager.IMPORTANCE_HIGH);
        callsSilent.setSound(null, null);
        callsSilent.enableVibration(false);

        NotificationChannel updates = new NotificationChannel(
                CH_UPDATES, "Actualizaciones obligatorias", NotificationManager.IMPORTANCE_HIGH);
        updates.setSound(defaultSound(RingtoneManager.TYPE_NOTIFICATION),
                audioAttributes(AudioAttributes.USAGE_NOTIFICATION));
        updates.enableVibration(true);
        updates.setVibrationPattern(new long[]{0, 200, 120, 200});

        manager.createNotificationChannels(Arrays.asList(
                foreground, messages, calls, messagesSilent, callsSilent, updates));
    }

    private Notification foregroundNotification() {
        PendingIntent open = openApp(null, null, 0);
        return new NotificationCompat.Builder(this, CH_FOREGROUND)
                .setContentTitle("Nexus activo")
                .setContentText("Avisos de mensajes y llamadas encendidos")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(open)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private PendingIntent openApp(String fromId, String callId, int requestCode) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (fromId != null) intent.putExtra("nexusFromId", fromId);
        if (callId != null) intent.putExtra("nexusCallId", callId);
        return PendingIntent.getActivity(
                this, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private boolean silent() {
        return NexusPrefs.quiet(this) || !NexusPrefs.sound(this);
    }

    private void onMessage(Object[] args) {
        try {
            JSONObject payload = (JSONObject) args[0];
            if (payload.optBoolean("updateNotice")) {
                long version = payload.optLong("versionCode", 0);
                if (version > installedVersion()) {
                    handler.post(() -> showUpdateNotification(
                            payload.optString("versionName", ""),
                            payload.optString("notes", "")));
                }
                return;
            }
            JSONObject message = payload.optJSONObject("message");
            if (message == null) return;
            String from = message.optString("fromId", "");
            if (from.equals(NexusPrefs.userId(this))) return;
            JSONObject author = message.optJSONObject("author");
            String name = author != null ? author.optString("displayName", "") : "";
            if (name.isEmpty()) name = "Nuevo mensaje";
            String text = message.optString("text", "");
            if (text.isEmpty() && message.optJSONObject("file") != null) text = "📎 Archivo adjunto";
            if (text.isEmpty()) text = "Nuevo mensaje";

            boolean quiet = silent();
            int id = notificationId.getAndIncrement();
            NotificationCompat.Builder builder = base(
                    quiet ? CH_MESSAGES_SILENT : CH_MESSAGES, name, text, openApp(from, null, id));
            builder.setCategory(Notification.CATEGORY_MESSAGE);
            if (!quiet) {
                builder.setSound(defaultSound(RingtoneManager.TYPE_NOTIFICATION));
                builder.setVibrate(new long[]{0, 180, 120, 180});
            }
            show(id, builder.build());
        } catch (Exception ignored) {
            // Un paquete malformado no debe tumbar el servicio.
        }
    }

    private void onCall(Object[] args) {
        try {
            JSONObject payload = (JSONObject) args[0];
            JSONObject from = payload.optJSONObject("from");
            String name = from != null ? from.optString("displayName", "") : "";
            if (name.isEmpty()) name = "Un amigo";
            String callId = payload.optString("callId", "");
            String body = payload.optBoolean("video", true)
                    ? "Te está llamando por video"
                    : "Te está llamando";

            boolean quiet = silent();
            int id = notificationId.getAndIncrement();
            NotificationCompat.Builder builder = base(
                    quiet ? CH_CALLS_SILENT : CH_CALLS,
                    "Llamada entrante · " + name, body, openApp(null, callId, id));
            builder.setCategory(Notification.CATEGORY_CALL);
            builder.setPriority(NotificationCompat.PRIORITY_MAX);
            builder.setOngoing(false);
            if (!quiet) {
                builder.setSound(defaultSound(RingtoneManager.TYPE_RINGTONE));
                builder.setVibrate(new long[]{0, 500, 250, 500});
                builder.setFullScreenIntent(openApp(null, callId, id + 100000), true);
            }
            if (!callId.isEmpty()) callNotifications.put(callId, id);
            show(id, builder.build());
        } catch (Exception ignored) {
            // Ignorar.
        }
    }

    // Al aceptar, el timbre debe parar aunque la app esté en segundo plano.
    private void onCallReady(Object[] args) {
        try {
            JSONObject payload = (JSONObject) args[0];
            String callId = payload.optString("callId", "");
            JSONArray peers = payload.optJSONArray("peers");
            String myId = NexusPrefs.userId(this);
            boolean accepted = false;
            if (peers != null) {
                for (int i = 0; i < peers.length(); i += 1) {
                    if (myId != null && myId.equals(peers.optString(i, ""))) accepted = true;
                }
            }
            if (accepted) cancelCall(callId);
        } catch (Exception ignored) {
            // Ignorar.
        }
    }

    // Colgar o cancelar la llamada también apaga el timbre en el celular.
    private void onCallEnded(Object[] args) {
        try {
            JSONObject payload = (JSONObject) args[0];
            cancelCall(payload.optString("callId", ""));
        } catch (Exception ignored) {
            // Ignorar.
        }
    }

    private void cancelCall(String callId) {
        if (callId == null || callId.isEmpty()) return;
        Integer id = callNotifications.remove(callId);
        if (id != null) NotificationManagerCompat.from(this).cancel(id);
    }

    // Aviso de actualización obligatoria: se consulta a Render aunque la app esté cerrada.
    private void scheduleUpdateCheck() {
        handler.removeCallbacks(updateCheck);
        handler.post(updateCheck);
    }

    private void checkUpdate() {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                String server = NexusPrefs.serverUrl(this);
                if (server == null || server.isEmpty()) return;
                URL endpoint = new URL(server.replaceAll("/+$", "") + "/api/app-version");
                connection = (HttpURLConnection) endpoint.openConnection();
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setUseCaches(false);
                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return;

                StringBuilder body = new StringBuilder();
                BufferedReader reader = new BufferedReader(
                        new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
                reader.close();

                JSONObject remote = new JSONObject(body.toString());
                long version = remote.optLong("versionCode", 0);
                if (!remote.optBoolean("force", false) || version <= installedVersion()) {
                    handler.post(() -> NotificationManagerCompat.from(this).cancel(UPDATE_NOTIFICATION_ID));
                    return;
                }
                String name = remote.optString("versionName", "");
                String notes = remote.optString("notes", "");
                handler.post(() -> showUpdateNotification(name, notes));
            } catch (Exception ignored) {
                // Sin red no hay aviso; se reintenta en el próximo ciclo.
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private long installedVersion() {
        return installedVersion(this);
    }

    private static long installedVersion(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? info.getLongVersionCode() : info.versionCode;
        } catch (PackageManager.NameNotFoundException error) {
            return Long.MAX_VALUE;
        }
    }

    // La interfaz puede pedir el aviso apenas detecta la versión obligatoria.
    static void showUpdate(Context context, long version, String versionName, String notes) {
        if (version <= 0 || version <= installedVersion(context)) return;
        Intent intent = new Intent(context, NexusMessagingService.class);
        intent.setAction(ACTION_UPDATE);
        intent.putExtra("versionCode", version);
        intent.putExtra("versionName", versionName);
        intent.putExtra("notes", notes);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, intent);
        } else {
            context.startService(intent);
        }
    }

    private void showUpdateNotification(String versionName, String notes) {
        if (versionName == null) versionName = "";
        if (notes == null) notes = "";
        String detail = "Nexus " + versionName + " está listo. Abrí la app y tocá Actualizar.";
        if (!notes.isEmpty()) detail = notes + " Abrí la app y tocá Actualizar.";
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CH_UPDATES)
                .setContentTitle("⬆️ Actualización obligatoria de Nexus")
                .setContentText(detail)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(detail))
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentIntent(openApp(null, null, 5000))
                .setCategory(Notification.CATEGORY_RECOMMENDATION)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setAutoCancel(true)
                .setOngoing(false)
                .setSound(defaultSound(RingtoneManager.TYPE_NOTIFICATION))
                .setVibrate(new long[]{0, 200, 120, 200});
        show(UPDATE_NOTIFICATION_ID, builder.build());
    }

    private void onFriendRequest(Object[] args) {
        try {
            JSONObject payload = (JSONObject) args[0];
            JSONObject from = payload.optJSONObject("from");
            String name = from != null ? from.optString("displayName", "") : "";
            if (name.isEmpty()) name = "Alguien";
            boolean quiet = silent();
            int id = notificationId.getAndIncrement();
            NotificationCompat.Builder builder = base(
                    quiet ? CH_MESSAGES_SILENT : CH_MESSAGES,
                    "Solicitud de amistad", name + " quiere ser tu amigo", openApp(null, null, id));
            if (!quiet) {
                builder.setSound(defaultSound(RingtoneManager.TYPE_NOTIFICATION));
            }
            show(id, builder.build());
        } catch (Exception ignored) {
            // Ignorar.
        }
    }

    private Uri defaultSound(int type) {
        Uri uri = RingtoneManager.getDefaultUri(type);
        return uri != null ? uri : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
    }

    private AudioAttributes audioAttributes(int usage) {
        return new AudioAttributes.Builder()
                .setUsage(usage)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
    }

    private NotificationCompat.Builder base(String channel, String title, String body, PendingIntent open) {
        return new NotificationCompat.Builder(this, channel)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentIntent(open)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH);
    }

    private void show(int id, Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return;
        NotificationManagerCompat.from(this).notify(id, notification);
    }

    static void start(Context context) {
        Intent intent = new Intent(context, NexusMessagingService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, intent);
        } else {
            context.startService(intent);
        }
    }
}
