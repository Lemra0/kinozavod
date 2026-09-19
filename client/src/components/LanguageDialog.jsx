import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FALLBACK_LOCALE, LOCALES } from '@kinozavod/shared';
import { chooseLanguage, needsLanguageChoice } from '../i18n/index.js';
import { LANGUAGE_NAMES } from '../i18n/languageNames.js';
import styles from './LanguageDialog.module.css';

/**
 * First-visit language choice.
 * Shown only when the browser language is not English, Russian or Estonian
 * and the visitor has not chosen a language before.
 */
export function LanguageDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(needsLanguageChoice);
  const firstButton = useRef(null);

  useEffect(() => {
    if (open) firstButton.current?.focus();
  }, [open]);

  if (!open) return null;

  const pick = (lang) => {
    chooseLanguage(lang);
    setOpen(false);
  };

  // Escape keeps the fallback language; Tab stays inside the dialog.
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      pick(FALLBACK_LOCALE);
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = [...event.currentTarget.querySelectorAll('button')];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={styles.backdrop}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-dialog-title"
        aria-describedby="language-dialog-text"
        onKeyDown={onKeyDown}
      >
        <h2 id="language-dialog-title" className={styles.title}>
          {t('language.dialogTitle')}
        </h2>
        <div className={styles.options}>
          {LOCALES.map((lang, index) => (
            <button
              key={lang}
              ref={index === 0 ? firstButton : undefined}
              type="button"
              lang={lang}
              className={styles.option}
              onClick={() => pick(lang)}
            >
              <span className={styles.code} aria-hidden="true">
                {lang.toUpperCase()}
              </span>
              <span>{LANGUAGE_NAMES[lang]}</span>
            </button>
          ))}
        </div>
        <p id="language-dialog-text" className={styles.text}>
          {t('language.dialogText')}
        </p>
      </div>
    </div>
  );
}
