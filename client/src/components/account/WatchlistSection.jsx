import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { myWatchlistRequest, removeWatchlistRequest } from '../../api/auth.js';
import { Poster } from '../Poster.jsx';
import { Empty, ErrorState, Loading } from '../States.jsx';
import { formatReleaseDate } from '../../lib/format.js';
import styles from './Sections.module.css';

export function WatchlistSection() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState({ status: 'loading', movies: [] });

  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let active = true;
    myWatchlistRequest(i18n.language)
      .then((r) => active && setState({ status: 'done', movies: r.movies }))
      .catch(() => active && setState({ status: 'error', movies: [] }));
    return () => {
      active = false;
    };
  }, [i18n.language, reloadKey]);

  const remove = async (movieId) => {
    await removeWatchlistRequest(movieId);
    setState((s) => ({ ...s, movies: s.movies.filter((m) => m.id !== movieId) }));
  };

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState onRetry={load} />;
  if (state.movies.length === 0) return <Empty>{t('account.emptyWatchlist')}</Empty>;

  return (
    <ul className={styles.watchGrid}>
      {state.movies.map((movie) => (
        <li key={movie.id} className={styles.watchItem}>
          <Link to={`/movies/${movie.id}`} className={styles.watchLink}>
            <Poster src={movie.posterUrl} />
            <span className={styles.watchTitle}>{movie.title}</span>
          </Link>
          <span className={styles.watchDate}>
            {movie.rentalStart > new Date().toISOString().slice(0, 10)
              ? formatReleaseDate(movie.rentalStart, i18n.language)
              : ''}
          </span>
          <button type="button" className={styles.watchRemove} onClick={() => remove(movie.id)}>
            {t('account.removeFromWatchlist')}
          </button>
        </li>
      ))}
    </ul>
  );
}
