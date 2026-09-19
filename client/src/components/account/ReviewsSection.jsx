import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { myReviewsRequest } from '../../api/queries.js';
import { StarRating } from '../StarRating.jsx';
import { ReviewSegments } from '../ReviewSegments.jsx';
import { Empty, ErrorState, Loading } from '../States.jsx';
import { formatReleaseDate } from '../../lib/format.js';
import styles from './Sections.module.css';

export function ReviewsSection() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [state, setState] = useState({ status: 'loading', reviews: [] });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    myReviewsRequest(lang)
      .then((r) => active && setState({ status: 'done', reviews: r.reviews }))
      .catch(() => active && setState({ status: 'error', reviews: [] }));
    return () => {
      active = false;
    };
  }, [lang, reloadKey]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />;
  if (state.reviews.length === 0) return <Empty>{t('account.noReviews')}</Empty>;

  return (
    <ul className={styles.reviewList}>
      {state.reviews.map((r) => (
        <li key={r.id} className={styles.reviewItem}>
          <div className={styles.reviewHead}>
            <Link to={`/movies/${r.movieId}`} className={styles.reviewMovie}>
              {r.movieTitle}
            </Link>
            <StarRating value={r.rating} readOnly />
            <span className={styles.reviewDate}>
              {formatReleaseDate(r.createdAt.slice(0, 10), lang)}
            </span>
          </div>
          {r.segments.length > 0 && (
            <p className={styles.reviewText}>
              <ReviewSegments segments={r.segments} />
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
