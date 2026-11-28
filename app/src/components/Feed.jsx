import { useCallback, useEffect, useRef, useState } from 'react';
import { api, uploadFile } from '../api.js';
import { fileUrl } from '../config.js';
import { cx, formatSize, isImage, isVideo, timeAgo } from '../utils.js';
import Avatar from './Avatar.jsx';

function Attachment({ file }) {
  if (!file) return null;
  if (isImage(file.mime)) {
    return <img className="post-media" src={fileUrl(file.url)} alt={file.name} />;
  }
  if (isVideo(file.mime)) {
    return <video className="post-media" src={fileUrl(file.url)} controls />;
  }
  return (
    <a className="file-chip" href={fileUrl(file.url)} target="_blank" rel="noreferrer">
      📎 {file.name} <span className="muted">({formatSize(file.size)})</span>
    </a>
  );
}

export default function Feed({ communityId = null, compact = false, onProfile, me, onFriendsChanged }) {
  const [posts, setPosts] = useState([]);
  const [text, setText] = useState('');
  const [progress, setProgress] = useState(null);
  const [fileId, setFileId] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [openComments, setOpenComments] = useState(null);
  const [commentText, setCommentText] = useState('');
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    try {
      const query = communityId ? `?communityId=${encodeURIComponent(communityId)}` : '';
      const data = await api(`/posts${query}`);
      setPosts(data.posts || []);
    } catch (err) {
      setError(err.message);
    }
  }, [communityId]);

  useEffect(() => {
    load();
  }, [load]);

  // El gesto de "tirar para abajo" del celular también recarga el feed.
  useEffect(() => {
    const refresh = () => load();
    window.addEventListener('nexus:refresh', refresh);
    return () => window.removeEventListener('nexus:refresh', refresh);
  }, [load]);

  async function publish(event) {
    event.preventDefault();
    if (!text.trim() && !fileId) return;
    setError('');
    try {
      const data = await api('/posts', {
        method: 'POST',
        body: { text: text.trim(), fileId, communityId }
      });
      setPosts((current) => [data.post, ...current]);
      setText('');
      setFileId(null);
      setFileName('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function attach(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setProgress(0);
    try {
      const uploaded = await uploadFile(file, setProgress);
      setFileId(uploaded.id);
      setFileName(uploaded.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
      event.target.value = '';
    }
  }

  async function toggleLike(post) {
    try {
      const data = await api(`/posts/${post.id}/like`, { method: 'POST' });
      setPosts((current) => current.map((item) => (
        item.id === post.id ? { ...item, liked: data.liked, likes: data.likes } : item
      )));
    } catch (err) {
      setError(err.message);
    }
  }

  async function addComment(post) {
    if (!commentText.trim()) return;
    try {
      const data = await api(`/posts/${post.id}/comments`, {
        method: 'POST',
        body: { text: commentText.trim() }
      });
      setPosts((current) => current.map((item) => (
        item.id === post.id ? { ...item, comments: [...(item.comments || []), data.comment] } : item
      )));
      setCommentText('');
    } catch (err) {
      setError(err.message);
    }
  }

  // Desde el Inicio se puede agregar a quien publicó, sin entrar a su perfil.
  async function requestFriend(author) {
    if (!author?.code) return;
    setError('');
    try {
      const data = await api('/friends/request', { method: 'POST', body: { code: author.code } });
      const nextState = data.accepted ? 'friend' : 'outgoing';
      setPosts((current) => current.map((post) => (
        post.author?.id === author.id ? { ...post, author: { ...post.author, friendState: nextState } } : post
      )));
      onFriendsChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function acceptFriend(author) {
    setError('');
    try {
      await api(`/friends/${author.id}/accept`, { method: 'POST' });
      setPosts((current) => current.map((post) => (
        post.author?.id === author.id ? { ...post, author: { ...post.author, friendState: 'friend' } } : post
      )));
      onFriendsChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleRepost(post) {
    setError('');
    try {
      const data = await api(`/posts/${post.id}/repost`, { method: 'POST' });
      setPosts((current) => {
        let next = current.map((item) => (
          item.id === post.id
            ? { ...item, reposts: data.reposts, reposted: data.reposted }
            : item
        ));
        if (data.reposted && data.post) {
          next = [data.post, ...next.filter((item) => item.id !== data.post.id)];
        } else {
          next = next.filter((item) => !(item.repostOf?.id === post.id && item.userId === me?.id));
        }
        return next;
      });
    } catch (err) {
      setError(err.message);
    }
  }

  function friendAction(author) {
    if (!author?.id || author.id === me?.id) return null;
    const state = author.friendState || 'none';
    if (state === 'friend') return null;
    if (state === 'incoming') {
      return <button type="button" className="ghost small" onClick={() => acceptFriend(author)}>✅ Aceptar amistad</button>;
    }
    if (state === 'outgoing') {
      return <button type="button" className="ghost small" disabled>Solicitud enviada</button>;
    }
    return <button type="button" className="ghost small" onClick={() => requestFriend(author)}>➕ Agregar</button>;
  }

  return (
    <div className={cx('feed', compact && 'compact')}>
      {!compact && <h2>{communityId ? 'Publicaciones de la comunidad' : 'Inicio'}</h2>}

      <form className="composer card" onSubmit={publish}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="¿Qué estás pensando?"
          rows={compact ? 2 : 3}
        />
        {fileId && <div className="chip">📎 {fileName} <button type="button" onClick={() => { setFileId(null); setFileName(''); }}>✕</button></div>}
        {progress !== null && <div className="progress"><div style={{ width: `${progress}%` }} /></div>}
        {error && <div className="error-box">{error}</div>}
        <div className="composer-actions">
          <input ref={fileInput} type="file" hidden onChange={attach} />
          <button type="button" className="ghost" onClick={() => fileInput.current?.click()}>📎 Adjuntar</button>
          <button type="submit" className="primary">Publicar</button>
        </div>
      </form>

      <div className="post-list">
        {posts.length === 0 && <p className="muted empty-state">Todavía no hay publicaciones. ¡Sé el primero!</p>}
        {posts.map((post) => (
          <article className="card post" key={post.id}>
            <header className="post-head">
              <button
                type="button"
                className="post-author"
                onClick={() => onProfile?.(post.author)}
                title={`Ver perfil de ${post.author?.displayName || 'este usuario'}`}
              >
                <Avatar user={post.author} />
                <div className="grow">
                  <strong className="post-author-name">{post.author?.displayName}</strong>
                  <div className="tiny muted">@{post.author?.username} · {timeAgo(post.createdAt)}</div>
                </div>
              </button>
            </header>
            {post.repostOf && <div className="repost-badge">🔁 {post.userId === me?.id ? 'Reposteaste' : `${post.author?.displayName || 'Alguien'} reposteó`}</div>}
            {post.text && <p className="post-text">{post.text}</p>}
            <Attachment file={post.file} />
            {post.repostOf && (
              <div className="repost-quote">
                {post.repostOf.unavailable ? (
                  <span className="repost-unavailable">Esta publicación ya no está disponible.</span>
                ) : (
                  <>
                    <div className="post-head">
                      <button
                        type="button"
                        className="post-author"
                        onClick={() => onProfile?.(post.repostOf.author)}
                      >
                        <Avatar user={post.repostOf.author} size="xs" />
                        <div className="grow">
                          <strong className="tiny">{post.repostOf.author?.displayName}</strong>
                          <div className="tiny muted">@{post.repostOf.author?.username} · {timeAgo(post.repostOf.createdAt)}</div>
                        </div>
                      </button>
                    </div>
                    {post.repostOf.text && <p className="post-text">{post.repostOf.text}</p>}
                    <Attachment file={post.repostOf.file} />
                  </>
                )}
              </div>
            )}
            <div className="post-actions">
              <button
                type="button"
                className={cx('ghost', post.liked && 'liked')}
                onClick={() => toggleLike(post)}
              >
                ❤️ {post.likes}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setOpenComments(openComments === post.id ? null : post.id)}
              >
                💬 {post.comments?.length || 0}
              </button>
              <button
                type="button"
                className={cx('ghost', post.reposted && 'liked')}
                onClick={() => toggleRepost(post)}
                title={post.reposted ? 'Deshacer repost' : 'Repostar'}
              >
                🔁 {post.reposts || 0}
              </button>
              {friendAction(post.author)}
            </div>
            {openComments === post.id && (
              <div className="comments">
                {(post.comments || []).map((comment) => (
                  <div className="comment" key={comment.id}>
                    <Avatar user={comment.author} size="xs" />
                    <div className="comment-body">
                      <div className="comment-meta">
                        <strong className="tiny">{comment.author?.displayName || 'Alguien'}</strong>
                        <span className="tiny muted">@{comment.author?.username || 'usuario'} · {timeAgo(comment.createdAt)}</span>
                      </div>
                      <span className="comment-text">{comment.text}</span>
                    </div>
                  </div>
                ))}
                <div className="comment-input">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addComment(post); }}
                    placeholder="Escribe un comentario…"
                  />
                  <button type="button" className="primary small" onClick={() => addComment(post)}>Enviar</button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
