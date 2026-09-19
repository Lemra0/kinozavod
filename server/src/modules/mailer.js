// Minimal mailer. In development it does not send anything for real —
// it logs the message so the flow can be followed from the server console.
// A real SMTP/Ethereal transport can be plugged in later.

function render(order, kind, t) {
  const { movie, session } = order;
  const when = `${session.localDate} ${session.localTime}`;
  switch (kind) {
    case 'ticket':
      return {
        subject: t('email.ticket.subject', { title: movie.title }),
        text: t('email.ticket.text', { title: movie.title, when, hall: t(session.hall.nameKey) }),
      };
    case 'refund':
      return {
        subject: t('email.refund.subject', { title: movie.title }),
        text: t('email.refund.text', { title: movie.title }),
      };
    default:
      return { subject: 'KINOZAVOD', text: '' };
  }
}

export function createMailer({ log = console.log } = {}) {
  return {
    async send(order, kind, { t, link }) {
      const { subject, text } = render(order, kind, t);
      log(`\n[email → ${order.email}] ${subject}\n${text}\n${link ? `Link: ${link}\n` : ''}`);
      return { delivered: true };
    },
  };
}
