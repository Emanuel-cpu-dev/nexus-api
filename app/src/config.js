export const STORAGE_KEY = 'nexus_server_url';
export const DEFAULT_SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

// Cuando la interfaz se sirve desde el propio servidor (Render, o el servidor local),
// usamos ese mismo origen. Así no hay URL guardada que quede vieja en ninguna PC.
function currentOrigin() {
  try {
    const origin = window.location.origin;
    if (!origin) return '';
    if (window.location.protocol === 'https:') return origin;
    if (origin.replace(/\/+$/, '') === DEFAULT_SERVER_URL.replace(/\/+$/, '')) return origin;
  } catch {
    // file:// u otros esquemas
  }
  return '';
}

export function isServerUrlAutomatic() {
  return Boolean(currentOrigin());
}

export function getServerUrl() {
  const automatic = currentOrigin();
  if (automatic) return automatic.replace(/\/+$/, '');
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  } catch {
    return DEFAULT_SERVER_URL.replace(/\/+$/, '');
  }
}

export function setServerUrl(url) {
  localStorage.setItem(STORAGE_KEY, String(url || '').trim().replace(/\/+$/, ''));
}

export function fileUrl(path) {
  if (!path) return '';
  const value = String(path);
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
  return `${getServerUrl()}${value.startsWith('/') ? '' : '/'}${value}`;
}
