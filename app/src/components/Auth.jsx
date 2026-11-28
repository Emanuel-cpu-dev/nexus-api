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
  const [view, setView] = useState('new');
  const [emailStep, setEmailStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [config, setConfig] = useState({ googleClientId: '', emailEnabled: false });
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
  const [googleReady, setGoogleReady] = useState(false);
  const autoTried = useRef(false);
  const googleRef = useRef(null);

  function prepare() {
    if (!automatic) {
      if (!serverUrl.trim()) {
        setError('Escribe la URL del servidor.');
        return false;
      }
      setServerUrl(serverUrl.trim());
    }
    return true;
  }

  function storeSession(data, legacy = null) {
    localStorage.setItem('nexus_token', data.token);
    if (legacy?.remember) {
      localStorage.setItem(USER_KEY, legacy.username.trim().toLowerCase());
      localStorage.setItem(PASS_KEY, legacy.password);
      localStorage.setItem(REMEMBER_KEY, '1');
    } else {
      // Los accesos nuevos (Google/correo) nunca guardan contraseña en el dispositivo.
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(PASS_KEY);
      localStorage.removeItem(REMEMBER_KEY);
    }
    onAuthenticated(data.user);
  }

  async function authenticate(kind, userValue, passValue, nameValue = '') {
    setError('');
    if (!prepare()) return false;
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
      storeSession(data, kind === 'login' && remember
        ? { remember: true, username: userValue, password: passValue }
        : null);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleResponse(response) {
    setError('');
    if (!response?.credential) {
      setError('Google no devolvió el acceso. Probá de nuevo.');
      return;
    }
    if (!prepare()) return;
    setBusy(true);
    try {
      const data = await api('/auth/google', {
        method: 'POST',
        auth: false,
        body: { credential: response.credential }
      });
      storeSession(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestCode(event) {
    event?.preventDefault();
    setError('');
    if (!prepare()) return;
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('Escribe un correo válido.');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/email/request', { method: 'POST', auth: false, body: { email: value } });
      setEmail(value);
      setEmailStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setError('');
    if (!prepare()) return;
    setBusy(true);
    try {
      const data = await api('/auth/email/verify', {
        method: 'POST',
        auth: false,
        body: { email: email.trim().toLowerCase(), code: code.trim() }
      });
      storeSession(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    api('/auth/config', { auth: false })
      .then((data) => { if (!cancelled) setConfig(data || {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    const saved = remembered.current;
    if (saved && !localStorage.getItem('nexus_token')) {
      authenticate('login', saved.username, saved.password);
    }
  }, []);

  useEffect(() => {
    if (!config.googleClientId) return undefined;
    let cancelled = false;

    function setup() {
      if (cancelled || !googleRef.current || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: handleGoogleResponse,
        auto_select: false
      });
      window.google.accounts.id.renderButton(googleRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 320
      });
      setGoogleReady(true);
    }

    if (window.google?.accounts?.id) {
      setup();
      return undefined;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = setup;
    document.head.appendChild(script);
    return () => { cancelled = true; };
  }, [config.googleClientId]);

  function handleSubmit(event) {
    event.preventDefault();
    authenticate(view === 'register' ? 'register' : 'login', username, password, displayName);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <BrandWordmark />
        <p className="muted">Tu espacio para hablar, llamar y ver videos juntos.</p>

        {automatic ? (
          <small className="hint">Conectado automáticamente a {serverUrl}</small>
        ) : (
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
        )}

        {view === 'new' ? (
          <div className="new-auth">
            {config.googleClientId ? (
              <div ref={googleRef} className="google-signin" aria-label="Entrar con Google" />
            ) : (
              <button className="ghost wide" type="button" disabled>
                Google se activará cuando se configure
              </button>
            )}
            {config.googleClientId && !googleReady && (
              <small className="hint">Preparando el acceso con Google…</small>
            )}

            <div className="auth-divider"><span>o</span></div>

            {config.emailEnabled === false && (
              <div className="error-box">El correo todavía no está configurado.</div>
            )}

            <form onSubmit={emailStep === 'email' ? requestCode : verifyCode}>
              {emailStep === 'email' ? (
                <>
                  <label>
                    Tu correo
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu-correo@hotmail.com"
                      autoComplete="email"
                      required
                    />
                  </label>
                  <small className="hint">Te enviamos un código de 6 números. No usamos contraseña.</small>
                  <button className="primary wide" type="submit" disabled={busy || config.emailEnabled === false}>
                    {busy ? 'Enviando…' : 'Enviar código'}
                  </button>
                </>
              ) : (
                <>
                  <small className="hint">Código enviado a <strong>{email}</strong>. Vence en 10 minutos.</small>
                  <label>
                    Código de 6 números
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                    />
                  </label>
                  <button className="primary wide" type="submit" disabled={busy}>
                    {busy ? 'Verificando…' : 'Entrar'}
                  </button>
                  <button
                    className="ghost wide"
                    type="button"
                    onClick={() => { setEmailStep('email'); setCode(''); setError(''); }}
                  >
                    Usar otro correo
                  </button>
                </>
              )}
              {error && <div className="error-box">{error}</div>}
            </form>

            <button
              type="button"
              className="link-button"
              onClick={() => { setView('legacy'); setError(''); }}
            >
              Ya tengo cuenta con usuario y contraseña
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="tabs">
              <button type="button" className={view === 'login' ? 'active' : ''} onClick={() => { setView('login'); setError(''); }}>
                Iniciar sesión
              </button>
              <button type="button" className={view === 'register' ? 'active' : ''} onClick={() => { setView('register'); setError(''); }}>
                Crear cuenta
              </button>
            </div>

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

            {view === 'register' && (
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
                autoComplete={view === 'login' ? 'current-password' : 'new-password'}
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
            <small className="hint">Solo para cuentas anteriores. Los accesos nuevos no guardan contraseña.</small>

            {error && <div className="error-box">{error}</div>}

            <button className="primary wide" type="submit" disabled={busy}>
              {busy ? 'Un momento…' : view === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>

            <button
              type="button"
              className="link-button"
              onClick={() => { setView('new'); setError(''); }}
            >
              Volver a Google o correo
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
