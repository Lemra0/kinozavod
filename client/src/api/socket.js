import { io } from 'socket.io-client';

let socket = null;

/** Lazily creates the shared Socket.IO connection. */
export function getSocket() {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}
