// Sonidos generados con Web Audio API: no hay que descargar ni agregar archivos.
let ctx = null;

function context() {
  if (typeof window === 'undefined') return null;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return null;
  try {
    if (!ctx) ctx = new Audio();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// Los navegadores/Electron solo permiten audio después de una interacción.
export function unlockSound() {
  context();
}

function tone(audio, frequency, start, duration, volume, type = 'sine') {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

export function playSound(kind = 'message') {
  const audio = context();
  if (!audio) return;
  const at = audio.currentTime + 0.01;

  if (kind === 'call') {
    // Timbre de llamada entrante, tres pulsos.
    for (const offset of [0, 0.30, 0.60]) {
      tone(audio, 523.25, at + offset, 0.16, 0.08, 'triangle');
      tone(audio, 659.25, at + offset + 0.08, 0.14, 0.06, 'triangle');
    }
    return;
  }

  // Aviso de mensaje: dos notas cortas y suaves, parecido a Discord.
  tone(audio, 880, at, 0.09, 0.09, 'sine');
  tone(audio, 1174.66, at + 0.085, 0.13, 0.08, 'sine');
}
