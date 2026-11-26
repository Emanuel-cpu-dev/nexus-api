import { useState } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { initials, timeAgo } from '../utils.js';

export default function Communities({ communities, onOpen, refresh }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(event) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const data = await api('/communities', {
        method: 'POST',
        body: { name: name.trim(), description: description.trim() }
      });
      getSocket()?.emit('community:join', { communityId: data.community.id });
      setName('');
      setDescription('');
      await refresh();
      onOpen(data.community);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function join(community) {
    setError('');
    try {
      await api(`/communities/${community.id}/join`, { method: 'POST' });
      getSocket()?.emit('community:join', { communityId: community.id });
      await refresh();
      onOpen(community);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h2>Comunidades</h2>
      <div className="card">
        <h3>Crear comunidad</h3>
        <form onSubmit={create} className="stack-form">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de la comunidad"
            maxLength={60}
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (opcional)"
            maxLength={300}
          />
          {error && <div className="error-box">{error}</div>}
          <button type="submit" className="primary" disabled={busy}>Crear comunidad</button>
        </form>
      </div>

      <div className="card">
        <h3>Explorar</h3>
        {communities.length === 0 && <p className="muted">No hay comunidades todavía. Crea la primera.</p>}
        <div className="community-grid">
          {communities.map((community) => (
            <div className="community-card" key={community.id}>
              <div className="community-icon">🌐</div>
              <div className="grow">
                <strong>{community.name}</strong>
                <p className="tiny muted">{community.description || 'Sin descripción'}</p>
                <span className="tiny muted">
                  {community.memberCount} miembros · creada {timeAgo(community.createdAt)}
                </span>
              </div>
              <div className="community-actions">
                {community.joined
                  ? <button type="button" className="primary small" onClick={() => onOpen(community)}>Abrir</button>
                  : <button type="button" className="ghost small" onClick={() => join(community)}>Unirse</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
