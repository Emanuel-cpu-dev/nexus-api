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
    private static NexusNotifyPlugin instance = null;
    private static boolean backRegistered = false;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    static void setPendingOpen(String json) {
        pendingOpen = json;
        if (instance == null) return;
        try {
            JSONObject data = new JSONObject(json);
            JSObject event = new JSObject();
            if (data.has("fromId")) event.put("fromId", data.getString("fromId"));
            if (data.has("callId")) event.put("callId", data.getString("callId"));
            if (data.has("postId")) event.put("postId", data.getString("postId"));
            instance.notifyListeners("nexusOpen", event, true);
        } catch (Exception ignored) {
            // El evento se puede recuperar igual con consumeOpen().
        }
    }

    @PluginMethod
    public void consumeOpen(PluginCall call) {
        JSObject result = new JSObject();
        if (pendingOpen != null) {
            try {
                JSONObject data = new JSONObject(pendingOpen);
                if (data.has("fromId")) result.put("fromId", data.getString("fromId"));
                if (data.has("callId")) result.put("callId", data.getString("callId"));
                if (data.has("postId")) result.put("postId", data.getString("postId"));
            } catch (Exception ignored) {
                // Ignorar datos corruptos.
            }
            pendingOpen = null;
        }
        call.resolve(result);
    }

    static boolean onBackPressed() {
        if (instance == null || !backRegistered) return false;
        instance.notifyListeners("nexusBack", new JSObject(), false);
        return true;
    }

    @PluginMethod
    public void registerBack(PluginCall call) {
        backRegistered = true;
        call.resolve();
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) activity.finishAffinity();
        call.resolve();
    }

    @PluginMethod
    public void notifyUpdate(PluginCall call) {
        NexusMessagingService.showUpdate(
                getContext(),
                call.getInt("versionCode", 0),
                call.getString("versionName", ""),
                call.getString("notes", ""));
        call.resolve();
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
