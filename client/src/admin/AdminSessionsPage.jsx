import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  adminBulkSessions,
  adminCancelSession,
  adminCreateSession,
  adminHalls,
  adminMovies,
  adminSessions,
} from '../api/admin.js';
import { Loading } from '../components/States.jsx';
import { RULES } from '@kinozavod/shared';
import styles from './admin.module.css';

const today = () => new Date().toISOString().slice(0, 10);
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export function AdminSessionsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [movies, setMovies] = useState([]);
  const [halls, setHalls] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = `${t('admin.nav.sessions')} · KINOZAVOD`;
  }, [t]);

  const load = () => adminSessions(date, lang).then(setData);
  useEffect(() => {
    let active = true;
    adminSessions(date, lang).then((r) => active && setData(r));
    return () => {
      active = false;
    };
  }, [date, lang]);
  useEffect(() => {
    adminMovies(lang).then((r) => setMovies(r.movies.filter((m) => !m.isArchived)));
    adminHalls().then((r) => setHalls(r.halls));
  }, [lang]);

  const cancel = async (s) => {
    if (!window.confirm(t('admin.sessions.cancelConfirm'))) return;
    setError(null);
    try {
      const r = await adminCancelSession(s.id);
      load();
      if (r.refunded > 0) window.alert(t('admin.sessions.refunded', { n: r.refunded }));
    } catch (err) {
      setError(err);
    }
  };

  if (!data)
    return (
      <div className={styles.page}>
        <Loading />
      </div>
    );

  const lowCoverage = data.coverageDays < RULES.scheduleHorizonDays;

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>{t('admin.nav.sessions')}</h1>
        <div className={styles.actions}>
          <input
            type="date"
            className={styles.input}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button type="button" className={styles.btn} onClick={() => setCreateOpen(true)}>
            {t('admin.sessions.add')}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setBulkOpen(true)}
          >
            {t('admin.sessions.bulk')}
          </button>
        </div>
      </div>

      {lowCoverage && (
        <p className={styles.warn}>
          {t('admin.sessions.lowCoverage', { days: data.coverageDays })}
        </p>
      )}
      {error && <p className={styles.error}>{t([`errors.${error.code}`, 'errors.generic'])}</p>}

      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('admin.sessions.time')}</th>
            <th>{t('admin.sessions.movie')}</th>
            <th>{t('admin.sessions.hall')}</th>
            <th>{t('admin.sessions.format')}</th>
            <th>{t('admin.sessions.sold')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.sessions.length === 0 && (
            <tr>
              <td colSpan={6} className={styles.empty}>
                {t('admin.sessions.none')}
              </td>
            </tr>
          )}
          {data.sessions.map((s) => (
            <tr key={s.id} className={s.status === 'cancelled' ? styles.archived : ''}>
              <td>{s.localTime}</td>
              <td>{s.movieTitle}</td>
              <td>{t(s.hallNameKey)}</td>
              <td>{s.format}</td>
              <td>{s.sold}</td>
              <td>
                {s.status === 'cancelled' ? (
                  <span className={styles.badge}>{t('admin.sessions.cancelled')}</span>
                ) : (
                  <button type="button" className={styles.smallBtn} onClick={() => cancel(s)}>
                    {t('admin.sessions.cancel')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {createOpen && (
        <CreateDialog
          movies={movies}
          halls={halls}
          date={date}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}
      {bulkOpen && (
        <BulkDialog
          movies={movies}
          halls={halls}
          onClose={() => setBulkOpen(false)}
          onCreated={() => {
            setBulkOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function MovieHallFormats({ movies, halls, form, setForm }) {
  const { t } = useTranslation();
  const hall = halls.find((h) => h.id === Number(form.hallId));
  const formats = hall ? hall.formats : ['2D'];
  return (
    <>
      <label className={styles.field}>
        <span>{t('admin.sessions.movie')}</span>
        <select
          className={styles.select}
          value={form.movieId}
          onChange={(e) => setForm({ ...form, movieId: e.target.value })}
        >
          <option value="">—</option>
          {movies.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.grid2}>
        <label className={styles.field}>
          <span>{t('admin.sessions.hall')}</span>
          <select
            className={styles.select}
            value={form.hallId}
            onChange={(e) => setForm({ ...form, hallId: e.target.value, format: '2D' })}
          >
            <option value="">—</option>
            {halls.map((h) => (
              <option key={h.id} value={h.id}>
                {t(h.nameKey)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>{t('admin.sessions.format')}</span>
          <select
            className={styles.select}
            value={form.format}
            onChange={(e) => setForm({ ...form, format: e.target.value })}
          >
            {formats.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

function CreateDialog({ movies, halls, date, onClose, onCreated }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ movieId: '', hallId: '', date, time: '18:00', format: '2D' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await adminCreateSession({
        movieId: Number(form.movieId),
        hallId: Number(form.hallId),
        date: form.date,
        time: form.time,
        format: form.format,
      });
      onCreated();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalBack} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2>{t('admin.sessions.addTitle')}</h2>
          <button type="button" className={styles.smallBtn} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <form onSubmit={submit}>
          <MovieHallFormats movies={movies} halls={halls} form={form} setForm={setForm} />
          <div className={styles.grid2}>
            <label className={styles.field}>
              <span>{t('admin.sessions.date')}</span>
              <input
                type="date"
                className={styles.input}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>{t('admin.sessions.startTime')}</span>
              <input
                type="time"
                step="600"
                className={styles.input}
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </label>
          </div>
          {error && <p className={styles.error}>{t([`errors.${error.code}`, 'errors.generic'])}</p>}
          <button
            type="submit"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={busy || !form.movieId || !form.hallId}
          >
            {t('admin.sessions.create')}
          </button>
        </form>
      </div>
    </div>
  );
}

function BulkDialog({ movies, halls, onClose, onCreated }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    movieId: '',
    hallId: '',
    format: '2D',
    startDate: today(),
    weeks: 1,
  });
  const [slots, setSlots] = useState([{ weekday: 1, time: '18:00' }]);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const addSlot = () => setSlots([...slots, { weekday: 1, time: '18:00' }]);
  const removeSlot = (i) => setSlots(slots.filter((_, idx) => idx !== i));
  const setSlot = (i, patch) =>
    setSlots(slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await adminBulkSessions({
        movieId: Number(form.movieId),
        hallId: Number(form.hallId),
        format: form.format,
        startDate: form.startDate,
        weeks: Number(form.weeks),
        slots: slots.map((s) => ({ weekday: Number(s.weekday), time: s.time })),
      });
      setResult(r);
      onCreated();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalBack} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2>{t('admin.sessions.bulkTitle')}</h2>
          <button type="button" className={styles.smallBtn} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <form onSubmit={submit}>
          <MovieHallFormats movies={movies} halls={halls} form={form} setForm={setForm} />
          <div className={styles.grid2}>
            <label className={styles.field}>
              <span>{t('admin.sessions.startDate')}</span>
              <input
                type="date"
                className={styles.input}
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>{t('admin.sessions.weeks')}</span>
              <input
                type="number"
                min="1"
                max="4"
                className={styles.input}
                value={form.weeks}
                onChange={(e) => setForm({ ...form, weeks: e.target.value })}
              />
            </label>
          </div>
          <span className={styles.field}>
            <span>{t('admin.sessions.slots')}</span>
          </span>
          {slots.map((slot, i) => (
            <div key={i} className={styles.grid2} style={{ marginBottom: 6 }}>
              <select
                className={styles.select}
                value={slot.weekday}
                onChange={(e) => setSlot(i, { weekday: e.target.value })}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {t(`search.weekdayShort.${d}`)}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="time"
                  step="600"
                  className={styles.input}
                  value={slot.time}
                  onChange={(e) => setSlot(i, { time: e.target.value })}
                  style={{ flex: 1 }}
                />
                {slots.length > 1 && (
                  <button type="button" className={styles.smallBtn} onClick={() => removeSlot(i)}>
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            className={styles.smallBtn}
            onClick={addSlot}
            style={{ marginBottom: 12 }}
          >
            + {t('admin.sessions.addSlot')}
          </button>
          {error && <p className={styles.error}>{t([`errors.${error.code}`, 'errors.generic'])}</p>}
          {result && (
            <p className={styles.note}>
              {t('admin.sessions.bulkResult', {
                created: result.created,
                skipped: result.skipped.length,
              })}
            </p>
          )}
          <button
            type="submit"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={busy || !form.movieId || !form.hallId}
          >
            {t('admin.sessions.create')}
          </button>
        </form>
      </div>
    </div>
  );
}
