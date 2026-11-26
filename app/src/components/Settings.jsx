import { useEffect, useState } from 'react';
import { getServerUrl, setServerUrl } from '../config.js';

export default function Settings({ onLogout }) {
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
      <form className="card stack-form" onSubmit={save}>
        <label>
          URL del servidor
          <input value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
        </label>
        <small className="hint">
          Usa la URL de Render (https://…onrender.com) para conectarte con tus amigos desde cualquier PC.
          Solo {`http://localhost:3000`} funciona en esta máquina.
        </small>

        <label>
          TURN (opcional, JSON)
          <textarea
            value={turn}
            onChange={(e) => setTurn(e.target.value)}
            rows={4}
            placeholder={'{"urls":"turn:servidor:3478","username":"user","credential":"pass"}'}
          />
        </label>
        <small className="hint">
          Las llamadas usan STUN de Google. Si estás detrás de un firewall estricto, añade un servidor TURN
          en formato JSON (por ejemplo de Twilio). El servidor solo relaya la señalización: el audio y video van
          directamente entre participantes (WebRTC).
        </small>
        {message && <div className="ok-box">{message}</div>}
        <button type="submit" className="primary">Guardar</button>
      </form>

      <div className="card">
        <h3>Sesión</h3>
        <button type="button" className="danger" onClick={onLogout}>Cerrar sesión</button>
      </div>
    </div>
  );
}
