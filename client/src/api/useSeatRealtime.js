import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from './socket.js';

/**
 * Subscribes to live seat-status changes for a session and patches the
 * cached seat map in place, so the hall updates without a refetch.
 * Seats the current viewer has selected are not overwritten by 'held'
 * events (those are this viewer's own holds echoed back).
 */
export function useSeatRealtime(sessionId, { selectedIds } = {}) {
  const queryClient = useQueryClient();
  // Keep the latest selection in a ref so the event handler always sees it
  // without re-subscribing on every click.
  const selectedRef = useRef(selectedIds);
  useEffect(() => {
    selectedRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    if (!sessionId) return undefined;
    const socket = getSocket();

    const join = () => socket.emit('session:join', sessionId);
    join();
    socket.on('connect', join);

    const onUpdate = (payload) => {
      if (Number(payload.sessionId) !== Number(sessionId)) return;
      queryClient.setQueryData(['seats', sessionId], (map) => {
        if (!map) return map;
        const selected = selectedRef.current;
        const byId = new Map(payload.changes.map((c) => [c.seatId, c.status]));
        let changed = false;
        const seats = map.seats.map((seat) => {
          if (!byId.has(seat.id)) return seat;
          const status = byId.get(seat.id);
          if (selected?.has(seat.id) && status === 'held') return seat;
          if (seat.status === status) return seat;
          changed = true;
          return { ...seat, status };
        });
        return changed ? { ...map, seats } : map;
      });
    };

    socket.on('seats:update', onUpdate);
    return () => {
      socket.emit('session:leave', sessionId);
      socket.off('seats:update', onUpdate);
      socket.off('connect', join);
    };
  }, [sessionId, queryClient]);
}
