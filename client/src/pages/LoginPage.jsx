import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.js';
import { useMeta } from '../api/queries.js';
import { Button } from '../components/Button.jsx';
import styles from './AuthPages.module.css';

export function LoginPage() {
  const { t } = useTranslation();
  const { login, demoLogin, user } = useAuth();
  const { data: meta } = useMeta();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/account';
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `${t('auth.loginTitle')} · KINOZAVOD`;
  }, [t]);
  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(form);
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
        <h1 className={styles.title}>{t('auth.loginTitle')}</h1>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            <span>{t('checkout.email')}</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span>{t('auth.password')}</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {t([`errors.${error.code}`, 'errors.generic'])}
            </p>
          )}
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? t('auth.loggingIn') : t('auth.login')}
          </Button>
        </form>
        <p className={styles.switch}>
          {t('auth.noAccount')}{' '}
          <Link to={`/register?next=${encodeURIComponent(next)}`}>{t('auth.registerLink')}</Link>
        </p>

        {meta?.demoMode && (
          <div className={styles.demo}>
            <span className={styles.demoLabel}>{t('auth.demoTitle')}</span>
            <div className={styles.demoButtons}>
              {['user', 'cashier', 'admin'].map((role) => (
                <button
                  key={role}
                  type="button"
                  className={styles.demoBtn}
                  onClick={async () => {
                    const u = await demoLogin(role);
                    navigate(
                      u.role === 'admin' ? '/admin' : u.role === 'cashier' ? '/staff' : '/account',
                      {
                        replace: true,
                      },
                    );
                  }}
                >
                  {t(`auth.demoRole.${role}`)}
                </button>
              ))}
            </div>
            <span className={styles.demoHint}>{t('auth.demoHint')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
