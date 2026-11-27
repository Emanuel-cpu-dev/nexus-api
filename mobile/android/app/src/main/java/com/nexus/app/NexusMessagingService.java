package com.nexus.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.util.Arrays;
import java.util.Collections;
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

    private final AtomicInteger notificationId = new AtomicInteger(2000);
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
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
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
            socket.on("friend:request", args -> onFriendRequest(args));
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

        manager.createNotificationChannels(Arrays.asList(
                foreground, messages, calls, messagesSilent, callsSilent));
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
            NotificationCompat.Builder builder = base(
                    quiet ? CH_MESSAGES_SILENT : CH_MESSAGES, name, text, openApp(from, null, 1));
            builder.setCategory(Notification.CATEGORY_MESSAGE);
            if (!quiet) {
                builder.setSound(defaultSound(RingtoneManager.TYPE_NOTIFICATION), AudioManager.STREAM_NOTIFICATION);
                builder.setVibrate(new long[]{0, 180, 120, 180});
            }
            show(notificationId.getAndIncrement(), builder.build());
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
            NotificationCompat.Builder builder = base(
                    quiet ? CH_CALLS_SILENT : CH_CALLS,
                    "Llamada entrante · " + name, body, openApp(null, callId, 2));
            builder.setCategory(Notification.CATEGORY_CALL);
            builder.setPriority(NotificationCompat.PRIORITY_MAX);
            builder.setOngoing(false);
            if (!quiet) {
                builder.setSound(defaultSound(RingtoneManager.TYPE_RINGTONE), AudioManager.STREAM_RING);
                builder.setVibrate(new long[]{0, 500, 250, 500});
                builder.setFullScreenIntent(openApp(null, callId, 3), true);
            }
            show(notificationId.getAndIncrement(), builder.build());
        } catch (Exception ignored) {
            // Ignorar.
        }
    }

    private void onFriendRequest(Object[] args) {
        try {
            JSONObject payload = (JSONObject) args[0];
            JSONObject from = payload.optJSONObject("from");
            String name = from != null ? from.optString("displayName", "") : "";
            if (name.isEmpty()) name = "Alguien";
            boolean quiet = silent();
            NotificationCompat.Builder builder = base(
                    quiet ? CH_MESSAGES_SILENT : CH_MESSAGES,
                    "Solicitud de amistad", name + " quiere ser tu amigo", openApp(null, null, 4));
            if (!quiet) {
                builder.setSound(defaultSound(RingtoneManager.TYPE_NOTIFICATION), AudioManager.STREAM_NOTIFICATION);
            }
            show(notificationId.getAndIncrement(), builder.build());
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
