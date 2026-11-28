import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { getServerUrl } from './config.js';
import { connectSocket, disconnectSocket, getSocket } from './socket.js';
import {
  configureNative, stopNative, consumeNativeOpen, onNativeOpen, showNativeUpdate, isNative,
  registerBack, onAndroidBack, exitApp, startNativeLocation, stopNativeLocation, onNativeLocation
} from './native.js';
import Auth from './components/Auth.jsx';
import Sidebar from './components/Sidebar.jsx';
import Feed from './components/Feed.jsx';
import Friends from './components/Friends.jsx';
import Chat from './components/Chat.jsx';
import Communities from './components/Communities.jsx';
import Profile from './components/Profile.jsx';
import Settings from './components/Settings.jsx';
import CallOverlay from './components/CallOverlay.jsx';
import Cine from './components/Cine.jsx';
import StoryBar from './components/StoryBar.jsx';
import StoryViewer from './components/StoryViewer.jsx';
import ZodiacStoryViewer from './components/ZodiacStoryViewer.jsx';
import BrandWordmark from './components/BrandWordmark.jsx';
import Avatar from './components/Avatar.jsx';
import UserProfile from './components/UserProfile.jsx';
import Location from './components/Location.jsx';
import Notifications from './components/Notifications.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';
import UiUpdateBanner from './components/UiUpdateBanner.jsx';
import {
  checkForUpdate, getNativeVersion, installUpdate, prepareUpdate,
  getPreparedUpdate, installPreparedUpdate, onUpdateReady, isNativeApp
} from './updater.js';
import { checkUiUpdate, applyUiUpdate } from './uiUpdate.js';
import { playSound, unlockSound } from './sound.js';
import {
  getMyStatus, setMyStatus, getSoundEnabled, setSoundEnabled, isQuietStatus
} from './preferences.js';

