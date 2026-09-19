import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.js';
import {
  createReviewRequest,
  deleteReviewRequest,
  updateReviewRequest,
  useReviews,
} from '../api/queries.js';
import { StarRating } from './StarRating.jsx';
import { ReviewSegments } from './ReviewSegments.jsx';
import { ReviewForm } from './ReviewForm.jsx';
import { Loading } from './States.jsx';
import { formatReleaseDate } from '../lib/format.js';
import styles from './MovieReviews.module.css';

export function MovieReviews({ movieId }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data, isPending, refetch } = useReviews(movieId);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (isPending) return <Loading />;

  const { reviews, mine } = data;

  const submit = async ({ rating, text }) => {
    setBusy(true);
    setError(null);
    try {
      if (mine) await updateReviewRequest(mine.id, { rating, text });
      else await createReviewRequest(movieId, { rating, text });
      setEditing(false);
      refetch();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!mine || !window.confirm(t('reviews.deleteConfirm'))) return;
    await deleteReviewRequest(mine.id);
    setEditing(false);
    refetch();
  };

  return (
    <section className={styles.section} aria-labelledby="reviews-title">
      <h2 id="reviews-title" className={styles.title}>
        {t('reviews.title')}
      </h2>

      {/* Own review / editor */}
      {user ? (
        editing || !mine ? (
          <ReviewForm
            initial={mine}
            onSubmit={submit}
            onCancel={mine ? () => setEditing(false) : undefined}
            busy={busy}
            error={error}
          />
        ) : (
          <div className={styles.mine}>
            <div className={styles.mineHead}>
              <StarRating value={mine.rating} readOnly />
              <span className={styles.mineLabel}>{t('reviews.yourReview')}</span>
              <div className={styles.mineActions}>
                <button type="button" className={styles.link} onClick={() => setEditing(true)}>
                  {t('reviews.edit')}
                </button>
                <button type="button" className={styles.link} onClick={remove}>
                  {t('reviews.delete')}
                </button>
              </div>
            </div>
            {mine.text && <p className={styles.mineText}>{mine.text}</p>}
          </div>
        )
      ) : (
        <p className={styles.signIn}>
          <Link to={`/login?next=/movies/${movieId}`}>{t('reviews.signInToReview')}</Link>
        </p>
      )}

      {/* Others */}
      <ul className={styles.list}>
        {reviews
          .filter((r) => !r.mine)
          .map((r) => (
            <li key={r.id} className={styles.item}>
              <img className={styles.avatar} src={r.avatarUrl} alt="" loading="lazy" />
              <div className={styles.body}>
                <div className={styles.itemHead}>
                  <span className={styles.nick}>{r.author.nickname}</span>
                  <StarRating value={r.rating} readOnly />
                  {r.watched && <span className={styles.watched}>{t('reviews.watchedHere')}</span>}
                  {r.hasSpoilers && (
                    <span className={styles.spoilerTag}>{t('reviews.hasSpoilers')}</span>
                  )}
                </div>
                {r.segments.length > 0 && (
                  <p className={styles.text}>
                    <ReviewSegments segments={r.segments} />
                  </p>
                )}
                <span className={styles.date}>
                  {formatReleaseDate(r.createdAt.slice(0, 10), i18n.language)}
                  {r.edited && ` · ${t('reviews.edited')}`}
                </span>
              </div>
            </li>
          ))}
        {reviews.filter((r) => !r.mine).length === 0 && !mine && (
          <li className={styles.empty}>{t('reviews.none')}</li>
        )}
      </ul>
    </section>
  );
}
