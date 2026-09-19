import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AgeBadge } from './AgeBadge.jsx';
import { Poster } from './Poster.jsx';
import { SessionButton } from './SessionButton.jsx';
import { formatDuration, hallNumber } from '../lib/format.js';
import styles from './MovieScheduleCard.module.css';

export function MovieScheduleCard({ movie }) {
  const { t } = useTranslation();
  const next = movie.sessions.find((s) => !s.past) ?? movie.sessions[0];

  return (
    <article className={styles.card}>
      <Link
        to={`/movies/${movie.id}`}
        className={styles.posterLink}
        tabIndex={-1}
        aria-hidden="true"
      >
        <Poster src={movie.posterUrl} hall={hallNumber(next?.hall.code)} />
      </Link>
      <div className={styles.body}>
        <div className={styles.head}>
          <h2 className={styles.title}>
            <Link to={`/movies/${movie.id}`}>{movie.title}</Link>
          </h2>
          <AgeBadge rating={movie.ageRating} />
        </div>
        <p className={styles.meta}>
          {[movie.genres.map((g) => g.name).join(', '), formatDuration(movie.durationMin, t)]
            .filter(Boolean)
            .join(' · ')}
          {movie.originalTitle !== movie.title && (
            <span className={styles.original}> · {movie.originalTitle}</span>
          )}
          {movie.rating?.count > 0 && (
            <span className={styles.rating}> · ★ {movie.rating.average}</span>
          )}
        </p>
        <ul className={styles.sessions}>
          {movie.sessions.map((session) => (
            <li key={session.id}>
              <SessionButton session={session} movieId={movie.id} />
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
