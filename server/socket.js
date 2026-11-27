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
  uid,
  now
} from './db.js';
import { addSocket, removeSocket, onlineUsers, isOnline, getStatus, setStatus } from './presence.js';

export function setupSocket(io) {
  const calls = new Map();

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
    const call = calls.get(callId);
    if (!call) return;
    io.to(`call:${callId}`).emit('call:ended', { callId, by: by || null });
    for (const userId of call.peers) {
      for (const socket of socketsOf(userId)) socket.leave(`call:${callId}`);
    }
    calls.delete(callId);
  }

  function leaveCall(callId, userId) {
    const call = calls.get(callId);
    if (!call) return;
    call.peers.delete(userId);
    call.accepted.delete(userId);
    io.to(`call:${callId}`).emit('call:left', { callId, userId });
    if (call.peers.size === 0 || !call.peers.has(call.hostId)) endCall(callId, userId);
  }

  io.on('connection', (socket) => {
    const myId = socket.userId;

    addSocket(myId, socket.id);
    socket.join(`user:${myId}`);

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
      const ids = (Array.isArray(raw) ? raw : [raw])
        .map((id) => (typeof id === 'object' ? id?.id : id))
        .filter((id) => id && id !== myId && getUserById(id));
      if (ids.length === 0) {
        if (typeof callback === 'function') callback({ error: 'Selecciona al menos un amigo.' });
        return;
      }

      let call = calls.get(payload?.callId);
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
        peers: [...call.peers],
        video: call.video,
        at: now()
      };
      for (const userId of ids) io.to(`user:${userId}`).emit('call:invite', invite);
      if (typeof callback === 'function') callback(null, callId);
    });

    socket.on('call:accept', (payload, callback) => {
      const callId = payload?.callId;
      const call = calls.get(callId);
      if (!call) {
        if (typeof callback === 'function') callback({ error: 'La llamada ya terminó.' });
        return;
      }
      call.accepted.add(myId);
      joinCallRoom(callId, myId);
      io.to(`call:${callId}`).emit('call:ready', {
        callId,
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

    socket.on('disconnect', () => {
      const wentOffline = removeSocket(myId, socket.id);
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
