import { useRef, useState } from 'react';
import { api, uploadFile } from '../api.js';
import Avatar from './Avatar.jsx';

export default function StoryBar({ groups = [], me, onOpen, onChange, onError }) {
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const own = groups.find((group) => group.user?.id === me?.id);
  const others = groups.filter((group) => group.user?.id !== me?.id);

  async function attach(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProgress(0);
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
        <button type="button" className="story-item" onClick={() => galleryRef.current?.click()}>
          <span className={`story-ring ${own?.seen ? 'seen' : ''}`}>
            <Avatar user={me} size="sm" />
            <span className="story-plus">+</span>
          </span>
          <span className="story-name">Tu historia</span>
        </button>
        <button type="button" className="story-item" onClick={() => cameraRef.current?.click()}>
          <span className="story-ring story-camera">
            <Avatar user={me} size="sm" />
            <span className="story-plus">📷</span>
          </span>
          <span className="story-name">Sacar foto</span>
        </button>
        {own?.items?.length > 0 && (
          <button type="button" className="story-item" onClick={() => openGroup(own)}>
            <span className={`story-ring ${own.seen ? 'seen' : ''}`}>
              <Avatar user={own.user} size="sm" />
            </span>
            <span className="story-name">Ver la tuya</span>
          </button>
        )}
        {others.map((group) => (
          <button type="button" className="story-item" key={group.user.id} onClick={() => openGroup(group)}>
            <span className={`story-ring ${group.seen ? 'seen' : ''}`}>
              <Avatar user={group.user} size="sm" />
            </span>
            <span className="story-name">{group.user.displayName}</span>
          </button>
        ))}
      </div>
      {progress !== null && (
        <div className="progress story-progress-upload"><div style={{ width: `${progress}%` }} /></div>
      )}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={attach}
      />
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
