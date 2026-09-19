import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RULES, ageOn } from '@kinozavod/shared';
import { useAuth } from '../auth/context.js';
import { nicknameAvailable } from '../api/auth.js';
import { Button } from '../components/Button.jsx';
import styles from './AuthPages.module.css';

const empty = { nickname: '', firstName: '', lastName: '', birthDate: '', email: '', password: '' };

export function RegisterPage() {
  const { t, i18n } = useTranslation();
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/account';
  const [form, setForm] = useState(empty);
  const [nickState, setNickState] = useState(null); // null | 'checking' | 'free' | 'taken'
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `${t('auth.registerTitle')} · KINOZAVOD`;
  }, [t]);
  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  // Debounced nickname availability check.
  useEffect(() => {
    const nick = form.nickname.trim();
    if (nick.length < 3) {
      const clear = setTimeout(() => setNickState(null), 0);
      return () => clearTimeout(clear);
    }
    const checking = setTimeout(() => setNickState('checking'), 0);
    const timer = setTimeout(() => {
      nicknameAvailable(nick)
        .then((r) => setNickState(r.available ? 'free' : 'taken'))
        .catch(() => setNickState(null));
    }, 350);
    return () => {
      clearTimeout(checking);
      clearTimeout(timer);
    };
  }, [form.nickname]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const tooYoung =
    form.birthDate &&
    ageOn(form.birthDate, new Date().toISOString().slice(0, 10)) < RULES.minRegistrationAge;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (tooYoung) {
      setError({ code: 'TOO_YOUNG' });
      return;
    }
    setBusy(true);
    try {
      await register({ ...form, locale: i18n.language });
      navigate(next, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('auth.registerTitle')}</h1>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            <span>{t('auth.nickname')}</span>
            <input
              required
              minLength={3}
              maxLength={20}
              value={form.nickname}
              onChange={set('nickname')}
              aria-describedby="nick-state"
            />
            <small id="nick-state" className={styles.hint}>
              {nickState === 'checking' && t('auth.nickChecking')}
              {nickState === 'free' && <span className={styles.ok}>{t('auth.nickFree')}</span>}
              {nickState === 'taken' && <span className={styles.bad}>{t('auth.nickTaken')}</span>}
              {!nickState && t('auth.nickHint')}
            </small>
          </label>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>{t('checkout.firstName')}</span>
              <input required value={form.firstName} onChange={set('firstName')} />
            </label>
            <label className={styles.field}>
              <span>{t('checkout.lastName')}</span>
              <input required value={form.lastName} onChange={set('lastName')} />
            </label>
          </div>
          <label className={styles.field}>
            <span>{t('auth.birthDate')}</span>
            <input
              type="date"
              required
              value={form.birthDate}
              onChange={set('birthDate')}
              max="2099-12-31"
            />
            {tooYoung && (
              <small className={styles.bad}>
                {t('auth.tooYoung', { age: RULES.minRegistrationAge })}
              </small>
            )}
          </label>
          <label className={styles.field}>
            <span>{t('checkout.email')}</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
            />
          </label>
          <label className={styles.field}>
            <span>{t('auth.password')}</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
            />
            <small className={styles.hint}>{t('auth.passwordHint')}</small>
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {t([`errors.${error.code}`, 'errors.generic'])}
            </p>
          )}
          <Button
            variant="primary"
            type="submit"
            disabled={busy || nickState === 'taken' || tooYoung}
          >
            {busy ? t('auth.registering') : t('auth.register')}
          </Button>
        </form>
        <p className={styles.switch}>
          {t('auth.haveAccount')}{' '}
          <Link to={`/login?next=${encodeURIComponent(next)}`}>{t('auth.loginLink')}</Link>
        </p>
      </div>
    </div>
  );
}
