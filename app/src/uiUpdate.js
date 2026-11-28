import { getServerUrl } from './config.js';
import { isNativeApp } from './updater.js';
import { UI_CODE } from './version.js';

const ACK_KEY = 'nexus_ui_update_ack';

// En Android/Capacitor manda el updater de la APK. En la PC y el navegador
// alcanza con recargar: Electron ya abre la interfaz desde Render.
export async function checkUiUpdate() {
  if (isNativeApp()) return null;
  try {
    const response = await fetch(`${getServerUrl()}/api/ui-version`, { cache: 'no-store' });
    if (!response.ok) return null;
    const remote = await response.json();
    const acknowledged = Number(localStorage.getItem(ACK_KEY)) || 0;
    if (!remote.uiCode || remote.uiCode <= UI_CODE || acknowledged >= remote.uiCode) return null;
    return remote;
  } catch {
    return null;
  }
}

export function applyUiUpdate(update) {
  if (!update?.uiCode) return;
  localStorage.setItem(ACK_KEY, String(update.uiCode));
  const url = new URL(window.location.href);
  url.searchParams.set('nexus_ui', String(update.uiCode));
  window.location.href = url.toString();
}
