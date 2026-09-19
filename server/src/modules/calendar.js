import { CINEMA } from '@kinozavod/shared';

function icsDate(iso) {
  // UTC form: 20260918T183000Z
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function escapeIcs(text) {
  return String(text ?? '')
    .replace(/([,;\\])/g, '\\$1')
    .replace(/\n/g, '\\n');
}

/**
 * Builds an .ics calendar event for an order, with a 1-hour reminder.
 * `order` is the object from getOrderView().
 */
export function buildIcs(order, { t }) {
  const { session, movie, tickets } = order;
  const seats = tickets
    .map((tk) => `${t('ticket.row')} ${tk.row}, ${t('ticket.seat')} ${tk.number}`)
    .join('; ');
  const description = [`${t(session.hall.nameKey)}, ${session.format}`, seats, CINEMA.address].join(
    '\\n',
  );

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KINOZAVOD//Tickets//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:kinozavod-order-${order.id}@kinozavod.local`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(session.startTime)}`,
    `DTEND:${icsDate(session.endTime)}`,
    `SUMMARY:${escapeIcs(movie.title)} — KINOZAVOD`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(CINEMA.address)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(movie.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  // ICS lines are CRLF-separated.
  return lines.join('\r\n');
}

/** Google Calendar "add event" URL. */
export function googleCalendarUrl(order, { t }) {
  const { session, movie } = order;
  const fmt = (iso) => icsDate(iso);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${movie.title} — KINOZAVOD`,
    dates: `${fmt(session.startTime)}/${fmt(session.endTime)}`,
    details: `${t(session.hall.nameKey)}, ${session.format}`,
    location: CINEMA.address,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
