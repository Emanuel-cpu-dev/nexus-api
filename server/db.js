import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
`);

// Migración simple para bases creadas antes de la foto de perfil.
if (!db.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'avatar_url')) {
  db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''");
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

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio || '',
    avatarColor: row.avatar_color || '#5865f2',
    avatarUrl: row.avatar_url || '',
    code: row.code,
    createdAt: row.created_at
  };
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
    createdAt: row.created_at
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

export function saveMessage(room, fromId, text = '', fileId = null) {
  const id = uid();
  db.prepare(`
    INSERT INTO messages (id, room, from_id, text, file_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, room, fromId, String(text || '').slice(0, 10000), fileId || null, now());
  return messageShape(db.prepare('SELECT * FROM messages WHERE id = ?').get(id));
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

export function postShape(row, viewerId) {
  if (!row) return null;
  const likes = db.prepare('SELECT COUNT(*) AS c FROM likes WHERE post_id = ?').get(row.id).c;
  const liked = viewerId
    ? Boolean(db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(row.id, viewerId))
    : false;
  const community = row.community_id
    ? db.prepare('SELECT id, name FROM communities WHERE id = ?').get(row.community_id)
    : null;
  return {
    id: row.id,
    userId: row.user_id,
    author: publicUser(getUserById(row.user_id)),
    communityId: row.community_id || null,
    community: community ? { id: community.id, name: community.name } : null,
    text: row.text || '',
    fileId: row.file_id || null,
    file: row.file_id ? fileShape(getFileById(row.file_id)) : null,
    likes,
    liked,
    comments: commentsFor(row.id),
    createdAt: row.created_at
  };
}

export function postsFor(viewerId, communityId = null) {
  const rows = communityId
    ? db.prepare('SELECT * FROM posts WHERE community_id = ? ORDER BY created_at DESC').all(communityId)
    : db.prepare('SELECT * FROM posts WHERE community_id IS NULL ORDER BY created_at DESC').all();
  return rows.map((row) => postShape(row, viewerId));
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
