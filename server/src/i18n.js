// Tiny server-side translator for e-mails and .ics files.
// Only the strings the server itself produces live here; the UI has its own i18n.

const STRINGS = {
  en: {
    'ticket.row': 'row',
    'ticket.seat': 'seat',
    'email.ticket.subject': 'Your KINOZAVOD ticket: {title}',
    'email.ticket.text':
      'Thank you for your purchase. {title}, {when}, {hall}. Show the QR code at the entrance.',
    'email.refund.subject': 'Refund for {title}',
    'email.refund.text': 'Your order for {title} has been refunded.',
    'halls.p1': 'Pavilion 1',
    'halls.p2': 'Pavilion 2',
    'halls.p3': 'Pavilion 3',
  },
  ru: {
    'ticket.row': 'ряд',
    'ticket.seat': 'место',
    'email.ticket.subject': 'Ваш билет в KINOZAVOD: {title}',
    'email.ticket.text': 'Спасибо за покупку. {title}, {when}, {hall}. Покажите QR-код на входе.',
    'email.refund.subject': 'Возврат за {title}',
    'email.refund.text': 'Ваш заказ на «{title}» возвращён.',
    'halls.p1': 'Павильон 1',
    'halls.p2': 'Павильон 2',
    'halls.p3': 'Павильон 3',
  },
  et: {
    'ticket.row': 'rida',
    'ticket.seat': 'koht',
    'email.ticket.subject': 'Sinu KINOZAVODi pilet: {title}',
    'email.ticket.text': 'Täname ostu eest. {title}, {when}, {hall}. Näita sissepääsul QR-koodi.',
    'email.refund.subject': 'Tagastus: {title}',
    'email.refund.text': 'Sinu tellimus filmile „{title}“ on tagastatud.',
    'halls.p1': 'Paviljon 1',
    'halls.p2': 'Paviljon 2',
    'halls.p3': 'Paviljon 3',
  },
};

export function makeEmailTranslator(locale) {
  const table = STRINGS[locale] ?? STRINGS.en;
  return (key, vars = {}) => {
    let text = table[key] ?? STRINGS.en[key] ?? key;
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
    }
    return text;
  };
}
