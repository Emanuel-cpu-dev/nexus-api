import { useEffect, useState } from 'react';
import { fileUrl } from '../config.js';
import { initials } from '../utils.js';

export default function Avatar({ user, size = '', className = '' }) {
  const url = user?.avatarUrl ? fileUrl(user.avatarUrl) : '';
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [url]);

  const showPhoto = Boolean(url) && !failed;
  return (
    <span className={`avatar ${size} ${className}`.trim()} style={{ background: user?.avatarColor || '#5865f2' }}>
      {showPhoto
        ? <img src={url} alt="" onError={() => setFailed(true)} />
        : initials(user?.displayName)}
      {showPhoto && <span className="avatar-photo-badge" title="Con foto de perfil">📷</span>}
    </span>
  );
}
