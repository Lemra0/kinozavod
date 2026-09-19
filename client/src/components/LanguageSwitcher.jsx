import { useTranslation } from 'react-i18next';
import { LOCALES } from '@kinozavod/shared';
import { chooseLanguage } from '../i18n/index.js';
import { LANGUAGE_NAMES } from '../i18n/languageNames.js';
import styles from './LanguageSwitcher.module.css';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <div className={styles.switcher} role="group" aria-label={t('language.label')}>
      {LOCALES.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          className={styles.option}
          aria-pressed={i18n.language === lang}
          aria-label={LANGUAGE_NAMES[lang]}
          onClick={() => chooseLanguage(lang)}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
