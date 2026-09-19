import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { myOrdersRequest } from '../../api/auth.js';
import { Empty, ErrorState, Loading } from '../States.jsx';
import { formatLongDate, formatPrice, formatTime } from '../../lib/format.js';
import styles from './Sections.module.css';

export function OrdersSection() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState({ status: 'loading', orders: [] });

  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let active = true;
    myOrdersRequest(i18n.language)
      .then((r) => active && setState({ status: 'done', orders: r.orders }))
      .catch(() => active && setState({ status: 'error', orders: [] }));
    return () => {
      active = false;
    };
  }, [i18n.language, reloadKey]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState onRetry={load} />;
  if (state.orders.length === 0) return <Empty>{t('account.noOrders')}</Empty>;

  return (
    <ul className={styles.orders}>
      {state.orders.map((order) => (
        <li key={order.id} className={styles.order}>
          <div className={styles.orderMain}>
            <span className={styles.orderMovie}>{order.movieTitle}</span>
            <span className={styles.orderMeta}>
              {formatLongDate(order.startTime.slice(0, 10), i18n.language)} ·{' '}
              {formatTime(order.startTime, i18n.language)} · {t(order.hallNameKey)} · {order.format}
            </span>
            <span className={styles.orderMeta}>
              {t('account.ticketCount', { count: order.ticketCount })} ·{' '}
              {formatPrice(order.total, i18n.language)}
            </span>
          </div>
          <div className={styles.orderSide}>
            <span className={`${styles.badge} ${styles[`badge_${order.status}`] ?? ''}`}>
              {t(`order.status${order.status[0].toUpperCase()}${order.status.slice(1)}`)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
