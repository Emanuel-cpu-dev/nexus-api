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
    created_at TEXT NOT NULL,
    updated_at TEXT
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
  CREATE TABLE IF NOT EXISTS mentions (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_mentions_user_created ON mentions(user_id, created_at);
  CREATE TABLE IF NOT EXISTS notification_reads (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    read_at TEXT NOT NULL
  );
  -- Historias efímeras (24 h). El archivo sigue viviendo dentro de SQLite.
  CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    caption TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_stories_feed ON stories(user_id, expires_at);
  CREATE INDEX IF NOT EXISTS idx_stories_expiry ON stories(expires_at);
  CREATE TABLE IF NOT EXISTS story_views (
    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at TEXT NOT NULL,
    PRIMARY KEY (story_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_story_views_user ON story_views(user_id, viewed_at);
  -- Reacciones a la historia del zodiaco. No guarda ubicación ni fotos efímeras.
  CREATE TABLE IF NOT EXISTS horoscope_reactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    sign TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    message TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_horoscope_like
    ON horoscope_reactions(date, sign, user_id, kind) WHERE kind = 'like';
  CREATE INDEX IF NOT EXISTS idx_horoscope_reactions_day
    ON horoscope_reactions(date, sign, created_at);
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
if (!messageColumns.includes('view_once')) {
  db.exec('ALTER TABLE messages ADD COLUMN view_once INTEGER DEFAULT 0');
}
if (!messageColumns.includes('viewed_by')) {
  db.exec('ALTER TABLE messages ADD COLUMN viewed_by TEXT');
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
if (!postColumns.includes('updated_at')) {
  db.exec('ALTER TABLE posts ADD COLUMN updated_at TEXT');
}
const storyColumns = db.prepare('PRAGMA table_info(stories)').all().map((column) => column.name);
if (!storyColumns.includes('caption')) {
  db.exec("ALTER TABLE stories ADD COLUMN caption TEXT DEFAULT ''");
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

// Búsqueda para el autocompletado de @. Solo devuelve datos públicos y nunca
// incluye contraseñas, códigos de acceso ni tokens.
// Los resultados del autocompletado no exponen el código de acceso.
function mentionUser(row, viewerId) {
  const user = publicUser(row, viewerId);
  if (!user) return null;
  delete user.code;
  return user;
}

export function searchUsers(query, viewerId, limit = 10) {
  const value = String(query || '').trim().replace(/^@/, '').toLowerCase();
  if (!value) {
    return db.prepare(`
      SELECT * FROM users WHERE id != ? ORDER BY username ASC LIMIT ?
    `).all(viewerId, limit).map((row) => mentionUser(row, viewerId));
  }
  const pattern = `%${value}%`;
  return db.prepare(`
    SELECT * FROM users
    WHERE id != ? AND (username LIKE ? OR display_name LIKE ?)
    ORDER BY (username = ?) DESC, username ASC
    LIMIT ?
  `).all(viewerId, pattern, pattern, value, limit).map((row) => mentionUser(row, viewerId));
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

export function messageShape(row, viewerId = null) {
  if (!row) return null;
  const viewOnce = Boolean(row.view_once);
  // Quien recibe una foto "una sola vez" nunca ve la URL pública: para eso
  // existe el endpoint que entrega el blob una única vez.
  const hideFile = viewOnce && viewerId && viewerId !== row.from_id;
  return {
    id: row.id,
    room: row.room,
    fromId: row.from_id,
    author: publicUser(getUserById(row.from_id)),
    text: row.text || '',
    fileId: row.file_id || null,
    file: row.file_id && !hideFile ? fileShape(getFileById(row.file_id)) : null,
    hasFile: Boolean(row.file_id),
    viewOnce,
    viewed: Boolean(row.viewed_by),
    createdAt: row.created_at,
    deliveredAt: row.delivered_at || null,
    readAt: row.read_at || null
  };
}

export function messagesFor(room, limit = 150, viewerId = null) {
  const rows = db.prepare(`
    SELECT * FROM (
      SELECT rowid AS rid, * FROM messages WHERE room = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
    ) ORDER BY rid ASC
  `).all(room, limit);
  return rows.map((row) => messageShape(row, viewerId));
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

export function saveMessage(room, fromId, text = '', fileId = null, deliveredAt = null, viewOnce = false) {
  const id = uid();
  db.prepare(`
    INSERT INTO messages (id, room, from_id, text, file_id, created_at, delivered_at, view_once)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, room, fromId, String(text || '').slice(0, 10000), fileId || null,
    now(), deliveredAt || null, viewOnce ? 1 : 0
  );
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

// Usuarios etiquetados con @ en el texto de una publicación (o en el pie de una foto).
// Los nombres se normalizan igual que en el registro: minúsculas y sin puntos/guiones finales.
export function mentionUsernames(text) {
  const names = [];
  const seen = new Set();
  const expression = /@([a-zA-Z0-9_.-]{3,20})/g;
  let match;
  while ((match = expression.exec(String(text || '')))) {
    const username = match[1].replace(/[.-]+$/, '').toLowerCase();
    if (username.length >= 3 && !seen.has(username)) {
      seen.add(username);
      names.push(username);
    }
  }
  return names;
}

export function saveMentions(postId, text, authorId) {
  const created = [];
  for (const username of mentionUsernames(text)) {
    const user = getUserByUsername(username);
    if (!user || user.id === authorId) continue;
    const result = db.prepare(`
      INSERT OR IGNORE INTO mentions (post_id, user_id, created_at) VALUES (?, ?, ?)
    `).run(postId, user.id, now());
    if (result.changes) created.push(mentionUser(user, authorId));
  }
  return created;
}

export function mentionsForPost(postId, viewerId) {
  return db.prepare(`
    SELECT u.* FROM mentions m JOIN users u ON u.id = m.user_id
    WHERE m.post_id = ? ORDER BY m.created_at ASC
  `).all(postId).map((row) => mentionUser(row, viewerId));
}

// Avisos de menciones para la pantalla de notificaciones. No incluye mensajes
// privados ni datos de ubicación.
export function mentionNotificationsFor(userId, limit = 120) {
  const rows = db.prepare(`
    SELECT m.post_id AS postId, m.created_at AS mentionCreated, p.text AS postText, p.file_id AS fileId, u.*
    FROM mentions m
    JOIN posts p ON p.id = m.post_id
    JOIN users u ON u.id = p.user_id
    WHERE m.user_id = ? AND p.user_id != ?
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(userId, userId, limit);
  return rows.map((row) => ({
    id: `mention:${row.postId}:${row.id}`,
    postId: row.postId,
    postText: row.postText || '',
    hasFile: Boolean(row.fileId),
    user: mentionUser(row, userId),
    createdAt: row.mentionCreated
  }));
}

// El badge funciona como en Instagram: se apaga al abrir Avisos y solo vuelve
// a encenderse con lo que llegue después de esa lectura.
export function markNotificationsRead(userId, at = now()) {
  db.prepare(`
    INSERT INTO notification_reads (user_id, read_at) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET read_at = excluded.read_at
  `).run(userId, at);
  return at;
}

export function unreadSocialCounts(userId) {
  const read = db.prepare('SELECT read_at FROM notification_reads WHERE user_id = ?').get(userId);
  const since = read?.read_at || null;
  const likes = db.prepare(`
    SELECT COUNT(*) AS c FROM likes l
    JOIN posts p ON p.id = l.post_id
    WHERE p.user_id = ? AND l.user_id != ? AND (? IS NULL OR l.created_at > ?)
  `).get(userId, userId, since, since).c;
  const mentions = db.prepare(`
    SELECT COUNT(*) AS c FROM mentions
    WHERE user_id = ? AND (? IS NULL OR created_at > ?)
  `).get(userId, since, since).c;
  return { likes, mentions };
}

// Las historias viven 24 h. Al vencer se borra también el BLOB del archivo
// para que el backup de Render no crezca sin límite.
export function purgeExpiredStories() {
  const stamp = now();
  const expired = db.prepare('SELECT file_id FROM stories WHERE expires_at <= ?').all(stamp);
  const removeFile = db.prepare('DELETE FROM files WHERE id = ?');
  for (const row of expired) removeFile.run(row.file_id);
  return db.prepare('DELETE FROM stories WHERE expires_at <= ?').run(stamp).changes;
}

export function saveStory(userId, fileId, caption = '') {
  const id = uid();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const text = String(caption || '').trim().slice(0, 280);
  db.prepare(`
    INSERT INTO stories (id, user_id, file_id, caption, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, fileId, text, createdAt, expiresAt);
  return storyShape(db.prepare('SELECT * FROM stories WHERE id = ?').get(id), userId);
}

export function storyShape(row, viewerId = null) {
  if (!row) return null;
  const file = getFileById(row.file_id);
  const views = db.prepare(`
    SELECT user_id, viewed_at FROM story_views WHERE story_id = ? ORDER BY viewed_at ASC
  `).all(row.id);
  return {
    id: row.id,
    user: publicUser(getUserById(row.user_id), viewerId),
    file: file ? fileShape(file) : null,
    caption: row.caption || '',
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    viewed: views.some((view) => view.user_id === viewerId),
    viewCount: views.length,
    ...(viewerId === row.user_id
      ? {
          viewers: views.map((view) => ({
            user: publicUser(getUserById(view.user_id), viewerId),
            viewedAt: view.viewed_at
          }))
        }
      : {})
  };
}

export function storiesFor(viewerId) {
  purgeExpiredStories();
  const allowed = [viewerId, ...friendIds(viewerId)];
  const marks = allowed.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT * FROM stories
    WHERE expires_at > ? AND user_id IN (${marks})
    ORDER BY created_at DESC
  `).all(now(), ...allowed);
  const byUser = new Map();
  for (const row of rows) {
    const story = storyShape(row, viewerId);
    if (!story.file) continue;
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, { user: story.user, items: [] });
    byUser.get(row.user_id).items.push(story);
  }
  const groups = [...byUser.values()].map((group) => ({
    ...group,
    seen: group.items.every((story) => story.viewed)
  }));
  groups.sort((a, b) => {
    if (a.user.id === viewerId) return -1;
    if (b.user.id === viewerId) return 1;
    return (b.items[0]?.createdAt || '').localeCompare(a.items[0]?.createdAt || '');
  });
  return {
    groups,
    storyCount: groups.filter((group) => group.user.id !== viewerId && !group.seen).length
  };
}

export function viewableStory(storyId, viewerId) {
  const row = db.prepare('SELECT * FROM stories WHERE id = ?').get(storyId);
  if (!row || row.expires_at <= now()) return null;
  if (row.user_id !== viewerId && !areFriends(row.user_id, viewerId)) return null;
  return row;
}

export function markStoryViewed(storyId, viewerId) {
  const viewedAt = now();
  const result = db.prepare(`
    INSERT OR IGNORE INTO story_views (story_id, user_id, viewed_at) VALUES (?, ?, ?)
  `).run(storyId, viewerId, viewedAt);
  return { created: result.changes > 0, viewedAt };
}

export function storyViewersFor(storyId, ownerId) {
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(storyId);
  if (!story || story.user_id !== ownerId) return [];
  return db.prepare(`
    SELECT user_id, viewed_at FROM story_views WHERE story_id = ? ORDER BY viewed_at ASC
  `).all(storyId).map((view) => ({
    user: publicUser(getUserById(view.user_id), ownerId),
    viewedAt: view.viewed_at
  }));
}

export function saveHoroscopeReaction(userId, date, sign, kind, message = '') {
  const day = String(date || '').slice(0, 10);
  const slug = String(sign || '').toLowerCase();
  const type = kind === 'message' ? 'message' : 'like';
  if (type === 'like') {
    const existing = db.prepare(`
      SELECT id FROM horoscope_reactions
      WHERE date = ? AND sign = ? AND user_id = ? AND kind = 'like'
    `).get(day, slug, userId);
    if (existing) {
      db.prepare('DELETE FROM horoscope_reactions WHERE id = ?').run(existing.id);
      return horoscopeReactions(day, slug, userId);
    }
  }
  const text = String(message || '').trim().slice(0, 280);
  db.prepare(`
    INSERT INTO horoscope_reactions (id, date, sign, user_id, kind, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uid(), day, slug, userId, type, text, now());
  return horoscopeReactions(day, slug, userId);
}

export function horoscopeReactions(date, sign, viewerId) {
  const day = String(date || '').slice(0, 10);
  const slug = String(sign || '').toLowerCase();
  const rows = db.prepare(`
    SELECT * FROM horoscope_reactions
    WHERE date = ? AND sign = ? ORDER BY created_at ASC
  `).all(day, slug);
  const likes = rows.filter((row) => row.kind === 'like').length;
  return {
    date: day,
    sign: slug,
    likes,
    liked: viewerId ? rows.some((row) => row.kind === 'like' && row.user_id === viewerId) : false,
    messages: rows.filter((row) => row.kind === 'message').map((row) => ({
      id: row.id,
      user: publicUser(getUserById(row.user_id), viewerId),
      text: row.message,
      createdAt: row.created_at
    }))
  };
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
    mentions: mentionsForPost(row.id, viewerId),
    createdAt: row.created_at,
    updatedAt: row.updated_at || null
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
