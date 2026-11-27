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
