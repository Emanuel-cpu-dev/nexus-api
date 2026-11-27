export const STATUSES = [
  { id: 'active', label: 'Activo', icon: '🟢' },
  { id: 'idle', label: 'Ausente', icon: '🌙' },
  { id: 'dnd', label: 'Ocupado', icon: '⛔' },
  { id: 'sleep', label: 'Durmiendo', icon: '😴' }
];

export function getMyStatus() {
  try {
    const value = localStorage.getItem('nexus_status') || 'active';
    return STATUSES.some((item) => item.id === value) ? value : 'active';
  } catch {
    return 'active';
  }
}

export function setMyStatus(status) {
  localStorage.setItem('nexus_status', status);
}

export function getSoundEnabled() {
  try {
    return localStorage.getItem('nexus_sound') !== '0';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled) {
  localStorage.setItem('nexus_sound', enabled ? '1' : '0');
}

// Ocupado y Durmiendo no muestran avisos emergentes ni suenan.
export function isQuietStatus(status) {
  return status === 'dnd' || status === 'sleep';
}
