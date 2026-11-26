import { io } from 'socket.io-client';
import { getServerUrl } from './config.js';

let socket = null;

export function connectSocket(token) {
  if (socket?.connected && socket.auth?.token === token) return socket;
  if (socket) socket.disconnect();

  socket = io(getServerUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 800
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) socket.disconnect();
  socket = null;
}
