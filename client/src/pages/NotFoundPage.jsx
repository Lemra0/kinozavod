import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button.jsx';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  const { t } = useTranslation();
  const heading = useRef(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = '404 · KINOZAVOD';
    heading.current?.focus();
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <section className={styles.page}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.leader} aria-hidden="true">
          <span>4</span>
        </div>
        <div>
          <p className={styles.code} aria-hidden="true">
            404
          </p>
          <h1 ref={heading} tabIndex={-1} className={styles.title}>
            {t('notFound.title')}
          </h1>
          <p className={styles.text}>{t('notFound.text')}</p>
          <div className={styles.actions}>
            <Button variant="primary" to="/">
              {t('notFound.home')}
            </Button>
            <Button variant="secondary" to="/">
              {t('notFound.schedule')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
