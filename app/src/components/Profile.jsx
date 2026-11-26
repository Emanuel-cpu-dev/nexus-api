import { useEffect, useState } from 'react';
import { api, uploadFile } from '../api.js';
import Avatar from './Avatar.jsx';

const COLORS = ['#5865f2', '#eb459e', '#57f287', '#fee75c', '#ed4245', '#00a8fc'];

export default function Profile({ me, onUpdated }) {
  const [displayName, setDisplayName] = useState(me?.displayName || '');
  const [bio, setBio] = useState(me?.bio || '');
  const [avatarColor, setAvatarColor] = useState(me?.avatarColor || COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState(me?.avatarUrl || '');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setDisplayName(me?.displayName || '');
    setBio(me?.bio || '');
    setAvatarColor(me?.avatarColor || COLORS[0]);
    setAvatarUrl(me?.avatarUrl || '');
  }, [me?.id]);

  async function save(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const data = await api('/me', {
        method: 'PATCH',
        body: { displayName: displayName.trim(), bio: bio.trim(), avatarColor, avatarUrl }
      });
      onUpdated(data.user);
      setMessage('Perfil actualizado.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function pickPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const uploaded = await uploadFile(file);
      if (!String(uploaded.mime || '').startsWith('image/')) {
        throw new Error('Selecciona una imagen (JPG, PNG, GIF, WebP…).');
      }
      setAvatarUrl(uploaded.url);
      setMessage('Foto lista. Clic en “Guardar cambios” para aplicarla.');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(me.code);
      setMessage('Código copiado.');
    } catch {
      setMessage(`Tu código: ${me.code}`);
    }
  }

  return (
    <div className="page">
      <h2>Mi perfil</h2>
      <div className="card profile-card">
        <div className="profile-preview">
          <Avatar user={{ displayName, avatarColor, avatarUrl }} size="xl" />
          <strong>{displayName}</strong>
          <div className="photo-actions">
            <button type="button" className="ghost small" disabled={uploading} onClick={() => document.getElementById('avatar-file')?.click()}>
              {uploading ? 'Subiendo…' : '📷 Cambiar foto'}
            </button>
            {avatarUrl && (
              <button type="button" className="ghost small" onClick={() => setAvatarUrl('')}>Quitar foto</button>
            )}
            <input id="avatar-file" type="file" accept="image/*" hidden onChange={pickPhoto} />
          </div>
          <span className="muted">@{me.username}</span>
          <div className="code-box">
            <span className="tiny muted block">TU CÓDIGO</span>
            <strong className="code-value">{me.code}</strong>
            <button type="button" className="ghost small" onClick={copyCode}>Copiar</button>
          </div>
        </div>
        <form onSubmit={save} className="stack-form grow">
          <label>
            Nombre visible
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
          </label>
          <label>
            Biografía
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={300} />
          </label>
          <div>
            <span className="tiny muted block">Color del avatar</span>
            <div className="color-row">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-dot ${avatarColor === color ? 'selected' : ''}`}
                  style={{ background: color }}
                  onClick={() => setAvatarColor(color)}
                  title={color}
                />
              ))}
              <input type="color" value={avatarColor} onChange={(e) => setAvatarColor(e.target.value)} />
            </div>
          </div>
          {error && <div className="error-box">{error}</div>}
          {message && <div className="ok-box">{message}</div>}
          <button type="submit" className="primary">Guardar cambios</button>
        </form>
      </div>
    </div>
  );
}
