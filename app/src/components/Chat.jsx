import { useCallback, useEffect, useRef, useState } from 'react';
import { api, uploadFile } from '../api.js';
import { fileUrl } from '../config.js';
import { getSocket } from '../socket.js';
import { cx, formatSize, isImage, isVideo, timeAgo } from '../utils.js';
import Avatar from './Avatar.jsx';

function dmRoomFor(a, b) {
  return `dm:${[a, b].sort().join(':')}`;
}

function MessageBubble({ message, me }) {
  const mine = message.fromId === me?.id;
  const file = message.file;
  return (
    <div className={cx('bubble-row', mine && 'mine')}>
      {!mine && (
        <Avatar user={message.author} size="xs" />
      )}
      <div className="bubble">
        {!mine && (
          <div className="tiny author-line">
            {message.author?.displayName} {message.author?.avatarUrl ? '📷' : '👤 sin foto'}
          </div>
        )}
        {message.text && <div className="bubble-text">{message.text}</div>}
        {file && (
          isImage(file.mime)
            ? <img className="bubble-media" src={fileUrl(file.url)} alt={file.name} />
            : isVideo(file.mime)
              ? <video className="bubble-media" src={fileUrl(file.url)} controls />
              : <a className="file-chip" href={fileUrl(file.url)} target="_blank" rel="noreferrer">📎 {file.name} ({formatSize(file.size)})</a>
        )}
        <div className="tiny muted bubble-time">
          {timeAgo(message.createdAt)}
          {mine && (
            <span className="receipt" title={message.readAt ? 'Leído' : message.deliveredAt ? 'Entregado' : 'Enviado'}>
              {message.readAt ? ' ✓✓' : message.deliveredAt ? ' ✓' : ' 🕒'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Chat({ chat, me, compact = false, onCall, onCine }) {
  const validDm = chat?.type === 'dm' && Boolean(chat.userId);
  const validCommunity = chat?.type === 'community' && Boolean(chat.communityId);
  const canChat = validDm || validCommunity;

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [fileId, setFileId] = useState(null);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [remoteTyping, setRemoteTyping] = useState(false);
  const bottomRef = useRef(null);
  const fileInput = useRef(null);
  const typingTimer = useRef(null);
  const typingSentAt = useRef(0);

  const load = useCallback(async () => {
    setMessages([]);
    setError('');
    if (!canChat) return;
    try {
      const path = validDm
        ? `/chats/dm/${chat.userId}`
        : `/chats/community/${chat.communityId}`;
      const data = await api(path);
      const loaded = data.messages || [];
      setMessages(loaded);
      if (validDm) {
        const unread = loaded.filter((item) => item.fromId === chat.userId && !item.readAt).map((item) => item.id);
        if (unread.length) getSocket()?.emit('dm:read', { to: chat.userId, ids: unread });
      }
    } catch (err) {
      setError(err.message);
    }
  }, [canChat, validDm, chat?.userId, chat?.communityId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, remoteTyping]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !canChat) return undefined;

    function onMessage(payload) {
      const matches = validDm
        ? payload?.room === dmRoomFor(me.id, chat.userId)
        : payload?.communityId === chat.communityId;
      if (!matches || !payload?.message) return;
      setMessages((current) => [...current, payload.message]);
      if (validDm && payload.message.fromId === chat.userId) {
        getSocket()?.emit('dm:read', { to: chat.userId, ids: [payload.message.id] });
      }
    }
    function onReceipt(payload) {
      if (!validDm || payload?.room !== dmRoomFor(me.id, chat.userId)) return;
      const ids = new Set(payload.ids || []);
      setMessages((current) => current.map((message) => ids.has(message.id)
        ? {
            ...message,
            deliveredAt: message.deliveredAt || payload.deliveredAt || null,
            readAt: message.readAt || payload.readAt || null
          }
        : message));
    }
    function onTyping(payload) {
      if (!validDm || payload?.from !== chat.userId) return;
      setRemoteTyping(Boolean(payload.typing));
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setRemoteTyping(false), 2500);
    }

    socket.on('dm:message', onMessage);
    socket.on('community:message', onMessage);
    socket.on('dm:receipt', onReceipt);
    socket.on('typing', onTyping);
    return () => {
      socket.off('dm:message', onMessage);
      socket.off('community:message', onMessage);
      socket.off('dm:receipt', onReceipt);
      socket.off('typing', onTyping);
      clearTimeout(typingTimer.current);
    };
  }, [canChat, validDm, chat?.userId, chat?.communityId, me?.id]);

  function notifyTyping() {
    const socket = getSocket();
    if (!socket?.connected || !validDm || Date.now() - typingSentAt.current < 1200) return;
    typingSentAt.current = Date.now();
    socket.emit('typing', { to: chat.userId, typing: true });
    socket.emit('typing', { to: chat.userId, typing: false });
  }

  function sendMessage() {
    const value = text.trim();
    if ((!value && !fileId) || !canChat) return;
    const socket = getSocket();
    if (!socket?.connected) {
      setError('Sin conexión con el servidor. Revisa la URL del servidor.');
      return;
    }
    setError('');
    const payload = { text: value, fileId };
    const event = validDm ? 'dm:send' : 'community:send';
    const target = validDm ? { to: chat.userId } : { communityId: chat.communityId };
    socket.emit(event, { ...target, ...payload }, (response) => {
      if (response?.error) setError(response.error);
    });
    setText('');
    setFileId(null);
    setFileName('');
  }

  async function attach(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProgress(0);
    setError('');
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

  const title = chat?.name || (validDm ? chat?.user?.displayName : 'Chat');

  return (
    <section className={cx('chat-panel card', compact && 'compact')}>
      <header className="chat-header">
        <div className="grow">
          <strong>{title || 'Mensajes'}</strong>
          <div className="tiny muted">
            {validDm
              ? (chat.online ? '🟢 En línea' : '⚫ Desconectado')
              : validCommunity ? 'Canal de comunidad' : 'Selecciona una conversación'}
          </div>
          {validDm && (
            <div className="tiny muted">{chat.user?.avatarUrl ? '📷 Con foto' : '👤 Sin foto'}</div>
          )}
        </div>
        <button type="button" className="icon-btn" title="Llamar" disabled={!validDm} onClick={() => onCall?.(chat.user)}>📹</button>
        <button type="button" className="icon-btn" title="Ver juntos" disabled={!canChat} onClick={() => onCine?.(chat)}>📺</button>
      </header>

      <div className="messages">
        {!canChat && (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            Elige un amigo en la lista o abre una comunidad para empezar a chatear.
          </div>
        )}
        {canChat && messages.length === 0 && <p className="muted empty-state">Sin mensajes todavía. ¡Escribe el primero!</p>}
        {messages.map((message) => <MessageBubble key={message.id} message={message} me={me} />)}
        {remoteTyping && <div className="tiny muted typing-line">{chat.user?.displayName || 'Alguien'} está escribiendo…</div>}
        <div ref={bottomRef} />
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="chat-composer">
        {fileId && <div className="chip">📎 {fileName} <button type="button" onClick={() => { setFileId(null); setFileName(''); }}>✕</button></div>}
        {progress !== null && <div className="progress"><div style={{ width: `${progress}%` }} /></div>}
        <input ref={fileInput} type="file" hidden onChange={attach} />
        <button type="button" className="icon-btn" title="Adjuntar" disabled={!canChat} onClick={() => fileInput.current?.click()}>📎</button>
        <input
          type="text"
          value={text}
          onChange={(e) => { setText(e.target.value); notifyTyping(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
          placeholder={canChat ? 'Escribe un mensaje…' : 'Selecciona un chat'}
          disabled={!canChat}
        />
        <button type="button" className="primary" disabled={!canChat} onClick={sendMessage}>Enviar</button>
      </div>
    </section>
  );
}
