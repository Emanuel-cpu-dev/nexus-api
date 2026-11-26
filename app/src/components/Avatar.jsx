import { fileUrl } from '../config.js';
import { initials } from '../utils.js';

export default function Avatar({ user, size = '', className = '' }) {
  const url = user?.avatarUrl ? fileUrl(user.avatarUrl) : '';
  return (
    <span className={`avatar ${size} ${className}`.trim()} style={{ background: user?.avatarColor || '#5865f2' }}>
      {url ? <img src={url} alt="" /> : initials(user?.displayName)}
    </span>
  );
}
