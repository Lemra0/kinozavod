import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.js';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import styles from './AdminLayout.module.css';

const NAV = [
  { to: '/admin', key: 'admin.nav.movies', end: true },
  { to: '/admin/sessions', key: 'admin.nav.sessions' },
  { to: '/admin/prices', key: 'admin.nav.prices' },
  { to: '/admin/halls', key: 'admin.nav.halls' },
  { to: '/admin/users', key: 'admin.nav.users' },
  { to: '/admin/reviews', key: 'admin.nav.reviews' },
  { to: '/admin/word-filter', key: 'admin.nav.words' },
];

export function AdminLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const onLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <div className={styles.brand}>
          KINOZAVOD <span className={styles.tag}>{t('admin.title')}</span>
        </div>
        <nav className={styles.nav}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
        <div className={styles.foot}>
          <ThemeToggle />
          <span className={styles.who}>{user?.nickname}</span>
          <button type="button" className={styles.logout} onClick={onLogout}>
            {t('auth.logout')}
          </button>
        </div>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
