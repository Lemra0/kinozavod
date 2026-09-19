import { useTranslation } from 'react-i18next';
import { AGE_RATINGS } from '@kinozavod/shared';
import styles from './AgeBadge.module.css';

export function AgeBadge({ rating, className = '' }) {
  const { t } = useTranslation();
  const known = rating && AGE_RATINGS[rating];
  const title = known ? t(`age.${rating}`) : t('age.unknown');

  return (
    <span className={`${styles.badge} ${known ? '' : styles.unknown} ${className}`} title={title}>
      <span aria-hidden="true">{known ? rating : '?'}</span>
      <span className="visually-hidden">{title}</span>
    </span>
  );
}
