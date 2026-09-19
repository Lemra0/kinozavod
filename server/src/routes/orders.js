import { Router } from 'express';
import { z } from 'zod';
import { RULES } from '@kinozavod/shared';
import { ApiError } from '../errors.js';
import { langOf, parseId, parseQuery } from '../http.js';
import { getSeatMap, suggestSeats } from '../modules/seatmap.js';
import {
  createOrder,
  getOrderView,
  payOrder,
  refundOrder,
  releaseExpiredOrders,
} from '../modules/orders.js';
import { parseIsikukood } from '../modules/isikukood.js';
import { qrSvg } from '../modules/qr.js';
import { buildIcs, googleCalendarUrl } from '../modules/calendar.js';
import { makeEmailTranslator } from '../i18n.js';

const createSchema = z.object({
  sessionId: z.number().int().positive(),
  seatIds: z.array(z.number().int().positive()).min(1).max(RULES.maxSeatsPerOrder),
  // Buyer fields are required for guests; for signed-in users they come from the profile.
  email: z.string().email().optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  locale: z.enum(['en', 'ru', 'et']).optional(),
  isikukood: z.string().optional(),
});

const paySchema = z.object({
  cardNumber: z.string().min(12).max(23),
});

const suggestSchema = z.object({
  count: z.coerce.number().int().min(1).max(RULES.maxSeatsPerOrder),
  type: z.enum(['any', 'standard', 'vip', 'sofa']).optional(),
});

export function ordersRouter({ db, mailer }) {
  const router = Router();

  // Seat map for a session.
  router.get('/sessions/:id/seats', (req, res) => {
    releaseExpiredOrders(db);
    const map = getSeatMap(db, parseId(req.params.id), langOf(req));
    if (!map) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found');
    res.json(map);
  });

  // Auto-pick seats.
  router.get('/sessions/:id/best-seats', (req, res) => {
    releaseExpiredOrders(db);
    const { count, type } = parseQuery(suggestSchema, req);
    const suggestions = suggestSeats(db, parseId(req.params.id), { viewers: count, type });
    res.json({ suggestions });
  });

  // Create an order (reserve seats).
  router.post('/orders', (req, res) => {
    const body = createSchema.parse(req.body);
    let birthDate;
    let ageVerified = false;

    // Signed-in users: buyer details and age come from the verified profile.
    let email = body.email;
    let firstName = body.firstName;
    let lastName = body.lastName;
    if (req.user) {
      email = req.user.email;
      firstName = req.user.first_name;
      lastName = req.user.last_name;
      birthDate = req.user.birth_date;
      ageVerified = false; // 'profile' age check, not isikukood
    } else if (body.isikukood) {
      const parsed = parseIsikukood(body.isikukood);
      if (!parsed.valid) throw new ApiError(400, 'INVALID_ISIKUKOOD', 'Invalid personal code');
      birthDate = parsed.birthDate;
      ageVerified = true;
    }

    if (!email || !firstName || !lastName) {
      throw new ApiError(400, 'BUYER_REQUIRED', 'Name and email are required');
    }

    const result = createOrder(db, {
      sessionId: body.sessionId,
      seatIds: body.seatIds,
      email,
      firstName,
      lastName,
      locale: body.locale ?? req.user?.locale ?? langOf(req),
      birthDate,
      ageVerified,
      userId: req.user?.id ?? null,
    });

    res.status(201).json({
      orderId: result.orderId,
      token: result.token,
      total: result.total,
      expiresAt: result.expiresAt,
    });
  });

  // Pay for an order (demo).
  router.post('/orders/:id/pay', async (req, res) => {
    const body = paySchema.parse(req.body);
    const orderId = parseId(req.params.id);
    payOrder(db, orderId, { cardNumber: body.cardNumber });

    const order = getOrderView(db, orderId, { skipToken: true, lang: langOf(req) });
    const t = makeEmailTranslator(order.locale);
    const link = `${req.app.get('clientUrl')}/orders/${orderId}?token=${req.query.token ?? ''}`;
    mailer.send(order, 'ticket', { t, link }).catch(() => {});

    res.json({ status: 'paid' });
  });

  // View an order (guest by token, or internal with skip).
  router.get('/orders/:id', async (req, res) => {
    const orderId = parseId(req.params.id);
    const order = getOrderView(db, orderId, { token: req.query.token, lang: langOf(req) });

    // Attach QR codes for valid tickets.
    for (const ticket of order.tickets) {
      if (ticket.status === 'valid' || ticket.status === 'used') {
        ticket.qr = await qrSvg(ticket.code);
      }
    }
    order.calendar = { google: googleCalendarUrl(order, { t: makeEmailTranslator(order.locale) }) };
    res.json(order);
  });

  // Refund an order.
  router.post('/orders/:id/refund', (req, res) => {
    const orderId = parseId(req.params.id);
    const order = getOrderView(db, orderId, { token: req.query.token, lang: langOf(req) });
    refundOrder(db, orderId);

    const t = makeEmailTranslator(order.locale);
    mailer.send({ ...order, status: 'refunded' }, 'refund', { t }).catch(() => {});
    res.json({ status: 'refunded' });
  });

  // Calendar file.
  router.get('/orders/:id/calendar.ics', (req, res) => {
    const orderId = parseId(req.params.id);
    const order = getOrderView(db, orderId, { token: req.query.token, lang: langOf(req) });
    const ics = buildIcs(order, { t: makeEmailTranslator(order.locale) });
    res
      .type('text/calendar; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="kinozavod-${orderId}.ics"`)
      .send(ics);
  });

  return router;
}
