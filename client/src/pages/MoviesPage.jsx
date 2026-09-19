import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMovies } from '../api/queries.js';
import { AgeBadge } from '../components/AgeBadge.jsx';
import { DemoNotice } from '../components/DemoNotice.jsx';
import { Poster } from '../components/Poster.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { Empty, ErrorState, Loading } from '../components/States.jsx';
import { formatDuration, formatReleaseDate } from '../lib/format.js';
import styles from './MoviesPage.module.css';

export function MoviesPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') === 'soon' ? 'soon' : 'now';
  const { data, isPending, isError, refetch } = useMovies(status);

  useEffect(() => {
    document.title = `${t('nav.movies')} · KINOZAVOD`;
  }, [t]);

  return (
    <div className="container">
      <header className={styles.header}>
        <h1 className={styles.title}>{t('movies.title')}</h1>
        <Segmented
          label={t('movies.show')}
          value={status}
          onChange={(v) => setParams(v === 'soon' ? { status: 'soon' } : {}, { replace: true })}
          options={[
            { value: 'now', label: t('movies.now') },
            { value: 'soon', label: t('movies.soon') },
          ]}
        />
      </header>

      <DemoNotice />

      {isPending && <Loading />}
      {isError && <ErrorState onRetry={refetch} />}
      {data?.movies.length === 0 && <Empty>{t('movies.empty')}</Empty>}

      <ul className={styles.grid}>
        {data?.movies.map((movie) => (
          <li key={movie.id}>
            <Link to={`/movies/${movie.id}`} className={styles.card}>
              <Poster src={movie.posterUrl} />
              <span className={styles.cardHead}>
                <span className={styles.cardTitle}>{movie.title}</span>
                <AgeBadge rating={movie.ageRating} />
              </span>
              <span className={styles.cardMeta}>
                {status === 'soon'
                  ? formatReleaseDate(movie.rentalStart, i18n.language)
                  : [movie.genres[0]?.name, formatDuration(movie.durationMin, t)]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
