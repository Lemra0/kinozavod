import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AGE_RATINGS, ageOn } from '@kinozavod/shared';
import { useAuth } from '../auth/context.js';
import { createOrderRequest, payOrderRequest, useSeatMap } from '../api/queries.js';
import { useSeatRealtime } from '../api/useSeatRealtime.js';
import { AgeBadge } from '../components/AgeBadge.jsx';
import { Button } from '../components/Button.jsx';
import { HoldTimer } from '../components/HoldTimer.jsx';
import { ErrorState, Loading } from '../components/States.jsx';
import { formatLongDate, formatPrice, formatTime } from '../lib/format.js';
import styles from './CheckoutPage.module.css';

// Two demo cards, shown to the user so they can test both outcomes.
const DEMO_CARD_OK = '4111 1111 1111 1111';
const DEMO_CARD_FAIL = '4000 0000 0000 0000';

export function CheckoutPage() {
  const { sessionId } = useParams();
  const id = Number(sessionId);
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const seatIds = useMemo(
    () => (params.get('seats') || '').split(',').map(Number).filter(Boolean),
    [params],
  );

  const { data: map, isPending, isError, refetch } = useSeatMap(id);
  useSeatRealtime(id);

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
  const [isikukood, setIsikukood] = useState('');
  const [order, setOrder] = useState(null); // { orderId, token, total, expiresAt }
  const [card, setCard] = useState(DEMO_CARD_OK);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `${t('checkout.title')} · KINOZAVOD`;
  }, [t]);

  if (isPending)
    return (
      <div className="container">
        <Loading />
      </div>
    );
  if (isError)
    return (
      <div className="container">
        <ErrorState onRetry={refetch} />
      </div>
    );

  const seats = map.seats.filter((s) => seatIds.includes(s.id));
  const total = seats.reduce((sum, s) => sum + s.price, 0);
  const rating = AGE_RATINGS[map.ageRating];
  const restricted = Boolean(rating?.restricted);
  const userTooYoung = user && restricted && ageOn(user.birthDate, map.localDate) < rating.minAge;

  if (seats.length === 0 && !order) {
    return (
      <div className={`container ${styles.page}`}>
        <p className={styles.gone}>{t('checkout.seatsGone')}</p>
        <Button variant="primary" to={`/seats/${id}`}>
          {t('checkout.backToSeats')}
        </Button>
      </div>
    );
  }

  const reserve = async (event) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = { sessionId: id, seatIds, locale: i18n.language };
      if (!user) {
        payload.email = form.email;
        payload.firstName = form.firstName;
        payload.lastName = form.lastName;
        if (restricted) payload.isikukood = isikukood.replace(/\s/g, '');
      }
      const created = await createOrderRequest(payload);
      setOrder(created);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    setError(null);
    setBusy(true);
    try {
      await payOrderRequest(order.orderId, order.token, card.replace(/\s/g, ''));
      navigate(`/orders/${order.orderId}?token=${encodeURIComponent(order.token)}`);
    } catch (err) {
      setError(err);
      if (err.code === 'PAYMENT_DECLINED' || err.code === 'ORDER_EXPIRED') {
        // seats were released; send the buyer back to choose again
        setOrder(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const errorText = error ? t([`errors.${error.code}`, 'errors.generic']) : null;

  return (
    <div className={`container ${styles.page}`}>
      <h1 className={styles.title}>{t('checkout.title')}</h1>

      <div className={styles.layout}>
        <div className={styles.main}>
          {!order ? (
            <form className={styles.form} onSubmit={reserve}>
              <h2 className={styles.sectionTitle}>{t('checkout.buyer')}</h2>

              {user ? (
                <p className={styles.asUser}>
                  {t('checkout.asUser', { name: `${user.firstName} ${user.lastName}` })}
                  <br />
                  <span className={styles.muted}>{user.email}</span>
                </p>
              ) : (
                <>
                  <div className={styles.row}>
                    <label className={styles.field}>
                      <span>{t('checkout.firstName')}</span>
                      <input
                        required
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>{t('checkout.lastName')}</span>
                      <input
                        required
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className={styles.field}>
                    <span>{t('checkout.email')}</span>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </label>
                </>
              )}

              {rating && !restricted && rating.minAge > 0 && (
                <p className={styles.recommend}>{t('movie.recommended', { age: rating.minAge })}</p>
              )}

              {restricted && user && (
                <div className={styles.ageBox}>
                  <h3 className={styles.ageTitle}>
                    <AgeBadge rating={map.ageRating} />{' '}
                    {t('checkout.ageTitle', { age: rating.minAge })}
                  </h3>
                  <p className={styles.demoNote}>
                    {userTooYoung ? t('checkout.profileTooYoung') : t('checkout.ageFromProfile')}
                  </p>
                </div>
              )}

              {restricted && !user && (
                <div className={styles.ageBox}>
                  <h3 className={styles.ageTitle}>
                    <AgeBadge rating={map.ageRating} />{' '}
                    {t('checkout.ageTitle', { age: rating.minAge })}
                  </h3>
                  <p className={styles.demoNote}>{t('checkout.isikukoodDemo')}</p>
                  <label className={styles.field}>
                    <span>{t('checkout.isikukood')}</span>
                    <input
                      inputMode="numeric"
                      placeholder="50001010017"
                      value={isikukood}
                      onChange={(e) => setIsikukood(e.target.value)}
                      required
                    />
                  </label>
                </div>
              )}

              {errorText && (
                <p className={styles.error} role="alert">
                  {errorText}
                </p>
              )}

              <Button variant="primary" type="submit" disabled={busy || userTooYoung}>
                {busy ? t('checkout.reserving') : t('checkout.toPayment')}
              </Button>

              {!user && (
                <p className={styles.signInHint}>
                  <Link
                    to={`/login?next=${encodeURIComponent(`/checkout/${id}?seats=${seatIds.join(',')}`)}`}
                  >
                    {t('checkout.signInToPrefill')}
                  </Link>
                </p>
              )}
            </form>
          ) : (
            <div className={styles.payment}>
              <div className={styles.demoBanner}>{t('checkout.paymentDemo')}</div>
              <h2 className={styles.sectionTitle}>{t('checkout.payment')}</h2>

              <HoldTimer expiresAt={order.expiresAt} onExpire={() => setOrder(null)} />

              <fieldset className={styles.cards}>
                <legend>{t('checkout.testCard')}</legend>
                <label className={styles.cardOption}>
                  <input
                    type="radio"
                    name="card"
                    checked={card === DEMO_CARD_OK}
                    onChange={() => setCard(DEMO_CARD_OK)}
                  />
                  <span>{DEMO_CARD_OK}</span>
                  <span className={styles.cardTag}>{t('checkout.cardApproved')}</span>
                </label>
                <label className={styles.cardOption}>
                  <input
                    type="radio"
                    name="card"
                    checked={card === DEMO_CARD_FAIL}
                    onChange={() => setCard(DEMO_CARD_FAIL)}
                  />
                  <span>{DEMO_CARD_FAIL}</span>
                  <span className={styles.cardTag}>{t('checkout.cardDeclined')}</span>
                </label>
              </fieldset>

              {errorText && (
                <p className={styles.error} role="alert">
                  {errorText}
                </p>
              )}

              <Button variant="primary" onClick={pay} disabled={busy}>
                {busy
                  ? t('checkout.processing')
                  : t('checkout.pay', { total: formatPrice(total, i18n.language) })}
              </Button>
            </div>
          )}
        </div>

        <aside className={styles.summary}>
          <h2 className={styles.sectionTitle}>{t('checkout.order')}</h2>
          <p className={styles.movieLine}>
            {map.movieTitle}
            <br />
            <span className={styles.muted}>
              {t(map.hall.nameKey)} · {map.format} · {formatLongDate(map.localDate, i18n.language)},{' '}
              {formatTime(map.startTime, i18n.language)}
            </span>
          </p>
          <ul className={styles.seatList}>
            {seats.map((s) => (
              <li key={s.id}>
                <span>
                  {t('ticket.row')} {s.row}, {t('ticket.seat')} {s.number}
                  {s.type !== 'standard' && ` · ${s.type === 'vip' ? 'VIP' : t('seat.sofa')}`}
                </span>
                <span>{formatPrice(s.price, i18n.language)}</span>
              </li>
            ))}
          </ul>
          <div className={styles.totalRow}>
            <span>{t('checkout.total')}</span>
            <span className={styles.totalValue}>{formatPrice(total, i18n.language)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
