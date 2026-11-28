import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { getServerUrl, setServerUrl, isServerUrlAutomatic } from '../config.js';
import BrandWordmark from './BrandWordmark.jsx';

const USER_KEY = 'nexus_user';
const PASS_KEY = 'nexus_pass';
const REMEMBER_KEY = 'nexus_remember';

function readRemembered() {
  try {
    if (localStorage.getItem(REMEMBER_KEY) !== '1') return null;
    const username = localStorage.getItem(USER_KEY) || '';
    const password = localStorage.getItem(PASS_KEY) || '';
    return username && password ? { username, password } : null;
  } catch {
    return null;
  }
}

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [serverUrl, setUrl] = useState(getServerUrl());
  const automatic = isServerUrlAutomatic();
  const remembered = useRef(readRemembered());
  const [username, setUsername] = useState(remembered.current?.username || '');
  const [password, setPassword] = useState(remembered.current?.password || '');
  const [displayName, setDisplayName] = useState('');
  // Viene marcado por defecto: nadie tiene que acordarse de tocar la casilla.
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const autoTried = useRef(false);

  async function authenticate(kind, userValue, passValue, nameValue = '') {
    setError('');
    if (!automatic) {
      if (!serverUrl.trim()) {
        setError('Escribe la URL del servidor.');
        return false;
      }
      setServerUrl(serverUrl.trim());
    }
    setBusy(true);
    try {
      const data = await api(kind === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        auth: false,
        body: {
          username: userValue.trim().toLowerCase(),
          password: passValue,
          displayName: nameValue.trim()
        }
      });
      localStorage.setItem('nexus_token', data.token);
      if (remember) {
        localStorage.setItem(USER_KEY, userValue.trim().toLowerCase());
        localStorage.setItem(PASS_KEY, passValue);
        localStorage.setItem(REMEMBER_KEY, '1');
      } else {
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(PASS_KEY);
        localStorage.removeItem(REMEMBER_KEY);
      }
      onAuthenticated(data.user);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    const saved = remembered.current;
    if (saved && !localStorage.getItem('nexus_token')) {
      authenticate('login', saved.username, saved.password);
    }
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    await authenticate(mode, username, password, displayName);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <BrandWordmark />
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

          <label className="remember-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Recordarme en este dispositivo
          </label>
          <small className="hint">Entrás automáticamente al abrir Heph, en la PC o en el celular. Los datos quedan solo en tu dispositivo.</small>

          {error && <div className="error-box">{error}</div>}

          <button className="primary wide" type="submit" disabled={busy}>
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  );
}
