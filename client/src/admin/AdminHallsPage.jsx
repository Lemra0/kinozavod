import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminHalls } from '../api/admin.js';
import { Loading } from '../components/States.jsx';
import styles from './admin.module.css';

// Read-only overview of halls. A full seat-layout editor is a large sub-feature;
// the schema is fixed by the seed and protected when sessions have sold tickets.
export function AdminHallsPage() {
  const { t } = useTranslation();
  const [halls, setHalls] = useState(null);

  useEffect(() => {
    document.title = `${t('admin.nav.halls')} · KINOZAVOD`;
  }, [t]);
  useEffect(() => {
    adminHalls().then((r) => setHalls(r.halls));
  }, []);

  if (!halls)
    return (
      <div className={styles.page}>
        <Loading />
      </div>
    );

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>{t('admin.nav.halls')}</h1>
      </div>
      <p className={styles.warn}>{t('admin.halls.editorNote')}</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('admin.halls.name')}</th>
            <th>{t('admin.halls.seats')}</th>
            <th>{t('admin.halls.formats')}</th>
            <th>ZAVOD SOUND</th>
          </tr>
        </thead>
        <tbody>
          {halls.map((h) => (
            <tr key={h.code}>
              <td>{t(h.nameKey)}</td>
              <td>{h.seatsTotal}</td>
              <td>{h.formats.join(', ')}</td>
              <td>{h.hasZavodSound ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
