import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.js';
import styles from './StaffLayout.module.css';

const NAV = [
  { to: '/staff', key: 'staff.nav.sell', end: true },
  { to: '/staff/check', key: 'staff.nav.check' },
  { to: '/staff/orders', key: 'staff.nav.orders' },
  { to: '/staff/shift', key: 'staff.nav.shift' },
];

/** Box-office shell: strict, high-contrast, large controls, no public chrome. */
export function StaffLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className={styles.shell} data-theme="dark">
      <header className={styles.header}>
        <div className={styles.brand}>
          KINOZAVOD <span className={styles.desk}>{t('staff.desk')}</span>
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
        <div className={styles.right}>
          <span className={styles.who}>{user?.nickname}</span>
          <button type="button" className={styles.logout} onClick={onLogout}>
            {t('auth.logout')}
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
