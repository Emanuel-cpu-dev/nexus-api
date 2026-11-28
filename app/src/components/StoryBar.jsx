import { useRef, useState } from 'react';
import { api, uploadFile } from '../api.js';
import Avatar from './Avatar.jsx';

export default function StoryBar({ groups = [], me, horoscope, onHoroscope, onOpen, onChange, onError }) {
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const own = groups.find((group) => group.user?.id === me?.id);
  const others = groups.filter((group) => group.user?.id !== me?.id);

  async function attach(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProgress(0);
    setCreateOpen(false);
    try {
      const uploaded = await uploadFile(file, setProgress);
      if (!/^(image|video)\//.test(uploaded?.mime || '')) {
        throw new Error('La historia debe ser una foto o un video.');
      }
      await api('/stories', { method: 'POST', body: { fileId: uploaded.id } });
      await onChange?.();
    } catch (error) {
      onError?.(error.message);
    } finally {
      setProgress(null);
      event.target.value = '';
    }
  }

  function openGroup(group) {
    if (group?.items?.length) onOpen?.(group.user.id, group.items[0].id);
  }

  return (
    <div className="story-bar card">
      <div className="story-bar-list">
        {horoscope && (
          <button
            type="button"
            className="story-item horoscope-item"
            title={`Horóscopo del ${horoscope.title || 'día'}`}
            onClick={() => onHoroscope?.()}
          >
            <span className="story-ring horoscope-ring"><span className="story-symbol">✨</span></span>
            <span className="story-name">Horóscopo</span>
            <span className="story-today">HOY {String(horoscope.date || '').slice(8)}</span>
          </button>
        )}
        <div className="story-own-wrap">
          <button
            type="button"
            className="story-item"
            onClick={() => (own?.items?.length ? openGroup(own) : setCreateOpen((value) => !value))}
          >
            <span className={`story-ring ${own?.seen ? 'seen' : ''}`}>
              <Avatar user={me} size="sm" />
            </span>
            <span className="story-name">Tu historia</span>
          </button>
          <button
            type="button"
            className="story-plus"
            title="Agregar a tu historia"
            onClick={() => setCreateOpen((value) => !value)}
          >
            +
          </button>
        </div>
        {others.map((group) => (
          <button type="button" className="story-item" key={group.user.id} onClick={() => openGroup(group)}>
            <span className={`story-ring ${group.seen ? 'seen' : ''}`}>
              <Avatar user={group.user} size="sm" />
            </span>
            <span className="story-name">{group.user.displayName}</span>
          </button>
        ))}
      </div>
      {createOpen && (
        <div className="story-create-menu">
          <button type="button" onClick={() => cameraRef.current?.click()}>📷 Sacar foto</button>
          <button type="button" onClick={() => galleryRef.current?.click()}>🖼️ Elegir foto o video</button>
        </div>
      )}
      {progress !== null && (
        <div className="progress story-progress-upload"><div style={{ width: `${progress}%` }} /></div>
      )}
      <input ref={galleryRef} type="file" accept="image/*,video/*" hidden onChange={attach} />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={attach}
      />
    </div>
  );
}
