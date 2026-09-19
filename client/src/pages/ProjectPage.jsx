import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ProjectPage.module.css';

const STACK = [
  'React + Vite',
  'Node.js + Express',
  'SQLite (better-sqlite3)',
  'CSS Modules',
  'i18next',
  'TanStack Query',
  'Vitest',
  'GitHub Actions',
];

export function ProjectPage() {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('nav.project')} · KINOZAVOD`;
  }, [t]);

  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.hero}>
        <h1 className={styles.title}>{t('project.title')}</h1>
        <p className={styles.lead}>{t('project.lead')}</p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('project.stackTitle')}</h2>
        <ul className={styles.stack}>
          {STACK.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('project.dataTitle')}</h2>
        <p>{t('project.dataText')}</p>
        <p className={styles.tmdb} lang="en">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
        <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">
          themoviedb.org
        </a>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('project.demoTitle')}</h2>
        <p>{t('project.demoText')}</p>
      </section>
    </div>
  );
}
