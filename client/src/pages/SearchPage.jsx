import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSearch, useSearchFilters } from '../api/queries.js';
import { MovieScheduleCard } from '../components/MovieScheduleCard.jsx';
import { SearchFilters } from '../components/SearchFilters.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { SessionButton } from '../components/SessionButton.jsx';
import { Empty, ErrorState, Loading } from '../components/States.jsx';
import { Button } from '../components/Button.jsx';
import { activeChips, DEFAULTS, paramsToState, stateToParams } from '../lib/searchParams.js';
import { formatLongDate, hallNumber } from '../lib/format.js';
import styles from './SearchPage.module.css';

const SORTS = ['time', 'title', 'rating', 'popularity', 'price', 'duration'];

export function SearchPage() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const state = useMemo(() => paramsToState(searchParams), [searchParams]);
  const { data: filterOptions } = useSearchFilters();
  const { data, isPending, isError, refetch, isFetching } = useSearch(searchParams.toString());

  useEffect(() => {
    document.title = `${t('nav.search')} · KINOZAVOD`;
  }, [t]);

  const genresById = useMemo(
    () => new Map((filterOptions?.genres ?? []).map((g) => [g.id, g.name])),
    [filterOptions],
  );

  // Merge a patch into the URL. Any change except paging resets the page.
  const set = (patch) => {
    const next = { ...state, ...patch };
    if (!('page' in patch)) next.page = 0;
    setSearchParams(stateToParams(next), { replace: true });
  };

  const setQuery = (q) => set({ q });
  const reset = () => setSearchParams(new URLSearchParams(), { replace: true });

  const chips = activeChips(state, { t, genresById });

  return (
    <div className={`container ${styles.layout}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('search.title')}</h1>
        <div className={styles.searchRow}>
          <input
            type="search"
            className={styles.search}
            placeholder={t('search.placeholder')}
            aria-label={t('nav.search')}
            value={state.q}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button
            variant="secondary"
            className={styles.filterToggle}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            {t('search.filters')}
          </Button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={`${styles.sidebar} ${filtersOpen ? styles.sidebarOpen : ''}`}>
          <SearchFilters state={state} set={set} filters={filterOptions} />
        </aside>

        <section className={styles.results} aria-live="polite" aria-busy={isFetching}>
          <div className={styles.toolbar}>
            <span className={styles.count}>
              {data ? t('search.found', { count: data.total }) : '\u00a0'}
            </span>
            <div className={styles.viewSort}>
              <Segmented
                label={t('search.view.label')}
                value={state.view}
                onChange={(view) => set({ view })}
                options={[
                  { value: 'movies', label: t('search.view.movies') },
                  { value: 'time', label: t('search.view.time') },
                ]}
              />
              <label className={styles.sort}>
                <span>{t('search.sort.label')}</span>
                <select
                  aria-label={t('search.sort.label')}
                  value={state.sort}
                  onChange={(e) => set({ sort: e.target.value })}
                >
                  {SORTS.map((sort) => (
                    <option key={sort} value={sort}>
                      {t(`search.sort.${sort}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {chips.length > 0 && (
            <div className={styles.activeChips}>
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className={styles.activeChip}
                  onClick={() => set(chip.reset)}
                >
                  {chip.label}
                  <span aria-hidden="true">×</span>
                  <span className="visually-hidden">{t('search.removeFilter')}</span>
                </button>
              ))}
              <button type="button" className={styles.resetAll} onClick={reset}>
                {t('search.reset')}
              </button>
            </div>
          )}

          {isPending && <Loading />}
          {isError && <ErrorState onRetry={refetch} />}
          {data && data.total === 0 && <Empty>{t('search.empty')}</Empty>}

          {data && data.total > 0 && state.view === 'movies' && <MoviesView data={data} />}
          {data && data.total > 0 && state.view === 'time' && (
            <TimeView data={data} lang={i18n.language} />
          )}

          {data && data.total > data.pageSize && (
            <Pagination data={data} onPage={(page) => set({ page })} t={t} />
          )}
        </section>
      </div>
    </div>
  );
}

function MoviesView({ data }) {
  const movies = data.movies.map((movie) => ({
    ...movie,
    sessions: data.sessions.filter((s) => s.movieId === movie.id),
  }));
  return (
    <div>
      {movies.map((movie) => (
        <MovieScheduleCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
}

function TimeView({ data, lang }) {
  const byDay = new Map();
  for (const session of data.sessions) {
    if (!byDay.has(session.localDate)) byDay.set(session.localDate, []);
    byDay.get(session.localDate).push(session);
  }
  const titleOf = (id) => data.movies.find((m) => m.id === id)?.title ?? '';

  return (
    <div className={styles.timeView}>
      {[...byDay.entries()].map(([day, sessions]) => (
        <section key={day}>
          <h2 className={styles.dayHeading}>{formatLongDate(day, lang)}</h2>
          <ul className={styles.timeList}>
            {sessions.map((session) => (
              <li key={session.id} className={styles.timeRow}>
                <SessionButton session={session} movieId={session.movieId} />
                <span className={styles.timeMovie}>{titleOf(session.movieId)}</span>
                <span className={styles.timeHall} aria-hidden="true">
                  {hallNumber(session.hall.code)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Pagination({ data, onPage, t }) {
  const pages = Math.ceil(data.total / data.pageSize);
  return (
    <nav className={styles.pagination} aria-label={t('search.pagination')}>
      <button type="button" disabled={data.page === 0} onClick={() => onPage(data.page - 1)}>
        {t('search.prev')}
      </button>
      <span>{t('search.pageOf', { page: data.page + 1, total: pages })}</span>
      <button type="button" disabled={data.page + 1 >= pages} onClick={() => onPage(data.page + 1)}>
        {t('search.next')}
      </button>
    </nav>
  );
}
