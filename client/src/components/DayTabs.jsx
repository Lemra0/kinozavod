import { useTranslation } from 'react-i18next';
import { formatDayLabel } from '../lib/format.js';
import styles from './DayTabs.module.css';

export function DayTabs({ days, today, value, onChange }) {
  const { t, i18n } = useTranslation();

  return (
    <div className={styles.tabs} role="group" aria-label={t('schedule.chooseDay')}>
      {days.map((day) => (
        <button
          key={day}
          type="button"
          className={styles.tab}
          aria-pressed={day === value}
          onClick={() => onChange(day)}
        >
          {formatDayLabel(day, today, i18n.language, t)}
        </button>
      ))}
    </div>
  );
}
