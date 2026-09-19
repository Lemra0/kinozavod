import { useTranslation } from 'react-i18next';
import { AgeBadge } from './AgeBadge.jsx';
import { formatLongDate, formatTime, hallNumber } from '../lib/format.js';
import styles from './Ticket.module.css';

/** A single ticket-pass with the QR code (already an SVG string from the API). */
export function Ticket({ order, ticket }) {
  const { t, i18n } = useTranslation();
  const { session, movie, buyer } = order;

  return (
    <div className={styles.ticket}>
      <div className={styles.main}>
        <p className={styles.kind}>{t('ticket.pass')}</p>
        <h3 className={styles.title}>{movie.title}</h3>
        <div className={styles.grid}>
          <div>
            <span>{t('ticket.hall')}</span>
            <b>{hallNumber(session.hall.code)}</b>
          </div>
          <div>
            <span>{t('ticket.row')}</span>
            <b>{String(ticket.row).padStart(2, '0')}</b>
          </div>
          <div>
            <span>{t('ticket.seat')}</span>
            <b>{String(ticket.number).padStart(2, '0')}</b>
          </div>
          <div>
            <span>{t('ticket.start')}</span>
            <b className={styles.time}>{formatTime(session.startTime, i18n.language)}</b>
          </div>
        </div>
        <p className={styles.meta}>
          {formatLongDate(session.localDate, i18n.language)} · {session.format}
          {session.hall.zavodSound && ' · ZAVOD SOUND'}
          {movie.ageRating && (
            <>
              {' · '}
              <AgeBadge rating={movie.ageRating} />
            </>
          )}
        </p>
        {buyer?.firstName && (
          <p className={styles.buyer}>
            {buyer.firstName} {buyer.lastName}
          </p>
        )}
      </div>
      <div className={styles.stub}>
        {ticket.qr ? (
          <div
            className={styles.qr}
            role="img"
            aria-label={t('ticket.qrOf', { code: ticket.code })}
            dangerouslySetInnerHTML={{ __html: ticket.qr }}
          />
        ) : (
          <div className={styles.qrEmpty} aria-hidden="true" />
        )}
        <code className={styles.code}>{ticket.code}</code>
      </div>
    </div>
  );
}
