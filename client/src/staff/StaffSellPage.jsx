import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RULES } from '@kinozavod/shared';
import { useQueryClient } from '@tanstack/react-query';
import { staffSeatMap, staffSell, staffSessions } from '../api/staff.js';
import { useSeatRealtime } from '../api/useSeatRealtime.js';
import { SeatMap } from '../components/SeatMap.jsx';
import { Empty, ErrorState, Loading } from '../components/States.jsx';
import { formatPrice } from '../lib/format.js';
import { openPrintWindow } from './print.js';
import styles from './StaffSell.module.css';

export function StaffSellPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();

  const [sessions, setSessions] = useState({ status: 'loading', list: [] });
  const [sessionId, setSessionId] = useState(null);
  const [map, setMap] = useState(null);
  const [mapStatus, setMapStatus] = useState('idle');
  const [selected, setSelected] = useState(() => new Set());
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = `${t('staff.nav.sell')} · KINOZAVOD`;
  }, [t]);

  // Load today's sessions.
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    staffSessions(lang)
      .then((r) => active && setSessions({ status: 'done', list: r.sessions }))
      .catch(() => active && setSessions({ status: 'error', list: [] }));
    return () => {
      active = false;
    };
  }, [lang, reload]);

  // Load the seat map for the chosen session and keep it in the query cache
  // so realtime patches apply here too.
  useEffect(() => {
    if (!sessionId) return undefined;
    let active = true;
    staffSeatMap(sessionId, lang)
      .then((m) => {
        if (!active) return;
        setMap(m);
        queryClient.setQueryData(['seats', sessionId], m);
        setMapStatus('done');
      })
      .catch(() => active && setMapStatus('error'));
    return () => {
      active = false;
    };
  }, [sessionId, lang, queryClient]);

  useSeatRealtime(sessionId, { selectedIds: selected });

  // Reflect realtime cache changes into local map.
  useEffect(() => {
    if (!sessionId) return undefined;
    const unsub = queryClient.getQueryCache().subscribe(() => {
      const fresh = queryClient.getQueryData(['seats', sessionId]);
      if (fresh) setMap(fresh);
    });
    return unsub;
  }, [sessionId, queryClient]);

  const selectedSeats = useMemo(
    () => (map ? map.seats.filter((s) => selected.has(s.id) && s.status === 'free') : []),
    [map, selected],
  );
  const total = selectedSeats.reduce((sum, s) => sum + s.price, 0);

  const toggle = (seat) => {
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seat.id)) next.delete(seat.id);
      else if (next.size < RULES.maxSeatsPerOrder) next.add(seat.id);
      return next;
    });
  };

  const sell = async () => {
    setBusy(true);
    setError(null);
    try {
      const { orderId } = await staffSell({
        sessionId,
        seatIds: [...selected],
        method,
      });
      // Print immediately.
      await openPrintWindow(orderId, { t, lang });
      // Reset for the next customer.
      setSelected(new Set());
      setReload((n) => n + 1);
      // Refresh the map to show sold seats.
      const m = await staffSeatMap(sessionId, lang);
      setMap(m);
      queryClient.setQueryData(['seats', sessionId], m);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const activeSession = sessions.list.find((s) => s.id === sessionId);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('staff.sell.title')}</h1>

      <div className={styles.layout}>
        <aside className={styles.sessions}>
          <h2 className={styles.h2}>{t('staff.sell.today')}</h2>
          {sessions.status === 'loading' && <Loading />}
          {sessions.status === 'error' && <ErrorState onRetry={() => setReload((n) => n + 1)} />}
          {sessions.status === 'done' && sessions.list.length === 0 && (
            <Empty>{t('staff.sell.noSessions')}</Empty>
          )}
          <ul className={styles.sessionList}>
            {sessions.list.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`${styles.sessionBtn} ${s.id === sessionId ? styles.sessionActive : ''}`}
                  onClick={() => {
                    setSessionId(s.id);
                    setMap(null);
                    setMapStatus('loading');
                    setSelected(new Set());
                  }}
                >
                  <span className={styles.sessionTime}>{s.localTime}</span>
                  <span className={styles.sessionInfo}>
                    {s.movieTitle}
                    <br />
                    <span className={styles.muted}>
                      {t(s.hall.nameKey)} · {s.format} · {t('staff.sell.free', { n: s.seatsFree })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className={styles.seatArea}>
          {!sessionId && <Empty>{t('staff.sell.pick')}</Empty>}
          {sessionId && mapStatus === 'loading' && <Loading />}
          {sessionId && mapStatus === 'error' && (
            <ErrorState onRetry={() => setSessionId(sessionId)} />
          )}
          {sessionId && map && mapStatus === 'done' && (
            <>
              <div className={styles.seatHead}>
                <strong>{activeSession?.movieTitle}</strong>{' '}
                <span className={styles.muted}>
                  {activeSession &&
                    `${activeSession.localTime} · ${t(map.hall.nameKey)} · ${map.format}`}
                </span>
              </div>
              <SeatMap map={map} selected={selected} onToggle={toggle} />

              <div className={styles.sellBar}>
                <div className={styles.methods}>
                  <span className={styles.methodLabel}>{t('staff.sell.method')}</span>
                  <button
                    type="button"
                    className={`${styles.methodBtn} ${method === 'cash' ? styles.methodActive : ''}`}
                    onClick={() => setMethod('cash')}
                  >
                    {t('staff.sell.cash')}
                  </button>
                  <button
                    type="button"
                    className={`${styles.methodBtn} ${method === 'card_terminal' ? styles.methodActive : ''}`}
                    onClick={() => setMethod('card_terminal')}
                  >
                    {t('staff.sell.terminal')}
                  </button>
                </div>
                <div className={styles.total}>{formatPrice(total, lang)}</div>
                <button
                  type="button"
                  className={styles.sellButton}
                  disabled={busy || selectedSeats.length === 0}
                  onClick={sell}
                >
                  {busy ? t('staff.sell.selling') : t('staff.sell.sellAndPrint')}
                </button>
              </div>
              {error && (
                <p className={styles.error} role="alert">
                  {t([`errors.${error.code}`, 'errors.generic'])}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
