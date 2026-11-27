import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { connectSocket, disconnectSocket, getSocket } from './socket.js';
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
import Avatar from './components/Avatar.jsx';
import UserProfile from './components/UserProfile.jsx';

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
  const [communityOpen, setCommunityOpen] = useState(null);
  const [call, setCall] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(Boolean(token));

  const toast = useCallback((message) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_user');
    localStorage.removeItem('nexus_pass');
    localStorage.removeItem('nexus_remember');
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
    setCall(null);
    setView('home');
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
    } catch (error) {
      toast(error.message);
      if (/401|No autorizado/i.test(error.message)) logout();
    }
  }, [toast, logout]);

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
      })
      .catch((error) => {
        if (cancelled) return;
        toast(error.message);
        if (/401|No autorizado/i.test(error.message)) logout();
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, toast, logout]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !me?.id) return undefined;

    function onPresence(payload) {
      if (!payload?.userId) return;
      setFriends((current) => current.map((friend) => (
        friend.id === payload.userId ? { ...friend, online: payload.online } : friend
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
      const message = payload?.message;
      if (!message || message.fromId === me.id) return;
      const room = `dm:${[me.id, message.fromId].sort().join(':')}`;
      if (activeChat?.id !== room) {
        toast(`💬 ${message.author?.displayName || 'Nuevo mensaje'}: ${message.text || 'archivo adjunto'}`);
      }
    }
    function onCallInvite(payload) {
      setCall((current) => current || {
        status: 'incoming',
        callId: payload?.callId,
        from: payload?.from,
        peers: payload?.peers || [],
        video: payload?.video !== false
      });
    }
    function onCallAccepted(payload) {
      toast(`${payload?.user?.displayName || 'Tu amigo'} se unió a la llamada`);
    }
    function onCallRejected(payload) {
      toast(`${payload?.user?.displayName || 'Tu amigo'} rechazó la llamada`);
      setCall(null);
    }
    function onCallEnded() {
      setCall(null);
    }

    socket.on('presence:update', onPresence);
    socket.on('friend:request', onFriendRequest);
    socket.on('friend:accepted', onFriendAccepted);
    socket.on('dm:message', onDmMessage);
    socket.on('call:invite', onCallInvite);
    socket.on('call:accepted', onCallAccepted);
    socket.on('call:rejected', onCallRejected);
    socket.on('call:ended', onCallEnded);

    return () => {
      socket.off('presence:update', onPresence);
      socket.off('friend:request', onFriendRequest);
      socket.off('friend:accepted', onFriendAccepted);
      socket.off('dm:message', onDmMessage);
      socket.off('call:invite', onCallInvite);
      socket.off('call:accepted', onCallAccepted);
      socket.off('call:rejected', onCallRejected);
      socket.off('call:ended', onCallEnded);
    };
  }, [me?.id, activeChat?.id, load, toast]);

  const changeView = useCallback((next) => {
    // Al entrar a "Ver juntos" desde el menú sin objetivo, usar la sala general.
    if (next === 'cine' && !cineTarget) {
      setCineTarget({ type: 'general', id: 'general', name: 'Sala general' });
    }
    if (next !== 'communities') setCommunityOpen(null);
    setView(next);
  }, [cineTarget]);

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
    setActiveChat(chat);
    setCommunityOpen(null);
    setView(nextView);
  }, [me?.id, toast]);

  const openCommunity = useCallback((community) => {
    const chat = {
      type: 'community',
      id: community.id,
      communityId: community.id,
      name: community.name
    };
    setActiveChat(chat);
    setCommunityOpen(community);
    setCineTarget({ type: 'community', id: community.id, name: community.name });
    setView('communities');
  }, []);

  const openProfile = useCallback(async (friend) => {
    if (!friend?.id) return;
    try {
      const data = await api(`/users/${friend.id}`);
      setProfileUser(data.user);
      setView('userProfile');
    } catch (error) {
      toast(error.message);
    }
  }, [toast]);

  const openCineForFriend = useCallback(async (friend) => {
    await openDm(friend, 'cine');
    setCineTarget({ type: 'dm', id: friend.id, name: friend.displayName });
  }, [openDm]);

  const openCineForChat = useCallback((chat) => {
    if (!chat || (chat.type !== 'dm' && chat.type !== 'community')) {
      toast('Abre un chat con un amigo o una comunidad para ver juntos.');
      return;
    }
    setActiveChat(chat);
    setCineTarget(chat.type === 'dm'
      ? { type: 'dm', id: chat.userId || chat.id, name: chat.name }
      : { type: 'community', id: chat.communityId || chat.id, name: chat.name });
    setView('cine');
  }, [toast]);

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
        peers: [me.id, friend.id],
        video: true
      });
    });
  }, [me?.id, toast]);

  const resolvedChat = useMemo(() => (
    activeChat && (activeChat.type === 'dm' || activeChat.type === 'community')
      ? activeChat
      : { type: 'general', id: 'general', name: 'Chat general' }
  ), [activeChat]);

  const resolvedCine = useMemo(() => (
    cineTarget || { type: 'general', id: 'general', name: 'Sala general' }
  ), [cineTarget]);

  if (!token) {
    return (
      <>
        <Auth onAuthenticated={(user) => {
          setMe(user);
          setToken(localStorage.getItem('nexus_token'));
          toast(`¡Bienvenido, ${user.displayName}!`);
        }} />
        {toasts.length > 0 && <div className="toast-stack">{toasts.map((item) => <div className="toast" key={item.id}>{item.message}</div>)}</div>}
      </>
    );
  }

  if (loading || !me) {
    return <div className="loading-screen"><div className="brand-mark">N</div><p>Conectando con Nexus…</p></div>;
  }

  return (
    <div className="app-shell">
      <Sidebar
        me={me}
        view={view}
        changeView={changeView}
        friends={friends}
        activeChat={activeChat}
        onDm={openDm}
        onLogout={logout}
      />

      <main className="content">
        {view === 'home' && (
          <div className="page home-page">
            <div className="hero card">
              <div>
                <h1>¡Hola, {me.displayName}! 👋</h1>
                <p className="muted">Comparte tu código, chatea, llama y ve videos en sincronía.</p>
              </div>
              <button type="button" className="primary" onClick={() => changeView('friends')}>👥 Mis amigos</button>
            </div>
            <Feed posts={posts} />
          </div>
        )}

        {view === 'friends' && (
          <Friends
            me={me}
            friends={friends}
            incoming={incoming}
            outgoing={outgoing}
            refresh={load}
            onDm={openDm}
            onCall={startCall}
            onCine={openCineForFriend}
            onProfile={openProfile}
          />
        )}

        {view === 'messages' && (
          <div className="messages-layout">
            <div className="card chat-list">
              <h3>Conversaciones</h3>
              <button
                type="button"
                className={`dm-item wide ${resolvedChat.type === 'general' ? 'active' : ''}`}
                onClick={() => setActiveChat(null)}
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
                </button>
              ))}
            </div>
            <Chat
              chat={resolvedChat}
              me={me}
              onCall={(user) => startCall(user)}
              onCine={openCineForChat}
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
            <button type="button" className="ghost" onClick={() => setCommunityOpen(null)}>← Todas las comunidades</button>
            <h2>🌐 {communityOpen.name}</h2>
            <div className="community-detail-grid">
              <Feed communityId={communityOpen.id} compact />
              <Chat
                chat={resolvedChat}
                me={me}
                compact
                onCall={(user) => startCall(user)}
                onCine={openCineForChat}
              />
            </div>
          </div>
        )}

        {view === 'communities' && !communityOpen && (
          <Communities communities={communities} refresh={load} onOpen={openCommunity} />
        )}

        {view === 'profile' && (
          <Profile
            me={me}
            onUpdated={(user) => {
              setMe(user);
              setFriends((current) => current.map((friend) => (friend.id === user.id ? { ...friend, ...user } : friend)));
            }}
          />
        )}

        {view === 'userProfile' && profileUser && (
          <UserProfile
            user={profileUser}
            onBack={() => changeView('friends')}
            onDm={() => openDm(profileUser)}
          />
        )}

        {view === 'settings' && <Settings onLogout={logout} />}
      </main>

      {call && (
        <CallOverlay
          call={call}
          me={me}
          friends={friends}
          onClose={() => setCall(null)}
        />
      )}

      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((item) => <div className="toast" key={item.id}>{item.message}</div>)}
        </div>
      )}
    </div>
  );
}
