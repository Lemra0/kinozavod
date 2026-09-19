import { useTranslation } from 'react-i18next';
import styles from './StarRating.module.css';

/** Interactive 1–10 rating selector, or a static display when readOnly. */
export function StarRating({ value, onChange, readOnly = false }) {
  const { t } = useTranslation();
  if (readOnly) {
    return (
      <span className={styles.static} title={`${value}/10`}>
        <span aria-hidden="true">★</span> {value}
      </span>
    );
  }
  return (
    <div className={styles.picker} role="radiogroup" aria-label={t('reviews.yourRating')}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={`${styles.star} ${n <= value ? styles.on : ''}`}
          aria-pressed={n === value}
          aria-label={`${n}`}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
      <span className={styles.value}>{value ? `${value}/10` : ''}</span>
    </div>
  );
}
