import { useEffect, useState } from 'react';
import { getServerUrl, setServerUrl, isServerUrlAutomatic } from '../config.js';
import { STATUSES } from '../preferences.js';

export default function Settings({ onLogout, status, onStatus, soundOn, onToggleSound, isOwner = false }) {
  const [url, setUrl] = useState(getServerUrl());
  const [turn, setTurn] = useState(() => localStorage.getItem('nexus_turn') || '');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setUrl(getServerUrl());
  }, []);

  function save(event) {
    event.preventDefault();
    setServerUrl(url);
    if (turn.trim()) {
      try {
        JSON.parse(turn);
        localStorage.setItem('nexus_turn', turn.trim());
      } catch {
        setMessage('El JSON del TURN no es válido.');
        return;
      }
    } else {
      localStorage.removeItem('nexus_turn');
    }
    setMessage('Guardado. Reinicia Heph para aplicar el cambio de servidor.');
  }

  return (
    <div className="page settings-page">
      <h2>Configuración</h2>

      <form className={`card settings-card ${isOwner ? '' : 'settings-locked'}`} onSubmit={save}>
        <div className="settings-card-head">
          <div className="settings-icon">🛠️</div>
          <div className="grow">
            <h3>Servidor y llamadas</h3>
            <p className="tiny muted">Conexión y red de videollamadas</p>
          </div>
          {!isOwner && <span className="tiny muted">🔒 Solo el dueño</span>}
        </div>
        <div className="settings-body">
          {!isOwner && (
            <div className="lock-note">🔒 Estas opciones solo las puede cambiar el dueño de Heph.</div>
          )}
          <label className="settings-field">
            URL del servidor
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              readOnly={!isOwner || isServerUrlAutomatic()}
              disabled={!isOwner}
              spellCheck={false}
            />
          </label>
          <p className="tiny muted hint">
            {isServerUrlAutomatic()
              ? 'La interfaz se actualiza sola desde Render y se conecta automáticamente. No hace falta cambiar esta URL.'
              : 'Usa la URL de Render (https://…onrender.com) para conectarte desde cualquier PC.'}
          </p>
          <label className="settings-field">
            TURN (opcional, JSON)
            <textarea
              value={turn}
              onChange={(e) => setTurn(e.target.value)}
              rows={4}
              disabled={!isOwner}
              placeholder={'{"urls":"turn:servidor:3478","username":"user","credential":"pass"}'}
            />
          </label>
          <p className="tiny muted hint">
            Las llamadas usan STUN de Google. Si estás detrás de un firewall estricto, agregá un servidor TURN.
          </p>
          {message && <div className="ok-box">{message}</div>}
        </div>
        <div className="settings-footer">
          <button type="submit" className="primary" disabled={!isOwner || isServerUrlAutomatic()}>
            {isOwner ? 'Guardar cambios' : 'Solo el dueño puede guardar'}
          </button>
        </div>
      </form>

      <section className="card settings-card">
        <div className="settings-card-head">
          <div className="settings-icon">🔔</div>
          <div className="grow">
            <h3>Notificaciones y estado</h3>
            <p className="tiny muted">Avisos de mensajes y llamadas</p>
          </div>
        </div>
        <div className="settings-body">
          <label className="settings-check">
            <input type="checkbox" checked={soundOn} onChange={onToggleSound} />
            Sonido al recibir mensajes o llamadas
          </label>
          <p className="tiny muted hint">También podés silenciar rápido desde el ícono 🔔 al pie del menú.</p>
          <label className="settings-field">
            Mi estado
            <select value={status} onChange={(event) => onStatus(event.target.value)}>
              {STATUSES.map((item) => (
                <option key={item.id} value={item.id}>{item.icon} {item.label}</option>
              ))}
            </select>
          </label>
          <p className="tiny muted hint">
            Ocupado y Durmiendo no muestran avisos emergentes ni suenan. Tus amigos ven el estado al costado de tu nombre.
          </p>
        </div>
      </section>

      <section className="card settings-card">
        <div className="settings-card-head">
          <div className="settings-icon">🚪</div>
          <div className="grow">
            <h3>Sesión</h3>
            <p className="tiny muted">Cerrar la sesión actual</p>
          </div>
        </div>
        <div className="settings-footer">
          <button type="button" className="danger" onClick={onLogout}>Cerrar sesión</button>
        </div>
      </section>
    </div>
  );
}
