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

export function onUpdateReady(listener) {
  if (!Capacitor.isNativePlatform()) return Promise.resolve({ remove() {} });
  return Updater.addListener('updateReady', listener);
}

function updateParams(update) {
  return {
    url: new URL(update?.apkUrl || '/Nexus.apk', getServerUrl()).toString(),
    versionCode: Number(update?.versionCode) || 0,
    versionName: update?.versionName || ''
  };
}

// Arranca la descarga en segundo plano. El plugin evita repetirla si esa misma
// versión ya está guardada, así que se puede llamar en cada chequeo sin miedo.
export async function prepareUpdate(update) {
  if (!Capacitor.isNativePlatform()) return { ready: false, started: false };
  try {
    return await Updater.prepareUpdate(updateParams(update)) || { ready: false };
  } catch {
    return { ready: false };
  }
}

export async function getPreparedUpdate() {
  if (!Capacitor.isNativePlatform()) return { ready: false };
  try {
    return await Updater.getStatus() || { ready: false };
  } catch {
    return { ready: false };
  }
}

// Abre el instalador con un toque. Android sigue pidiendo confirmación: es una
// restricción del sistema, no se puede saltar desde una app normal.
export async function installPreparedUpdate() {
  if (!Capacitor.isNativePlatform()) return { started: false };
  return Updater.installPrepared();
}

export async function installUpdate(update) {
  if (Capacitor.isNativePlatform()) {
    const status = await getPreparedUpdate();
    if (status?.versionCode >= Number(update?.versionCode) && status?.ready) {
      return installPreparedUpdate();
    }
    const started = await prepareUpdate(update);
    if (started?.ready) return installPreparedUpdate();
    return started;
  }
  window.open(new URL(update?.apkUrl || '/Nexus.apk', getServerUrl()).toString(), '_blank');
  return { started: true };
}
