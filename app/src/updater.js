import { Capacitor, registerPlugin } from '@capacitor/core';
import { getServerUrl } from './config.js';

const Updater = registerPlugin('Updater');

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function getNativeVersion() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await Updater.getVersion();
  } catch {
    return null;
  }
}

export async function checkForUpdate() {
  const native = await getNativeVersion();
  if (!native?.versionCode) return null;

  try {
    const response = await fetch(`${getServerUrl()}/api/app-version`, { cache: 'no-store' });
    if (!response.ok) return null;
    const remote = await response.json();
    if (!remote.versionCode || remote.versionCode <= native.versionCode) return null;
    return remote;
  } catch {
    return null;
  }
}

export async function installUpdate(update) {
  const url = new URL(update?.apkUrl || '/Nexus.apk', getServerUrl()).toString();
  if (Capacitor.isNativePlatform()) {
    return Updater.downloadAndInstall({ url });
  }
  window.open(url, '_blank');
  return { started: true };
}
