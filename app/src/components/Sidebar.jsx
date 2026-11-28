import Avatar from './Avatar.jsx';
import { STATUSES } from '../preferences.js';

const NAV = [
  { id: 'home', icon: '🏠', label: 'Inicio', short: 'Inicio' },
  { id: 'friends', icon: '👥', label: 'Amigos', short: 'Amigos' },
  { id: 'messages', icon: '💬', label: 'Mensajes', short: 'Chats' },
  { id: 'notifications', icon: '🔔', label: 'Avisos', short: 'Avisos' },
  { id: 'cine', icon: '📺', label: 'Ver juntos', short: 'Ver' },
  { id: 'communities', icon: '🌐', label: 'Comunidades', short: 'Grupos' },
  { id: 'location', icon: '📍', label: 'Ubicación', short: 'Ubicación' },
  { id: 'profile', icon: '👤', label: 'Mi perfil', short: 'Perfil' },
  { id: 'settings', icon: '⚙️', label: 'Configuración', short: 'Ajustes' }
];

function dotClass(friend) {
  if (!friend.online) return '';
  if (!friend.status || friend.status === 'active') return 'online';
  return friend.status;
}

export default function Sidebar({
  me, view, changeView, friends, activeChat, unread = {}, noticeCount = 0, storyCount = 0, onDm, onLogout,
  status, onStatus, soundOn, onToggleSound
}) {
  const messageUnread = Object.entries(unread).reduce((total, [key, count]) => (
    key.startsWith('community:') ? total : total + Number(count || 0)
  ), 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand-mark small">N</div>
        <div>
          <strong>Nexus</strong>
          <span className="muted block tiny">conectados, siempre</span>
        </div>
      </div>

      <nav className="nav-list">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => changeView(item.id)}
            title={item.label}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label nav-label-full">{item.label}</span>
            <span className="nav-label nav-label-short">{item.short || item.label}</span>
            {item.id === 'home' && storyCount > 0 && (
              <span className="nav-badge" title="Historias nuevas">{storyCount > 99 ? '99+' : storyCount}</span>
            )}
            {item.id === 'messages' && messageUnread > 0 && (
              <span className="nav-badge">{messageUnread > 99 ? '99+' : messageUnread}</span>
            )}
            {item.id === 'notifications' && noticeCount > 0 && (
              <span className="nav-badge">{noticeCount > 99 ? '99+' : noticeCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Mensajes directos</div>
        <div className="dm-list">
          {friends.length === 0 && <p className="tiny muted pad">Aún no tienes amigos. Agrega uno con su código.</p>}
          {friends.map((friend) => (
            <button
              type="button"
              key={friend.id}
              className={`dm-item ${activeChat?.userId === friend.id && view === 'messages' ? 'active' : ''}`}
              onClick={() => onDm(friend)}
              title={friend.online ? `En línea (${STATUSES.find((s) => s.id === friend.status)?.label || 'Activo'})` : 'Desconectado'}
            >
              <Avatar user={friend} size="xs" />
              <span className="dm-name">{friend.displayName}</span>
              <span className={`presence-dot ${dotClass(friend)}`} />
              {unread[friend.id] > 0 && <span className="dm-badge">{unread[friend.id]}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-foot">
        <Avatar user={me} />
        <div className="grow">
          <strong className="block">{me?.displayName}</strong>
          <span className="tiny muted">@{me?.username}</span>
        </div>
        <button type="button" className="icon-btn" title="Cerrar sesión" onClick={onLogout}>
          ⏻
        </button>
        <div className="presence-controls">
          <select
            className="status-select"
            value={status}
            onChange={(event) => onStatus(event.target.value)}
            title="Mi estado"
            aria-label="Mi estado"
          >
            {STATUSES.map((item) => (
              <option key={item.id} value={item.id}>{item.icon} {item.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="icon-btn"
            title={soundOn ? 'Silenciar avisos' : 'Activar sonido de avisos'}
            onClick={onToggleSound}
          >
            {soundOn ? '🔔' : '🔕'}
          </button>
        </div>
      </div>
    </aside>
  );
}
