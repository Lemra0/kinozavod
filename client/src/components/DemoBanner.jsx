import { useTranslation } from 'react-i18next';
import styles from './DemoBanner.module.css';

export function DemoBanner() {
  const { t } = useTranslation();
  return (
    <div className={styles.banner} role="note">
      <span className={styles.text}>{t('demo.banner')}</span>
    </div>
  );
}
