import { Capacitor, registerPlugin } from '@capacitor/core';

// En la web (PC/navegador) el plugin no existe: todas las funciones son no-op.
const NexusNative = registerPlugin('NexusNative');
const NexusLocation = registerPlugin('NexusLocation');

export function isNative() {
  return Capacitor.getPlatform() !== 'web';
}

export async function configureNative(options) {
  if (!isNative()) return;
  try {
    await NexusNative.configure(options);
  } catch {
    // APK anterior sin el plugin nativo: la interfaz sigue funcionando igual.
  }
}

export async function stopNative() {
  if (!isNative()) return;
  try {
    await NexusNative.stop();
  } catch {
    // Ignorar.
  }
}

export async function consumeNativeOpen() {
  if (!isNative()) return null;
  try {
    return await NexusNative.consumeOpen();
  } catch {
    return null;
  }
}

// Muestra el aviso de actualización en la bandeja del celular, aunque la app esté abierta.
export async function showNativeUpdate(update) {
  if (!isNative() || !update) return;
  try {
    await NexusNative.notifyUpdate({
      versionCode: Number(update.versionCode) || 0,
      versionName: String(update.versionName || ''),
      notes: String(update.notes || '')
    });
  } catch {
    // APK anterior: el cartel dentro de la app igual aparece.
  }
}

// El aviso nativo avisa en el momento en que se toca, aunque la app ya estuviera abierta.
export function onNativeOpen(callback) {
  if (!isNative()) return () => {};
  try {
    const handle = NexusNative.addListener('nexusOpen', callback);
    return () => handle?.remove?.();
  } catch {
    return () => {};
  }
}

// Botón físico "atrás": la app decide si vuelve a la pantalla anterior o sale.
export async function registerBack() {
  if (!isNative()) return;
  try {
    await NexusNative.registerBack();
  } catch {
    // APK anterior: Android cierra la app como antes.
  }
}

export function onAndroidBack(callback) {
  if (!isNative()) return () => {};
  try {
    const handle = NexusNative.addListener('nexusBack', callback);
    return () => handle?.remove?.();
  } catch {
    return () => {};
  }
}

export async function exitApp() {
  if (!isNative()) return;
  try {
    await NexusNative.exitApp();
  } catch {
    // Ignorar.
  }
}

// Ubicación: el plugin nativo usa el GPS cuando está disponible; si no,
// la app cae al geolocation del navegador.
export async function startNativeLocation() {
  if (!isNative()) return false;
  try {
    await NexusLocation.start();
    return true;
  } catch {
    return false;
  }
}

export async function stopNativeLocation() {
  if (!isNative()) return;
  try {
    await NexusLocation.stop();
  } catch {
    // Ignorar.
  }
}

export function onNativeLocation(callback) {
  if (!isNative()) return () => {};
  try {
    const handle = NexusLocation.addListener('nexusLocation', callback);
    return () => handle?.remove?.();
  } catch {
    return () => {};
  }
}
