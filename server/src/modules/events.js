import { EventEmitter } from 'node:events';

/**
 * Process-wide bus for seat-status changes.
 * orders.js publishes here; realtime.js subscribes and pushes to clients.
 * Keeping this separate means the order logic has no dependency on sockets
 * and stays testable without a running server.
 */
export const seatEvents = new EventEmitter();
// Many sockets can listen; lift the default warning ceiling.
seatEvents.setMaxListeners(0);

/**
 * Announce that some seats of a session changed status.
 * @param {number} sessionId
 * @param {Array<{seatId:number,status:'free'|'held'|'sold'}>} changes
 */
export function emitSeatChanges(sessionId, changes) {
  if (changes.length === 0) return;
  seatEvents.emit('seats', { sessionId, changes });
}
