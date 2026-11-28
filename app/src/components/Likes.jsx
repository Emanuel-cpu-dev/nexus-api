import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { timeAgo } from '../utils.js';
import Avatar from './Avatar.jsx';

export default function Likes({ onBack, onProfile }) {
  const [likes, setLikes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/likes/me');
      setLikes(data.likes || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page">
      <button type="button" className="ghost" onClick={onBack}>← Volver</button>
      <h2>❤️ Quién te puso MG</h2>
      <p className="muted">Personas a las que les gustaron tus publicaciones.</p>
      {error && <div className="error-box">{error}</div>}
      {loading && <p className="muted">Cargando…</p>}
      {!loading && likes.length === 0 && (
        <p className="muted empty-state">Todavía nadie le puso MG a tus publicaciones.</p>
      )}
      <div className="likes-list">
        {likes.map((like) => (
          <div className="card like-row" key={like.id}>
            <button
              type="button"
              className="post-author grow"
              onClick={() => onProfile?.(like.user)}
              title={`Ver perfil de ${like.user?.displayName || 'este usuario'}`}
            >
              <Avatar user={like.user} />
              <div className="grow">
                <strong>{like.user?.displayName || 'Alguien'}</strong>
                <div className="tiny muted">@{like.user?.username || 'usuario'} · {timeAgo(like.createdAt)}</div>
              </div>
            </button>
            <div className="like-post tiny muted">
              {like.postText ? `“${like.postText.slice(0, 100)}”` : 'Publicación con archivo'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
