import { useState } from 'react';
import { api } from '../api.js';
import { getServerUrl, setServerUrl, isServerUrlAutomatic } from '../config.js';

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [serverUrl, setUrl] = useState(getServerUrl());
  const automatic = isServerUrlAutomatic();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!automatic) {
      if (!serverUrl.trim()) {
        setError('Escribe la URL del servidor.');
        return;
      }
      setServerUrl(serverUrl.trim());
    }
    setBusy(true);
    try {
      const data = await api(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        auth: false,
        body: {
          username: username.trim().toLowerCase(),
          password,
          displayName: displayName.trim()
        }
      });
      localStorage.setItem('nexus_token', data.token);
      onAuthenticated(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand-mark">N</div>
        <h1>Nexus</h1>
        <p className="muted">Tu espacio para hablar, llamar y ver videos juntos.</p>

        <div className="tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>
            Iniciar sesión
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>
            Crear cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {automatic ? (
            <small className="hint">Conectado automáticamente a {serverUrl}</small>
          ) : (
            <>
              <label>
                URL del servidor
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://tu-app.onrender.com"
                  spellCheck={false}
                />
              </label>
              <small className="hint">En Render pega aquí la URL que te dé Render. En local: http://localhost:3000</small>
            </>
          )}

          <label>
            Usuario
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="mi_usuario"
              autoComplete="username"
              required
            />
          </label>

          {mode === 'register' && (
            <label>
              Nombre visible
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Cómo te verán tus amigos"
                required
              />
            </label>
          )}

          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </label>

          {error && <div className="error-box">{error}</div>}

          <button className="primary wide" type="submit" disabled={busy}>
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  );
}
