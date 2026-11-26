export const STORAGE_KEY = 'nexus_server_url';
export const DEFAULT_SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

export function getServerUrl() {
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
