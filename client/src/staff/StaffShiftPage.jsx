import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { staffShiftSummary } from '../api/staff.js';
import { Loading } from '../components/States.jsx';
import { formatPrice } from '../lib/format.js';
import { getPrintLayout, setPrintLayout } from './print.js';
import styles from './StaffShift.module.css';

export function StaffShiftPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [summary, setSummary] = useState(null);
  const [layout, setLayout] = useState(getPrintLayout());

  useEffect(() => {
    document.title = `${t('staff.nav.shift')} · KINOZAVOD`;
  }, [t]);

  useEffect(() => {
    let active = true;
    staffShiftSummary().then((r) => active && setSummary(r));
    return () => {
      active = false;
    };
  }, []);

  const changeLayout = (value) => {
    setPrintLayout(value);
    setLayout(value);
  };

  if (!summary)
    return (
      <div className={styles.page}>
        <Loading />
      </div>
    );

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('staff.shift.title')}</h1>
      <p className={styles.date}>{summary.date}</p>

      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('staff.shift.ticketsSold')}</span>
          <span className={styles.cardValue}>{summary.ticketsSold}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('staff.shift.net')}</span>
          <span className={styles.cardValue}>{formatPrice(summary.net, lang)}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('staff.shift.refunds')}</span>
          <span className={styles.cardValue}>{summary.refundCount}</span>
        </div>
      </div>

      <h2 className={styles.h2}>{t('staff.shift.byMethod')}</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('staff.shift.method')}</th>
            <th>{t('staff.shift.sold')}</th>
            <th>{t('staff.shift.refunded')}</th>
          </tr>
        </thead>
        <tbody>
          {['cash', 'card_terminal', 'card_demo'].map((m) => {
            const row = summary.byMethod[m];
            if (!row) return null;
            return (
              <tr key={m}>
                <td>{t(`staff.shift.methods.${m}`)}</td>
                <td>{formatPrice(row.sold, lang)}</td>
                <td>{formatPrice(row.refunded, lang)}</td>
              </tr>
            );
          })}
          {Object.keys(summary.byMethod).length === 0 && (
            <tr>
              <td colSpan={3} className={styles.empty}>
                {t('staff.shift.noSales')}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2 className={styles.h2}>{t('staff.shift.printSettings')}</h2>
      <div className={styles.layoutRow}>
        <span>{t('staff.shift.printLayout')}</span>
        <button
          type="button"
          className={`${styles.layoutBtn} ${layout === 'receipt' ? styles.layoutActive : ''}`}
          onClick={() => changeLayout('receipt')}
        >
          {t('staff.shift.receipt')}
        </button>
        <button
          type="button"
          className={`${styles.layoutBtn} ${layout === 'a4' ? styles.layoutActive : ''}`}
          onClick={() => changeLayout('a4')}
        >
          A4
        </button>
      </div>
    </div>
  );
}
