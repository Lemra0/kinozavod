import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  adminArchiveMovie,
  adminMovies,
  adminRefreshMovie,
  adminTmdbImport,
  adminTmdbSearch,
  adminUpdateMovie,
} from '../api/admin.js';
import { useMeta } from '../api/queries.js';
import { Loading } from '../components/States.jsx';
import { formatReleaseDate } from '../lib/format.js';
import styles from './admin.module.css';

const AGE = ['', 'PERE', 'L', 'MS-6', 'MS-12', 'K-12', 'K-14', 'K-16'];

export function AdminMoviesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data: meta } = useMeta();
  const [movies, setMovies] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = `${t('admin.nav.movies')} · KINOZAVOD`;
  }, [t]);

  const load = () => adminMovies(lang).then((r) => setMovies(r.movies));
  useEffect(() => {
    let active = true;
    adminMovies(lang).then((r) => active && setMovies(r.movies));
    return () => {
      active = false;
    };
  }, [lang]);

  const changeRating = async (m, rating) => {
    setError(null);
    try {
      await adminUpdateMovie(m.id, { ageRating: rating || null });
      load();
    } catch (err) {
      setError(err);
    }
  };
  const archive = async (m) => {
    await adminArchiveMovie(m.id, !m.isArchived);
    load();
  };
  const refresh = async (m) => {
    setError(null);
    try {
      await adminRefreshMovie(m.id);
      load();
    } catch (err) {
      setError(err);
    }
  };

  if (!movies)
    return (
      <div className={styles.page}>
        <Loading />
      </div>
    );

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>{t('admin.nav.movies')}</h1>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setImportOpen(true)}
            disabled={!meta?.tmdbConfigured}
            title={meta?.tmdbConfigured ? '' : t('admin.movies.noTmdb')}
          >
            {t('admin.movies.import')}
          </button>
        </div>
      </div>

      {error && <p className={styles.error}>{t([`errors.${error.code}`, 'errors.generic'])}</p>}
      {!meta?.tmdbConfigured && <p className={styles.warn}>{t('admin.movies.noTmdb')}</p>}

      <table className={styles.table}>
        <thead>
          <tr>
            <th></th>
            <th>{t('admin.movies.title')}</th>
            <th>{t('admin.movies.rating')}</th>
            <th>{t('admin.movies.rental')}</th>
            <th>{t('admin.movies.sessions')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {movies.map((m) => (
            <tr key={m.id} className={m.isArchived ? styles.archived : ''}>
              <td>
                {m.posterUrl && (
                  <img className={styles.poster} src={m.posterUrl} alt="" loading="lazy" />
                )}
              </td>
              <td>
                {m.title}
                <br />
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {m.source === 'tmdb' ? 'TMDB' : t('admin.movies.demo')}
                  {m.isArchived && ` · ${t('admin.movies.archived')}`}
                </span>
              </td>
              <td>
                <select
                  className={styles.select}
                  value={m.ageRating ?? ''}
                  onChange={(e) => changeRating(m, e.target.value)}
                >
                  {AGE.map((a) => (
                    <option key={a || 'none'} value={a}>
                      {a || t('admin.movies.noRating')}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {m.rentalStart ? formatReleaseDate(m.rentalStart, lang) : '—'}
                {m.rentalEnd ? ` — ${formatReleaseDate(m.rentalEnd, lang)}` : ''}
              </td>
              <td>
                {m.upcomingSessions}
                {m.soldTickets > 0 && ` · ${t('admin.movies.sold', { n: m.soldTickets })}`}
              </td>
              <td>
                <div className={styles.rowActions}>
                  {m.source === 'tmdb' && (
                    <button type="button" className={styles.smallBtn} onClick={() => refresh(m)}>
                      {t('admin.movies.refresh')}
                    </button>
                  )}
                  <button type="button" className={styles.smallBtn} onClick={() => archive(m)}>
                    {m.isArchived ? t('admin.movies.restore') : t('admin.movies.archive')}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImported={load} />}
    </div>
  );
}

function ImportDialog({ onClose, onImported }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  const search = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try {
      const r = await adminTmdbSearch(query);
      setResults(r.results);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (tmdbId) => {
    await adminTmdbImport(tmdbId);
    onImported();
    setResults((prev) =>
      prev.map((r) => (r.tmdbId === tmdbId ? { ...r, alreadyImported: true } : r)),
    );
  };

  return (
    <div className={styles.modalBack} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2>{t('admin.movies.importTitle')}</h2>
          <button type="button" className={styles.smallBtn} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <form onSubmit={search} style={{ display: 'flex', gap: 8 }}>
          <input
            className={styles.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('admin.movies.searchPlaceholder')}
            autoFocus
            style={{ flex: 1 }}
          />
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>
            {t('admin.movies.search')}
          </button>
        </form>
        <div className={styles.resultList}>
          {results.map((r) => (
            <div key={r.tmdbId} className={styles.resultItem}>
              {r.posterUrl && <img className={styles.poster} src={r.posterUrl} alt="" />}
              <span className={styles.meta}>
                {r.title} {r.year ? `(${r.year})` : ''}
                {r.originalTitle !== r.title && (
                  <>
                    <br />
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {r.originalTitle}
                    </span>
                  </>
                )}
              </span>
              {r.alreadyImported ? (
                <span className={styles.badge}>{t('admin.movies.imported')}</span>
              ) : (
                <button
                  type="button"
                  className={styles.smallBtn}
                  onClick={() => doImport(r.tmdbId)}
                >
                  {t('admin.movies.add')}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
