import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { fileUrl } from '../config.js';
import { cx, isImage, isVideo, timeAgo } from '../utils.js';
import Avatar from './Avatar.jsx';

const STORY_MS = 7000;

export default function StoryViewer({ groups = [], me, initial, onClose, onChange, onProfile }) {
  const items = useMemo(() => groups.flatMap((group) => (
    (group.items || []).map((story) => ({ story, group }))
  )), [groups]);

  const findIndex = useCallback((target) => {
    if (!target) return 0;
    const byId = items.findIndex((item) => item.story.id === target.storyId);
    if (byId >= 0) return byId;
    if (target.userId) {
      const byUser = items.findIndex((item) => item.story.user?.id === target.userId);
      if (byUser >= 0) return byUser;
    }
    return 0;
  }, [items]);

  const [index, setIndex] = useState(() => findIndex(initial));
  const [viewers, setViewers] = useState(null);
  const marked = useRef(new Set());
  const current = items[index];

  // Solo reposicionamos cuando cambia el objetivo; no al actualizarse la lista
  // después de marcar una vista (si no, el visor saltaría hacia atrás).
  const initialKey = `${initial?.storyId || ''}:${initial?.userId || ''}`;
  useEffect(() => {
    setIndex(findIndex(initial));
  }, [initialKey]);

  const go = useCallback((delta) => {
    setIndex((value) => {
      const next = value + delta;
      if (next >= items.length) {
        onClose?.();
        return value;
      }
      if (next < 0) return value;
      return next;
    });
  }, [items.length, onClose]);

  useEffect(() => {
    if (!current) return undefined;
    setViewers(null);
    const authorId = current.story.user?.id;
    const id = current.story.id;
    if (authorId && authorId !== me?.id && !current.story.viewed && !marked.current.has(id)) {
      marked.current.add(id);
      api(`/stories/${id}/view`, { method: 'POST' })
        .then(() => onChange?.())
        .catch(() => {});
    }
    return undefined;
  }, [current?.story?.id, current?.story?.viewed, current?.story?.user?.id, me?.id, onChange]);

  useEffect(() => {
    if (!current) return undefined;
    const timer = setTimeout(() => go(1), current.story.file?.mime?.startsWith('video') ? 12000 : STORY_MS);
    return () => clearTimeout(timer);
  }, [current?.story?.id, go]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  async function showViewers() {
    if (!current) return;
    try {
      const data = await api(`/stories/${current.story.id}/views`);
      setViewers(data.viewers || []);
    } catch {
      setViewers([]);
    }
  }

  if (!current) {
    return (
      <div className="overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
        <div className="card story-viewer empty-state">No hay historias disponibles.</div>
      </div>
    );
  }

  const mine = current.story.user?.id === me?.id;
  const file = current.story.file;
  return (
    <div className="overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="card story-viewer">
        <div className="story-segments">
          {items.map((item, position) => (
            <span
              key={item.story.id}
              className={cx('story-segment', position < index && 'done', position === index && 'active')}
            />
          ))}
        </div>
        <header className="story-head">
          <Avatar user={current.story.user} size="xs" />
          <div className="grow">
            <strong>{mine ? 'Tu historia' : current.story.user?.displayName}</strong>
            <div className="tiny muted">{timeAgo(current.story.createdAt)}</div>
          </div>
          <button type="button" className="icon-btn" title="Cerrar" onClick={onClose}>✕</button>
        </header>

        <div className="story-media">
          {!file && <div className="empty-state">Esta historia ya venció.</div>}
          {file && isImage(file.mime) && (
            <img className="post-media" src={fileUrl(file.url)} alt="Historia" />
          )}
          {file && isVideo(file.mime) && (
            <video
              className="post-media"
              src={fileUrl(file.url)}
              controls
              autoPlay
              playsInline
              onEnded={() => go(1)}
            />
          )}
          <button
            type="button"
            className="story-nav story-prev"
            title="Anterior"
            disabled={index === 0}
            onClick={() => go(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="story-nav story-next"
            title="Siguiente"
            onClick={() => go(1)}
          >
            ›
          </button>
        </div>

        <footer className="story-footer">
          <span className="tiny muted">
            {mine ? `👁️ ${current.story.viewCount || 0} vistas` : 'Se borra en 24 horas'}
          </span>
          {mine && (
            <button type="button" className="ghost small" onClick={showViewers}>
              Ver quién la vio
            </button>
          )}
          {!mine && onProfile && (
            <button
              type="button"
              className="ghost small"
              onClick={() => { onProfile(current.story.user); onClose?.(); }}
            >
              Ver perfil
            </button>
          )}
        </footer>

        {viewers && (
          <div className="story-viewers">
            <div className="tiny muted">Vista por</div>
            {viewers.length === 0 && <div className="tiny muted">Todavía nadie la vio.</div>}
            {viewers.map((view) => (
              <button
                type="button"
                className="like-row"
                key={view.user.id}
                onClick={() => { if (onProfile) { onProfile(view.user); onClose?.(); } }}
              >
                <Avatar user={view.user} size="xs" />
                <span className="grow">{view.user.displayName}</span>
                <span className="tiny muted">{timeAgo(view.viewedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
