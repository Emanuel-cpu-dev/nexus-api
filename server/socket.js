import {
  getUserByToken,
  getUserById,
  publicUser,
  friendIds,
  areFriends,
  dmRoom,
  saveMessage,
  markMessagesDelivered,
  markMessagesRead,
  isCommunityMember,
  communityIdsFor,
  getWatchRoom,
  saveWatchRoom,
  setLocationShare,
  removeLocationShare,
  removeAllLocationShares,
  locationViewersFor,
  locationOwnersFor,
  canSeeLocation,
  saveLocation,
  latestLocationFor,
  uid,
  now
} from './db.js';
import { addSocket, removeSocket, onlineUsers, isOnline, getStatus, setStatus } from './presence.js';
import { addInvite, removeInvite } from './pending.js';

const MAX_CALL_PARTICIPANTS = 5;
const UPDATE_REMINDER_MS = Number(process.env.UPDATE_REMINDER_MS) || 60 * 1000;

export function setupSocket(io, release = {}) {
  const calls = new Map();
  // Aviso inicial una vez por usuario; después se repite hasta que informe la versión nueva.
  const updateNoticeSent = new Set();
  const updateState = new Map();
  const lastLocationAt = new Map();
  const targetVersion = Number(release?.versionCode) || 0;
  const forceUpdate = Boolean(release?.force && targetVersion > 0);

  function sendUpdateNotice(userId) {
    io.to(`user:${userId}`).emit('dm:message', {
      updateNotice: true,
      versionCode: targetVersion,
      versionName: String(release.versionName || ''),
      notes: String(release.notes || ''),
      message: {
        id: `update-${targetVersion}`,
        room: `update:${userId}`,
        fromId: 'nexus-update',
        author: { displayName: '⬆️ Actualización obligatoria' },
        text: `Abrí Nexus y tocá Actualizar para instalar la versión ${release.versionName || targetVersion}.`,
        createdAt: now()
      }
    });
  }

  function stopUpdateReminders(userId) {
    const state = updateState.get(userId);
    if (state?.timer) clearInterval(state.timer);
    updateState.delete(userId);
  }

  function ensureUpdateReminders(userId) {
    if (!forceUpdate) return;
    let state = updateState.get(userId);
    if (!state) {
      state = { version: 0, timer: null };
      updateState.set(userId, state);
    }
    if (state.version >= targetVersion) {
      stopUpdateReminders(userId);
      return;
    }
    if (state.timer) return;
    state.timer = setInterval(() => {
      const current = updateState.get(userId);
      if (!current) return stopUpdateReminders(userId);
      if (current.version >= targetVersion || socketsOf(userId).length === 0) {
        return stopUpdateReminders(userId);
      }
      sendUpdateNotice(userId);
    }, UPDATE_REMINDER_MS);
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const user = getUserByToken(token);
    if (!user) return next(new Error('No autorizado'));
    socket.userId = user.id;
    socket.user = publicUser(user);
    return next();
  });

  function socketsOf(userId) {
    const ids = onlineUsers.get(userId) || [];
    return [...ids].map((id) => io.sockets.sockets.get(id)).filter(Boolean);
  }

  function joinCallRoom(callId, userId) {
    for (const socket of socketsOf(userId)) socket.join(`call:${callId}`);
  }

  function endCall(callId, by) {
    removeInvite(callId);
    const call = calls.get(callId);
    if (!call) return;
    const ended = { callId, by: by || null, cancelled: true };
    io.to(`call:${callId}`).emit('call:ended', ended);
    // También avisamos sala por sala: así deja de sonar incluso en un celular
    // que tenía el aviso nativo pero no llegó a entrar a la sala de la llamada.
    for (const userId of call.peers) {
      io.to(`user:${userId}`).emit('call:ended', ended);
      for (const socket of socketsOf(userId)) socket.leave(`call:${callId}`);
    }
    calls.delete(callId);
  }

  function leaveCall(callId, userId) {
    const call = calls.get(callId);
    if (!call) return;
    const wasHost = call.hostId === userId;
    call.peers.delete(userId);
    call.accepted.delete(userId);

    // Si se va quien llamó, deja de sonarle a quienes todavía no aceptaron.
    // Los que ya estaban dentro pueden seguir con el nuevo anfitrión.
    if (wasHost) {
      for (const id of [...call.peers]) {
        if (call.accepted.has(id)) continue;
        removeInvite(callId, id);
        io.to(`user:${id}`).emit('call:ended', { callId, by: userId, cancelled: true });
        for (const socket of socketsOf(id)) socket.leave(`call:${callId}`);
        call.peers.delete(id);
      }
      if (call.peers.size > 0) {
        call.hostId = [...call.accepted][0] || [...call.peers][0];
      }
    }

    io.to(`call:${callId}`).emit('call:left', {
      callId,
      userId,
      hostId: call.hostId,
      user: getUserById(userId) ? publicUser(getUserById(userId)) : null
    });
    if (call.peers.size === 0) endCall(callId, userId);
  }

  io.on('connection', (socket) => {
    const myId = socket.userId;

    addSocket(myId, socket.id);
    socket.join(`user:${myId}`);

    // El primer aviso lo dispara la app al informar su versión. Así un celular
    // ya actualizado no recibe un aviso espurio al reconectarse tras un deploy.

    // La app informa su versión: si sigue vieja, el server vuelve a mandar el aviso cada minuto.
    socket.on('app:version', (payload) => {
      const version = Number(payload?.versionCode) || 0;
      socket.appVersion = version;
      if (!forceUpdate) return;
      const state = updateState.get(myId) || { version: 0, timer: null };
      state.version = version;
      updateState.set(myId, state);
      if (version >= targetVersion) {
        stopUpdateReminders(myId);
        return;
      }
      if (!updateNoticeSent.has(myId)) {
        updateNoticeSent.add(myId);
        sendUpdateNotice(myId);
      }
      ensureUpdateReminders(myId);
    });

    for (const friendId of friendIds(myId)) {
      io.to(`user:${friendId}`).emit('presence:update', {
        userId: myId,
        online: isOnline(myId),
        status: getStatus(myId)
      });
    }
    for (const communityId of communityIdsFor(myId)) {
      socket.join(`community:${communityId}`);
    }
    // Si otro amigo ya autorizó compartir, entramos a su sala de ubicación.
    for (const ownerId of locationOwnersFor(myId)) {
      socket.join(`location:${ownerId}`);
    }

    // Mensajes que esperaban entrega: ahora que el destinatario está conectado,
    // marcarlos como entregados y avisar al emisor.
    for (const friendId of friendIds(myId)) {
      for (const message of markMessagesDelivered(dmRoom(myId, friendId), friendId)) {
        io.to(`user:${message.fromId}`).emit('dm:receipt', {
          room: message.room,
          ids: [message.id],
          deliveredAt: message.deliveredAt,
          readAt: null
        });
      }
    }

    socket.on('presence:status', (payload, callback) => {
      const allowed = new Set(['active', 'idle', 'dnd', 'sleep']);
      const status = allowed.has(payload?.status) ? payload.status : 'active';
      setStatus(myId, status);
      for (const friendId of friendIds(myId)) {
        io.to(`user:${friendId}`).emit('presence:update', {
          userId: myId,
          online: isOnline(myId),
          status
        });
      }
      if (typeof callback === 'function') callback(null, { status });
    });

    socket.on('dm:send', (payload, callback) => {
      const to = payload?.to || payload?.userId;
      const text = String(payload?.text || '');
      const fileId = payload?.fileId || null;
      if (!to || !areFriends(myId, to)) {
        if (typeof callback === 'function') callback({ error: 'No puedes enviar a este usuario.' });
        return;
      }
      const deliveredAt = isOnline(to) ? now() : null;
      const message = saveMessage(dmRoom(myId, to), myId, text, fileId, deliveredAt);
      io.to(`user:${myId}`).emit('dm:message', { room: message.room, message });
      io.to(`user:${to}`).emit('dm:message', { room: message.room, message });
      if (typeof callback === 'function') callback(null, message);
    });

    socket.on('dm:read', (payload, callback) => {
      const from = payload?.to || payload?.from || payload?.userId;
      if (!from || !areFriends(myId, from)) {
        if (typeof callback === 'function') callback({ error: 'No se puede marcar como leído.' });
        return;
      }
      const rawIds = payload?.ids;
      const ids = Array.isArray(rawIds)
        ? rawIds.filter((id) => typeof id === 'string').slice(0, 150)
        : [];
      const rows = markMessagesRead(dmRoom(myId, from), from, ids);
      for (const message of rows) {
        io.to(`user:${message.fromId}`).emit('dm:receipt', {
          room: message.room,
          ids: [message.id],
          deliveredAt: message.deliveredAt,
          readAt: message.readAt
        });
      }
      if (typeof callback === 'function') callback(null, { count: rows.length });
    });

    socket.on('community:send', (payload, callback) => {
      const communityId = payload?.communityId || payload?.to;
      const text = String(payload?.text || '');
      const fileId = payload?.fileId || null;
      if (!communityId || !isCommunityMember(myId, communityId)) {
        if (typeof callback === 'function') callback({ error: 'No eres miembro de esta comunidad.' });
        return;
      }
      const message = saveMessage(`community:${communityId}`, myId, text, fileId);
      io.to(`community:${communityId}`).emit('community:message', { communityId, message });
      if (typeof callback === 'function') callback(null, message);
    });

    socket.on('typing', (payload) => {
      const to = payload?.to || payload?.userId;
      if (!to || !areFriends(myId, to)) return;
      io.to(`user:${to}`).emit('typing', { from: myId, typing: Boolean(payload.typing) });
    });

    socket.on('community:join', (payload) => {
      const communityId = payload?.communityId || payload?.id;
      if (communityId && isCommunityMember(myId, communityId)) {
        socket.join(`community:${communityId}`);
      }
    });

    socket.on('call:invite', (payload, callback) => {
      const raw = payload?.to ?? payload?.peerId ?? [];
      const ids = [...new Set((Array.isArray(raw) ? raw : [raw])
        .map((id) => (typeof id === 'object' ? id?.id : id))
        .filter((id) => id && id !== myId && getUserById(id)))];
      if (ids.length === 0) {
        if (typeof callback === 'function') callback({ error: 'Selecciona al menos un amigo.' });
        return;
      }

      const existing = calls.get(payload?.callId);
      const currentSize = existing ? existing.peers.size : 1;
      const additions = ids.filter((id) => !existing?.peers.has(id)).length;
      if (currentSize + additions > MAX_CALL_PARTICIPANTS) {
        if (typeof callback === 'function') callback({ error: 'La sala admite hasta 5 participantes.' });
        return;
      }

      let call = existing;
      let callId;
      if (call) {
        callId = call.id;
        for (const id of ids) call.peers.add(id);
      } else {
        callId = uid();
        call = {
          id: callId,
          hostId: myId,
          peers: new Set([myId, ...ids]),
          accepted: new Set([myId]),
          video: payload?.video !== false,
          createdAt: now()
        };
        calls.set(callId, call);
      }

      for (const userId of call.peers) joinCallRoom(callId, userId);
      const invite = {
        callId,
        from: socket.user,
        hostId: call.hostId,
        peers: [...call.peers],
        video: call.video,
        at: now()
      }
      for (const userId of ids) {
        addInvite(userId, invite);
        io.to(`user:${userId}`).emit('call:invite', invite);
      }
      if (typeof callback === 'function') callback(null, callId);
    });

    socket.on('call:accept', (payload, callback) => {
      const callId = payload?.callId;
      const call = calls.get(callId);
      if (!call) {
        if (typeof callback === 'function') callback({ error: 'La llamada ya terminó.' });
        return;
      }
      if (!call.peers.has(myId)) {
        if (typeof callback === 'function') callback({ error: 'No fuiste invitado a esta llamada.' });
        return;
      }
      call.accepted.add(myId);
      joinCallRoom(callId, myId);
      io.to(`call:${callId}`).emit('call:ready', {
        callId,
        hostId: call.hostId,
        peers: [...call.accepted],
        accepted: [...call.accepted]
      });
      io.to(`user:${call.hostId}`).emit('call:accepted', {
        callId,
        userId: myId,
        user: socket.user
      });
      if (typeof callback === 'function') callback(null, { callId });
    });

    socket.on('call:reject', (payload) => {
      removeInvite(payload?.callId, myId);
      const call = calls.get(payload?.callId);
      if (!call) return;
      io.to(`user:${call.hostId}`).emit('call:rejected', {
        callId: call.id,
        userId: myId,
        user: socket.user
      });
      leaveCall(call.id, myId);
    });

    socket.on('call:signal', (payload) => {
      const callId = payload?.callId;
      const to = payload?.to;
      if (!calls.has(callId) || !to) return;
      io.to(`user:${to}`).emit('call:signal', {
        from: myId,
        callId,
        data: payload.data
      });
    });

    // Un participante que terminó de abrir cámara/micrófono pide renegociar:
    // así la oferta nunca se pierde si llegó antes de que su RTCPeerConnection existiera.
    socket.on('call:resync', (payload) => {
      const call = calls.get(payload?.callId);
      if (!call || !call.accepted.has(myId)) return;
      io.to(`call:${call.id}`).emit('call:ready', {
        callId: call.id,
        hostId: call.hostId,
        peers: [...call.accepted],
        accepted: [...call.accepted]
      });
    });

    socket.on('call:leave', (payload) => leaveCall(payload?.callId, myId));
    socket.on('call:left', (payload) => leaveCall(payload?.callId, myId));
    socket.on('call:ended', (payload) => endCall(payload?.callId, myId));

    socket.on('watch:join', (payload, callback) => {
      const key = String(payload?.key || 'general');
      socket.join(`watch:${key}`);
      const state = getWatchRoom(key);
      socket.emit('watch:state', state);
      if (typeof callback === 'function') callback(state);
    });

    socket.on('watch:sync', (payload, callback) => {
      const key = String(payload?.key || 'general');
      const state = saveWatchRoom({
        key,
        url: payload?.url || '',
        playing: Boolean(payload?.playing),
        position: payload?.position || 0,
        hostId: myId
      });
      socket.to(`watch:${key}`).emit('watch:state', state);
      if (typeof callback === 'function') callback(null, state);
    });

    socket.on('watch:reaction', (payload) => {
      const key = String(payload?.key || 'general');
      socket.to(`watch:${key}`).emit('watch:reaction', {
        key,
        emoji: String(payload?.emoji || '❤️').slice(0, 16),
        from: myId,
        at: now()
      });
    });

    // ---------- Ubicación compartida (siempre con permiso del dueño) ----------
    socket.on('location:request', (payload, ack) => {
      const ownerId = String(payload?.ownerId || '');
      const done = typeof ack === 'function' ? ack : () => {};
      if (!areFriends(myId, ownerId)) return done({ error: 'Solo puedes pedírselo a un amigo.' });
      io.to(`user:${ownerId}`).emit('location:request', {
        fromId: myId,
        from: publicUser(getUserById(myId)),
        at: now()
      });
      return done({ ok: true });
    });

    socket.on('location:permission', (payload, ack) => {
      const viewerId = String(payload?.viewerId || '');
      const allow = Boolean(payload?.allow);
      const done = typeof ack === 'function' ? ack : () => {};
      if (!areFriends(myId, viewerId)) return done({ error: 'Esa persona no es tu amiga.' });
      if (allow) setLocationShare(myId, viewerId);
      else removeLocationShare(myId, viewerId);

      for (const target of socketsOf(viewerId)) {
        if (allow) target.join(`location:${myId}`);
        else target.leave(`location:${myId}`);
      }
      io.to(`user:${viewerId}`).emit('location:permission', {
        ownerId: myId,
        allow,
        by: publicUser(getUserById(myId))
      });
      io.to(`user:${myId}`).emit('location:shares', {
        sharedWith: locationViewersFor(myId)
      });
      return done({ ok: true });
    });

    socket.on('location:revoke', (payload, ack) => {
      const viewerId = String(payload?.viewerId || '');
      const done = typeof ack === 'function' ? ack : () => {};
      removeLocationShare(myId, viewerId);
      for (const target of socketsOf(viewerId)) target.leave(`location:${myId}`);
      io.to(`user:${viewerId}`).emit('location:permission', {
        ownerId: myId,
        allow: false,
        by: publicUser(getUserById(myId))
      });
      io.to(`user:${myId}`).emit('location:shares', {
        sharedWith: locationViewersFor(myId)
      });
      return done({ ok: true });
    });

    socket.on('location:stopAll', (_payload, ack) => {
      const done = typeof ack === 'function' ? ack : () => {};
      const viewers = locationViewersFor(myId);
      removeAllLocationShares(myId);
      for (const viewerId of viewers) {
        for (const target of socketsOf(viewerId)) target.leave(`location:${myId}`);
        io.to(`user:${viewerId}`).emit('location:permission', {
          ownerId: myId,
          allow: false,
          by: publicUser(getUserById(myId))
        });
      }
      io.to(`user:${myId}`).emit('location:shares', { sharedWith: [] });
      return done({ ok: true });
    });

    socket.on('location:update', (payload, ack) => {
      const done = typeof ack === 'function' ? ack : () => {};
      const lat = Number(payload?.lat);
      const lng = Number(payload?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return done({ error: 'Coordenadas inválidas.' });
      }
      if (!locationViewersFor(myId).length) return done({ ok: true, viewers: 0 });

      const last = lastLocationAt.get(socket.id) || 0;
      if (Date.now() - last < 10 * 1000) return done({ ok: true, throttled: true });
      lastLocationAt.set(socket.id, Date.now());

      const position = {
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        accuracy: Math.max(0, Math.min(10000, Number(payload?.accuracy) || 0)),
        at: now()
      };
      saveLocation(myId, position);
      io.to(`location:${myId}`).emit('location:update', { ownerId: myId, position });
      return done({ ok: true, viewers: locationViewersFor(myId).length });
    });

    socket.on('location:latest', (payload, ack) => {
      const ownerId = String(payload?.ownerId || '');
      const done = typeof ack === 'function' ? ack : () => {};
      if (!canSeeLocation(myId, ownerId)) return done({ error: 'No tenés permiso para ver esta ubicación.' });
      return done({ ok: true, position: latestLocationFor(ownerId) });
    });

    socket.on('disconnect', () => {
      const wentOffline = removeSocket(myId, socket.id);
      lastLocationAt.delete(socket.id);
      if (wentOffline) {
        for (const friendId of friendIds(myId)) {
          io.to(`user:${friendId}`).emit('presence:update', {
            userId: myId,
            online: false,
            status: getStatus(myId)
          });
        }
      }
      for (const callId of [...calls.keys()]) {
        if (calls.get(callId)?.peers.has(myId)) leaveCall(callId, myId);
      }
    });
  });
}
