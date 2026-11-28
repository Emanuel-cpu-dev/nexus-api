import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { timeAgo } from '../utils.js';
import Avatar from './Avatar.jsx';

// Avisos estilo Instagram: MG y menciones en una sola pantalla.
export default function Notifications({ onBack, onProfile, onPost }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [likesData, mentionsData] = await Promise.all([
        api('/likes/me'),
        api('/mentions/me')
      ]);
      const likes = (likesData.likes || []).map((item) => ({
        ...item,
        kind: 'like',
        icon: '❤️',
        title: `${item.user?.displayName || 'Alguien'} te puso MG`
      }));
      const mentions = (mentionsData.mentions || []).map((item) => ({
        ...item,
        kind: 'mention',
        icon: '@',
        title: `${item.user?.displayName || 'Alguien'} te mencionó`
      }));
      setItems([...likes, ...mentions].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function detail(item) {
    if (item.kind === 'mention') {
      if (item.postText) return `“${item.postText.slice(0, 100)}”`;
      return item.hasFile ? 'Te etiquetó en una foto' : 'Te mencionó en una publicación';
    }
    return item.postText ? `“${item.postText.slice(0, 100)}”` : 'Publicación con archivo';
  }

  return (
    <div className="page">
      <button type="button" className="ghost" onClick={onBack}>← Volver</button>
      <h2>🔔 Avisos</h2>
      <p className="muted">Quién te puso MG y dónde te mencionaron.</p>
      {error && <div className="error-box">{error}</div>}
      {loading && <p className="muted">Cargando…</p>}
      {!loading && items.length === 0 && (
        <p className="muted empty-state">Todavía no tenés avisos.</p>
      )}
      <div className="likes-list">
        {items.map((item) => (
          <div className="card like-row" key={item.id}>
            <button
              type="button"
              className="post-author grow"
              onClick={() => onProfile?.(item.user)}
              title={`Ver perfil de ${item.user?.displayName || 'este usuario'}`}
            >
              <Avatar user={item.user} />
              <div className="grow">
                <strong>{item.title}</strong>
                <div className="tiny muted">@{item.user?.username || 'usuario'} · {timeAgo(item.createdAt)}</div>
              </div>
            </button>
            <div className="like-post tiny muted">{detail(item)}</div>
            {item.kind === 'mention' && (
              <button
                type="button"
                className="ghost small"
                onClick={() => onPost?.(item.postId)}
              >
                Ver publicación
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
