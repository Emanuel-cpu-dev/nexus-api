import { initials } from '../utils.js';

const NAV = [
  { id: 'home', icon: '🏠', label: 'Inicio' },
  { id: 'friends', icon: '👥', label: 'Amigos' },
  { id: 'messages', icon: '💬', label: 'Mensajes' },
  { id: 'cine', icon: '📺', label: 'Ver juntos' },
  { id: 'communities', icon: '🌐', label: 'Comunidades' },
  { id: 'profile', icon: '👤', label: 'Mi perfil' },
  { id: 'settings', icon: '⚙️', label: 'Configuración' }
];

export default function Sidebar({ me, view, changeView, friends, activeChat, onDm, onLogout }) {
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
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
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
            >
              <span className="avatar xs" style={{ background: friend.avatarColor }}>
                {initials(friend.displayName)}
              </span>
              <span className="dm-name">{friend.displayName}</span>
              <span className={`presence-dot ${friend.online ? 'online' : ''}`} />
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-foot">
        <div className="avatar" style={{ background: me?.avatarColor }}>
          {initials(me?.displayName)}
        </div>
        <div className="grow">
          <strong className="block">{me?.displayName}</strong>
          <span className="tiny muted">@{me?.username}</span>
        </div>
        <button type="button" className="icon-btn" title="Cerrar sesión" onClick={onLogout}>
          ⏻
        </button>
      </div>
    </aside>
  );
}
