import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import './restore.js';

const DATA_DIR = process.env.DATA_DIR || './data';
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, 'nexus.db'));
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    bio TEXT DEFAULT '',
    avatar_color TEXT DEFAULT '#5865f2',
    avatar_url TEXT DEFAULT '',
    code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS friends (
    a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (a, b)
  );
  CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    UNIQUE (from_id, to_id)
  );
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room TEXT NOT NULL,
    from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT DEFAULT '',
    file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room, created_at);
  CREATE TABLE IF NOT EXISTS communities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS community_members (
    community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (community_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    community_id TEXT REFERENCES communities(id) ON DELETE CASCADE,
    text TEXT DEFAULT '',
    file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
    repost_of TEXT REFERENCES posts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS likes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS watch_rooms (
    key TEXT PRIMARY KEY,
    url TEXT DEFAULT '',
    playing INTEGER DEFAULT 0,
    position REAL DEFAULT 0,
    host_id TEXT,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS location_shares (
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (owner_id, viewer_id)
  );
`);

// Migraciones simples para bases creadas antes de la foto de perfil y de los recibos.
if (!db.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'avatar_url')) {
  db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''");
}
const messageColumns = db.prepare('PRAGMA table_info(messages)').all().map((column) => column.name);
if (!messageColumns.includes('delivered_at')) {
  db.exec('ALTER TABLE messages ADD COLUMN delivered_at TEXT');
}
if (!messageColumns.includes('read_at')) {
  db.exec('ALTER TABLE messages ADD COLUMN read_at TEXT');
}
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
if (!userColumns.includes('profile_private')) {
  db.exec("ALTER TABLE users ADD COLUMN profile_private INTEGER DEFAULT 0");
}
// Los archivos subidos viven dentro de SQLite: el disco de Render se reinicia en cada deploy.
const fileColumns = db.prepare('PRAGMA table_info(files)').all().map((column) => column.name);
if (!fileColumns.includes('data')) {
  db.exec('ALTER TABLE files ADD COLUMN data BLOB');
}
// Reposts: una publicación puede ser una reiteración de otra, sin duplicar su contenido.
const postColumns = db.prepare('PRAGMA table_info(posts)').all().map((column) => column.name);
if (!postColumns.includes('repost_of')) {
  db.exec('ALTER TABLE posts ADD COLUMN repost_of TEXT REFERENCES posts(id) ON DELETE CASCADE');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_repost_user ON posts(user_id, repost_of) WHERE repost_of IS NOT NULL');

// node:sqlite puede devolver un BLOB como objeto tipo-array; lo normalizamos a Buffer.
export function blobBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) => Number(a) - Number(b));
    return Buffer.from(keys.map((key) => value[key]));
  }
  return null;
}

export function fileDataByFilename(filename) {
  return db.prepare('SELECT mime, data FROM files WHERE filename = ?').get(String(filename || ''));
}

export function saveFileData(row) {
  db.prepare(`
    INSERT INTO files (id, name, filename, mime, size, uploaded_by, created_at, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.name, row.filename, row.mime, row.size,
    row.uploadedBy, row.createdAt, row.data
  );
}

// Migración única: archivos que ya estaban en disco pasan a la base.
export function migrateUploadsFromDisk(dir) {
  if (!existsSync(dir)) return 0;
  const anyUser = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (!anyUser) return 0;
  let count = 0;
  for (const filename of readdirSync(dir)) {
    const existing = db.prepare('SELECT 1 FROM files WHERE filename = ?').get(filename);
    if (existing) {
      const withData = db.prepare('SELECT data FROM files WHERE filename = ?').get(filename);
      if (withData?.data?.length) continue;
    }
    const path = join(dir, filename);
    try {
      const data = readFileSync(path);
      const ext = filename.split('.').pop()?.toLowerCase();
      const mime = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' })[ext]
        || 'application/octet-stream';
      if (!existing) {
        saveFileData({
          id: filename.replace(/\.[^.]+$/, ''),
          name: filename,
          filename,
          mime,
          size: data.length,
          uploadedBy: anyUser.id,
          createdAt: now(),
          data
        });
      } else {
        db.prepare('UPDATE files SET data = ?, size = ?, mime = ? WHERE filename = ?').run(data, data.length, mime, filename);
      }
      count += 1;
    } catch {
      // Si no se puede leer, se ignora; el archivo seguirá disponible en disco.
    }
  }
  return count;
}

export function uid() {
  return randomBytes(12).toString('hex');
}

export function now() {
  return new Date().toISOString();
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hex] = String(stored).split(':');
    const actual = scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hex, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCode() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let raw = '';
    const bytes = randomBytes(7);
    for (let i = 0; i < 7; i += 1) raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    if (!db.prepare('SELECT 1 FROM users WHERE code = ?').get(code)) return code;
  }
  throw new Error('No se pudo generar un código único');
}

