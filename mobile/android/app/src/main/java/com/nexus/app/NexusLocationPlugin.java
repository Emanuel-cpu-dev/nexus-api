package com.nexus.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Entrega la posición del dispositivo al WebView sin depender de Google Play Services.
 * Solo escucha mientras el usuario tiene activado el permiso de compartir.
 */
@CapacitorPlugin(name = "NexusLocation")
public class NexusLocationPlugin extends Plugin {
    static final int REQUEST_LOCATION = 2002;
    private static NexusLocationPlugin instance;

    private LocationManager manager;
    private PluginCall pendingCall;
    private boolean listening = false;

    private final LocationListener listener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            emit(location);
        }

        @Override
        public void onStatusChanged(String provider, int status, Bundle extras) {
            // No se usa: Android 10+ ya no lo llama.
        }

        @Override
        public void onProviderEnabled(String provider) {
            // El proveedor vuelve a estar disponible en la próxima actualización.
        }

        @Override
        public void onProviderDisabled(String provider) {
            // El otro proveedor sigue activo si el usuario lo habilitó.
        }
    };

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    private boolean hasPermission() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void start(PluginCall call) {
        pendingCall = call;
        if (hasPermission()) {
            startListening();
            call.resolve();
            return;
        }
        ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                },
                REQUEST_LOCATION
        );
    }

    static void onPermissionsResult(int requestCode, int[] grantResults) {
        if (instance == null || requestCode != REQUEST_LOCATION) return;
        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted) instance.startListening();
        if (instance.pendingCall != null) {
            if (granted) instance.pendingCall.resolve();
            else instance.pendingCall.reject("Permiso de ubicación denegado");
            instance.pendingCall = null;
        }
    }

    private void startListening() {
        if (listening || !hasPermission()) return;
        manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) return;
        listening = true;
        for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
            try {
                Location last = manager.getLastKnownLocation(provider);
                if (last != null) emit(last);
                manager.requestLocationUpdates(provider, 15000L, 10f, listener);
            } catch (SecurityException ignored) {
                // Sin permiso no se registra; el otro proveedor puede funcionar.
            } catch (IllegalArgumentException ignored) {
                // Proveedor desactivado en este dispositivo.
            }
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopListening();
        call.resolve();
    }

    private void stopListening() {
        if (manager != null && listening) {
            try {
                manager.removeUpdates(listener);
            } catch (SecurityException ignored) {
                // El permiso ya fue revocado desde Ajustes.
            }
        }
        listening = false;
    }

    private void emit(Location location) {
        JSObject event = new JSObject();
        event.put("lat", location.getLatitude());
        event.put("lng", location.getLongitude());
        event.put("accuracy", location.getAccuracy());
        event.put("at", System.currentTimeMillis());
        notifyListeners("nexusLocation", event, true);
    }

    @Override
    protected void handleOnDestroy() {
        stopListening();
        instance = null;
        super.handleOnDestroy();
    }
}
