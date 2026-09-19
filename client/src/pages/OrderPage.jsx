import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { refundOrderRequest, useOrder } from '../api/queries.js';
import { Ticket } from '../components/Ticket.jsx';
import { Button } from '../components/Button.jsx';
import { HoldTimer } from '../components/HoldTimer.jsx';
import { ErrorState, Loading } from '../components/States.jsx';
import { formatPrice } from '../lib/format.js';
import styles from './OrderPage.module.css';

const STATUS_STAMP = {
  paid: 'order.statusPaid',
  refunded: 'order.statusRefunded',
  pending: 'order.statusPending',
  expired: 'order.statusExpired',
  failed: 'order.statusFailed',
};

export function OrderPage() {
  const { orderId } = useParams();
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { data: order, isPending, isError, error, refetch } = useOrder(Number(orderId), token);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState(null);

  useEffect(() => {
    if (order) document.title = `${t('order.title')} · KINOZAVOD`;
  }, [order, t]);

  if (!token) {
    return (
      <div className={`container ${styles.page}`}>
        <p className={styles.notice}>{t('order.noToken')}</p>
      </div>
    );
  }
  if (isPending)
    return (
      <div className="container">
        <Loading />
      </div>
    );
  if (isError) {
    const text = error.status === 403 || error.status === 404 ? t('order.notFound') : null;
    return (
      <div className={`container ${styles.page}`}>
        {text ? <p className={styles.notice}>{text}</p> : <ErrorState onRetry={refetch} />}
      </div>
    );
  }

  const refund = async () => {
    setRefunding(true);
    setRefundError(null);
    try {
      await refundOrderRequest(Number(orderId), token);
      refetch();
    } catch (err) {
      setRefundError(err);
    } finally {
      setRefunding(false);
    }
  };

  const icsUrl = `/api/orders/${orderId}/calendar.ics?token=${encodeURIComponent(token)}`;
  const paid = order.status === 'paid';

  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('order.title')}</h1>
        <span className={`${styles.stamp} ${styles[`stamp_${order.status}`] ?? ''}`}>
          {t(STATUS_STAMP[order.status] ?? 'order.statusPending')}
        </span>
      </header>

      {order.status === 'pending' && (
        <div className={styles.pending}>
          <HoldTimer expiresAt={order.expiresAt} onExpire={refetch} />
          <Button variant="primary" to={`/checkout/${order.session.id}?seats=`}>
            {t('order.finishPayment')}
          </Button>
        </div>
      )}

      {paid && (
        <>
          <div className={styles.actions}>
            <a className={styles.calendarBtn} href={icsUrl}>
              {t('order.addToCalendar')}
            </a>
            {order.calendar?.google && (
              <a
                className={styles.calendarBtn}
                href={order.calendar.google}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Calendar
              </a>
            )}
          </div>

          <div className={styles.tickets}>
            {order.tickets.map((ticket) => (
              <Ticket key={ticket.id} order={order} ticket={ticket} />
            ))}
          </div>

          <div className={styles.footer}>
            <p className={styles.total}>
              {t('checkout.total')}: <b>{formatPrice(order.total, i18n.language)}</b>
            </p>
            {order.canRefund && (
              <div className={styles.refund}>
                <Button variant="secondary" onClick={refund} disabled={refunding}>
                  {refunding ? t('order.refunding') : t('order.refund')}
                </Button>
                <span className={styles.refundNote}>{t('order.refundNote')}</span>
              </div>
            )}
            {refundError && (
              <p className={styles.error} role="alert">
                {t([`errors.${refundError.code}`, 'errors.generic'])}
              </p>
            )}
          </div>
        </>
      )}

      {order.status === 'refunded' && <p className={styles.notice}>{t('order.refundedNote')}</p>}
      {(order.status === 'expired' || order.status === 'failed') && (
        <div className={styles.notice}>
          <p>{t('order.expiredNote')}</p>
          <Button variant="primary" to={`/seats/${order.session.id}`}>
            {t('checkout.backToSeats')}
          </Button>
        </div>
      )}
    </div>
  );
}