const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'emaggi22').toLowerCase();

// Estado de amistad respecto del usuario que está mirando. Se usa para que el
// feed pueda ofrecer "agregar" o "aceptar" sin obligar a entrar al perfil.
export function friendshipState(viewerId, otherId) {
  if (!viewerId || !otherId || viewerId === otherId) return 'self';
  if (areFriends(viewerId, otherId)) return 'friend';
  if (db.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').get(otherId, viewerId)) return 'incoming';
  if (db.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').get(viewerId, otherId)) return 'outgoing';
  return 'none';
}

export function publicUser(row, viewerId = null) {
  if (!row) return null;
  const result = {
    id: row.id,
    username: row.username,
    isOwner: String(row.username || '').toLowerCase() === OWNER_USERNAME,
    displayName: row.display_name,
    bio: row.bio || '',
    avatarColor: row.avatar_color || '#5865f2',
    avatarUrl: row.avatar_url || '',
    code: row.code,
    isPrivate: Boolean(row.profile_private),
    createdAt: row.created_at
  };
  if (viewerId) result.friendState = friendshipState(viewerId, row.id);
  return result;
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).toLowerCase());
}

export function getUserByCode(code) {
  return db.prepare('SELECT * FROM users WHERE code = ?').get(String(code).toUpperCase().replace(/\s/g, ''));
}

export function getUserByToken(token) {
  if (!token) return null;
  return db.prepare(`
    SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?
  `).get(token);
}

export function createToken(userId) {
  const token = `${uid()}${uid()}`;
  db.prepare('INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, now());
  return token;
}

export function friendsOf(userId) {
  return db.prepare(`
    SELECT u.* FROM friends f
    JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
    WHERE f.a = ? OR f.b = ?
    ORDER BY u.display_name COLLATE NOCASE
  `).all(userId, userId, userId);
}

export function friendIds(userId) {
  return db.prepare(`
    SELECT CASE WHEN a = ? THEN b ELSE a END AS id FROM friends WHERE a = ? OR b = ?
  `).all(userId, userId, userId).map((row) => row.id);
}

export function areFriends(a, b) {
  if (!a || !b || a === b) return false;
  const [x, y] = [a, b].sort();
  return Boolean(db.prepare('SELECT 1 FROM friends WHERE a = ? AND b = ?').get(x, y));
}

export function addFriendship(a, b) {
  const [x, y] = [a, b].sort();
  db.prepare('INSERT OR IGNORE INTO friends (a, b, created_at) VALUES (?, ?, ?)').run(x, y, now());
}

// Ubicación compartida: solo el dueño del dispositivo puede autorizarla.
export function setLocationShare(ownerId, viewerId) {
  if (!areFriends(ownerId, viewerId)) return false;
  db.prepare(`
    INSERT INTO location_shares (owner_id, viewer_id, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(owner_id, viewer_id) DO NOTHING
  `).run(ownerId, viewerId, now());
  return true;
}

export function removeLocationShare(ownerId, viewerId) {
  db.prepare('DELETE FROM location_shares WHERE owner_id = ? AND viewer_id = ?').run(ownerId, viewerId);
}

export function removeAllLocationShares(ownerId) {
  db.prepare('DELETE FROM location_shares WHERE owner_id = ?').run(ownerId);
}

export function locationViewersFor(ownerId) {
  return db.prepare('SELECT viewer_id AS id FROM location_shares WHERE owner_id = ?')
    .all(ownerId).map((row) => row.id);
}

export function locationOwnersFor(viewerId) {
  return db.prepare('SELECT owner_id AS id FROM location_shares WHERE viewer_id = ?')
    .all(viewerId).map((row) => row.id);
}

export function canSeeLocation(viewerId, ownerId) {
  return Boolean(db.prepare(
    'SELECT 1 FROM location_shares WHERE owner_id = ? AND viewer_id = ?'
  ).get(ownerId, viewerId));
}

// La posición es volátil: nunca se guarda en SQLite ni se incluye en backups.
const latestLocations = new Map();
const LOCATION_TTL = 10 * 60 * 1000;

export function saveLocation(ownerId, position) {
  latestLocations.set(ownerId, { ...position, at: position.at || now() });
}

export function latestLocationFor(ownerId) {
  const point = latestLocations.get(ownerId);
  if (!point) return null;
  if (Date.now() - new Date(point.at).getTime() > LOCATION_TTL) {
    latestLocations.delete(ownerId);
    return null;
  }
  return point;
}

export function latestLocationsFor(viewerId) {
  const result = {};
  for (const ownerId of locationOwnersFor(viewerId)) {
    const point = latestLocationFor(ownerId);
    if (point) result[ownerId] = point;
  }
  return result;
}

export function dmRoom(a, b) {
  return `dm:${[a, b].sort().join(':')}`;
}

export function getFileById(id) {
  return db.prepare('SELECT * FROM files WHERE id = ?').get(id);
}

export function fileShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    url: `/uploads/${row.filename}`,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at
  };
}

