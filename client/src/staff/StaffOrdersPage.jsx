import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { staffRefund, staffSearchOrders } from '../api/staff.js';
import { openPrintWindow } from './print.js';
import { Empty } from '../components/States.jsx';
import { formatLongDate, formatPrice, formatTime } from '../lib/format.js';
import styles from './StaffOrders.module.css';

export function StaffOrdersPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  useEffect(() => {
    document.title = `${t('staff.nav.orders')} · KINOZAVOD`;
  }, [t]);

  const search = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await staffSearchOrders(query, lang);
      setOrders(r.orders);
    } finally {
      setBusy(false);
    }
  };

  const refund = async (order) => {
    const cash = order.channel === 'box_office';
    const message = cash ? t('staff.orders.refundCashConfirm') : t('staff.orders.refundConfirm');
    if (!window.confirm(message)) return;
    try {
      await staffRefund(order.id);
      setNote(t('staff.orders.refunded'));
      search();
    } catch (err) {
      setNote(t([`errors.${err.code}`, 'errors.generic']));
    }
  };

  const reprint = (order) => openPrintWindow(order.id, { t, lang });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('staff.orders.title')}</h1>
      <form className={styles.searchRow} onSubmit={search}>
        <input
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('staff.orders.searchPlaceholder')}
          autoFocus
        />
        <button type="submit" className={styles.searchBtn} disabled={busy}>
          {t('staff.orders.search')}
        </button>
      </form>

      {note && <p className={styles.note}>{note}</p>}
      {orders && orders.length === 0 && <Empty>{t('staff.orders.none')}</Empty>}

      <ul className={styles.list}>
        {orders?.map((order) => (
          <li key={order.id} className={styles.order}>
            <div className={styles.info}>
              <span className={styles.orderId}>#{order.id}</span>
              <span className={styles.movie}>{order.movieTitle}</span>
              <span className={styles.meta}>
                {formatLongDate(order.startTime.slice(0, 10), lang)} ·{' '}
                {formatTime(order.startTime, lang)}
                {' · '}
                {t(order.hallNameKey)} · {order.format}
              </span>
              <span className={styles.meta}>
                {t('staff.orders.tickets', { n: order.ticketCount })} ·{' '}
                {formatPrice(order.total, lang)}
                {' · '}
                {order.channel === 'box_office'
                  ? t('staff.orders.atDesk')
                  : t('staff.orders.online')}
                {order.email ? ` · ${order.email}` : ''}
              </span>
            </div>
            <div className={styles.actions}>
              <span className={`${styles.badge} ${styles[`badge_${order.status}`] ?? ''}`}>
                {t(`order.status${order.status[0].toUpperCase()}${order.status.slice(1)}`)}
              </span>
              {order.status === 'paid' && (
                <>
                  <button type="button" className={styles.action} onClick={() => reprint(order)}>
                    {t('staff.orders.reprint')}
                  </button>
                  <button type="button" className={styles.action} onClick={() => refund(order)}>
                    {t('staff.orders.refund')}
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
