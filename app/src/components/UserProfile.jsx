import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fileUrl } from '../config.js';
import { formatSize, isImage, isVideo, timeAgo } from '../utils.js';
import Avatar from './Avatar.jsx';

export default function UserProfile({ user, onBack, onDm }) {
  const [posts, setPosts] = useState([]);
  const [privateProfile, setPrivateProfile] = useState(Boolean(user.privateProfile));
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setPrivateProfile(Boolean(user.privateProfile));
    api(`/users/${user.id}`)
      .then((data) => {
        if (cancelled) return;
        setPrivateProfile(Boolean(data.private));
        setPosts(data.posts || []);
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [user.id]);

  return (
    <div className="page">
      <button type="button" className="ghost" onClick={onBack}>← Volver</button>
      <div className="card profile-card">
        <div className="profile-preview">
          <Avatar user={user} size="xl" />
          <strong>{user.displayName}</strong>
          <span className="muted">@{user.username}{privateProfile ? ' · 🔒 Privado' : ''}</span>
          <span className={`presence-dot inline ${user.online ? 'online' : ''}`} />
          {user.bio && <p className="muted">{user.bio}</p>}
          <button type="button" className="primary" onClick={onDm}>💬 Enviar mensaje</button>
        </div>
      </div>

      <h2>Publicaciones de {user.displayName}</h2>
      {error && <div className="error-box">{error}</div>}
      <div className="post-list">
        {posts.length === 0 && (
          <p className="muted empty-state">
            {privateProfile
              ? 'Este perfil es privado. Sus publicaciones solo son visibles para sus amigos.'
              : 'Todavía no publicó nada.'}
          </p>
        )}
        {posts.map((post) => (
          <article className="card post" key={post.id}>
            <header className="post-head">
              <Avatar user={post.author} />
              <div className="grow">
                <strong>{post.author?.displayName || user.displayName}</strong>
                <div className="tiny muted">@{post.author?.username || user.username} · {timeAgo(post.createdAt)}</div>
              </div>
            </header>
            {post.text && <p className="post-text">{post.text}</p>}
            {post.file && isImage(post.file.mime) && (
              <img className="post-media" src={fileUrl(post.file.url)} alt={post.file.name} />
            )}
            {post.file && isVideo(post.file.mime) && (
              <video className="post-media" src={fileUrl(post.file.url)} controls />
            )}
            {post.file && !isImage(post.file.mime) && !isVideo(post.file.mime) && (
              <a className="file-chip" href={fileUrl(post.file.url)} target="_blank" rel="noreferrer">
                📎 {post.file.name} <span className="muted">({formatSize(post.file.size)})</span>
              </a>
            )}
            <div className="post-actions">
              <span className="ghost">❤️ {post.likes || 0}</span>
              <span className="ghost">💬 {post.comments?.length || 0}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
