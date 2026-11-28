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

// El texto sigue siendo texto: solo convertimos en botón las menciones que el
// servidor confirmó. Nunca se inserta HTML.
function PostText({ text, mentions, onProfile }) {
  if (!text) return null;
  const parts = String(text).split(/(@[a-zA-Z0-9_.-]{3,20})/g);
  return (
    <p className="post-text">
      {parts.map((part, index) => {
        const match = part.match(/^@([a-zA-Z0-9_.-]{3,20})$/);
        if (!match) return <span key={index}>{part}</span>;
        const username = match[1].replace(/[.-]+$/, '').toLowerCase();
        const user = (mentions || []).find(
          (item) => String(item.username || '').toLowerCase() === username
        );
        if (!user) return <span key={index}>{part}</span>;
        return (
          <button
            type="button"
            className="mention-link"
            key={index}
            onClick={() => onProfile?.(user)}
            title={`Ver perfil de ${user.displayName || username}`}
          >
            @{user.username}
          </button>
        );
      })}
    </p>
  );
}

export default function Feed({
  communityId = null, compact = false, onProfile, me, friends = [], onFriendsChanged, focusPostId = null
}) {
  const [posts, setPosts] = useState([]);
  const [text, setText] = useState('');
  const [progress, setProgress] = useState(null);
  const [fileId, setFileId] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [openComments, setOpenComments] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionUsers, setMentionUsers] = useState([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const fileInput = useRef(null);
  const textareaRef = useRef(null);
  const mentionRange = useRef(null);

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

  // Sugerencias del @: al escribir solo "@" mostramos amigos y otros usuarios;
  // con texto buscamos en el servidor. La búsqueda se cancela al seguir tecleando.
  useEffect(() => {
    if (mentionQuery === null) return undefined;
    setMentionIndex(0);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/users/search?q=${encodeURIComponent(mentionQuery)}`);
        if (cancelled) return;
        const found = data.users || [];
        if (!mentionQuery) {
          const seen = new Set();
          setMentionUsers([...friends, ...found].filter((user) => {
            if (!user?.id || seen.has(user.id)) return false;
            seen.add(user.id);
            return true;
          }).slice(0, 8));
        } else {
          setMentionUsers(found);
        }
      } catch {
        if (!cancelled) setMentionUsers(mentionQuery ? [] : friends.slice(0, 8));
      }
    }, mentionQuery ? 180 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mentionQuery, friends]);

  // Al tocar una notificación de mención abrimos el inicio y resaltamos el post.
  useEffect(() => {
    if (!focusPostId) return undefined;
    const node = [...document.querySelectorAll('.post')]
      .find((element) => element.dataset.postId === focusPostId);
    if (!node) return undefined;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('post-focused');
    const timer = setTimeout(() => node.classList.remove('post-focused'), 2600);
    return () => {
      clearTimeout(timer);
      node.classList.remove('post-focused');
    };
  }, [focusPostId, posts]);

  function updateMentionQuery(event) {
    const value = event.target.value;
    const caret = event.target.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(/@([a-zA-Z0-9_.-]{0,20})$/);
    if (!match) {
      mentionRange.current = null;
      setMentionQuery(null);
      setMentionUsers([]);
      return;
    }
    mentionRange.current = { start: caret - match[0].length, end: caret };
    setMentionQuery(match[1]);
  }

  function closeMentions() {
    mentionRange.current = null;
    setMentionQuery(null);
    setMentionUsers([]);
  }

  function chooseMention(user) {
    const range = mentionRange.current;
    if (!range || !user?.username) return;
    const before = text.slice(0, range.start);
    const after = text.slice(range.end);
    const insertion = `@${user.username} `;
    setText(before + insertion + after);
    closeMentions();
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      const position = before.length + insertion.length;
      node.setSelectionRange(position, position);
    });
  }

  function handleComposerKeyDown(event) {
    if (mentionQuery === null || mentionUsers.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMentionIndex((current) => (current + 1) % mentionUsers.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMentionIndex((current) => (current - 1 + mentionUsers.length) % mentionUsers.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      chooseMention(mentionUsers[mentionIndex] || mentionUsers[0]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMentions();
    }
  }

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
      closeMentions();
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
        <div className="composer-input-wrap">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              updateMentionQuery(event);
            }}
            onKeyDown={handleComposerKeyDown}
            placeholder="¿Qué estás pensando? Usá @ para etiquetar"
            rows={compact ? 2 : 3}
          />
          {mentionQuery !== null && mentionUsers.length > 0 && (
            <div className="mention-menu" role="listbox">
              <div className="mention-menu-title">Etiquetar a…</div>
              {mentionUsers.map((user, index) => (
                <button
                  type="button"
                  key={user.id}
                  role="option"
                  aria-selected={index === mentionIndex}
                  className={cx('mention-option', index === mentionIndex && 'active')}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseMention(user)}
                >
                  <Avatar user={user} size="xs" />
                  <span className="grow">
                    <strong className="block">{user.displayName}</strong>
                    <span className="tiny muted">@{user.username}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
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
          <article className="card post" key={post.id} data-post-id={post.id}>
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
            {post.text && <PostText text={post.text} mentions={post.mentions} onProfile={onProfile} />}
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
                    {post.repostOf.text && (
                      <PostText text={post.repostOf.text} mentions={post.repostOf.mentions} onProfile={onProfile} />
                    )}
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