export function messageShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    room: row.room,
    fromId: row.from_id,
    author: publicUser(getUserById(row.from_id)),
    text: row.text || '',
    fileId: row.file_id || null,
    file: row.file_id ? fileShape(getFileById(row.file_id)) : null,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at || null,
    readAt: row.read_at || null
  };
}

export function messagesFor(room, limit = 150) {
  const rows = db.prepare(`
    SELECT * FROM (
      SELECT rowid AS rid, * FROM messages WHERE room = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
    ) ORDER BY rid ASC
  `).all(room, limit);
  return rows.map(messageShape);
}

// Mensajes sin leer agrupados por conversación (clave = id del amigo,
// o "community:<id>" para las comunidades).
export function unreadCountsFor(userId) {
  const rows = db.prepare(`
    SELECT room, COUNT(*) AS c FROM messages
    WHERE read_at IS NULL AND from_id != ?
    GROUP BY room
  `).all(userId);
  const counts = {};
  for (const row of rows) {
    if (row.room.startsWith('dm:')) {
      const parts = row.room.slice(3).split(':');
      // Solo contamos conversaciones de las que el usuario es participante.
      if (!parts.includes(userId)) continue;
      const other = parts.find((id) => id !== userId);
      if (other) counts[other] = (counts[other] || 0) + row.c;
    } else if (row.room.startsWith('community:')) {
      const communityId = row.room.slice(10);
      if (!isCommunityMember(userId, communityId)) continue;
      const key = `community:${communityId}`;
      counts[key] = (counts[key] || 0) + row.c;
    }
  }
  return counts;
}