function ToastStack({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack">
      {toasts.map((item) => (
        <div
          key={item.id}
          className={`toast ${item.title ? 'notification' : ''}`}
          role={item.onClick ? 'button' : undefined}
          tabIndex={item.onClick ? 0 : undefined}
          onClick={item.onClick}
          onKeyDown={item.onClick ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') item.onClick();
          } : undefined}
        >
          {item.title ? (
            <>
              <div className="toast-head">
                <span className="toast-icon">{item.icon || '🔔'}</span>
                <strong>{item.title}</strong>
              </div>
              {item.body && <div className="toast-body">{item.body}</div>}
            </>
          ) : item.message}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('nexus_token'));
  const [me, setMe] = useState(null);
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [posts, setPosts] = useState([]);
  const [view, setView] = useState('home');
  const [activeChat, setActiveChat] = useState(null);
  const [cineTarget, setCineTarget] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [profileReturnView, setProfileReturnView] = useState('friends');
  const [communityOpen, setCommunityOpen] = useState(null);
  const [locationState, setLocationState] = useState({
    sharedWith: [], sharedBy: [], positions: {}
  });
  const [locationRequests, setLocationRequests] = useState([]);
  const [locating, setLocating] = useState(false);
  const [unread, setUnread] = useState({});
  const [noticeCounts, setNoticeCounts] = useState({ likes: 0, mentions: 0 });
  const [stories, setStories] = useState([]);
  const [storyCount, setStoryCount] = useState(0);
  const [storyOpen, setStoryOpen] = useState(null);
  const [zodiacOpen, setZodiacOpen] = useState(false);
  const [horoscope, setHoroscope] = useState(null);
  const lastHoroscopeDate = useRef(null);
  const [focusPostId, setFocusPostId] = useState(null);
  const [call, setCall] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [myStatus, setStatusState] = useState(getMyStatus);
  const [soundOn, setSoundState] = useState(getSoundEnabled);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [update, setUpdate] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [uiUpdate, setUiUpdate] = useState(null);
  const contentRef = useRef(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const historyRef = useRef([]);
  const screenRef = useRef({ view: 'home' });
  const lastLocationSent = useRef(0);
  const nativeKeyboardRef = useRef(false);

  screenRef.current = {
    view, activeChat, cineTarget, profileUser, profileReturnView, communityOpen, focusPostId
  };

  // Navegación real como en Instagram: cada pantalla entra a una pila y el
  // botón "atrás" vuelve a la anterior; en el inicio sale de la app.
  const applyScreen = useCallback((state) => {
    if ('view' in state) setView(state.view);
    if ('activeChat' in state) setActiveChat(state.activeChat);
    if ('cineTarget' in state) setCineTarget(state.cineTarget);
    if ('profileUser' in state) setProfileUser(state.profileUser);
    if ('profileReturnView' in state) setProfileReturnView(state.profileReturnView);
    if ('communityOpen' in state) setCommunityOpen(state.communityOpen);
    if ('focusPostId' in state) setFocusPostId(state.focusPostId);
  }, []);

  const pushScreen = useCallback((patch) => {
    historyRef.current = [...historyRef.current, { ...screenRef.current }];
    applyScreen(patch);
  }, [applyScreen]);

  const handleBack = useCallback(() => {
    const stack = historyRef.current;
    if (!stack.length) {
      exitApp();
      return;
    }
    const previous = stack[stack.length - 1];
    historyRef.current = stack.slice(0, -1);
    applyScreen(previous);
  }, [applyScreen]);

  const toast = useCallback((entry) => {
    const item = typeof entry === 'string' ? { message: entry } : entry;
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { ...item, id }]);
    setTimeout(
      () => setToasts((current) => current.filter((toastItem) => toastItem.id !== id)),
      item.duration || (item.title ? 6000 : 4200)
    );
  }, []);

  const notify = useCallback((entry, soundKind) => {
    if (isQuietStatus(myStatus)) return;
    toast(entry);
    // En Android el sonido lo pone la notificación nativa (suena aunque la app esté cerrada).
    if (soundOn && soundKind && !isNative()) {
      try { playSound(soundKind); } catch { /* el audio es opcional */ }
    }
  }, [toast, myStatus, soundOn]);

  // El WebView de Android no cambia de alto cuando aparece el teclado: el
  // nativo nos manda la altura real con este evento. En navegador/PC, donde no
  // existe ese evento, seguimos usando el viewport como respaldo.
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let baseline = viewport?.height || window.innerHeight;
    let baselineLayout = window.innerHeight;
    let nativeKeyboard = 0;

    function setKeyboard(height) {
      root.style.setProperty('--kb', height > 20 ? `${Math.round(height)}px` : '0px');
      document.body.classList.toggle('keyboard-open', height > 20);
      // No fuerza scroll: en el WebView mover el foco hace que Android vuelva a
      // dibujar el teclado y se quede en un bucle. La lista ya baja sola.
    }

    function keyboardFromNative() {
      // En algunos WebViews el teclado ya achica el layout y además manda el
      // evento nativo. Descontamos solo lo que el WebView NO achicó para no
      // repetir la corrección y deformar la pantalla.
      const consumedByWebView = Math.max(0, baselineLayout - window.innerHeight);
      return Math.max(0, nativeKeyboard - consumedByWebView);
    }

    function onNativeKeyboard(event) {
      nativeKeyboardRef.current = true;
      nativeKeyboard = Math.max(0, Number(event.detail) || 0);
      setKeyboard(keyboardFromNative());
    }

    function update() {
      if (nativeKeyboardRef.current) {
        setKeyboard(keyboardFromNative());
        return;
      }
      const visible = viewport?.height || window.innerHeight;
      if (visible > baseline) baseline = visible;
      if (window.innerHeight > baselineLayout) baselineLayout = window.innerHeight;
      setKeyboard(Math.max(0, baseline - visible));
    }

    update();
    window.addEventListener('nexus:keyboard', onNativeKeyboard);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('nexus:keyboard', onNativeKeyboard);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      root.style.setProperty('--kb', '0px');
      document.body.classList.remove('keyboard-open');
    };
  }, []);

  // La PC abre la UI desde Render: avisamos si hay versión nueva y recargamos.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const found = await checkUiUpdate();
      if (!cancelled && found) setUiUpdate(found);
    };
    check();
    const timer = setInterval(check, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  const applyFoundUpdate = useCallback((found) => {
    if (!found) return;
    if (!found.force && Number(localStorage.getItem('nexus_dismissed_update')) >= found.versionCode) return;
    // Una obligatoria nunca se puede descartar, aunque una versión vieja guardara el dismiss.
    if (found.force) localStorage.removeItem('nexus_dismissed_update');
    setUpdate(found);
    // En Android la descarga arranca sola, sin que el usuario tenga que esperar.
    if (isNativeApp()) {
      getPreparedUpdate().then((status) => {
        if (status?.versionCode >= found.versionCode && status?.ready) setUpdateReady(true);
      });
      prepareUpdate(found).then((status) => {
        if (status?.ready || status?.versionCode >= found.versionCode) setUpdateReady(Boolean(status?.ready));
      });
    }
    if (found.force && Number(localStorage.getItem('nexus_native_update_notified')) < found.versionCode) {
      localStorage.setItem('nexus_native_update_notified', String(found.versionCode));
      showNativeUpdate(found);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const found = await checkForUpdate();
      if (cancelled || !found) return;
      applyFoundUpdate(found);
    }

    check();
    const timer = setInterval(check, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [applyFoundUpdate]);

  useEffect(() => {
    let handle;
    onUpdateReady(() => {
      setUpdateReady(true);
      toast('La actualización ya está descargada. Tocá Instalar.');
    }).then((listener) => { handle = listener; });
    return () => handle?.remove?.();
  }, [toast]);

  const dismissUpdate = useCallback(() => {
    if (update?.force) return;
    if (update) localStorage.setItem('nexus_dismissed_update', String(update.versionCode));
    setUpdate(null);
  }, [update]);

  const applyUpdate = useCallback(async () => {
    if (!update || updating) return;
    if (isNativeApp() && !updateReady) {
      toast('Ya se está descargando en segundo plano. Te avisamos cuando esté lista.');
      return;
    }
    setUpdating(true);
    try {
      await installUpdate(update);
      if (isNativeApp()) {
        // Android abre el instalador; no descartamos el cartel hasta que el
        // usuario confirme, por si vuelve desde la pantalla del sistema.
        setUpdateReady(false);
      } else {
        toast('Descargando la actualización…');
        setUpdate(null);
      }
    } catch (error) {
      toast(error.message || 'No se pudo iniciar la actualización.');
    } finally {
      setUpdating(false);
    }
  }, [update, updating, updateReady, toast]);

  const changeStatus = useCallback((next) => {
    setMyStatus(next);
    setStatusState(next);
    getSocket()?.emit('presence:status', { status: next });
  }, []);

  const toggleSound = useCallback(() => {
    setSoundState((current) => {
      const next = !current;
      setSoundEnabled(next);
      return next;
    });
  }, []);

  // El servicio nativo necesita el token y las preferencias para avisar en segundo plano.
  useEffect(() => {
    if (!token) {
      stopNative();
      return;
    }
    // Ojo: al arrancar `me` todavía es null. No podemos llamar a stopNative()
    // acá porque borra el token guardado y apaga el servicio justo cuando el
    // usuario minimiza la app durante el bootstrap.
    if (!me?.id) return;
    configureNative({
      token,
      userId: me.id,
      serverUrl: getServerUrl(),
      sound: soundOn,
      quiet: isQuietStatus(myStatus)
    });
  }, [token, me?.id, soundOn, myStatus]);

  // El servidor necesita saber qué APK tiene el celular para dejar de insistir cuando ya actualizó.
  useEffect(() => {
    if (!token) return undefined;
    const socket = getSocket();
    if (!socket) return undefined;
    const report = async () => {
      const native = await getNativeVersion();
      if (native?.versionCode) socket.emit('app:version', { versionCode: native.versionCode });
    };
    report();
    socket.on('connect', report);
    return () => socket.off('connect', report);
  }, [token]);

  // Botón físico "atrás" y tecla Escape: mismo recorrido que una app nativa.
  useEffect(() => {
    if (!token) return undefined;
    registerBack();
    const unsubscribe = onAndroidBack(handleBack);
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      handleBack();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unsubscribe();
      window.removeEventListener('keydown', onKey);
    };
  }, [token, handleBack]);

  const logout = useCallback((clearCredentials = true) => {
    localStorage.removeItem('nexus_token');
    // Si la sesión venció o el servidor se reinició, conservamos usuario y clave
    // para que el próximo arranque entre solo de nuevo.
    if (clearCredentials === true) {
      localStorage.removeItem('nexus_user');
      localStorage.removeItem('nexus_pass');
      localStorage.removeItem('nexus_remember');
    }
    disconnectSocket();
    setToken(null);
    setMe(null);
    setFriends([]);
    setIncoming([]);
    setOutgoing([]);
    setActiveChat(null);
    setCineTarget(null);
    setProfileUser(null);
    setCommunityOpen(null);
    setLocationRequests([]);
    setLocationState({ sharedWith: [], sharedBy: [], positions: {} });
    setStories([]);
    setStoryCount(0);
    setStoryOpen(null);
    setZodiacOpen(false);
    setHoroscope(null);
    setCall(null);
    setView('home');
    historyRef.current = [];
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api('/bootstrap');
      setMe(data.user);
      setFriends(data.friends || []);
      setIncoming(data.incoming || []);
      setOutgoing(data.outgoing || []);
      setCommunities(data.communities || []);
      setPosts(data.posts || []);
      setUnread(data.unread || {});
      setNoticeCounts({
        likes: Number(data.likeCount) || 0,
        mentions: Number(data.mentionCount) || 0
      });
      setStories(data.stories || []);
      setStoryCount(Number(data.storyCount) || 0);
      if (data.horoscope) setHoroscope(data.horoscope);
      if (data.location) setLocationState(data.location);
    } catch (error) {
      toast(error.message);
      if (/401|No autorizado/i.test(error.message)) logout(false);
    }
  }, [toast, logout]);

  const refreshStories = useCallback(async () => {
    try {
      const data = await api('/stories');
      setStories(data.groups || []);
      setStoryCount(Number(data.storyCount) || 0);
    } catch {
      // Las historias son opcionales: no rompemos el resto de la app.
    }
  }, []);

  const refreshHoroscope = useCallback(async () => {
    try {
      const data = await api('/horoscope');
      setHoroscope(data);
      return data;
    } catch (error) {
      toast(error.message);
      return null;
    }
  }, [toast]);

  // Si la app queda abierta de un día para otro, el horóscopo se renueva solo.
  useEffect(() => {
    if (!horoscope?.date) return undefined;
    const timer = setInterval(() => {
      const today = new Date().toISOString().slice(0, 10);
      if (horoscope.date === today) return;
      refreshHoroscope();
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [horoscope?.date, refreshHoroscope]);

  // Aviso suave cuando cambia el día: es el gancho para volver a entrar.
  useEffect(() => {
    const date = horoscope?.date;
    if (!date) return;
    if (lastHoroscopeDate.current && lastHoroscopeDate.current !== date) {
      toast('✨ Tu horóscopo de hoy ya está listo');
    }
    lastHoroscopeDate.current = date;
  }, [horoscope?.date, toast]);

  // Marcamos la lectura en el servidor para que el badge no vuelva a aparecer
  // después de recargar. Es el mismo comportamiento que Instagram.
  const markNoticesRead = useCallback(() => {
    setNoticeCounts({ likes: 0, mentions: 0 });
    api('/notifications/read', { method: 'POST' }).then(load).catch(() => {});
  }, [load]);

  const openNotifications = useCallback(() => {
    markNoticesRead();
    pushScreen({ view: 'notifications', focusPostId: null });
  }, [markNoticesRead, pushScreen]);

  const openPost = useCallback((postId) => {
    if (!postId) return;
    markNoticesRead();
    pushScreen({ view: 'home', focusPostId: postId });
  }, [markNoticesRead, pushScreen]);

  // "Tirar para abajo para actualizar" en el celular (como Instagram).
  const pullEnabled = ['home', 'friends', 'messages', 'communities', 'location', 'profile', 'likes', 'notifications', 'userProfile', 'settings', 'cine'].includes(view);

  useEffect(() => {
    const node = contentRef.current;
    if (!node || !pullEnabled) {
      pullRef.current = 0;
      setPull(0);
      return undefined;
    }

    let startY = 0;
    let active = false;

    // En chat y cine el scroll puede estar en un hijo, no en .content.
    // Solo activamos el gesto si todos los contenedores están arriba.
    function atTop(target) {
      let element = target instanceof Element ? target : null;
      while (element && element !== node) {
        if (element.scrollTop > 0) return false;
        element = element.parentElement;
      }
      return node.scrollTop <= 0;
    }

    function onStart(event) {
      if (refreshingRef.current || event.touches?.length !== 1 || !atTop(event.target)) return;
      startY = event.touches[0].clientY;
      active = true;
    }

    function onMove(event) {
      if (!active || event.touches?.length !== 1) return;
      if (!atTop(event.target)) {
        active = false;
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const delta = event.touches[0].clientY - startY;
      const next = delta > 0 ? Math.min(96, delta * 0.6) : 0;
      pullRef.current = next;
      setPull(next);
      // Evita que el WebView haga su propio overscroll mientras mostramos el indicador.
      if (next > 0 && event.cancelable) event.preventDefault();
    }

    async function onEnd() {
      if (!active) return;
      active = false;
      if (pullRef.current < 55) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      pullRef.current = 56;
      setPull(56);
      try {
        await load();
        window.dispatchEvent(new CustomEvent('nexus:refresh'));
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
        pullRef.current = 0;
        setPull(0);
      }
    }

    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd, { passive: true });
    node.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
      pullRef.current = 0;
      setPull(0);
    };
  }, [pullEnabled, load, loading, me]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    setLoading(true);
    connectSocket(token);
    api('/bootstrap')
      .then((data) => {
        if (cancelled) return;
        setMe(data.user);
        setFriends(data.friends || []);
        setIncoming(data.incoming || []);
        setOutgoing(data.outgoing || []);
        setCommunities(data.communities || []);
        setPosts(data.posts || []);
        setUnread(data.unread || {});
        setNoticeCounts({
          likes: Number(data.likeCount) || 0,
          mentions: Number(data.mentionCount) || 0
        });
        setStories(data.stories || []);
        setStoryCount(Number(data.storyCount) || 0);
        if (data.horoscope) setHoroscope(data.horoscope);
        if (data.location) setLocationState(data.location);
      })
      .catch((error) => {
        if (cancelled) return;
        toast(error.message);
        if (/401|No autorizado/i.test(error.message)) logout(false);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, toast, logout]);

  useEffect(() => {
    const unlock = () => {
      unlockSound();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    const socket = getSocket();
    if (!socket) return undefined;
    const send = () => socket.emit('presence:status', { status: myStatus });
    send();
    socket.on('connect', send);
    return () => socket.off('connect', send);
  }, [token, myStatus]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !me?.id) return undefined;

    function onPresence(payload) {
      if (!payload?.userId) return;
      setFriends((current) => current.map((friend) => (
        friend.id === payload.userId
          ? { ...friend, online: payload.online, status: payload.status || friend.status }
          : friend
      )));
    }
    function onFriendRequest(payload) {
      toast(`Solicitud de amistad de ${payload?.from?.displayName || 'un usuario'}`);
      load();
    }
    function onFriendAccepted(payload) {
      toast(`¡Ahora son amigos con ${payload?.friend?.displayName || 'tu amigo'}!`);
      load();
    }
    function onDmMessage(payload) {
      // El servidor manda el aviso obligatorio por este canal para que llegue
      // incluso a las APK antiguas; acá lo convertimos en cartel de actualización.
      if (payload?.updateNotice) {
        checkForUpdate().then(applyFoundUpdate).catch(() => {});
        return;
      }
      const message = payload?.message;
      if (!message || message.fromId === me.id) return;
      const room = `dm:${[me.id, message.fromId].sort().join(':')}`;
      if (activeChat?.id !== room) {
        setUnread((current) => ({
          ...current,
          [message.fromId]: (current[message.fromId] || 0) + 1
        }));
        const friend = friends.find((item) => item.id === message.fromId);
        notify({
          icon: '💬',
          title: message.author?.displayName || 'Nuevo mensaje',
          body: message.viewOnce
            ? '📷 Foto (una sola vez)'
            : message.text || '📎 Archivo adjunto',
          onClick: friend ? () => openDm(friend) : undefined
        }, 'message');
      }
    }
    function onLikeNew(payload) {
      if (!payload?.user?.id || payload.user.id === me.id) return;
      const name = payload.user.displayName || 'Un amigo';
      setNoticeCounts((current) => ({ ...current, likes: (current.likes || 0) + 1 }));
      notify({
        icon: '❤️',
        title: `${name} te puso MG`,
        body: payload.postText ? `“${payload.postText.slice(0, 80)}”` : 'En una de tus publicaciones',
        onClick: () => openNotifications()
      });
    }
    function onMentionNew(payload) {
      if (!payload?.user?.id || payload.user.id === me.id) return;
      const name = payload.user.displayName || 'Alguien';
      setNoticeCounts((current) => ({ ...current, mentions: (current.mentions || 0) + 1 }));
      notify({
        icon: '@',
        title: `${name} te mencionó`,
        body: payload.postText
          ? `“${payload.postText.slice(0, 80)}”`
          : payload.hasFile ? 'Te etiquetó en una foto' : 'En una publicación',
        onClick: () => openPost(payload.postId)
      });
    }
    function onStoryNew(payload) {
      const name = payload?.user?.displayName || payload?.story?.user?.displayName || 'Un amigo';
      refreshStories();
      notify({
        icon: '📖',
        title: `${name} publicó una historia`,
        body: 'Tocala para verla',
        onClick: async () => {
          await refreshStories();
          setStoryOpen({ userId: payload?.story?.user?.id, storyId: payload?.story?.id });
        }
      }, 'message');
    }
    function onStoryViewed(payload) {
      if (!payload?.viewer?.id || payload.viewer.id === me.id) return;
      toast(`👁️ ${payload.viewer.displayName || 'Un amigo'} vio tu historia`);
    }
    function onCallInvite(payload) {
      notify({
        icon: '📹',
        title: 'Llamada entrante',
        body: `${payload?.from?.displayName || 'Un amigo'} te está llamando`
      }, 'call');
      setCall((current) => current || {
        status: 'incoming',
        callId: payload?.callId,
        from: payload?.from,
        hostId: payload?.hostId || payload?.from?.id,
        peers: payload?.peers || [],
        video: payload?.video !== false
      });
    }
    function onCallAccepted(payload) {
      toast(`${payload?.user?.displayName || 'Tu amigo'} se unió a la llamada`);
    }
    function onCallRejected(payload) {
      // Un invitado rechazó: el anfitrión sigue en la sala con los demás.
      toast(`${payload?.user?.displayName || 'Tu amigo'} rechazó la llamada`);
    }
    function onCallEnded() {
      setCall(null);
    }
    function onLocationRequest(payload) {
      if (!payload?.fromId) return;
      setLocationRequests((current) => (
        current.some((item) => item.fromId === payload.fromId)
          ? current
          : [...current, { fromId: payload.fromId, from: payload.from, at: payload.at }]
      ));
      toast({
        icon: '📍',
        title: payload.from?.displayName || 'Un amigo',
        body: 'Te pidió ver su ubicación en tiempo real.',
        duration: 12000
      });
    }
    function onLocationPermission(payload) {
      const name = payload?.by?.displayName || 'Tu amigo';
      toast(payload?.allow
        ? `📍 ${name} ahora comparte su ubicación con vos.`
        : `📍 ${name} dejó de compartir su ubicación.`);
      load();
    }
    function onLocationShares(payload) {
      if (!Array.isArray(payload?.sharedWith)) return;
      setLocationState((current) => ({ ...current, sharedWith: payload.sharedWith }));
    }
    function onLocationUpdate(payload) {
      if (!payload?.ownerId || !payload?.position) return;
      setLocationState((current) => ({
        ...current,
        positions: { ...(current.positions || {}), [payload.ownerId]: payload.position }
      }));
    }

    socket.on('presence:update', onPresence);
    socket.on('friend:request', onFriendRequest);
    socket.on('friend:accepted', onFriendAccepted);
    socket.on('dm:message', onDmMessage);
    socket.on('like:new', onLikeNew);
    socket.on('mention:new', onMentionNew);
    socket.on('story:new', onStoryNew);
    socket.on('story:viewed', onStoryViewed);
    socket.on('call:invite', onCallInvite);
    socket.on('call:accepted', onCallAccepted);
    socket.on('call:rejected', onCallRejected);
    socket.on('call:ended', onCallEnded);
    socket.on('location:request', onLocationRequest);
    socket.on('location:permission', onLocationPermission);
    socket.on('location:shares', onLocationShares);
    socket.on('location:update', onLocationUpdate);

    return () => {
      socket.off('presence:update', onPresence);
      socket.off('friend:request', onFriendRequest);
      socket.off('friend:accepted', onFriendAccepted);
      socket.off('dm:message', onDmMessage);
      socket.off('like:new', onLikeNew);
      socket.off('mention:new', onMentionNew);
      socket.off('story:new', onStoryNew);
      socket.off('story:viewed', onStoryViewed);
      socket.off('call:invite', onCallInvite);
      socket.off('call:accepted', onCallAccepted);
      socket.off('call:rejected', onCallRejected);
      socket.off('call:ended', onCallEnded);
      socket.off('location:request', onLocationRequest);
      socket.off('location:permission', onLocationPermission);
      socket.off('location:shares', onLocationShares);
      socket.off('location:update', onLocationUpdate);
    };
  }, [me?.id, activeChat?.id, load, notify, toast, friends, applyFoundUpdate, pushScreen, openNotifications, openPost, refreshStories]);

  const changeView = useCallback((next) => {
    const generalCine = { type: 'general', id: 'general', name: 'Sala general' };
    if (next === 'notifications') markNoticesRead();
    if (next === view) {
      const hasDetail = Boolean(activeChat || communityOpen || profileUser
        || (next === 'cine' && cineTarget?.id !== 'general'));
      if (!hasDetail) return;
      pushScreen({
        activeChat: null,
        communityOpen: null,
        profileUser: null,
        focusPostId: null,
        cineTarget: next === 'cine' ? generalCine : cineTarget
      });
      return;
    }
    const patch = { view: next, focusPostId: null };
    // Compatibilidad con enlaces viejos: si entran a la sala general, usar ese objetivo.
    if (next === 'cine' && !cineTarget) patch.cineTarget = generalCine;
    // En el celular, tocar "Chats" desde otra sección debe mostrar la lista.
    if (next === 'messages') patch.activeChat = null;
    if (next !== 'communities') patch.communityOpen = null;
    if (next !== 'userProfile') patch.profileUser = null;
    pushScreen(patch);
  }, [cineTarget, view, activeChat, communityOpen, profileUser, pushScreen, markNoticesRead]);

  const openDm = useCallback(async (friend, nextView = 'messages') => {
    if (!friend?.id) return;
    let chat = {
      type: 'dm',
      id: `dm:${[friend.id, me?.id].filter(Boolean).sort().join(':')}`,
      userId: friend.id,
      name: friend.displayName,
      user: friend,
      online: friend.online
    };
    try {
      const data = await api(`/chats/dm/${friend.id}`);
      chat = { ...data.chat, user: friend };
    } catch (error) {
      toast(error.message);
    }
    pushScreen({ activeChat: chat, communityOpen: null, view: nextView });
    setUnread((current) => {
      const next = { ...current };
      delete next[friend.id];
      return next;
    });
  }, [me?.id, toast, pushScreen]);

  // Si el celular abrió la app desde un aviso (o la llamada llegó cerrada), la recuperamos.
  // Se ejecuta al tocar la notificación, al volver al frente y como respaldo al cargar.
  const checkNativeOpen = useCallback(async () => {
    if (!token || !me?.id || document.visibilityState === 'hidden') return;
    let opened = null;
    try { opened = await consumeNativeOpen(); } catch { /* APK vieja: no tiene plugin */ }

    try {
      const { invites } = await api('/calls/pending');
      if (!Array.isArray(invites)) return;
      const invite = invites.find((item) => !opened?.callId || item.callId === opened.callId);
      if (invite) {
        setCall((current) => current || {
          status: 'incoming',
          callId: invite.callId,
          from: invite.from,
          hostId: invite.hostId || invite.from?.id,
          peers: invite.peers || [],
          video: invite.video !== false
        });
      }
    } catch { /* sin llamadas pendientes */ }

    if (opened?.fromId && !opened?.callId) {
      const friend = friends.find((item) => item.id === opened.fromId);
      if (friend) openDm(friend);
    }
    if (opened?.postId) openPost(opened.postId);
  }, [token, me?.id, friends, openDm, openPost]);

  useEffect(() => {
    checkNativeOpen();
    document.addEventListener('visibilitychange', checkNativeOpen);
    window.addEventListener('focus', checkNativeOpen);
    const unsubscribe = onNativeOpen(checkNativeOpen);
    return () => {
      document.removeEventListener('visibilitychange', checkNativeOpen);
      window.removeEventListener('focus', checkNativeOpen);
      unsubscribe();
    };
  }, [checkNativeOpen]);

  const openCommunity = useCallback((community) => {
    const chat = {
      type: 'community',
      id: community.id,
      communityId: community.id,
      name: community.name
    };
    pushScreen({
      activeChat: chat,
      communityOpen: community,
      cineTarget: { type: 'community', id: community.id, name: community.name },
      view: 'communities'
    });
    setUnread((current) => {
      const next = { ...current };
      delete next[`community:${community.id}`];
      return next;
    });
  }, [pushScreen]);

  const openProfile = useCallback(async (friend) => {
    if (!friend?.id) return;
    try {
      const data = await api(`/users/${friend.id}`);
      pushScreen({
        profileUser: { ...data.user, privateProfile: Boolean(data.private) },
        profileReturnView: view === 'userProfile' ? profileReturnView : view,
        view: 'userProfile'
      });
    } catch (error) {
      toast(error.message);
    }
  }, [toast, view, profileReturnView, pushScreen]);

  const openCineForFriend = useCallback(async (friend) => {
    if (!friend?.id) return;
    let chat = {
      type: 'dm',
      id: `dm:${[friend.id, me?.id].filter(Boolean).sort().join(':')}`,
      userId: friend.id,
      name: friend.displayName,
      user: friend
    };
    try {
      const data = await api(`/chats/dm/${friend.id}`);
      chat = { ...data.chat, user: friend };
    } catch (error) {
      toast(error.message);
    }
    pushScreen({
      activeChat: chat,
      cineTarget: { type: 'dm', id: friend.id, name: friend.displayName },
      communityOpen: null,
      view: 'cine'
    });
    setUnread((current) => {
      const next = { ...current };
      delete next[friend.id];
      return next;
    });
  }, [me?.id, toast, pushScreen]);

  const openCineForChat = useCallback((chat) => {
    if (!chat || (chat.type !== 'dm' && chat.type !== 'community')) {
      toast('Abre un chat con un amigo para compartir tu pantalla.');
      return;
    }
    pushScreen({
      activeChat: chat,
      cineTarget: chat.type === 'dm'
        ? { type: 'dm', id: chat.userId || chat.id, name: chat.name }
        : { type: 'community', id: chat.communityId || chat.id, name: chat.name },
      view: 'cine'
    });
  }, [toast, pushScreen]);

  const startCall = useCallback((friend) => {
    if (!friend?.id) {
      toast('Abre un chat con un amigo para llamarlo.');
      return;
    }
    const socket = getSocket();
    if (!socket?.connected) {
      toast('Sin conexión con el servidor. No se puede iniciar la llamada.');
      return;
    }
    socket.emit('call:invite', { to: [friend.id], video: true }, (response, callId) => {
      if (response?.error) toast(response.error);
      else setCall({
        status: 'outgoing',
        callId,
        hostId: me.id,
        peers: [me.id, friend.id],
        video: true
      });
    });
  }, [me?.id, toast]);

  // Igual que Discord: abrimos una sala de audio y el usuario elige qué ventana
  // o pestaña quiere mostrar. El audio de esa fuente viaja con el video.
  const startScreenShare = useCallback((friend) => {
    if (!friend?.id) {
      toast('Abre un chat con un amigo para compartir tu pantalla.');
      return;
    }
    const socket = getSocket();
    if (!socket?.connected) {
      toast('Sin conexión con el servidor. No se puede compartir la pantalla.');
      return;
    }
    socket.emit('call:invite', { to: [friend.id], video: false }, (response, callId) => {
      if (response?.error) toast(response.error);
      else {
        setCall({
          status: 'outgoing',
          callId,
          hostId: me.id,
          peers: [me.id, friend.id],
          video: false
        });
        toast('Cuando acepten, tocá 🖥️ Compartir pantalla y elegí la ventana o pestaña.');
      }
    });
  }, [me?.id, toast]);

  const emitLocation = useCallback((lat, lng, accuracy) => {
    const socket = getSocket();
    if (!socket?.connected || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const stamp = Date.now();
    if (stamp - lastLocationSent.current < 12 * 1000) return;
    lastLocationSent.current = stamp;
    socket.emit('location:update', {
      lat, lng, accuracy: Number(accuracy) || 0, at: new Date(stamp).toISOString()
    });
  }, []);

  const requestLocation = useCallback((ownerId) => {
    const socket = getSocket();
    if (!socket?.connected) return toast('Sin conexión para pedir la ubicación.');
    socket.emit('location:request', { ownerId }, (response) => {
      if (response?.error) toast(response.error);
      else toast('Pedido enviado. Tu amigo debe aceptarlo.');
    });
  }, [toast]);

  const respondLocation = useCallback((viewerId, allow) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('location:permission', { viewerId, allow }, (response) => {
      if (response?.error) toast(response.error);
      else {
        setLocationRequests((current) => current.filter((item) => item.fromId !== viewerId));
        load();
      }
    });
  }, [load, toast]);

  const revokeLocation = useCallback((viewerId) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('location:revoke', { viewerId }, (response) => {
      if (response?.error) toast(response.error);
      else load();
    });
  }, [load, toast]);

  const stopAllLocation = useCallback(() => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('location:stopAll', {}, (response) => {
      if (response?.error) toast(response.error);
      else load();
    });
  }, [load, toast]);

  // Si el usuario compartió su ubicación, el celular reporta puntos cada ~15 s.
  const sharedWithKey = (locationState.sharedWith || []).slice().sort().join(',');
  useEffect(() => {
    if (!token || !sharedWithKey) return undefined;
    let stopped = false;
    let watchId = null;
    let unsubscribeNative = () => {};

    setLocating(true);
    unsubscribeNative = onNativeLocation((point) => {
      if (!stopped && Number.isFinite(point?.lat) && Number.isFinite(point?.lng)) {
        emitLocation(point.lat, point.lng, point.accuracy);
      }
    });

    (async () => {
      const started = await startNativeLocation();
      if (started || stopped) return;
      if (!navigator.geolocation) {
        toast('Este dispositivo no puede compartir ubicación.');
        return;
      }
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (!stopped) emitLocation(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy
          );
        },
        () => toast('Activá el permiso de ubicación para compartir tu posición.'),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    })();

    return () => {
      stopped = true;
      unsubscribeNative();
      if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
      stopNativeLocation();
      setLocating(false);
    };
  }, [token, sharedWithKey, emitLocation, toast]);

  const resolvedChat = useMemo(() => (
    activeChat && (activeChat.type === 'dm' || activeChat.type === 'community')
      ? activeChat
      : { type: 'general', id: 'general', name: 'Chat general' }
  ), [activeChat]);

  const resolvedCine = useMemo(() => (
    cineTarget || { type: 'general', id: 'general', name: 'Sala general' }
  ), [cineTarget]);

  const updateBanner = (
    <>
      <UpdateBanner
        update={update}
        busy={isNativeApp() ? updating || !updateReady : updating}
        ready={isNativeApp() && updateReady}
        onInstall={applyUpdate}
        onDismiss={dismissUpdate}
      />
      <UiUpdateBanner update={uiUpdate} onInstall={() => applyUiUpdate(uiUpdate)} />
    </>
  );

  if (!token) {
    return (
      <>
        {updateBanner}
        <Auth onAuthenticated={(user) => {
          setMe(user);
          setToken(localStorage.getItem('nexus_token'));
          toast(`¡Bienvenido, ${user.displayName}!`);
        }} />
        <ToastStack toasts={toasts} />
      </>
    );
  }

  if (loading || !me) {
    return (
      <>
        {updateBanner}
        <div className="loading-screen"><BrandWordmark /><p>Conectando…</p></div>
      </>
    );
  }

  return (
    <>
      {updateBanner}
      <div className="app-shell">
      <Sidebar
        me={me}
        view={view}
        changeView={changeView}
        friends={friends}
        activeChat={activeChat}
        unread={unread}
        noticeCount={noticeCounts.likes + noticeCounts.mentions}
        storyCount={storyCount}
        onDm={openDm}
        onLogout={logout}
        status={myStatus}
        onStatus={changeStatus}
        soundOn={soundOn}
        onToggleSound={toggleSound}
      />

      <main className="content" ref={contentRef}>
        {pullEnabled && (
          <div className="pull-indicator" style={{ height: pull }} aria-hidden={!pull && !refreshing}>
            <span className={`pull-spinner ${refreshing ? 'spinning' : ''}`}>{refreshing ? '⟳' : '↓'}</span>
            <span className="tiny muted">
              {refreshing ? 'Actualizando…' : pull >= 60 ? 'Suelta para actualizar' : 'Tira para actualizar'}
            </span>
          </div>
        )}
        {view === 'home' && (
          <div className="page home-page">
            <div className="mobile-brand"><BrandWordmark /></div>
            <StoryBar
              groups={stories}
              me={me}
              horoscope={horoscope}
              onHoroscope={() => setZodiacOpen(true)}
              onOpen={(userId, storyId) => setStoryOpen({ userId, storyId })}
              onChange={refreshStories}
              onError={(message) => toast(message)}
            />
            <Feed
              posts={posts}
              friends={friends}
              focusPostId={focusPostId}
              onProfile={openProfile}
              me={me}
              onFriendsChanged={load}
            />
          </div>
        )}

        {view === 'friends' && (
          <Friends
            me={me}
            friends={friends}
            incoming={incoming}
            outgoing={outgoing}
            unread={unread}
            refresh={load}
            onDm={openDm}
            onCall={startCall}
            onShare={startScreenShare}
            onProfile={openProfile}
          />
        )}

        {view === 'messages' && (
          <div className={`messages-layout ${activeChat ? 'mobile-chat-open' : ''}`}>
            <div className="card chat-list">
              <h3>Conversaciones</h3>
              <button
                type="button"
                className={`dm-item wide ${resolvedChat.type === 'general' ? 'active' : ''}`}
                onClick={() => pushScreen({ activeChat: { type: 'general', id: 'general', name: 'Chat general' } })}
              >
                🌐 Chat general
              </button>
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  type="button"
                  className={`dm-item wide ${activeChat?.userId === friend.id ? 'active' : ''}`}
                  onClick={() => openDm(friend)}
                >
                  <Avatar user={friend} size="xs" />
                  <span className="dm-name grow">{friend.displayName}</span>
                  <span className={`presence-dot ${friend.online ? 'online' : ''}`} />
                  {unread[friend.id] > 0 && <span className="dm-badge">{unread[friend.id]}</span>}
                </button>
              ))}
            </div>
            <Chat
              chat={resolvedChat}
              me={me}
              onBack={handleBack}
              onCall={(user) => startCall(user)}
              onShare={(user) => startScreenShare(user)}
            />
          </div>
        )}

        {/* Siempre se renderiza Cine cuando view==='cine'; resolvedCine nunca es undefined. */}
        {view === 'cine' && (
          <Cine
            target={resolvedCine}
            chat={resolvedChat}
            me={me}
            friends={friends}
            onCall={(user) => startCall(user)}
            onCine={openCineForChat}
          />
        )}

        {view === 'communities' && communityOpen && (
          <div className="community-detail">
            <button type="button" className="ghost" onClick={handleBack}>← Todas las comunidades</button>
            <h2>🌐 {communityOpen.name}</h2>
            <div className="community-detail-grid">
              <Feed
                communityId={communityOpen.id}
                compact
                friends={friends}
                onProfile={openProfile}
                me={me}
                onFriendsChanged={load}
              />
              <Chat
                chat={resolvedChat}
                me={me}
                compact
                onCall={(user) => startCall(user)}
                onShare={(user) => startScreenShare(user)}
              />
            </div>
          </div>
        )}

        {view === 'communities' && !communityOpen && (
          <Communities communities={communities} unread={unread} refresh={load} onOpen={openCommunity} />
        )}

        {view === 'location' && (
          <Location
            friends={friends}
            location={locationState}
            locating={locating}
            onRequest={requestLocation}
            onRevoke={revokeLocation}
            onStopAll={stopAllLocation}
            onBack={handleBack}
          />
        )}

        {view === 'profile' && (
          <Profile
            me={me}
            onLikes={openNotifications}
            onUpdated={(user) => {
              setMe(user);
              setFriends((current) => current.map((friend) => (friend.id === user.id ? { ...friend, ...user } : friend)));
            }}
          />
        )}

        {(view === 'likes' || view === 'notifications') && (
          <Notifications onBack={handleBack} onProfile={openProfile} onPost={openPost} />
        )}

        {view === 'userProfile' && profileUser && (
          <UserProfile
            user={profileUser}
            onBack={handleBack}
            onDm={() => openDm(profileUser)}
          />
        )}

        {view === 'settings' && (
          <Settings
            onLogout={() => logout(true)}
            status={myStatus}
            onStatus={changeStatus}
            soundOn={soundOn}
            onToggleSound={toggleSound}
            isOwner={Boolean(me?.isOwner)}
          />
        )}
      </main>

      {call && (
        <CallOverlay
          call={call}
          me={me}
          friends={friends}
          onClose={() => setCall(null)}
        />
      )}

      {storyOpen && (
        <StoryViewer
          groups={stories}
          me={me}
          initial={storyOpen}
          onClose={() => setStoryOpen(null)}
          onChange={refreshStories}
          onProfile={openProfile}
        />
      )}

      {zodiacOpen && horoscope && (
        <ZodiacStoryViewer
          data={horoscope}
          me={me}
          onClose={() => setZodiacOpen(false)}
          onRetry={refreshHoroscope}
          onStoryChanged={refreshStories}
          onToast={toast}
        />
      )}

      {locationRequests.length > 0 && (
        <div className="location-requests">
          {locationRequests.map((request) => (
            <div className="card location-request" key={request.fromId}>
              <div>
                <strong>📍 {request.from?.displayName || 'Un amigo'}</strong>
                <div className="tiny muted">Quiere ver tu ubicación en tiempo real.</div>
              </div>
              <div className="location-request-actions">
                <button
                  type="button"
                  className="primary small"
                  onClick={() => respondLocation(request.fromId, true)}
                >
                  Permitir
                </button>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => respondLocation(request.fromId, false)}
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ToastStack toasts={toasts} />
      </div>
    </>
  );
}
