package com.nexus.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(NexusNotifyPlugin.class);
        super.onCreate(savedInstanceState);
        // Permite que el audio de las videollamadas arranque sin exigir un toque extra.
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        getBridge().getWebView().getSettings().setDomStorageEnabled(true);

        // Android 15 dibuja el WebView debajo de la barra de estado.
        // Reservamos el espacio de barras para que la hora/batería no tape la interfaz.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 2001);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNexusIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        handleNexusIntent(getIntent());
    }

    // El aviso abrió la app: le decimos a React qué chat o llamada debe mostrar.
    private void handleNexusIntent(Intent intent) {
        if (intent == null) return;
        String fromId = intent.getStringExtra("nexusFromId");
        String callId = intent.getStringExtra("nexusCallId");
        if (fromId == null && callId == null) return;

        JSONObject detail = new JSONObject();
        try {
            if (fromId != null) detail.put("fromId", fromId);
            if (callId != null) detail.put("callId", callId);
        } catch (Exception ignored) {
            return;
        }
        NexusNotifyPlugin.setPendingOpen(detail.toString());
        intent.removeExtra("nexusFromId");
        intent.removeExtra("nexusCallId");
    }
}