export function saveMessage(room, fromId, text = '', fileId = null, deliveredAt = null) {
  const id = uid();
  db.prepare(`
    INSERT INTO messages (id, room, from_id, text, file_id, created_at, delivered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, room, fromId, String(text || '').slice(0, 10000), fileId || null, now(), deliveredAt || null);
  return messageShape(db.prepare('SELECT * FROM messages WHERE id = ?').get(id));
}

function receiptUpdate(tableColumn, room, fromId, ids, value) {
  const whereIds = ids?.length
    ? ` AND id IN (${ids.map(() => '?').join(',')})`
    : '';
  const rows = db.prepare(`
    SELECT * FROM messages WHERE room = ? AND from_id = ? AND ${tableColumn} IS NULL${whereIds}
  `).all(room, fromId, ...(ids || []));
  if (!rows.length) return [];
  db.prepare(`
    UPDATE messages SET ${tableColumn} = ? WHERE id IN (${rows.map(() => '?').join(',')})
  `).run(value, ...rows.map((row) => row.id));
  return rows.map((row) => messageShape({ ...row, [tableColumn]: value }));
}

export function markMessagesDelivered(room, fromId) {
  return receiptUpdate('delivered_at', room, fromId, [], now());
}

export function markMessagesRead(room, fromId, ids) {
  return receiptUpdate('read_at', room, fromId, ids, now());
}

export function commentShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    author: publicUser(getUserById(row.user_id)),
    text: row.text,
    createdAt: row.created_at
  };
}

export function commentsFor(postId) {
  return db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC').all(postId).map(commentShape);
}

export function postShape(row, viewerId, includeRepost = true) {
  if (!row) return null;
  const likes = db.prepare('SELECT COUNT(*) AS c FROM likes WHERE post_id = ?').get(row.id).c;
  const liked = viewerId
    ? Boolean(db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(row.id, viewerId))
    : false;
  const reposts = db.prepare('SELECT COUNT(*) AS c FROM posts WHERE repost_of = ?').get(row.id).c;
  const reposted = viewerId
    ? Boolean(db.prepare('SELECT 1 FROM posts WHERE repost_of = ? AND user_id = ?').get(row.id, viewerId))
    : false;
  const community = row.community_id
    ? db.prepare('SELECT id, name FROM communities WHERE id = ?').get(row.community_id)
    : null;
  let repostOf = null;
  if (row.repost_of) {
    if (!includeRepost) {
      repostOf = { id: row.repost_of, unavailable: true };
    } else {
      const original = db.prepare('SELECT * FROM posts WHERE id = ?').get(row.repost_of);
      repostOf = original && canSeePosts(original.user_id, viewerId)
        ? postShape(original, viewerId, false)
        : { id: row.repost_of, unavailable: true };
    }
  }
  return {
    id: row.id,
    userId: row.user_id,
    author: publicUser(getUserById(row.user_id), viewerId),
    communityId: row.community_id || null,
    community: community ? { id: community.id, name: community.name } : null,
    text: row.text || '',
    fileId: row.file_id || null,
    file: row.file_id ? fileShape(getFileById(row.file_id)) : null,
    likes,
    liked,
    reposts,
    reposted,
    repostOf,
    comments: commentsFor(row.id),
    createdAt: row.created_at
  };
}

// Quiénes pusieron "me gusta" en publicaciones del usuario, para la pantalla
// de notificaciones sociales. No incluye mensajes ni datos de ubicación.
export function likeNotificationsFor(userId, limit = 120) {
  const rows = db.prepare(`
    SELECT l.post_id AS postId, l.created_at AS createdAt, p.text AS postText, u.*
    FROM likes l
    JOIN posts p ON p.id = l.post_id
    JOIN users u ON u.id = l.user_id
    WHERE p.user_id = ? AND l.user_id != ?
    ORDER BY l.created_at DESC
    LIMIT ?
  `).all(userId, userId, limit);
  return rows.map((row) => ({
    id: `${row.postId}:${row.id}`,
    postId: row.postId,
    postText: row.postText || '',
    user: publicUser(row, userId),
    createdAt: row.createdAt
  }));
}

// Los perfiles privados solo muestran sus publicaciones a sus amigos (y a su dueño).
export function canSeePosts(ownerId, viewerId) {
  if (!ownerId || ownerId === viewerId) return true;
  const owner = getUserById(ownerId);
  if (!owner || !owner.profile_private) return true;
  return areFriends(ownerId, viewerId);
}

export function postsFor(viewerId, communityId = null) {
  const rows = communityId
    ? db.prepare('SELECT * FROM posts WHERE community_id = ? ORDER BY created_at DESC').all(communityId)
    : db.prepare('SELECT * FROM posts WHERE community_id IS NULL ORDER BY created_at DESC').all();
  return rows
    .filter((row) => communityId || canSeePosts(row.user_id, viewerId))
    .map((row) => postShape(row, viewerId));
}

export function postsByUser(userId, viewerId) {
  const rows = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  return rows.map((row) => postShape(row, viewerId));
}

export function communitiesFor(userId) {
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM community_members m WHERE m.community_id = c.id) AS member_count,
      EXISTS(SELECT 1 FROM community_members m2 WHERE m2.community_id = c.id AND m2.user_id = ?) AS joined
    FROM communities c ORDER BY c.created_at DESC
  `).all(userId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description || '',
    ownerId: row.owner_id,
    owner: publicUser(getUserById(row.owner_id)),
    memberCount: row.member_count,
    joined: Boolean(row.joined),
    createdAt: row.created_at
  }));
}

export function isCommunityMember(userId, communityId) {
  if (!userId || !communityId) return false;
  return Boolean(db.prepare(`
    SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?
  `).get(communityId, userId));
}

export function communityIdsFor(userId) {
  return db.prepare('SELECT community_id FROM community_members WHERE user_id = ?').all(userId).map((r) => r.community_id);
}

export function getWatchRoom(key) {
  const row = db.prepare('SELECT * FROM watch_rooms WHERE key = ?').get(String(key || 'general'));
  if (!row) {
    return { key: String(key || 'general'), url: '', playing: false, position: 0, hostId: null, updatedAt: null };
  }
  return {
    key: row.key,
    url: row.url || '',
    playing: Boolean(row.playing),
    position: row.position || 0,
    hostId: row.host_id || null,
    updatedAt: row.updated_at || null
  };
}

export function saveWatchRoom(state) {
  const key = String(state.key || 'general');
  const row = {
    key,
    url: String(state.url || '').slice(0, 2000),
    playing: state.playing ? 1 : 0,
    position: Number(state.position) || 0,
    hostId: state.hostId || null,
    updatedAt: now()
  };
  db.prepare(`
    INSERT INTO watch_rooms (key, url, playing, position, host_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      url = excluded.url, playing = excluded.playing, position = excluded.position,
      host_id = excluded.host_id, updated_at = excluded.updated_at
  `).run(row.key, row.url, row.playing, row.position, row.hostId, row.updatedAt);
  return getWatchRoom(key);
}
