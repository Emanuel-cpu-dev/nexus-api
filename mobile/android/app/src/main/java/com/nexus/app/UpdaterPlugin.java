package com.nexus.app;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * Actualizador de la APK desde dentro de la propia app.
 * No abre links ni Play Store: descarga el APK publicado en Render y
 * abre el instalador de Android cuando termina.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    private long downloadId = -1;

    private final BroadcastReceiver onComplete = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (downloadId < 0 || !DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
            long finished = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (finished != downloadId) return;

            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) return;

            Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId));
            if (cursor == null) return;
            try {
                if (!cursor.moveToFirst()) return;
                int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                if (status != DownloadManager.STATUS_SUCCESSFUL) return;
            } finally {
                cursor.close();
            }

            File apk = new File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Nexus.apk");
            if (!apk.exists()) return;

            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(uri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(install);
            downloadId = -1;
        }
    };

    @Override
    public void load() {
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(onComplete, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            context.registerReceiver(onComplete, filter);
        }
        super.load();
    }

    @Override
    protected void handleOnDestroy() {
        try {
            getContext().unregisterReceiver(onComplete);
        } catch (IllegalArgumentException ignored) {
            // El receptor ya estaba dado de baja.
        }
        super.handleOnDestroy();
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
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Falta la URL de la actualización.");
            return;
        }

        try {
            Context context = getContext();
            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                call.reject("No se pudo iniciar la descarga.");
                return;
            }

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("Actualizando Nexus");
            request.setDescription("Descargando la nueva versión…");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, "Nexus.apk");

            downloadId = manager.enqueue(request);
            JSObject result = new JSObject();
            result.put("started", true);
            result.put("downloadId", downloadId);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "No se pudo descargar la actualización." : error.getMessage());
        }
    }
}
