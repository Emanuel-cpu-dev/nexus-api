import { useEffect, useState } from 'react';
import { fileUrl } from '../config.js';
import { initials } from '../utils.js';

export default function Avatar({ user, size = '', className = '' }) {
  const url = user?.avatarUrl ? fileUrl(user.avatarUrl) : '';
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFailed(false);
    setAttempt(0);
  }, [url]);

  // Si una carga falla por un corte de red, volvemos a intentar con cache roto.
  const src = url && attempt ? `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}` : url;
  const showPhoto = Boolean(src) && !failed;

  return (
    <span className={`avatar ${size} ${className}`.trim()} style={{ background: user?.avatarColor || '#5865f2' }}>
      <span className="avatar-photo">
        {showPhoto
          ? <img
              src={src}
              alt=""
              onError={() => {
                if (attempt < 2) setAttempt((current) => current + 1);
                else setFailed(true);
              }}
            />
          : initials(user?.displayName)}
      </span>
      {showPhoto && <span className="avatar-photo-badge" title="Con foto de perfil">📷</span>}
    </span>
  );
}
