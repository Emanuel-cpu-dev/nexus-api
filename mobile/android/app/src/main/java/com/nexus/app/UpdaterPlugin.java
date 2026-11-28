package com.nexus.app;

import android.Manifest;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Actualizador de la APK desde dentro de la propia app.
 * Descarga en segundo plano con DownloadManager; cuando termina muestra un
 * aviso. Un toque en el aviso (o en el botón de la app) abre el instalador.
 * Nunca abre links ni Play Store.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    private static final String PREFS = "nexus_update";
    private static final String KEY_DOWNLOAD_ID = "downloadId";
    private static final String KEY_VERSION = "versionCode";
    private static final String KEY_NAME = "versionName";
    private static final String CHANNEL = "nexus_updates";
    private static final int READY_NOTIFICATION_ID = 4100;

    private static UpdaterPlugin instance = null;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        instance = null;
        super.handleOnDestroy();
    }

    private static android.content.SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static File apkFile(Context context) {
        return new File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Nexus.apk");
    }

    private static long downloadId(Context context) {
        return prefs(context).getLong(KEY_DOWNLOAD_ID, -1);
    }

    private static DownloadManager manager(Context context) {
        return (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
    }

    private static int downloadStatus(Context context) {
        long id = downloadId(context);
        if (id < 0) return -1;
        DownloadManager manager = manager(context);
        if (manager == null) return -1;
        Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id));
        if (cursor == null) return -1;
        try {
            if (!cursor.moveToFirst()) return -1;
            return cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
        } finally {
            cursor.close();
        }
    }

    private static boolean downloaded(Context context) {
        return downloadStatus(context) == DownloadManager.STATUS_SUCCESSFUL && apkFile(context).exists();
    }

    private static boolean downloading(Context context) {
        int status = downloadStatus(context);
        return status == DownloadManager.STATUS_PENDING || status == DownloadManager.STATUS_RUNNING;
    }

    static boolean isPrepared(Context context) {
        return downloaded(context);
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL,
                "Actualizaciones de Nexus",
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Avisos cuando una versión nueva ya está descargada.");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 200, 120, 200});
        manager.createNotificationChannel(channel);
    }

    static PendingIntent readyPendingIntent(Context context) {
        File apk = apkFile(context);
        Uri uri = FileProvider.getUriForFile(
                context, context.getPackageName() + ".fileprovider", apk);
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(uri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, 4100, install, flags);
    }

    static void showReadyNotification(Context context, String versionName) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return;
        createChannel(context);
        String text = "Tocá para instalar"
                + (versionName == null || versionName.isEmpty() ? " la versión nueva." : " la versión " + versionName + ".");
        Notification notification = new NotificationCompat.Builder(context, CHANNEL)
                .setContentTitle("⬆️ Nexus listo para actualizar")
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentIntent(readyPendingIntent(context))
                .setCategory(Notification.CATEGORY_RECOMMENDATION)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setOngoing(false)
                .build();
        NotificationManagerCompat.from(context).notify(READY_NOTIFICATION_ID, notification);
    }

    /** Llamado por UpdateDownloadReceiver incluso con la app cerrada. */
    static void onDownloadComplete(Context context, Intent intent) {
        if (intent == null || !DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
        long finished = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
        if (finished != downloadId(context)) return;
        if (!downloaded(context)) return;

        String versionName = prefs(context).getString(KEY_NAME, "");
        showReadyNotification(context, versionName);

        if (instance != null) {
            JSObject event = new JSObject();
            event.put("ready", true);
            event.put("versionCode", prefs(context).getLong(KEY_VERSION, 0));
            event.put("versionName", versionName);
            instance.notifyListeners("updateReady", event, true);
        }
    }

    static void openInstaller(Context context) {
        Uri uri = FileProvider.getUriForFile(
                context, context.getPackageName() + ".fileprovider", apkFile(context));
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(uri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(install);
    }

    private long enqueue(Context context, String url, long version, String versionName) {
        DownloadManager manager = manager(context);
        if (manager == null) return -1;
        File apk = apkFile(context);
        if (apk.exists() && !apk.delete()) {
            // Si no se puede reemplazar, DownloadManager crearía otro archivo.
        }
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle("Nexus");
        request.setDescription("Descargando la actualización…");
        request.setMimeType("application/vnd.android.package-archive");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
        request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, "Nexus.apk");
        request.setAllowedOverMetered(true);
        request.setAllowedOverRoaming(false);
        long id = manager.enqueue(request);
        prefs(context).edit()
                .putLong(KEY_DOWNLOAD_ID, id)
                .putLong(KEY_VERSION, version)
                .putString(KEY_NAME, versionName == null ? "" : versionName)
                .apply();
        return id;
    }

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? info.getLongVersionCode()
                    : info.versionCode;
            JSObject result = new JSObject();
            result.put("platform", "android");
            result.put("versionCode", code);
            result.put("versionName", info.versionName);
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException error) {
            call.reject("No se pudo leer la versión de la app.");
        }
    }

    @PluginMethod
    public void prepareUpdate(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Falta la URL de la actualización.");
            return;
        }
        long version = call.getInt("versionCode", 0);
        String versionName = call.getString("versionName", "");
        Context context = getContext();

        long savedVersion = prefs(context).getLong(KEY_VERSION, 0);
        if (version > 0 && version <= savedVersion && downloaded(context)) {
            JSObject result = new JSObject();
            result.put("started", false);
            result.put("ready", true);
            result.put("versionCode", version);
            call.resolve(result);
            return;
        }
        if (version > 0 && version == savedVersion && downloading(context)) {
            JSObject result = new JSObject();
            result.put("started", false);
            result.put("ready", false);
            result.put("versionCode", version);
            call.resolve(result);
            return;
        }

        long id = enqueue(context, url, version, versionName);
        if (id < 0) {
            call.reject("No se pudo iniciar la descarga.");
            return;
        }
        JSObject result = new JSObject();
        result.put("started", true);
        result.put("ready", false);
        result.put("downloadId", id);
        call.resolve(result);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();
        boolean ready = downloaded(context);
        result.put("ready", ready);
        result.put("versionCode", prefs(context).getLong(KEY_VERSION, 0));
        result.put("versionName", prefs(context).getString(KEY_NAME, ""));
        call.resolve(result);
    }

    @PluginMethod
    public void installPrepared(PluginCall call) {
        Context context = getContext();
        if (!downloaded(context)) {
            call.reject("La actualización todavía se está descargando.");
            return;
        }
        try {
            openInstaller(context);
            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "No se pudo abrir el instalador." : error.getMessage());
        }
    }

    /** Compatibilidad con la interfaz anterior: inicia la descarga silenciosa. */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Falta la URL de la actualización.");
            return;
        }
        long id = enqueue(getContext(), url, call.getInt("versionCode", 0),
                call.getString("versionName", ""));
        if (id < 0) {
            call.reject("No se pudo iniciar la descarga.");
            return;
        }
        JSObject result = new JSObject();
        result.put("started", true);
        result.put("downloadId", id);
        call.resolve(result);
    }
}
