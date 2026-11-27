import { useState } from 'react';
import { api } from '../api.js';
import { timeAgo } from '../utils.js';
import Avatar from './Avatar.jsx';

export default function Friends({ me, friends, incoming, outgoing, unread = {}, onDm, onCall, onCine, onProfile, refresh }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(me.code);
      setMessage('¡Código copiado!');
    } catch {
      setMessage(`Tu código: ${me.code}`);
    }
  }

  async function sendRequest(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const data = await api('/friends/request', { method: 'POST', body: { code } });
      setCode('');
      setMessage(data.accepted ? '¡Ya son amigos!' : 'Solicitud enviada.');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function respond(id, action) {
    try {
      await api(`/friends/${id}/${action}`, { method: 'POST' });
      setMessage(action === 'accept' ? 'Solicitud aceptada.' : 'Solicitud rechazada.');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h2>Amigos</h2>

      <div className="card my-code">
        <div>
          <span className="muted tiny block">TU CÓDIGO NEXUS</span>
          <strong className="code-value">{me.code}</strong>
          <p className="tiny muted">Compártelo para que otros te agreguen.</p>
        </div>
        <button type="button" className="primary" onClick={copyCode}>Copiar código</button>
      </div>

      <div className="card">
        <h3>Agregar amigo</h3>
        <form onSubmit={sendRequest} className="inline-form">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXX"
            maxLength={8}
          />
          <button type="submit" className="primary" disabled={busy}>Enviar solicitud</button>
        </form>
        {error && <div className="error-box">{error}</div>}
        {message && <div className="ok-box">{message}</div>}
      </div>

      {incoming.length > 0 && (
        <section className="card">
          <h3>Solicitudes recibidas</h3>
          {incoming.map((request) => (
            <div className="row" key={request.id}>
              <Avatar user={request.from} />
              <div className="grow">
                <strong>{request.from?.displayName}</strong>
                <div className="tiny muted">@{request.from?.username} · {timeAgo(request.createdAt)}</div>
              </div>
              <button type="button" className="primary small" onClick={() => respond(request.from.id, 'accept')}>Aceptar</button>
              <button type="button" className="ghost small" onClick={() => respond(request.from.id, 'reject')}>Rechazar</button>
            </div>
          ))}
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="card">
          <h3>Solicitudes enviadas</h3>
          {outgoing.map((request) => (
            <div className="row" key={request.id}>
              <Avatar user={request.to} />
              <span className="grow">{request.to?.displayName}</span>
              <span className="tiny muted">Pendiente</span>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h3>Tus amigos ({friends.length})</h3>
        {friends.length === 0 && <p className="muted">Aún no tienes amigos. Pega su código arriba.</p>}
        <div className="friend-grid">
          {friends.map((friend) => (
            <div className="friend-card" key={friend.id}>
              <div className="friend-head">
                <Avatar user={friend} />
                <div className="grow">
                  <strong>{friend.displayName}</strong>
                  <div className="tiny muted">
                    <span className={`presence-dot inline ${friend.online ? 'online' : ''}`} />
                    {friend.online ? 'En línea' : 'Desconectado'}
                  </div>
                </div>
              </div>
              <div className="friend-actions">
                <button type="button" className="ghost small" onClick={() => onProfile?.(friend)}>👤 Perfil</button>
                <button type="button" className="ghost small" onClick={() => onDm(friend)}>
                  💬 Mensaje {unread[friend.id] > 0 && <span className="dm-badge">{unread[friend.id]}</span>}
                </button>
                <button type="button" className="ghost small" onClick={() => onCall(friend)}>📹 Llamar</button>
                <button type="button" className="ghost small" onClick={() => onCine(friend)}>📺 Ver juntos</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
