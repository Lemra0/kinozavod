import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSchedule } from '../api/queries.js';
import { DayTabs } from '../components/DayTabs.jsx';
import { DemoNotice } from '../components/DemoNotice.jsx';
import { MovieScheduleCard } from '../components/MovieScheduleCard.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { SoonList } from '../components/SoonList.jsx';
import { Empty, ErrorState, Loading } from '../components/States.jsx';
import { formatLongDate } from '../lib/format.js';
import styles from './HomePage.module.css';

export function HomePage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? undefined;
  const hall = params.get('hall') ?? '';
  const format = params.get('format') ?? '';

  const { data, isPending, isError, refetch, isFetching } = useSchedule({ date, hall, format });

  useEffect(() => {
    document.title = `${t('nav.schedule')} · KINOZAVOD`;
  }, [t]);

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="container">
      <header className={styles.header}>
        <h1 className={styles.title}>{t('schedule.title')}</h1>
        {data && <p className={styles.date}>{formatLongDate(data.date, i18n.language)}</p>}
      </header>

      <DemoNotice />

      {data && (
        <DayTabs
          days={data.days}
          today={data.today}
          value={data.date}
          onChange={(day) => update('date', day === data.today ? '' : day)}
        />
      )}

      <div className={styles.filters}>
        <Segmented
          label={t('schedule.format')}
          value={format}
          onChange={(v) => update('format', v)}
          options={[
            { value: '', label: t('common.all') },
            { value: '2D', label: '2D' },
            { value: '3D', label: '3D' },
          ]}
        />
        <Segmented
          label={t('schedule.hall')}
          value={hall}
          onChange={(v) => update('hall', v)}
          options={[
            { value: '', label: t('common.all') },
            { value: 'p1', label: t('halls.p1') },
            { value: 'p2', label: t('halls.p2') },
            { value: 'p3', label: t('halls.p3') },
          ]}
        />
      </div>

      <section aria-live="polite" aria-busy={isFetching} className={styles.list}>
        {isPending && <Loading />}
        {isError && <ErrorState onRetry={refetch} />}
        {data && data.movies.length === 0 && <Empty>{t('schedule.empty')}</Empty>}
        {data?.movies.map((movie) => (
          <MovieScheduleCard key={movie.id} movie={movie} />
        ))}
      </section>

      {data?.soon.length > 0 && (
        <section className={styles.soon}>
          <h2 className={styles.soonTitle}>{t('schedule.soon')}</h2>
          <SoonList movies={data.soon} />
        </section>
      )}
    </div>
  );
}
