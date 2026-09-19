import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useHalls, useMeta } from '../api/queries.js';
import styles from './AboutPage.module.css';

export function AboutPage() {
  const { t } = useTranslation();
  const { data: meta } = useMeta();
  const { data: hallsData } = useHalls();

  useEffect(() => {
    document.title = `${t('nav.about')} · KINOZAVOD`;
  }, [t]);

  const cinema = meta?.cinema;

  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.hero}>
        <p className={styles.kicker}>{t('about.kicker')}</p>
        <h1 className={styles.title}>{t('about.title')}</h1>
        <p className={styles.lead}>{t('about.legend')}</p>
      </header>

      <section className={styles.halls}>
        <h2 className={styles.sectionTitle}>{t('about.hallsTitle')}</h2>
        <div className={styles.hallGrid}>
          {hallsData?.halls.map((hall) => (
            <article key={hall.code} className={styles.hall}>
              <span className={styles.hallNo} aria-hidden="true">
                {hall.code.replace('p', '0')}
              </span>
              <h3 className={styles.hallName}>{t(hall.nameKey)}</h3>
              <p className={styles.hallMeta}>
                {t('about.hallSeats', { count: hall.seatsTotal })}
                <br />
                {hall.formats.join(' · ')}
                {hall.hasZavodSound && ' · ZAVOD SOUND'}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.info}>
        <div>
          <h2 className={styles.sectionTitle}>{t('about.visitTitle')}</h2>
          <dl className={styles.facts}>
            <div>
              <dt>{t('about.address')}</dt>
              <dd>{cinema?.address ?? 'Vana-Kinotehase 3, Tallinn'}</dd>
            </div>
            <div>
              <dt>{t('about.hours')}</dt>
              <dd>{t('about.hoursValue')}</dd>
            </div>
            <div>
              <dt>{t('about.rules')}</dt>
              <dd>{t('about.rulesValue')}</dd>
            </div>
          </dl>
        </div>
        <div className={styles.mapBox} aria-hidden="true">
          <svg viewBox="0 0 300 200" className={styles.map}>
            <rect width="300" height="200" fill="var(--surface-2)" />
            <g stroke="var(--border)" strokeWidth="2">
              <path d="M0 70 H300 M0 130 H300 M110 0 V200 M210 0 V200" />
            </g>
            <rect x="120" y="80" width="80" height="42" fill="var(--accent)" />
            <text
              x="160"
              y="106"
              textAnchor="middle"
              fontFamily="var(--font-stencil)"
              fontSize="22"
              fill="var(--on-accent)"
            >
              KZ
            </text>
          </svg>
        </div>
      </section>
    </div>
  );
}
