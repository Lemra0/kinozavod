import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context.js';
import styles from './UserMenu.module.css';

/** Header account control: a Sign in link, or an avatar linking to the account. */
export function UserMenu() {
  const { t } = useTranslation();
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) return <span className={styles.placeholder} aria-hidden="true" />;

  if (!user) {
    return (
      <Link to="/login" className={styles.signIn}>
        {t('auth.login')}
      </Link>
    );
  }

  const onLogout = async () => {
    await logout();
    navigate('/');
  };

  const isStaff = user.role === 'cashier' || user.role === 'admin';

  return (
    <div className={styles.menu}>
      {user.role === 'admin' && (
        <Link to="/admin" className={styles.staff}>
          {t('admin.title')}
        </Link>
      )}
      {isStaff && (
        <Link to="/staff" className={styles.staff}>
          {t('staff.desk')}
        </Link>
      )}
      <Link to="/account" className={styles.account} title={user.nickname}>
        <img className={styles.avatar} src={`/api/users/${user.id}/avatar`} alt="" />
        <span className={styles.nick}>{user.nickname}</span>
      </Link>
      <button type="button" className={styles.logout} onClick={onLogout} title={t('auth.logout')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="visually-hidden">{t('auth.logout')}</span>
      </button>
    </div>
  );
}
