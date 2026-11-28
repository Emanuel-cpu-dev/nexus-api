import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, uploadFile } from '../api.js';
import { cx, timeAgo } from '../utils.js';
import Avatar from './Avatar.jsx';

const STORY_MS = 8000;
const FONT = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function assetFor(sign) {
  try {
    return new URL(`zodiac/${sign.id}.svg`, document.baseURI).href;
  } catch {
    return `./zodiac/${sign.id}.svg`;
  }
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let last = visible[visible.length - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    visible[visible.length - 1] = `${last}…`;
  }
  visible.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
  return y + visible.length * lineHeight;
}

// La imagen se dibuja en el dispositivo con el dato REAL del día. La semilla
// incluye la fecha: cambian las estrellas, el brillo y el sello, aunque el
// signo sea el mismo. Por eso las 12 fotos se renuevan solas cada día.
function drawStoryCanvas(sign, data, message) {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');

  const dayNumber = Number(String(data?.date || '').replace(/-/g, '')) || 20260101;
  const rand = seeded(dayNumber + sign.name.length * 7717);

  const gradient = ctx.createLinearGradient(0, 0, 720, 1280);
  gradient.addColorStop(0, sign.color);
  gradient.addColorStop(0.45, '#0b0d1d');
  gradient.addColorStop(1, '#03040a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 720, 1280);

  const glowX = 250 + Math.round(rand() * 220);
  const glowY = 300 + Math.round(rand() * 200);
  const glow = ctx.createRadialGradient(glowX, glowY, 20, glowX, glowY, 520);
  glow.addColorStop(0, `${sign.color}b0`);
  glow.addColorStop(0.55, `${sign.color}22`);
  glow.addColorStop(1, '#00000000');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 720, 1280);

  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 90; i += 1) {
    ctx.globalAlpha = 0.2 + rand() * 0.65;
    ctx.beginPath();
    ctx.arc(Math.round(rand() * 720), Math.round(rand() * 780), rand() * 1.7 + 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffffd9';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(`✨ NUEVO HOY · ${data?.title || ''}`, 360, 96);

  ctx.fillStyle = '#00000059';
  ctx.fillRect(0, 720, 720, 560);
  ctx.textAlign = 'center';
  ctx.fillStyle = sign.accent;
  ctx.font = `240px "Segoe UI Symbol", "Apple Symbols", ${FONT}`;
  ctx.fillText(sign.symbol, 360, 500);
  ctx.strokeStyle = `${sign.accent}33`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(360, 430, 175, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 54px ${FONT}`;
  ctx.fillText(`${sign.symbol}  ${sign.name}`, 56, 840);
  ctx.fillStyle = '#c9d2ff';
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(data.title || '', 56, 885);

  ctx.fillStyle = '#ffffff';
  ctx.font = `500 29px ${FONT}`;
  let y = wrapText(ctx, sign.message, 56, 950, 608, 42, 7);

  ctx.fillStyle = sign.accent;
  ctx.font = `600 25px ${FONT}`;
  ctx.fillText(`${sign.luck}  Energía ${sign.score}/10   🍀 ${sign.number}`, 56, y + 34);

  const text = String(message || '').trim();
  if (text) {
    y += 86;
    ctx.fillStyle = '#ffffff24';
    ctx.fillRect(48, y - 34, 624, Math.min(150, 62 + Math.ceil(text.length / 36) * 36));
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 28px ${FONT}`;
    wrapText(ctx, `“${text}”`, 72, y + 10, 576, 38, 3);
  }

  ctx.fillStyle = '#ffffff9e';
  ctx.font = `500 20px ${FONT}`;
  ctx.fillText(`Horóscopo de hoy · ${data.source?.name || 'AstroWay'}`, 56, 1240);

  return canvas;
}

// Convierte el canvas en el archivo que se sube como historia propia.
function buildStoryImage(sign, data, message) {
  const canvas = drawStoryCanvas(sign, data, message);
  return new Promise((resolve, reject) => {
    if (!canvas.toBlob) {
      reject(new Error('Este dispositivo no puede crear la imagen de la historia.'));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('No se pudo generar la imagen.'));
        return;
      }
      resolve(new File([blob], `zodiac-${sign.id}-${data.date}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.88);
  });
}

export default function ZodiacStoryViewer({
  data, onClose, onRetry, onStoryChanged, onToast, me
}) {
  const signs = useMemo(() => data?.signs || [], [data?.signs]);
  const [index, setIndex] = useState(() => {
    const focus = Number(data?.focusIndex) || 0;
    return Math.min(Math.max(focus, 0), Math.max((data?.signs?.length || 1) - 1, 0));
  });
  const [panel, setPanel] = useState(null);
  const [reactions, setReactions] = useState({});
  const [reply, setReply] = useState('');
  const [shareText, setShareText] = useState('');
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const panelRef = useRef(null);
  const sign = signs[index];

  useEffect(() => {
    if (!data?.date) return undefined;
    setIndex(Math.min(Math.max(Number(data.focusIndex) || 0, 0), Math.max(signs.length - 1, 0)));
  }, [data?.date, data?.focusIndex, signs.length]);

  // La foto de cada signo se redibuja con el texto real de ese día.
  useEffect(() => {
    if (!sign || !data?.date) {
      setPhotoUrl('');
      return;
    }
    try {
      setPhotoUrl(drawStoryCanvas(sign, data, '').toDataURL('image/jpeg', 0.88));
    } catch {
      setPhotoUrl('');
    }
  }, [sign?.id, data?.date, data?.title]);

  useEffect(() => {
    if (!sign) return undefined;
    let cancelled = false;
    api(`/horoscope/${sign.id}/reactions`)
      .then((result) => { if (!cancelled) setReactions((current) => ({ ...current, [sign.id]: result })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sign?.id]);

  const go = useCallback((delta) => {
    setPanel(null);
    setError('');
    setIndex((value) => {
      const next = value + delta;
      if (next >= signs.length) {
        onClose?.();
        return value;
      }
      return next < 0 ? 0 : next;
    });
  }, [signs.length, onClose]);

  useEffect(() => {
    if (!sign || panel) return undefined;
    const timer = setTimeout(() => go(1), STORY_MS);
    return () => clearTimeout(timer);
  }, [index, panel, go, sign?.id]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') {
        if (panel) setPanel(null);
        else onClose?.();
      }
      if (panel) return;
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, panel]);

  useEffect(() => {
    if (panel && panelRef.current) panelRef.current.scrollTop = 0;
  }, [panel, index]);

  async function react(kind) {
    if (!sign || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/horoscope/${sign.id}/react`, {
        method: 'POST',
        body: { kind }
      });
      setReactions((current) => ({ ...current, [sign.id]: result }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    if (!reply.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/horoscope/${sign.id}/react`, {
        method: 'POST',
        body: { kind: 'message', message: reply.trim() }
      });
      setReactions((current) => ({ ...current, [sign.id]: result }));
      setReply('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function shareToStory() {
    if (!sign || busy) return;
    setBusy(true);
    setError('');
    setProgress(0);
    try {
      const file = await buildStoryImage(sign, data, shareText);
      const uploaded = await uploadFile(file, setProgress);
      const caption = `Mi horóscopo: ${sign.name} · ${data.title}${shareText.trim() ? ` · ${shareText.trim()}` : ''}`;
      await api('/stories', { method: 'POST', body: { fileId: uploaded.id, caption: caption.slice(0, 280) } });
      await onStoryChanged?.();
      setPanel(null);
      setShareText('');
      onToast?.('Tu signo ya está en tu historia ✨');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function openCredit(event) {
    const url = data?.source?.url || 'https://api.astroway.info';
    if (window.electronAPI?.openExternal) {
      event.preventDefault();
      window.electronAPI.openExternal(url);
    }
  }

  if (!signs.length) {
    return createPortal(
      <div className="overlay zodiac-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
        <div className="card story-viewer zodiac-viewer empty-state">
          <strong>Horóscopo de hoy</strong>
          <p>{data?.error || 'No se pudo cargar el horóscopo.'}</p>
          <div className="zodiac-error-actions">
            <button type="button" className="primary small" onClick={() => onRetry?.()}>Reintentar</button>
            <button type="button" className="ghost small" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  const currentReactions = reactions[sign.id] || { likes: 0, liked: false, messages: [] };

  return createPortal(
    <div
      className="overlay zodiac-overlay"
      onClick={(event) => { if (event.target === event.currentTarget && !panel) onClose?.(); }}
    >
      <div className="card story-viewer zodiac-viewer">
        <div className="story-segments">
          {signs.map((item, position) => (
            <span
              key={item.id}
              className={cx('story-segment', position < index && 'done', position === index && 'active')}
            />
          ))}
        </div>

        <header className="story-head">
          <span className="zodiac-head-icon">{sign.symbol}</span>
          <div className="grow">
            <strong>Horóscopo · {sign.name}</strong>
            <div className="tiny muted">{data.title} · dato real del día</div>
          </div>
          <button type="button" className="icon-btn" title="Cerrar" aria-label="Cerrar historia" onClick={onClose}>✕</button>
        </header>

        <div className="story-media zodiac-media">
          <img src={photoUrl || assetFor(sign)} alt={`Horóscopo de ${sign.name} para ${data.title}`} draggable={false} />
          {!photoUrl && (
            <>
              <div className="zodiac-shade" />
              <div className="zodiac-copy">
                <div className="zodiac-kicker">{sign.dates} · {sign.element}</div>
                <h2>{sign.symbol} {sign.name}</h2>
                <p>{sign.message}</p>
                <div className="zodiac-stats">
                  <span>{sign.luck} · {sign.score}/10</span>
                  <span>🍀 {sign.number}</span>
                  {sign.luckyDay && <span>{sign.luckyDay}</span>}
                </div>
              </div>
            </>
          )}
          {!panel && (
            <>
              <button
                type="button"
                className="story-nav story-prev"
                title="Signo anterior"
                disabled={index === 0}
                onClick={(event) => { event.stopPropagation(); go(-1); }}
              >
                ‹
              </button>
              <button
                type="button"
                className="story-nav story-next"
                title="Signo siguiente"
                onClick={(event) => { event.stopPropagation(); go(1); }}
              >
                ›
              </button>
            </>
          )}
        </div>

        <footer className="story-footer zodiac-footer">
          <div className="zodiac-actions">
            <button
              type="button"
              className={cx('zodiac-action', currentReactions.liked && 'liked')}
              disabled={busy}
              onClick={() => react('like')}
              title="Me gusta"
            >
              ❤️ {currentReactions.likes || ''}
            </button>
            <button
              type="button"
              className="zodiac-action"
              onClick={() => setPanel(panel === 'messages' ? null : 'messages')}
              title="Mensajes"
            >
              💬 {currentReactions.messages?.length || ''}
            </button>
            <button
              type="button"
              className="zodiac-action"
              onClick={() => setPanel(panel === 'share' ? null : 'share')}
              title="Compartir en tu historia"
            >
              ↗️ Compartir
            </button>
          </div>
          <span className="zodiac-page">{index + 1}/{signs.length}</span>
        </footer>

        <div className="zodiac-credit tiny muted">
          Datos: <a href={data.source?.url || 'https://api.astroway.info'} target="_blank" rel="noreferrer" onClick={openCredit}>{data.source?.name || 'AstroWay'}</a>
          {data.stale ? ' · guardado del último día disponible' : ' · actualizado hoy'}
        </div>

        {error && <div className="error-box zodiac-error">{error}</div>}

        {panel === 'messages' && (
          <div className="zodiac-panel" ref={panelRef}>
            <div className="zodiac-panel-head">
              <strong>💬 Mensajes de {sign.name}</strong>
              <button type="button" className="icon-btn" onClick={() => setPanel(null)}>✕</button>
            </div>
            <div className="zodiac-messages">
              {(currentReactions.messages || []).length === 0 && (
                <div className="tiny muted">Sé el primero en dejar un mensaje.</div>
              )}
              {(currentReactions.messages || []).map((item) => (
                <div className="zodiac-message" key={item.id}>
                  <Avatar user={item.user} size="xs" />
                  <div className="grow">
                    <div className="tiny muted">{item.user?.displayName} · {timeAgo(item.createdAt)}</div>
                    <span>{item.text}</span>
                  </div>
                </div>
              ))}
            </div>
            <form className="zodiac-reply" onSubmit={sendReply}>
              <input
                type="text"
                value={reply}
                maxLength={280}
                placeholder="Escribí un mensaje…"
                onChange={(event) => setReply(event.target.value)}
              />
              <button type="submit" className="primary small" disabled={busy || !reply.trim()}>Enviar</button>
            </form>
          </div>
        )}

        {panel === 'share' && (
          <div className="zodiac-panel" ref={panelRef}>
            <div className="zodiac-panel-head">
              <strong>↗️ Compartir {sign.name} en tu historia</strong>
              <button type="button" className="icon-btn" onClick={() => setPanel(null)}>✕</button>
            </div>
            <p className="tiny muted">
              Se crea una imagen con el horóscopo de hoy. Podés agregarle un mensaje (mg) y aparece en tu historia.
            </p>
            <input
              type="text"
              value={shareText}
              maxLength={180}
              placeholder="Escribí algo si querés…"
              onChange={(event) => setShareText(event.target.value)}
            />
            {progress !== null && <div className="progress"><div style={{ width: `${progress}%` }} /></div>}
            <button type="button" className="primary" disabled={busy} onClick={shareToStory}>
              {busy ? 'Publicando…' : 'Publicar en mi historia'}
            </button>
            <div className="tiny muted">La historia se borra sola a las 24 horas, como las demás.</div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
