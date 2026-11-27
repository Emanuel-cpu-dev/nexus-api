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
    setMessage('Guardado. Reinicia Nexus para aplicar el cambio de servidor.');
  }

  return (
    <div className="page">
      <h2>Configuración</h2>
      <form className={`card stack-form ${isOwner ? '' : 'settings-locked'}`} onSubmit={save}>
        <h3>Servidor y llamadas {isOwner ? '' : '🔒'}</h3>
        {!isOwner && <small className="hint">Estas opciones solo las puede cambiar el dueño de Nexus.</small>}
        <label>
          URL del servidor
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            readOnly={!isOwner || isServerUrlAutomatic()}
            disabled={!isOwner}
            spellCheck={false}
          />
        </label>
        <small className="hint">
          {isServerUrlAutomatic()
            ? 'La interfaz se actualiza sola desde Render y se conecta automáticamente a ese servidor. No hace falta cambiar esta URL.'
            : 'Usa la URL de Render (https://…onrender.com) para conectarte con tus amigos desde cualquier PC. Solo localhost funciona en esta máquina.'}
        </small>

        <label>
          TURN (opcional, JSON)
          <textarea
            value={turn}
            onChange={(e) => setTurn(e.target.value)}
            rows={4}
            disabled={!isOwner}
            placeholder={'{"urls":"turn:servidor:3478","username":"user","credential":"pass"}'}
          />
        </label>
        <small className="hint">
          Las llamadas usan STUN de Google. Si estás detrás de un firewall estricto, añade un servidor TURN
          en formato JSON (por ejemplo de Twilio). El servidor solo relaya la señalización: el audio y video van
          directamente entre participantes (WebRTC).
        </small>
        {message && <div className="ok-box">{message}</div>}
        <button type="submit" className="primary" disabled={!isOwner || isServerUrlAutomatic()}>
          {isOwner ? 'Guardar' : 'Solo el dueño puede guardar'}
        </button>
      </form>

      <div className="card">
        <h3>Notificaciones y estado</h3>
        <label className="settings-check">
          <input type="checkbox" checked={soundOn} onChange={onToggleSound} />
          Sonido al recibir mensajes o llamadas
        </label>
        <small className="hint">También podés silenciar rápido desde el ícono 🔔 al pie del menú.</small>
        <label className="settings-field">
          Mi estado
          <select value={status} onChange={(event) => onStatus(event.target.value)}>
            {STATUSES.map((item) => (
              <option key={item.id} value={item.id}>{item.icon} {item.label}</option>
            ))}
          </select>
        </label>
        <small className="hint">Ocupado y Durmiendo no muestran avisos emergentes ni suenan. Tus amigos ven el estado al costado de tu nombre.</small>
      </div>

      <div className="card">
        <h3>Sesión</h3>
        <button type="button" className="danger" onClick={onLogout}>Cerrar sesión</button>
      </div>
    </div>
  );
}
