import { staffOrder } from '../api/staff.js';
import { formatLongDate, formatTime, formatPrice, hallNumber } from '../lib/format.js';

const LAYOUT_KEY = 'kz-print-layout';

export function getPrintLayout() {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'a4' ? 'a4' : 'receipt';
  } catch {
    return 'receipt';
  }
}

export function setPrintLayout(layout) {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    /* ignore */
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function ticketHtml(order, ticket, { t, lang }) {
  const { session, movie } = order;
  return `
    <article class="ticket">
      <div class="head">
        <span class="brand">KINOZAVOD</span>
        <span class="code">${escapeHtml(ticket.code)}</span>
      </div>
      <h2>${escapeHtml(movie.title)}</h2>
      <div class="grid">
        <div><span>${escapeHtml(t('ticket.hall'))}</span><b>${hallNumber(session.hall.code)}</b></div>
        <div><span>${escapeHtml(t('ticket.row'))}</span><b>${ticket.row}</b></div>
        <div><span>${escapeHtml(t('ticket.seat'))}</span><b>${ticket.number}</b></div>
        <div><span>${escapeHtml(t('ticket.start'))}</span><b>${formatTime(session.startTime, lang)}</b></div>
      </div>
      <p class="meta">${escapeHtml(formatLongDate(session.localDate, lang))} · ${session.format}${
        movie.ageRating ? ` · ${escapeHtml(movie.ageRating)}` : ''
      }</p>
      <p class="meta">${escapeHtml(t('session.price'))}: ${escapeHtml(formatPrice(ticket.price, lang))}</p>
      ${order.buyer?.firstName ? `<p class="buyer">${escapeHtml(order.buyer.firstName)} ${escapeHtml(order.buyer.lastName ?? '')}</p>` : ''}
      <div class="qr">${ticket.qr ?? ''}</div>
    </article>`;
}

function documentHtml(order, layout, ctx) {
  const printable = order.tickets.filter((tk) => tk.status === 'valid' || tk.status === 'used');
  const tickets = printable.map((tk) => ticketHtml(order, tk, ctx)).join('');
  const receipt = layout === 'receipt';
  const css = `
    * { box-sizing: border-box; }
    body { font-family: 'IBM Plex Sans', system-ui, sans-serif; margin: 0; color: #111; }
    .ticket { padding: 10mm; border-bottom: 1px dashed #999; page-break-inside: avoid; }
    .head { display: flex; justify-content: space-between; align-items: baseline; }
    .brand { font-weight: 700; letter-spacing: 0.06em; }
    .code { font-family: monospace; font-size: 12px; }
    h2 { font-size: 18px; margin: 6px 0 10px; }
    .grid { display: flex; gap: 14px; }
    .grid span { display: block; font-size: 10px; color: #666; text-transform: uppercase; }
    .grid b { font-size: 22px; }
    .meta { margin: 6px 0 0; font-size: 12px; color: #444; }
    .buyer { margin: 4px 0 0; font-size: 13px; font-weight: 600; }
    .qr { margin-top: 8px; width: 90px; height: 90px; }
    .qr svg { width: 100%; height: 100%; }
    @media print { .ticket { page-break-after: always; } }
    ${
      receipt
        ? '@page { size: 80mm auto; margin: 0; } body { width: 80mm; } .grid b { font-size: 18px; }'
        : '@page { size: A4; margin: 12mm; } .ticket { border: 1px solid #ccc; margin-bottom: 8mm; }'
    }
  `;
  return `<!doctype html><html><head><meta charset="utf-8"><title>KINOZAVOD — ${escapeHtml(order.movie.title)}</title><style>${css}</style></head><body>${tickets}<script>window.onload=()=>{window.print();}</script></body></html>`;
}

/** Loads an order and opens a print window in the saved layout. */
export async function openPrintWindow(orderId, ctx) {
  const order = await staffOrder(orderId, ctx.lang);
  const layout = getPrintLayout();
  const win = window.open('', '_blank', 'width=420,height=640');
  if (!win) return; // popup blocked; caller can show a hint
  win.document.write(documentHtml(order, layout, ctx));
  win.document.close();
}
