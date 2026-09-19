import { useTranslation } from 'react-i18next';
import { Segmented } from './Segmented.jsx';
import styles from './SearchFilters.module.css';

const PERIODS = ['all', 'today', 'tomorrow', 'week', 'next-week', 'month'];
const TIME_BANDS = ['morning', 'afternoon', 'evening', 'late'];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/** The filter panel of the search page. `set` merges a patch into the state. */
export function SearchFilters({ state, set, filters }) {
  const { t } = useTranslation();
  const genres = filters?.genres ?? [];
  const languages = filters?.languages ?? [];

  const toggleInArray = (key, value) => {
    const list = state[key];
    set({ [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
  };

  return (
    <div className={styles.panel}>
      <Field label={t('search.period.label')}>
        <div className={styles.chips}>
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              className={styles.chip}
              aria-pressed={state.period === period}
              onClick={() => set({ period })}
            >
              {t(`search.period.${period}`)}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('search.time.label')}>
        <div className={styles.chips}>
          {TIME_BANDS.map((band) => (
            <button
              key={band}
              type="button"
              className={styles.chip}
              aria-pressed={state.timeBand === band}
              onClick={() =>
                set({ timeBand: state.timeBand === band ? '' : band, timeFrom: '', timeTo: '' })
              }
            >
              {t(`search.time.${band}`)}
            </button>
          ))}
        </div>
        <div className={styles.range}>
          <label>
            <span>{t('search.time.from')}</span>
            <input
              type="time"
              step="900"
              value={state.timeFrom}
              onChange={(e) => set({ timeFrom: e.target.value, timeBand: '' })}
            />
          </label>
          <label>
            <span>{t('search.time.to')}</span>
            <input
              type="time"
              step="900"
              value={state.timeTo}
              onChange={(e) => set({ timeTo: e.target.value, timeBand: '' })}
            />
          </label>
        </div>
      </Field>

      <Field label={t('search.weekdays')}>
        <div className={styles.chips}>
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              className={styles.chip}
              aria-pressed={state.weekdays.includes(day)}
              onClick={() => toggleInArray('weekdays', day)}
            >
              {t(`search.weekdayShort.${day}`)}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('schedule.format')}>
        <Segmented
          label=""
          value={state.format}
          onChange={(format) => set({ format })}
          options={[
            { value: '', label: t('common.all') },
            { value: '2D', label: '2D' },
            { value: '3D', label: '3D' },
          ]}
        />
      </Field>

      <Field label={t('schedule.hall')}>
        <Segmented
          label=""
          value={state.hall}
          onChange={(hall) => set({ hall })}
          options={[
            { value: '', label: t('common.all') },
            { value: 'p1', label: t('halls.p1') },
            { value: 'p2', label: t('halls.p2') },
            { value: 'p3', label: t('halls.p3') },
          ]}
        />
      </Field>

      {genres.length > 0 && (
        <Field label={t('movie.genres')}>
          <div className={styles.chips}>
            {genres.map((genre) => (
              <button
                key={genre.id}
                type="button"
                className={styles.chip}
                aria-pressed={state.genres.includes(genre.id)}
                onClick={() => toggleInArray('genres', genre.id)}
              >
                {genre.name}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label={t('search.age.label')}>
        <Segmented
          label=""
          value={state.age}
          onChange={(age) => set({ age })}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'no-restricted', label: t('search.age.no-restricted') },
            { value: 'family', label: t('search.age.family') },
          ]}
        />
      </Field>

      <Field label={t('search.seats.label')}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={state.hasSeats}
            onChange={(e) => set({ hasSeats: e.target.checked })}
          />
          {t('search.seats.available')}
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={state.premiumSeats}
            onChange={(e) => set({ premiumSeats: e.target.checked })}
          />
          {t('search.seats.premium')}
        </label>
        <label className={styles.number}>
          <span>{t('search.seats.togetherLabel')}</span>
          <input
            type="number"
            min="1"
            max="10"
            value={state.together}
            onChange={(e) =>
              set({ together: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })
            }
          />
        </label>
      </Field>

      {languages.length > 0 && (
        <Field label={t('movie.language')}>
          <select
            className={styles.select}
            value={state.language}
            onChange={(e) => set({ language: e.target.value })}
          >
            <option value="">{t('common.all')}</option>
            {languages.map((code) => (
              <option key={code} value={code}>
                {code.toUpperCase()}
              </option>
            ))}
          </select>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={state.zavodSound}
              onChange={(e) => set({ zavodSound: e.target.checked })}
            />
            ZAVOD SOUND
          </label>
        </Field>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <h3 className={styles.label}>{label}</h3>
      {children}
    </div>
  );
}
