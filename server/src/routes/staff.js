import { Router } from 'express';
import { z } from 'zod';
import { RULES } from '@kinozavod/shared';
import { ApiError } from '../errors.js';
import { langOf, parseId } from '../http.js';
import { requireRole } from '../middleware/auth.js';
import { getSeatMap } from '../modules/seatmap.js';
import { getOrderView, refundOrder } from '../modules/orders.js';
import { qrSvg } from '../modules/qr.js';
import {
  lookupTicket,
  searchOrders,
  sellAtBoxOffice,
  shiftSummary,
  todaySessions,
  useTicket,
} from '../modules/boxoffice.js';

const sellSchema = z.object({
  sessionId: z.number().int().positive(),
  seatIds: z.array(z.number().int().positive()).min(1).max(RULES.maxSeatsPerOrder),
  method: z.enum(['cash', 'card_terminal']),
  email: z.string().email().optional().nullable(),
  firstName: z.string().trim().max(80).optional().nullable(),
  lastName: z.string().trim().max(80).optional().nullable(),
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Box office / controller endpoints. Requires the cashier or admin role. */
export function staffRouter({ db }) {
  const router = Router();
  router.use(requireRole('cashier', 'admin'));

  // Today's sessions to sell.
  router.get('/sessions', (req, res) => {
    res.json({ sessions: todaySessions(db, { lang: langOf(req) }) });
  });

  // Live seat map (same as the public one — realtime already covers it).
  router.get('/sessions/:id/seats', (req, res) => {
    const map = getSeatMap(db, parseId(req.params.id), langOf(req));
    if (!map) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found');
    res.json(map);
  });

  // Sell seats at the desk.
  router.post('/orders', (req, res) => {
    const body = sellSchema.parse(req.body);
    const result = sellAtBoxOffice(db, { ...body, cashierId: req.user.id }, new Date());
    res.status(201).json(result);
  });

  // Search orders (id / email / ticket code).
  router.get('/orders', (req, res) => {
    const query = String(req.query.q ?? '');
    res.json({ orders: searchOrders(db, query, { lang: langOf(req) }) });
  });

  // Full order with QR codes, for the desk (no access token needed).
  router.get('/orders/:id', async (req, res) => {
    const order = getOrderView(db, parseId(req.params.id), { skipToken: true, lang: langOf(req) });
    for (const ticket of order.tickets) {
      if (ticket.status === 'valid' || ticket.status === 'used')
        ticket.qr = await qrSvg(ticket.code);
    }
    res.json(order);
  });

  // Refund at the desk (cash refunds are marked "money handed over" client-side).
  router.post('/orders/:id/refund', (req, res) => {
    refundOrder(db, parseId(req.params.id));
    res.json({ status: 'refunded' });
  });

  // Check a ticket without changing it.
  router.get('/tickets/:code', (req, res) => {
    res.json(lookupTicket(db, req.params.code, { lang: langOf(req) }));
  });

  // Admit: mark a valid ticket as used.
  router.post('/tickets/:code/use', (req, res) => {
    const result = useTicket(db, req.params.code, { cashierId: req.user.id, now: new Date() });
    res.json(result);
  });

  // Shift summary for a day (defaults to today).
  router.get('/shift-summary', (req, res) => {
    const date = req.query.date ? dateSchema.parse(req.query.date) : undefined;
    res.json(shiftSummary(db, { date }));
  });

  return router;
}
