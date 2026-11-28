package com.nexus.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Avisa aunque la app esté cerrada cuando termina la descarga de la APK. */
public class UpdateDownloadReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        UpdaterPlugin.onDownloadComplete(context, intent);
    }
}
