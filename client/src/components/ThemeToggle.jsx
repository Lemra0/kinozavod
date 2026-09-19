import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ThemeToggle.module.css';

const STORAGE_KEY = 'kz-theme';

function readTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function ThemeToggle() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState(readTheme);

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore: the theme then lasts for this visit only.
    }
    setTheme(next);
  };

  const label = theme === 'light' ? t('theme.toDark') : t('theme.toLight');

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        {theme === 'light' ? (
          <path
            d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </g>
        )}
      </svg>
    </button>
  );
}
