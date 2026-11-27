package com.nexus.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(NexusNotifyPlugin.class);
        registerPlugin(NexusLocationPlugin.class);
        super.onCreate(savedInstanceState);
        // Permite que el audio de las videollamadas arranque sin exigir un toque extra.
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        getBridge().getWebView().getSettings().setDomStorageEnabled(true);
        // El tamaño de letra del sistema no debe agrandar la interfaz dentro de la app.
        getBridge().getWebView().getSettings().setTextZoom(100);

        // La app va DENTRO del área útil del celular, no por debajo de la hora,
        // la señal, el wifi ni los 3 botones del Android. El sistema reserva ese
        // espacio y el WebView queda como un contenedor normal.
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.parseColor("#0d0e14"));
        getWindow().setNavigationBarColor(Color.parseColor("#0d0e14"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarDividerColor(Color.parseColor("#0d0e14"));
        }
        View decor = getWindow().getDecorView();
        // Hora, señal, wifi y botones se ven claros sobre el fondo oscuro.
        WindowCompat.getInsetsController(getWindow(), decor).setAppearanceLightStatusBars(false);
        WindowCompat.getInsetsController(getWindow(), decor).setAppearanceLightNavigationBars(false);
        getBridge().getWebView().setFitsSystemWindows(true);

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

    // La pila de pantallas vive en React; Android solo le avisa. Cuando React
    // decide que ya está en el inicio, llama a exitApp().
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (NexusNotifyPlugin.onBackPressed()) return;
        super.onBackPressed();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        NexusLocationPlugin.onPermissionsResult(requestCode, grantResults);
    }
}
