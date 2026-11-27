import { Capacitor, registerPlugin } from '@capacitor/core';

// En la web (PC/navegador) el plugin no existe: todas las funciones son no-op.
const NexusNative = registerPlugin('NexusNative');

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
