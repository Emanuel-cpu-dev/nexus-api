import { Router } from 'express';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { authRequired } from './auth.js';
import { isOnline, onlineUsers, getStatus } from './presence.js';
import { getInvites } from './pending.js';
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
  searchUsers,
  createToken,
  addFriendship,
  areFriends,
  friendIds,
  friendsOf,
  dmRoom,
  messagesFor,
  unreadCountsFor,
  saveMessage,
  postsFor,
  postsByUser,
  postShape,
  likeNotificationsFor,
  saveMentions,
  mentionNotificationsFor,
  unreadSocialCounts,
  markNotificationsRead,
  saveStory,
  storiesFor,
  storyShape,
  viewableStory,
  markStoryViewed,
  storyViewersFor,
  saveHoroscopeReaction,
  horoscopeReactions,
  saveFileData,
  blobBuffer,
  commentsFor,
  communitiesFor,
  isCommunityMember,
  fileShape,
  getFileById,
  getWatchRoom,
  saveWatchRoom,
  locationViewersFor,
  locationOwnersFor,
  latestLocationFor,
  latestLocationsFor
} from './db.js';
import { getHoroscope, HOROSCOPE_SIGNS } from './horoscope.js';

export function createRoutes(io) {
  const router = Router();
  const uploadDir = resolve(process.env.UPLOAD_DIR || './uploads');
  mkdirSync(uploadDir, { recursive: true });

  // Guardamos el archivo dentro de SQLite: en Render el disco se reinicia con cada deploy.
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

  function singleFile(req, res, next) {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el límite de 50 MB' : err.message
        });
      }
      if (req.file) {
        const ext = extname(req.file.originalname || '').replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12);
        const filename = `${uid()}${ext}`;
        saveFileData({
          id: uid(),
          name: req.file.originalname || filename,
          filename,
          mime: req.file.mimetype || 'application/octet-stream',
          size: req.file.size,
          uploadedBy: req.user.id,
          createdAt: now(),
          data: req.file.buffer
        });
        req.savedFileId = filename;
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

  // Para el celular: si la llamada entró con la app cerrada, el aviso sigue acá al abrir.
  router.get('/calls/pending', authRequired, (req, res) => {
    return res.json({ invites: getInvites(req.user.id) });
  });

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

  router.get('/bootstrap', authRequired, async (req, res) => {
    const id = req.user.id;
    const noticeCounts = unreadSocialCounts(id);
    const storyFeed = storiesFor(id);
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
      posts: postsFor(id),
      unread: unreadCountsFor(id),
      likeCount: noticeCounts.likes,
      mentionCount: noticeCounts.mentions,
      stories: storyFeed.groups,
      storyCount: storyFeed.storyCount,
      horoscope: await getHoroscope(),
      location: {
        sharedWith: locationViewersFor(id),
        sharedBy: locationOwnersFor(id),
        positions: latestLocationsFor(id)
      }
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
    if (req.body?.profilePrivate !== undefined) {
      fields.push('profile_private = ?');
      values.push(req.body.profilePrivate ? 1 : 0);
    }
    if (fields.length) {
      values.push(id);
      db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return res.json({ user: publicUser(getUserById(id)) });
  });

  // Autocompletado del @ en el composer. Va antes de /users/:id para que
  // "search" no se interprete como un id de usuario.
  router.get('/users/search', authRequired, (req, res) => {
    const query = String(req.query.q || '').trim();
    return res.json({ users: searchUsers(query, req.user.id, 12) });
  });

  router.get('/users/:id', authRequired, (req, res) => {
    const user = getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const privateForMe = Boolean(user.profile_private)
      && user.id !== req.user.id
      && !areFriends(user.id, req.user.id);
    return res.json({
      user: { ...publicUser(user, req.user.id), online: isOnline(user.id), status: getStatus(user.id) },
      private: privateForMe,
      posts: privateForMe ? [] : postsByUser(user.id, req.user.id)
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
      messages: messagesFor(room, 150, req.user.id)
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
      messages: messagesFor(`community:${community.id}`, 150, req.user.id)
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

  // Avisos sociales: quién le puso "me gusta" a las publicaciones del usuario.
  router.get('/likes/me', authRequired, (req, res) => {
    return res.json({ likes: likeNotificationsFor(req.user.id) });
  });

  router.get('/mentions/me', authRequired, (req, res) => {
    return res.json({ mentions: mentionNotificationsFor(req.user.id) });
  });

  router.post('/notifications/read', authRequired, (req, res) => {
    markNotificationsRead(req.user.id);
    return res.json({ ok: true });
  });

  // Historia fija: lectura REAL del día, cacheada en memoria y compartida por todos.
  router.get('/horoscope', authRequired, async (req, res) => res.json(await getHoroscope()));

  router.get('/horoscope/:sign/reactions', authRequired, (req, res) => {
    const sign = String(req.params.sign || '').toLowerCase();
    if (!HOROSCOPE_SIGNS.includes(sign)) return res.status(400).json({ error: 'Signo no válido.' });
    const date = String(req.query.date || '').slice(0, 10) || null;
    const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
    return res.json(horoscopeReactions(targetDate, sign, req.user.id));
  });

  router.post('/horoscope/:sign/react', authRequired, (req, res) => {
    const sign = String(req.params.sign || '').toLowerCase();
    if (!HOROSCOPE_SIGNS.includes(sign)) return res.status(400).json({ error: 'Signo no válido.' });
    const kind = req.body?.kind === 'message' ? 'message' : 'like';
    const message = String(req.body?.message || '').trim().slice(0, 280);
    if (kind === 'message' && !message) return res.status(400).json({ error: 'Escribí un mensaje.' });
    const date = new Date().toISOString().slice(0, 10);
    const data = saveHoroscopeReaction(req.user.id, date, sign, kind, message);
    for (const friendId of friendIds(req.user.id)) {
      io.to(`user:${friendId}`).emit('horoscope:reaction', { date, sign, ...data });
    }
    return res.json(data);
  });

  // Historias: solo el autor y sus amigos pueden verlas; viven 24 horas.
  router.get('/stories', authRequired, (req, res) => {
    return res.json(storiesFor(req.user.id));
  });

  router.post('/stories', authRequired, (req, res) => {
    const fileId = req.body?.fileId;
    const file = fileId ? getFileById(fileId) : null;
    if (!file) return res.status(400).json({ error: 'Sube una foto o un video para la historia.' });
    if (!/^(image|video)\//.test(file.mime || '')) {
      return res.status(400).json({ error: 'La historia debe ser una imagen o un video.' });
    }
    if (Number(file.size) > 25 * 1024 * 1024) {
      return res.status(400).json({ error: 'La historia no puede superar 25 MB.' });
    }
    const caption = String(req.body?.caption || '').trim().slice(0, 280);
    const story = saveStory(req.user.id, file.id, caption);
    const row = db.prepare('SELECT * FROM stories WHERE id = ?').get(story.id);
    for (const friendId of friendIds(req.user.id)) {
      io.to(`user:${friendId}`).emit('story:new', {
        story: storyShape(row, friendId),
        user: publicUser(req.user, friendId),
        createdAt: story.createdAt
      });
    }
    return res.status(201).json({ story });
  });

  router.post('/stories/:id/view', authRequired, (req, res) => {
    const row = viewableStory(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Historia no disponible.' });
    if (row.user_id === req.user.id) return res.json({ ok: true, own: true });
    const result = markStoryViewed(row.id, req.user.id);
    if (result.created) {
      io.to(`user:${row.user_id}`).emit('story:viewed', {
        storyId: row.id,
        viewer: publicUser(req.user, row.user_id),
        viewedAt: result.viewedAt
      });
    }
    return res.json({ ok: true, viewedAt: result.viewedAt, viewCount: storyShape(row, req.user.id).viewCount });
  });

  router.get('/stories/:id/views', authRequired, (req, res) => {
    const row = viewableStory(req.params.id, req.user.id);
    if (!row || row.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Solo el autor puede ver quién miró su historia.' });
    }
    return res.json({ viewers: storyViewersFor(row.id, req.user.id) });
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
    const savedText = text.slice(0, 5000);
    db.prepare(`
      INSERT INTO posts (id, user_id, community_id, text, file_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, communityId, savedText, fileId, now());
    const tagged = saveMentions(id, savedText, req.user.id);
    const post = postShape(db.prepare('SELECT * FROM posts WHERE id = ?').get(id), req.user.id);
    if (communityId) io.to(`community:${communityId}`).emit('post:new', { communityId, post });
    // Cada etiquetado recibe su aviso por su propio canal, igual que los MG.
    // No va por dm:message para no mezclarlo con los chats.
    for (const user of tagged) {
      io.to(`user:${user.id}`).emit('mention:new', {
        postId: id,
        postText: savedText,
        hasFile: Boolean(fileId),
        user: publicUser(req.user, req.user.id),
        createdAt: now()
      });
    }
    return res.status(201).json({ post, mentions: tagged });
  });

  // Editar publicación propia: texto y archivo. Los reposts no se editan.
  router.patch('/posts/:id', authRequired, (req, res) => {
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Publicación no encontrada.' });
    if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Solo podés editar tus publicaciones.' });
    if (row.repost_of) return res.status(400).json({ error: 'Los reposts no se editan.' });
    const text = String(req.body?.text ?? row.text ?? '').trim().slice(0, 5000);
    const hasFile = Object.prototype.hasOwnProperty.call(req.body || {}, 'fileId');
    const fileId = hasFile ? (req.body.fileId || null) : row.file_id;
    if (!text && !fileId) return res.status(400).json({ error: 'Escribe algo o dejá una foto.' });
    if (fileId && !getFileById(fileId)) return res.status(400).json({ error: 'El archivo no existe.' });
    db.prepare('UPDATE posts SET text = ?, file_id = ?, updated_at = ? WHERE id = ?')
      .run(text, fileId, now(), row.id);
    const tagged = saveMentions(row.id, text, req.user.id);
    for (const user of tagged) {
      io.to(`user:${user.id}`).emit('mention:new', {
        postId: row.id,
        postText: text,
        hasFile: Boolean(fileId),
        user: publicUser(req.user, req.user.id),
        createdAt: now()
      });
    }
    return res.json({
      post: postShape(db.prepare('SELECT * FROM posts WHERE id = ?').get(row.id), req.user.id),
      mentions: tagged
    });
  });

  router.delete('/posts/:id', authRequired, (req, res) => {
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Publicación no encontrada.' });
    if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Solo podés borrar tus publicaciones.' });
    db.prepare('DELETE FROM posts WHERE id = ?').run(row.id);
    if (row.community_id) {
      io.to(`community:${row.community_id}`).emit('post:deleted', {
        id: row.id,
        communityId: row.community_id
      });
    }
    return res.json({ ok: true, id: row.id });
  });

  router.post('/posts/:id/like', authRequired, (req, res) => {
    const post = db.prepare('SELECT id, user_id, text FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Publicación no encontrada.' });
    const exists = db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, req.user.id);
    if (exists) {
      db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(post.id, req.user.id);
    } else {
      db.prepare('INSERT INTO likes (post_id, user_id, created_at) VALUES (?, ?, ?)').run(post.id, req.user.id, now());
      // Aviso en vivo al autor. Va por su propio canal, no por dm:message.
      io.to(`user:${post.user_id}`).emit('like:new', {
        postId: post.id,
        postText: post.text || '',
        user: publicUser(req.user, req.user.id),
        createdAt: now()
      });
    }
    const likes = db.prepare('SELECT COUNT(*) AS c FROM likes WHERE post_id = ?').get(post.id).c;
    return res.json({ liked: !exists, likes });
  });

  // Repost al estilo Twitter: aparece en el feed con la publicación original
  // incrustada. Volver a tocarlo lo deshace.
  router.post('/posts/:id/repost', authRequired, (req, res) => {
    let target = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'Publicación no encontrada.' });
    // Si reposteamos un repost, apuntamos siempre a la publicación original.
    const seen = new Set();
    while (target.repost_of && !seen.has(target.repost_of)) {
      seen.add(target.repost_of);
      const parent = db.prepare('SELECT * FROM posts WHERE id = ?').get(target.repost_of);
      if (!parent) break;
      target = parent;
    }
    if (target.community_id && !isCommunityMember(req.user.id, target.community_id)) {
      return res.status(403).json({ error: 'Debes unirte a la comunidad.' });
    }

    const existing = db.prepare('SELECT id FROM posts WHERE repost_of = ? AND user_id = ?').get(target.id, req.user.id);
    let repost = null;
    if (existing) {
      db.prepare('DELETE FROM posts WHERE id = ?').run(existing.id);
    } else {
      const id = uid();
      const quote = String(req.body?.text || '').trim().slice(0, 5000);
      db.prepare(`
        INSERT INTO posts (id, user_id, community_id, text, file_id, repost_of, created_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?)
      `).run(id, req.user.id, target.community_id || null, quote, target.id, now());
      repost = postShape(db.prepare('SELECT * FROM posts WHERE id = ?').get(id), req.user.id);
      if (target.community_id) io.to(`community:${target.community_id}`).emit('post:new', {
        communityId: target.community_id,
        post: repost
      });
    }
    const reposts = db.prepare('SELECT COUNT(*) AS c FROM posts WHERE repost_of = ?').get(target.id).c;
    return res.json({ reposted: !existing, reposts, post: repost });
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
    if (!req.savedFileId) return res.status(400).json({ error: 'Selecciona un archivo.' });
    const saved = db.prepare('SELECT * FROM files WHERE filename = ?').get(req.savedFileId);
    return res.status(201).json({ file: fileShape(saved) });
  });

  router.get('/files/:id', authRequired, (req, res) => {
    const file = getFileById(req.params.id);
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado.' });
    return res.json({ file: fileShape(file) });
  });

  router.get('/files/:id/download', authRequired, (req, res) => {
    const file = getFileById(req.params.id);
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado.' });
    const data = blobBuffer(file.data);
    if (data?.length) {
      res.setHeader('Content-Type', file.mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${String(file.name || file.filename).replace(/"/g, '')}"`);
      return res.send(data);
    }
    return res.download(join(uploadDir, file.filename), file.name || file.filename);
  });

  // Foto "ver una sola vez": se entrega el blob una única vez al destinatario.
  // No se publica la URL de /uploads y la respuesta no se guarda en caché.
  router.post('/messages/:id/once', authRequired, (req, res) => {
    const row = db.prepare(`
      SELECT * FROM messages WHERE id = ? AND view_once = 1 AND file_id IS NOT NULL
    `).get(req.params.id);
    const parts = row?.room?.startsWith('dm:') ? row.room.slice(3).split(':') : [];
    if (!row || !parts.includes(req.user.id) || row.from_id === req.user.id) {
      return res.status(404).json({ error: 'Foto no disponible.' });
    }
    const file = getFileById(row.file_id);
    const data = blobBuffer(file?.data);
    if (!data?.length) return res.status(410).json({ error: 'La foto ya no está disponible.' });
    const claim = db.prepare(`
      UPDATE messages SET viewed_by = ? WHERE id = ? AND viewed_by IS NULL
    `).run(req.user.id, row.id);
    if (!claim.changes) return res.status(410).json({ error: 'Esta foto ya fue vista.' });
    res.setHeader('Content-Type', file.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(data);
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
