import { useEffect, useState } from 'react';
import { cx } from '../utils.js';

const FRAME_MS = 6500;

export default function HoroscopeViewer({ data, onClose }) {
  const signs = data?.signs || [];
  const [index, setIndex] = useState(() => (
    signs.length ? Math.min(Math.max(Number(data.focusIndex) || 0, 0), signs.length - 1) : 0
  ));

  useEffect(() => {
    if (signs.length < 2) return undefined;
    const timer = setTimeout(() => setIndex((value) => (value + 1) % signs.length), FRAME_MS);
    return () => clearTimeout(timer);
  }, [index, signs.length]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowRight') setIndex((value) => (value + 1) % signs.length);
      if (event.key === 'ArrowLeft') setIndex((value) => (value - 1 + signs.length) % signs.length);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [signs.length, onClose]);

  if (!signs.length) return null;
  const sign = signs[index];

  return (
    <div className="overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="card horoscope-viewer">
        <div className="story-segments">
          {signs.map((item, position) => (
            <span
              key={item.name}
              className={cx('story-segment', position < index && 'done', position === index && 'active')}
            />
          ))}
        </div>
        <header className="story-head">
          <span className="horoscope-icon">✨</span>
          <div className="grow">
            <strong>Horóscopo de hoy</strong>
            <div className="tiny muted">{data.title} · se actualiza solo cada día</div>
          </div>
          <button type="button" className="icon-btn" title="Cerrar" onClick={onClose}>✕</button>
        </header>
        <div className="horoscope-body">
          <div className="horoscope-symbol">{sign.symbol}</div>
          <h2>{sign.name}</h2>
          <div className="tiny muted">{sign.dates} · {sign.element}</div>
          <p className="horoscope-message">{sign.message}</p>
          <div className="horoscope-stats">
            <span>🍀 {sign.luck}</span>
            <span>🔢 {sign.number}</span>
            <span>🎨 {sign.color}</span>
          </div>
        </div>
        <footer className="story-footer">
          <span className="tiny muted">{index + 1} de {signs.length}</span>
          <div className="horoscope-nav">
            <button type="button" className="ghost small" onClick={() => setIndex((value) => (value - 1 + signs.length) % signs.length)}>‹ Anterior</button>
            <button type="button" className="ghost small" onClick={() => setIndex((value) => (value + 1) % signs.length)}>Siguiente ›</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
