package com.nexus.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

@CapacitorPlugin(name = "NexusNative")
public class NexusNotifyPlugin extends Plugin {
    private static String pendingOpen = null;

    static void setPendingOpen(String json) {
        pendingOpen = json;
    }

    @PluginMethod
    public void consumeOpen(PluginCall call) {
        JSObject result = new JSObject();
        if (pendingOpen != null) {
            try {
                JSONObject data = new JSONObject(pendingOpen);
                if (data.has("fromId")) result.put("fromId", data.getString("fromId"));
                if (data.has("callId")) result.put("callId", data.getString("callId"));
            } catch (Exception ignored) {
                // Ignorar datos corruptos.
            }
            pendingOpen = null;
        }
        call.resolve(result);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        Context context = getContext();
        String token = call.getString("token", "");
        String userId = call.getString("userId", "");
        String serverUrl = call.getString("serverUrl", "");
        boolean sound = call.getBoolean("sound", true);
        boolean quiet = call.getBoolean("quiet", false);

        NexusPrefs.save(context, token, userId, serverUrl, sound, quiet);
        requestNotificationPermission();
        if (!token.isEmpty()) NexusMessagingService.start(context);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        NexusPrefs.clear(getContext());
        getContext().stopService(new android.content.Intent(getContext(), NexusMessagingService.class));
        call.resolve();
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        Context context = getContext();
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        if (context instanceof Activity) {
            ActivityCompat.requestPermissions(
                    (Activity) context,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    2001
            );
        }
    }
}
