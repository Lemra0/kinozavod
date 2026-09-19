import { useTranslation } from 'react-i18next';
import styles from './SeatMap.module.css';

const STATUS_LABEL = {
  free: 'seat.free',
  held: 'seat.held',
  sold: 'seat.sold',
  selected: 'seat.selected',
};

/**
 * Interactive hall map. `selected` is a Set of seat ids.
 * Calls onToggle(seat) when a free/selected seat is clicked.
 */
export function SeatMap({ map, selected, onToggle }) {
  const { t } = useTranslation();
  const cell = 30;
  const gap = 6;
  const width = map.grid.cols * (cell + gap);
  const height = map.grid.rows * (cell + gap);

  return (
    <div className={styles.wrap}>
      <div className={styles.screen}>
        <svg
          viewBox="0 0 520 30"
          preserveAspectRatio="none"
          className={styles.screenCurve}
          aria-hidden="true"
        >
          <path d="M10 26 Q260 -8 510 26" fill="none" stroke="var(--accent)" strokeWidth="4" />
        </svg>
        <span className={styles.screenLabel}>{t('seat.screen')}</span>
      </div>

      <div className={styles.mapScroll}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={styles.map}
          role="group"
          aria-label={t('seat.mapOf', { hall: t(map.hall.nameKey) })}
          style={{ maxWidth: `${width}px` }}
        >
          {map.seats.map((seat) => {
            const isSelected = selected.has(seat.id);
            const status = isSelected ? 'selected' : seat.status;
            const clickable = seat.status === 'free' || isSelected;
            const x = seat.gridX * (cell + gap);
            const y = seat.gridY * (cell + gap);
            const w = seat.width * cell + (seat.width - 1) * gap;
            const label = `${t('ticket.row')} ${seat.row}, ${t('ticket.seat')} ${seat.number}, ${t(
              STATUS_LABEL[status],
            )}`;

            return (
              <g
                key={seat.id}
                transform={`translate(${x} ${y})`}
                className={`${styles.seat} ${styles[status]} ${styles[seat.type]} ${
                  clickable ? styles.clickable : ''
                }`}
                role={clickable ? 'button' : 'img'}
                tabIndex={clickable ? 0 : -1}
                aria-pressed={clickable ? isSelected : undefined}
                aria-label={label}
                onClick={() => clickable && onToggle(seat)}
                onKeyDown={(e) => {
                  if (clickable && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onToggle(seat);
                  }
                }}
              >
                <rect width={w} height={cell} rx="6" className={styles.seatBox} />
                {status === 'sold' && (
                  <path
                    d={`M8 8 L${w - 8} ${cell - 8} M${w - 8} 8 L8 ${cell - 8}`}
                    className={styles.cross}
                  />
                )}
                {seat.type === 'sofa' && status !== 'sold' && (
                  <text x={w / 2} y={cell / 2 + 4} className={styles.sofaMark}>
                    ♥
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <ul className={styles.legend}>
        <li>
          <span className={`${styles.chip} ${styles.free}`} /> {t('seat.free')}
        </li>
        <li>
          <span className={`${styles.chip} ${styles.selected}`} /> {t('seat.selected')}
        </li>
        <li>
          <span className={`${styles.chip} ${styles.held}`} /> {t('seat.held')}
        </li>
        <li>
          <span className={`${styles.chip} ${styles.sold}`} /> {t('seat.sold')}
        </li>
        <li>
          <span className={`${styles.chip} ${styles.vip}`} /> VIP
        </li>
        <li>
          <span className={`${styles.chip} ${styles.sofa}`} /> {t('seat.sofa')}
        </li>
      </ul>
    </div>
  );
}
