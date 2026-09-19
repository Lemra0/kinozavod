import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminAddWord, adminRemoveWord, adminTestWord, adminWordFilter } from '../api/admin.js';
import { Loading } from '../components/States.jsx';
import styles from './admin.module.css';

const LISTS = ['profanity', 'hate', 'exception'];
const LOCALES = ['en', 'ru', 'et'];

export function AdminWordFilterPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({
    locale: 'ru',
    list: 'profanity',
    pattern: '',
    matchType: 'root',
  });
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = `${t('admin.nav.words')} · KINOZAVOD`;
  }, [t]);

  const load = () => adminWordFilter().then((r) => setItems(r.items));
  useEffect(() => {
    let active = true;
    adminWordFilter().then((r) => active && setItems(r.items));
    return () => {
      active = false;
    };
  }, []);

  const add = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.pattern.trim()) return;
    try {
      await adminAddWord(form);
      setForm({ ...form, pattern: '' });
      load();
    } catch (err) {
      setError(err);
    }
  };
  const remove = async (id) => {
    await adminRemoveWord(id);
    load();
  };
  const test = async (e) => {
    e.preventDefault();
    const r = await adminTestWord(testText);
    setTestResult(r.allowed);
  };

  if (!items)
    return (
      <div className={styles.page}>
        <Loading />
      </div>
    );

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>{t('admin.nav.words')}</h1>
      </div>

      <form
        onSubmit={add}
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          marginBottom: 16,
        }}
      >
        <label className={styles.field}>
          <span>{t('admin.words.locale')}</span>
          <select
            className={styles.select}
            value={form.locale}
            onChange={(e) => setForm({ ...form, locale: e.target.value })}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>{t('admin.words.list')}</span>
          <select
            className={styles.select}
            value={form.list}
            onChange={(e) => setForm({ ...form, list: e.target.value })}
          >
            {LISTS.map((l) => (
              <option key={l} value={l}>
                {t(`admin.words.lists.${l}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>{t('admin.words.matchType')}</span>
          <select
            className={styles.select}
            value={form.matchType}
            onChange={(e) => setForm({ ...form, matchType: e.target.value })}
          >
            <option value="word">{t('admin.words.word')}</option>
            <option value="root">{t('admin.words.root')}</option>
          </select>
        </label>
        <label className={styles.field} style={{ flex: 1, minWidth: 180 }}>
          <span>{t('admin.words.pattern')}</span>
          <input
            className={styles.input}
            value={form.pattern}
            onChange={(e) => setForm({ ...form, pattern: e.target.value })}
          />
        </label>
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>
          {t('admin.words.add')}
        </button>
      </form>
      {error && <p className={styles.error}>{t([`errors.${error.code}`, 'errors.generic'])}</p>}

      <form
        onSubmit={test}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}
      >
        <label className={styles.field} style={{ flex: 1 }}>
          <span>{t('admin.words.testLabel')}</span>
          <input
            className={styles.input}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
          />
        </label>
        <button type="submit" className={styles.btn}>
          {t('admin.words.test')}
        </button>
        {testResult !== null && (
          <span
            className={styles.badge}
            style={{ color: testResult ? 'var(--success)' : 'var(--accent)' }}
          >
            {testResult ? t('admin.words.allowed') : t('admin.words.blocked')}
          </span>
        )}
      </form>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('admin.words.locale')}</th>
            <th>{t('admin.words.list')}</th>
            <th>{t('admin.words.pattern')}</th>
            <th>{t('admin.words.matchType')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className={styles.empty}>
                {t('admin.words.none')}
              </td>
            </tr>
          )}
          {items.map((w) => (
            <tr key={w.id}>
              <td>{w.locale.toUpperCase()}</td>
              <td>{t(`admin.words.lists.${w.list}`)}</td>
              <td>{w.pattern}</td>
              <td>{t(`admin.words.${w.matchType}`)}</td>
              <td>
                <button type="button" className={styles.smallBtn} onClick={() => remove(w.id)}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
