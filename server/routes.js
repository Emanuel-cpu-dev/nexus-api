import { Router } from 'express';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { authRequired } from './auth.js';
import { isOnline, onlineUsers, getStatus } from './presence.js';
import {
  db,
  uid,
  now,
  hashPassword,
  verifyPassword,
  generateCode,
  publicUser,
  getUserById,
  getUserByUsername,
  getUserByCode,
  createToken,
  addFriendship,
  areFriends,
  friendIds,
  friendsOf,
  dmRoom,
  messagesFor,
  saveMessage,
  postsFor,
  postsByUser,
  postShape,
  commentsFor,
  communitiesFor,
  isCommunityMember,
  fileShape,
  getFileById,
  getWatchRoom,
  saveWatchRoom
} from './db.js';

export function createRoutes(io) {
  const router = Router();
  const uploadDir = resolve(process.env.UPLOAD_DIR || './uploads');
  mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = extname(file.originalname || '').replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12);
      cb(null, `${uid()}${ext}`);
    }
  });
  const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

  function singleFile(req, res, next) {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el límite de 50 MB' : err.message
        });
      }
      return next();
    });
  }

  function joinCommunityRoom(userId, communityId) {
    const sockets = onlineUsers.get(userId);
    if (!sockets) return;
    for (const socketId of sockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) socket.join(`community:${communityId}`);
    }
  }

  function emitFriendAccepted(aId, bId) {
    const a = publicUser(getUserById(aId));
    const b = publicUser(getUserById(bId));
    io.to(`user:${aId}`).emit('friend:accepted', { friend: b, user: a, at: now() });
    io.to(`user:${bId}`).emit('friend:accepted', { friend: a, user: b, at: now() });
  }

  router.get('/health', (req, res) => res.json({ ok: true, time: now() }));

  router.post('/auth/register', (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || '').trim();

    if (!/^[a-z0-9_.-]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Usuario: 3-20 caracteres (a-z, 0-9, ., -, _).' });
    }
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    if (displayName.length < 1 || displayName.length > 40) {
      return res.status(400).json({ error: 'El nombre visible debe tener entre 1 y 40 caracteres.' });
    }
    if (getUserByUsername(username)) return res.status(409).json({ error: 'Ese usuario ya está registrado.' });

    const id = uid();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, display_name, bio, avatar_color, code, created_at)
      VALUES (?, ?, ?, ?, '', '#5865f2', ?, ?)
    `).run(id, username, hashPassword(password), displayName.slice(0, 40), generateCode(), now());
    const token = createToken(id);
    return res.status(201).json({ token, user: publicUser(getUserById(id)) });
  });

  router.post('/auth/login', (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = getUserByUsername(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    return res.json({ token: createToken(user.id), user: publicUser(user) });
  });

  router.get('/bootstrap', authRequired, (req, res) => {
    const id = req.user.id;
    const friendRequests = db.prepare('SELECT * FROM friend_requests WHERE to_id = ? ORDER BY created_at DESC').all(id);
    const outgoingRows = db.prepare('SELECT * FROM friend_requests WHERE from_id = ? ORDER BY created_at DESC').all(id);

    const incoming = friendRequests.map((row) => ({
      id: row.id,
      from: publicUser(getUserById(row.from_id)),
      createdAt: row.created_at
    }));
    const outgoing = outgoingRows.map((row) => ({
      id: row.id,
      to: publicUser(getUserById(row.to_id)),
      createdAt: row.created_at
    }));

    return res.json({
      user: publicUser(req.user),
      friends: friendsOf(id).map((u) => ({
        ...publicUser(u),
        online: isOnline(u.id),
        status: getStatus(u.id)
      })),
      incoming,
      outgoing,
      communities: communitiesFor(id),
      posts: postsFor(id)
    });
  });

  router.patch('/me', authRequired, (req, res) => {
    const id = req.user.id;
    const fields = [];
    const values = [];
    if (req.body?.displayName !== undefined) {
      const value = String(req.body.displayName).trim();
      if (value.length < 1 || value.length > 40) return res.status(400).json({ error: 'Nombre visible inválido.' });
      fields.push('display_name = ?');
      values.push(value);
    }
    if (req.body?.bio !== undefined) {
      fields.push('bio = ?');
      values.push(String(req.body.bio).slice(0, 300));
    }
    if (req.body?.avatarColor !== undefined) {
      const color = String(req.body.avatarColor);
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: 'Color inválido (usa #RRGGBB).' });
      fields.push('avatar_color = ?');
      values.push(color);
    }
    if (req.body?.avatarUrl !== undefined) {
      const value = String(req.body.avatarUrl || '').trim();
      if (value.length > 500 || (value && !/^(\/uploads\/[^\s]+|https?:\/\/[^\s]+)$/.test(value))) {
        return res.status(400).json({ error: 'URL de foto inválida.' });
      }
      fields.push('avatar_url = ?');
      values.push(value);
    }
    if (fields.length) {
      values.push(id);
      db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return res.json({ user: publicUser(getUserById(id)) });
  });

  router.get('/users/:id', authRequired, (req, res) => {
    const user = getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    return res.json({
      user: { ...publicUser(user), online: isOnline(user.id), status: getStatus(user.id) },
      posts: postsByUser(user.id, req.user.id)
    });
  });

  router.post('/friends/request', authRequired, (req, res) => {
    const me = req.user.id;
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Pega un código de amigo.' });
    const target = getUserByCode(code);
    if (!target) return res.status(404).json({ error: 'No existe ningún usuario con ese código.' });
    if (target.id === me) return res.status(400).json({ error: 'Ese es tu propio código.' });
    if (areFriends(me, target.id)) return res.json({ ok: true, already: true, friend: publicUser(target) });

    const pending = db.prepare('SELECT * FROM friend_requests WHERE from_id = ? AND to_id = ?').get(target.id, me);
    if (pending) {
      db.prepare(`
        DELETE FROM friend_requests
        WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
      `).run(target.id, me, me, target.id);
      addFriendship(me, target.id);
      emitFriendAccepted(me, target.id);
      return res.json({ ok: true, accepted: true, friend: publicUser(target) });
    }

    const existing = db.prepare('SELECT * FROM friend_requests WHERE from_id = ? AND to_id = ?').get(me, target.id);
    if (existing) return res.json({ ok: true, accepted: false, user: publicUser(target) });

    const requestId = uid();
    db.prepare(`
      INSERT INTO friend_requests (id, from_id, to_id, created_at) VALUES (?, ?, ?, ?)
    `).run(requestId, me, target.id, now());
    io.to(`user:${target.id}`).emit('friend:request', {
      id: requestId,
      from: publicUser(req.user),
      createdAt: now()
    });
    return res.json({ ok: true, accepted: false, user: publicUser(target) });
  });

  router.post('/friends/:id/accept', authRequired, (req, res) => {
    const me = req.user.id;
    const other = getUserById(req.params.id);
    if (!other) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const pending = db.prepare('SELECT * FROM friend_requests WHERE from_id = ? AND to_id = ?').get(other.id, me);
    if (!pending) return res.status(404).json({ error: 'No hay una solicitud pendiente.' });
    db.prepare('DELETE FROM friend_requests WHERE id = ?').run(pending.id);
    addFriendship(me, other.id);
    emitFriendAccepted(me, other.id);
    return res.json({ ok: true, friend: publicUser(other) });
  });

  router.post('/friends/:id/reject', authRequired, (req, res) => {
    db.prepare('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?').run(req.params.id, req.user.id);
    return res.json({ ok: true });
  });

  router.delete('/friends/:id', authRequired, (req, res) => {
    const [a, b] = [req.user.id, req.params.id].sort();
    db.prepare('DELETE FROM friends WHERE a = ? AND b = ?').run(a, b);
    return res.json({ ok: true });
  });

  router.get('/chats/dm/:userId', authRequired, (req, res) => {
    const other = getUserById(req.params.userId);
    if (!other) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (!areFriends(req.user.id, other.id)) return res.status(403).json({ error: 'Solo puedes chatear con amigos.' });
    const room = dmRoom(req.user.id, other.id);
    const profile = publicUser(other);
    return res.json({
      chat: {
        type: 'dm',
        id: room,
        userId: other.id,
        name: profile.displayName,
        user: { ...profile, online: isOnline(other.id), status: getStatus(other.id) },
        online: isOnline(other.id),
        status: getStatus(other.id)
      },
      messages: messagesFor(room, 150)
    });
  });

  router.get('/chats/community/:communityId', authRequired, (req, res) => {
    const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.communityId);
    if (!community) return res.status(404).json({ error: 'Comunidad no encontrada.' });
    if (!isCommunityMember(req.user.id, community.id)) {
      return res.status(403).json({ error: 'Debes unirte a la comunidad.' });
    }
    return res.json({
      chat: { type: 'community', id: community.id, communityId: community.id, name: community.name },
      messages: messagesFor(`community:${community.id}`, 150)
    });
  });

  router.get('/communities', authRequired, (req, res) => {
    return res.json({ communities: communitiesFor(req.user.id) });
  });

  router.post('/communities', authRequired, (req, res) => {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    if (name.length < 1 || name.length > 60) return res.status(400).json({ error: 'El nombre debe tener 1-60 caracteres.' });
    const id = uid();
    db.prepare(`
      INSERT INTO communities (id, name, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?)
    `).run(id, name.slice(0, 60), description.slice(0, 300), req.user.id, now());
    db.prepare(`
      INSERT INTO community_members (community_id, user_id, created_at) VALUES (?, ?, ?)
    `).run(id, req.user.id, now());
    joinCommunityRoom(req.user.id, id);
    return res.status(201).json({ community: communitiesFor(req.user.id).find((c) => c.id === id) });
  });

  router.post('/communities/:id/join', authRequired, (req, res) => {
    const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(req.params.id);
    if (!community) return res.status(404).json({ error: 'Comunidad no encontrada.' });
    db.prepare(`
      INSERT OR IGNORE INTO community_members (community_id, user_id, created_at) VALUES (?, ?, ?)
    `).run(community.id, req.user.id, now());
    joinCommunityRoom(req.user.id, community.id);
    return res.json({ community: communitiesFor(req.user.id).find((c) => c.id === community.id) });
  });

  router.get('/posts', authRequired, (req, res) => {
    const communityId = req.query.communityId || null;
    if (communityId && !isCommunityMember(req.user.id, communityId)) {
      return res.status(403).json({ error: 'Debes unirte a la comunidad.' });
    }
    return res.json({ posts: postsFor(req.user.id, communityId) });
  });

  router.post('/posts', authRequired, (req, res) => {
    const text = String(req.body?.text || '').trim();
    const communityId = req.body?.communityId || null;
    const fileId = req.body?.fileId || null;
    if (!text && !fileId) return res.status(400).json({ error: 'Escribe algo o adjunta un archivo.' });
    if (communityId && !isCommunityMember(req.user.id, communityId)) {
      return res.status(403).json({ error: 'Debes unirte a la comunidad.' });
    }
    if (fileId && !getFileById(fileId)) return res.status(400).json({ error: 'El archivo no existe.' });
    const id = uid();
    db.prepare(`
      INSERT INTO posts (id, user_id, community_id, text, file_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, communityId, text.slice(0, 5000), fileId, now());
    const post = postShape(db.prepare('SELECT * FROM posts WHERE id = ?').get(id), req.user.id);
    if (communityId) io.to(`community:${communityId}`).emit('post:new', { communityId, post });
    return res.status(201).json({ post });
  });

  router.post('/posts/:id/like', authRequired, (req, res) => {
    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Publicación no encontrada.' });
    const exists = db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, req.user.id);
    if (exists) {
      db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(post.id, req.user.id);
    } else {
      db.prepare('INSERT INTO likes (post_id, user_id, created_at) VALUES (?, ?, ?)').run(post.id, req.user.id, now());
    }
    const likes = db.prepare('SELECT COUNT(*) AS c FROM likes WHERE post_id = ?').get(post.id).c;
    return res.json({ liked: !exists, likes });
  });

  router.get('/posts/:id/comments', authRequired, (req, res) => {
    return res.json({ comments: commentsFor(req.params.id) });
  });

  router.post('/posts/:id/comments', authRequired, (req, res) => {
    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Publicación no encontrada.' });
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Escribe un comentario.' });
    const id = uid();
    db.prepare(`
      INSERT INTO comments (id, post_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)
    `).run(id, post.id, req.user.id, text.slice(0, 1000), now());
    const comment = commentsFor(post.id).find((c) => c.id === id);
    return res.status(201).json({ comment });
  });

  router.post('/files', authRequired, singleFile, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Selecciona un archivo.' });
    const id = uid();
    db.prepare(`
      INSERT INTO files (id, name, filename, mime, size, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.file.originalname || 'archivo',
      req.file.filename,
      req.file.mimetype || 'application/octet-stream',
      req.file.size || 0,
      req.user.id,
      now()
    );
    return res.status(201).json({ file: fileShape(getFileById(id)) });
  });

  router.get('/files/:id', authRequired, (req, res) => {
    const file = getFileById(req.params.id);
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado.' });
    return res.json({ file: fileShape(file) });
  });

  router.get('/files/:id/download', authRequired, (req, res) => {
    const file = getFileById(req.params.id);
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado.' });
    return res.download(join(uploadDir, file.filename), file.name || file.filename);
  });

  router.get('/watch/:key', authRequired, (req, res) => {
    return res.json({ state: getWatchRoom(req.params.key) });
  });

  router.post('/watch/:key', authRequired, (req, res) => {
    const key = String(req.params.key || 'general');
    const state = saveWatchRoom({
      key,
      url: req.body?.url || '',
      playing: Boolean(req.body?.playing),
      position: req.body?.position || 0,
      hostId: req.user.id
    });
    io.to(`watch:${key}`).emit('watch:state', state);
    return res.json({ state });
  });

  return router;
}
