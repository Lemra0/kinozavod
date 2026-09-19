import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPrice, hallNumber } from '../lib/format.js';
import styles from './SessionButton.module.css';

/** Time button of a session. Leads to the movie page with the session selected. */
export function SessionButton({ session, movieId, selected = false, onSelect }) {
  const { t, i18n } = useTranslation();
  const unavailable = session.past || session.salesClosed;

  let note = `${t(session.hall.nameKey)} · ${t('session.from', { price: formatPrice(session.priceFrom, i18n.language) })}`;
  if (session.past) note = t('session.started');
  else if (session.salesClosed) note = t('session.salesClosed');
  else if (session.soldOut) note = t('session.soldOut');

  const label = `${session.localTime}, ${t(session.hall.nameKey)}, ${session.format}. ${note}${
    session.lowSeats ? `. ${t('session.lowSeats')}` : ''
  }`;

  const content = (
    <>
      <span className={styles.time}>
        {session.localTime}
        {session.format === '3D' && <span className={styles.format}>3D</span>}
      </span>
      <span className={styles.note}>
        <span className={styles.hallNo} aria-hidden="true">
          {hallNumber(session.hall.code)}
        </span>
        {note}
      </span>
      {session.lowSeats && !unavailable && (
        <span className={styles.low}>{t('session.lowSeats')}</span>
      )}
    </>
  );

  const className = `${styles.button} ${selected ? styles.selected : ''} ${
    unavailable || session.soldOut ? styles.disabled : ''
  }`;

  if (unavailable) {
    return (
      <span className={className} aria-disabled="true">
        {content}
      </span>
    );
  }

  if (onSelect) {
    return (
      <button
        type="button"
        className={className}
        aria-pressed={selected}
        aria-label={label}
        onClick={() => onSelect(session)}
      >
        {content}
      </button>
    );
  }

  return (
    <Link to={`/movies/${movieId}?session=${session.id}`} className={className} aria-label={label}>
      {content}
    </Link>
  );
}
