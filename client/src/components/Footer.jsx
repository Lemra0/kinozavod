import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './Footer.module.css';

export function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div>
          <p className={styles.brand}>KINOZAVOD</p>
          <p className={styles.muted}>
            {t('footer.address')}
            <br />
            {t('footer.hours')}
          </p>
        </div>
        <nav className={styles.links} aria-label={t('footer.nav')}>
          <Link to="/about">{t('nav.about')}</Link>
          <Link to="/project">{t('nav.project')}</Link>
          <Link to="/search">{t('nav.search')}</Link>
        </nav>
        <div className={styles.right}>
          <p className={styles.muted} lang="en">
            {t('footer.tmdb')}
          </p>
          <p className={styles.muted}>
            © {year} KINOZAVOD · {t('footer.portfolio')}
          </p>
        </div>
      </div>
    </footer>
  );
}
