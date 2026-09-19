import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminPrices, adminUpdatePrices } from '../api/admin.js';
import { Loading } from '../components/States.jsx';
import styles from './admin.module.css';

const CENTS = [
  'seatStandard',
  'seatVip',
  'seatSofa',
  'surcharge3dPerViewer',
  'morningDiscountPerViewer',
];

export function AdminPricesPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = `${t('admin.nav.prices')} · KINOZAVOD`;
  }, [t]);
  useEffect(() => {
    adminPrices().then((r) => setForm(r.prices));
  }, []);

  if (!form)
    return (
      <div className={styles.page}>
        <Loading />
      </div>
    );

  const setEuro = (key, value) => setForm({ ...form, [key]: Math.round(Number(value) * 100) });

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const patch = {};
      for (const k of CENTS) patch[k] = form[k];
      patch.morningUntil = form.morningUntil;
      const r = await adminUpdatePrices(patch);
      setForm(r.prices);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>{t('admin.nav.prices')}</h1>
      </div>
      {saved && <p className={styles.note}>{t('admin.prices.saved')}</p>}
      {error && <p className={styles.error}>{t([`errors.${error.code}`, 'errors.generic'])}</p>}
      <form onSubmit={submit} style={{ maxWidth: 420 }}>
        {CENTS.map((key) => (
          <label key={key} className={styles.field}>
            <span>{t(`admin.prices.${key}`)} (€)</span>
            <input
              className={styles.input}
              type="number"
              step="0.5"
              min="0"
              value={(form[key] / 100).toString()}
              onChange={(e) => setEuro(key, e.target.value)}
            />
          </label>
        ))}
        <label className={styles.field}>
          <span>{t('admin.prices.morningUntil')}</span>
          <input
            className={styles.input}
            type="time"
            step="600"
            value={form.morningUntil}
            onChange={(e) => setForm({ ...form, morningUntil: e.target.value })}
          />
        </label>
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>
          {t('admin.prices.save')}
        </button>
      </form>
    </div>
  );
}
