import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminHideReview, adminReviews } from '../api/admin.js';
import { Empty, Loading } from '../components/States.jsx';
import styles from './admin.module.css';

export function AdminReviewsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [reviews, setReviews] = useState(null);
  const [onlyHate, setOnlyHate] = useState(false);

  useEffect(() => {
    document.title = `${t('admin.nav.reviews')} · KINOZAVOD`;
  }, [t]);

  const load = (hate = onlyHate) => adminReviews(lang, hate).then((r) => setReviews(r.reviews));
  useEffect(() => {
    let active = true;
    adminReviews(lang, onlyHate).then((r) => active && setReviews(r.reviews));
    return () => {
      active = false;
    };
  }, [lang, onlyHate]);

  const hide = async (r, hidden) => {
    await adminHideReview(r.id, hidden);
    load();
  };

  if (!reviews)
    return (
      <div className={styles.page}>
        <Loading />
      </div>
    );

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>{t('admin.nav.reviews')}</h1>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={onlyHate}
            onChange={(e) => setOnlyHate(e.target.checked)}
          />
          {t('admin.reviews.onlyHate')}
        </label>
      </div>
      {reviews.length === 0 && <Empty>{t('admin.reviews.none')}</Empty>}
      <table className={styles.table}>
        <tbody>
          {reviews.map((r) => (
            <tr key={r.id} className={r.isHidden ? styles.archived : ''}>
              <td style={{ width: 60 }}>★ {r.rating}</td>
              <td>
                <strong>{r.nickname}</strong> · {r.movieTitle}
                <br />
                <span style={{ color: 'var(--text-muted)' }}>{r.text}</span>
              </td>
              <td style={{ width: 120 }}>
                <button
                  type="button"
                  className={styles.smallBtn}
                  onClick={() => hide(r, !r.isHidden)}
                >
                  {r.isHidden ? t('admin.reviews.restore') : t('admin.reviews.hide')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
