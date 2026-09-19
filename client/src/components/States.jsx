import { useTranslation } from 'react-i18next';
import styles from './States.module.css';

export function Loading() {
  const { t } = useTranslation();
  return (
    <p className={styles.loading} role="status">
      {t('common.loading')}
    </p>
  );
}

export function ErrorState({ onRetry }) {
  const { t } = useTranslation();
  return (
    <div className={styles.error} role="alert">
      <p>{t('common.loadError')}</p>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function Empty({ children }) {
  return <p className={styles.empty}>{children}</p>;
}
