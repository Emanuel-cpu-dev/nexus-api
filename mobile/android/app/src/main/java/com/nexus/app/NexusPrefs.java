package com.nexus.app;

import android.content.Context;
import android.content.SharedPreferences;

final class NexusPrefs {
    private static final String NAME = "nexus_native";

    private NexusPrefs() {}

    static SharedPreferences get(Context context) {
        return context.getSharedPreferences(NAME, Context.MODE_PRIVATE);
    }

    static void save(Context context, String token, String userId, String serverUrl, boolean sound, boolean quiet) {
        get(context).edit()
                .putString("token", token)
                .putString("userId", userId)
                .putString("serverUrl", serverUrl)
                .putBoolean("sound", sound)
                .putBoolean("quiet", quiet)
                .apply();
    }

    static String token(Context context) {
        return get(context).getString("token", "");
    }

    static String userId(Context context) {
        return get(context).getString("userId", "");
    }

    static String serverUrl(Context context) {
        return get(context).getString("serverUrl", "");
    }

    static boolean sound(Context context) {
        return get(context).getBoolean("sound", true);
    }

    static boolean quiet(Context context) {
        return get(context).getBoolean("quiet", false);
    }

    static boolean hasToken(Context context) {
        String token = token(context);
        return token != null && !token.isEmpty();
    }

    static void clear(Context context) {
        get(context).edit().clear().apply();
    }
}
