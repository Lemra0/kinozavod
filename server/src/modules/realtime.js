import { Server } from 'socket.io';
import { seatEvents } from './events.js';

const ROOM = (sessionId) => `session:${sessionId}`;
const MAX_ROOMS_PER_SOCKET = 5;

/**
 * Attaches a Socket.IO server that broadcasts seat-status changes.
 * Clients emit `session:join` / `session:leave` with a sessionId and
 * receive `seats:update` events for the session they are viewing.
 */
export function attachRealtime(httpServer, { config }) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: config.env === 'production' ? undefined : { origin: config.clientUrl, credentials: true },
    serveClient: false,
  });

  io.on('connection', (socket) => {
    socket.on('session:join', (sessionId) => {
      const id = Number(sessionId);
      if (!Number.isInteger(id) || id <= 0) return;
      // A viewer only needs a few rooms; guard against a client flooding joins.
      const joined = [...socket.rooms].filter((r) => r.startsWith('session:'));
      if (joined.length >= MAX_ROOMS_PER_SOCKET) return;
      socket.join(ROOM(id));
    });

    socket.on('session:leave', (sessionId) => {
      const id = Number(sessionId);
      if (Number.isInteger(id)) socket.leave(ROOM(id));
    });
  });

  // Relay seat changes from the in-process bus to the right room.
  const onSeats = ({ sessionId, changes }) => {
    io.to(ROOM(sessionId)).emit('seats:update', { sessionId, changes });
  };
  seatEvents.on('seats', onSeats);

  return {
    io,
    close: () => {
      seatEvents.off('seats', onSeats);
      return io.close();
    },
  };
}
