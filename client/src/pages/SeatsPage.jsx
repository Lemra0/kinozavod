import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RULES } from '@kinozavod/shared';
import { fetchBestSeats, useSeatMap } from '../api/queries.js';
import { useSeatRealtime } from '../api/useSeatRealtime.js';
import { SeatMap } from '../components/SeatMap.jsx';
import { Button } from '../components/Button.jsx';
import { ErrorState, Loading } from '../components/States.jsx';
import { formatLongDate, formatPrice, formatTime } from '../lib/format.js';
import styles from './SeatsPage.module.css';

export function SeatsPage() {
  const { sessionId } = useParams();
  const id = Number(sessionId);
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const { data: map, isPending, isError, refetch } = useSeatMap(id);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  useSeatRealtime(id, { selectedIds });
  const [viewers, setViewers] = useState(2);
  const [pickType, setPickType] = useState('any');
  const [picking, setPicking] = useState(false);
  const [pickEmpty, setPickEmpty] = useState(false);

  useEffect(() => {
    document.title = `${t('seat.title')} · KINOZAVOD`;
  }, [t]);

  // A selected seat stays valid only while it is still free on the latest map.
  // We derive the effective selection each render instead of syncing via an effect.
  const selectableIds = useMemo(
    () => new Set((map?.seats ?? []).filter((s) => s.status === 'free').map((s) => s.id)),
    [map],
  );
  const selectedSeats = useMemo(
    () => (map ? map.seats.filter((s) => selectedIds.has(s.id) && selectableIds.has(s.id)) : []),
    [map, selectedIds, selectableIds],
  );
  const total = selectedSeats.reduce((sum, s) => sum + s.price, 0);
  const viewersSelected = selectedSeats.reduce((sum, s) => sum + s.viewers, 0);

  const toggle = (seat) => {
    setPickEmpty(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(seat.id)) next.delete(seat.id);
      else if (next.size < RULES.maxSeatsPerOrder) next.add(seat.id);
      return next;
    });
  };

  const autoPick = async () => {
    setPicking(true);
    setPickEmpty(false);
    try {
      const { suggestions } = await fetchBestSeats(id, viewers, pickType);
      if (suggestions.length > 0) setSelectedIds(new Set(suggestions[0]));
      else setPickEmpty(true);
    } finally {
      setPicking(false);
    }
  };

  const proceed = () => {
    navigate(`/checkout/${id}?seats=${[...selectedIds].join(',')}`);
  };

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

  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('seat.title')}</h1>
        <p className={styles.sub}>
          {map.movieTitle} · {t(map.hall.nameKey)} · {map.format}
          <br />
          <span className={styles.subMuted}>
            {formatLongDate(map.localDate, i18n.language)},{' '}
            {formatTime(map.startTime, i18n.language)}
          </span>
        </p>
      </header>

      <div className={styles.autopick}>
        <label className={styles.field}>
          <span>{t('seat.viewers')}</span>
          <input
            type="number"
            min="1"
            max={RULES.maxSeatsPerOrder}
            value={viewers}
            onChange={(e) =>
              setViewers(Math.max(1, Math.min(RULES.maxSeatsPerOrder, Number(e.target.value) || 1)))
            }
          />
        </label>
        <label className={styles.field}>
          <span>{t('seat.seatType')}</span>
          <select value={pickType} onChange={(e) => setPickType(e.target.value)}>
            <option value="any">{t('common.all')}</option>
            <option value="standard">{t('seat.standard')}</option>
            <option value="vip">VIP</option>
            <option value="sofa">{t('seat.sofa')}</option>
          </select>
        </label>
        <Button variant="secondary" onClick={autoPick} disabled={picking}>
          {picking ? t('seat.picking') : t('seat.autoPick')}
        </Button>
        {pickEmpty && <span className={styles.pickEmpty}>{t('seat.pickEmpty')}</span>}
      </div>

      <SeatMap map={map} selected={selectedIds} onToggle={toggle} />

      <div className={styles.summary}>
        <div>
          <div className={styles.selList}>
            {selectedSeats.length === 0
              ? t('seat.noneSelected')
              : selectedSeats
                  .map((s) => `${t('ticket.row')} ${s.row}, ${t('ticket.seat')} ${s.number}`)
                  .join(' · ')}
          </div>
          <div className={styles.total}>{formatPrice(total, i18n.language)}</div>
          {viewersSelected > 0 && (
            <div className={styles.viewersNote}>
              {t('seat.viewersSelected', { count: viewersSelected })}
            </div>
          )}
        </div>
        <Button variant="primary" disabled={selectedSeats.length === 0} onClick={proceed}>
          {t('seat.checkout')}
        </Button>
      </div>
    </div>
  );
}
