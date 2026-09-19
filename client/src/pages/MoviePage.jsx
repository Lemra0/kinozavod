import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AGE_RATINGS } from '@kinozavod/shared';
import { useMovie } from '../api/queries.js';
import { AgeBadge } from '../components/AgeBadge.jsx';
import { Button } from '../components/Button.jsx';
import { DayTabs } from '../components/DayTabs.jsx';
import { Poster } from '../components/Poster.jsx';
import { SessionButton } from '../components/SessionButton.jsx';
import { Empty, ErrorState, Loading } from '../components/States.jsx';
import { TrailerDialog } from '../components/TrailerDialog.jsx';
import { WatchButton } from '../components/WatchButton.jsx';
import { MovieReviews } from '../components/MovieReviews.jsx';
import { StarRating } from '../components/StarRating.jsx';
import {
  formatDuration,
  formatLongDate,
  formatPrice,
  formatReleaseDate,
  languageName,
} from '../lib/format.js';
import { NotFoundPage } from './NotFoundPage.jsx';
import styles from './MoviePage.module.css';

export function MoviePage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [params, setParams] = useSearchParams();
  const [trailerOpen, setTrailerOpen] = useState(false);
  const { data, isPending, isError, error, refetch } = useMovie(id);

  const sessions = useMemo(() => data?.sessions ?? [], [data]);
  const days = useMemo(() => [...new Set(sessions.map((s) => s.localDate))], [sessions]);
  const selectedId = Number(params.get('session')) || null;
  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  const [day, setDay] = useState(null);
  const activeDay = day ?? selected?.localDate ?? days[0];

  useEffect(() => {
    if (data?.movie) document.title = `${data.movie.title} · KINOZAVOD`;
  }, [data]);

  if (isPending)
    return (
      <div className="container">
        <Loading />
      </div>
    );
  if (isError && error.status === 404) return <NotFoundPage />;
  if (isError)
    return (
      <div className="container">
        <ErrorState onRetry={refetch} />
      </div>
    );

  const { movie } = data;
  const rating = AGE_RATINGS[movie.ageRating];
  const { today } = data;

  const select = (session) => {
    const next = new URLSearchParams(params);
    next.set('session', String(session.id));
    setParams(next, { replace: true });
  };

  const facts = [
    [t('movie.genres'), movie.genres.map((g) => g.name).join(', ')],
    [t('movie.duration'), formatDuration(movie.durationMin, t)],
    [t('movie.director'), movie.director],
    [t('movie.cast'), movie.cast.join(', ')],
    [
      t('movie.country'),
      movie.country && new Intl.DisplayNames([lang], { type: 'region' }).of(movie.country),
    ],
    [t('movie.year'), movie.year],
    [t('movie.language'), languageName(movie.originalLanguage, lang)],
    [t('movie.release'), movie.releaseDate && formatReleaseDate(movie.releaseDate, lang)],
  ].filter(([, value]) => value);

  return (
    <article>
      <div
        className={styles.hero}
        style={movie.backdropUrl ? { '--backdrop': `url("${movie.backdropUrl}")` } : undefined}
      >
        <div className={`container ${styles.heroInner}`}>
          <Poster
            src={movie.posterUrl}
            alt={t('movie.posterOf', { title: movie.title })}
            className={styles.poster}
          />
          <div className={styles.info}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{movie.title}</h1>
              <AgeBadge rating={movie.ageRating} className={styles.age} />
            </div>
            {movie.originalTitle !== movie.title && (
              <p className={styles.original}>{movie.originalTitle}</p>
            )}
            {movie.rating?.count > 0 && (
              <p className={styles.rating}>
                <StarRating value={movie.rating.average} readOnly />{' '}
                <span className={styles.ratingCount}>
                  {t('reviews.count', { count: movie.rating.count })}
                </span>
              </p>
            )}
            {movie.overview ? (
              <p className={styles.overview} lang={movie.overviewLocale ?? undefined}>
                {movie.overview}
              </p>
            ) : (
              <p className={styles.overview}>{t('movie.noOverview')}</p>
            )}
            {movie.overviewLocale && movie.overviewLocale !== lang && (
              <p className={styles.fallback}>{t('movie.overviewFallback')}</p>
            )}
            {rating?.restricted && (
              <p className={styles.warning}>{t('movie.restricted', { age: rating.minAge })}</p>
            )}
            {rating && !rating.restricted && rating.minAge > 0 && (
              <p className={styles.recommend}>{t('movie.recommended', { age: rating.minAge })}</p>
            )}
            <div className={styles.actions}>
              {movie.trailerKey && (
                <Button variant="secondary" onClick={() => setTrailerOpen(true)}>
                  {t('movie.watchTrailer')}
                </Button>
              )}
              <WatchButton movieId={movie.id} />
            </div>
          </div>
        </div>
      </div>

      <div className={`container ${styles.content}`}>
        <section className={styles.sessions} aria-labelledby="sessions-title">
          <h2 id="sessions-title" className={styles.sectionTitle}>
            {t('movie.sessions')}
          </h2>

          {days.length === 0 ? (
            <Empty>
              {movie.rentalStart > today
                ? t('movie.soonNoSessions', { date: formatReleaseDate(movie.rentalStart, lang) })
                : t('movie.noSessions')}
            </Empty>
          ) : (
            <>
              <DayTabs days={days} today={today} value={activeDay} onChange={setDay} />
              <p className={styles.dayLabel}>{formatLongDate(activeDay, lang)}</p>
              <ul className={styles.times}>
                {sessions
                  .filter((s) => s.localDate === activeDay)
                  .map((s) => (
                    <li key={s.id}>
                      <SessionButton
                        session={s}
                        movieId={movie.id}
                        selected={s.id === selectedId}
                        onSelect={select}
                      />
                    </li>
                  ))}
              </ul>

              {selected && (
                <div className={styles.selected} aria-live="polite">
                  <h3 className={styles.selectedTitle}>
                    {formatLongDate(selected.localDate, lang)}, {selected.localTime}
                  </h3>
                  <dl className={styles.selectedFacts}>
                    <div>
                      <dt>{t('schedule.hall')}</dt>
                      <dd>
                        {t(selected.hall.nameKey)}
                        {selected.hall.zavodSound && ' · ZAVOD SOUND'}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('schedule.format')}</dt>
                      <dd>{selected.format}</dd>
                    </div>
                    <div>
                      <dt>{t('movie.language')}</dt>
                      <dd>
                        {languageName(selected.language, lang)}
                        {selected.subtitles.length > 0 &&
                          ` · ${t('session.subtitles', {
                            list: selected.subtitles.map((s) => s.toUpperCase()).join(', '),
                          })}`}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('session.price')}</dt>
                      <dd>{t('session.from', { price: formatPrice(selected.priceFrom, lang) })}</dd>
                    </div>
                    <div>
                      <dt>{t('session.seats')}</dt>
                      <dd>
                        {t('session.seatsFree', {
                          free: selected.seatsFree,
                          total: selected.seatsTotal,
                        })}
                      </dd>
                    </div>
                  </dl>
                  <Button variant="primary" to={`/seats/${selected.id}`}>
                    {t('movie.chooseSeats')}
                  </Button>
                </div>
              )}
              {!selected && <p className={styles.hint}>{t('movie.pickSession')}</p>}
            </>
          )}
        </section>

        <aside className={styles.facts}>
          <h2 className={styles.sectionTitle}>{t('movie.about')}</h2>
          <dl>
            {facts.map(([label, value]) => (
              <div key={label} className={styles.fact}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {movie.source === 'tmdb' && <p className={styles.source}>{t('movie.tmdbSource')}</p>}
        </aside>
      </div>

      <div className="container">
        <MovieReviews movieId={movie.id} />
      </div>

      {trailerOpen && (
        <TrailerDialog
          videoKey={movie.trailerKey}
          title={movie.title}
          onClose={() => setTrailerOpen(false)}
        />
      )}
    </article>
  );
}
