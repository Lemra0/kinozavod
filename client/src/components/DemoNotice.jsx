import { useTranslation } from 'react-i18next';
import { useMeta } from '../api/queries.js';
import styles from './DemoNotice.module.css';

/** Shown when the catalog uses fictional demo movies instead of TMDB. */
export function DemoNotice() {
  const { t } = useTranslation();
  const { data } = useMeta();
  if (data?.catalog?.source !== 'demo') return null;

  let reason = t('demoNotice.noKey');
  if (data.catalog.tmdbError === 'INVALID_KEY') reason = t('demoNotice.invalidKey');
  else if (data.catalog.tmdbError) reason = t('demoNotice.unavailable');

  return (
    <div className={styles.notice} role="note">
      <strong>{t('demoNotice.title')}</strong> {reason}
    </div>
  );
}
