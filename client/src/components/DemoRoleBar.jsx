import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.js';
import { useMeta } from '../api/queries.js';
import styles from './DemoRoleBar.module.css';

const ROLES = ['user', 'cashier', 'admin'];

/** In demo mode, shows the current demo role and lets you switch instantly. */
export function DemoRoleBar() {
  const { t } = useTranslation();
  const { user, demoLogin } = useAuth();
  const { data: meta } = useMeta();
  const navigate = useNavigate();

  // Only for demo accounts in demo mode.
  if (!meta?.demoMode || !user || !user.nickname?.startsWith('demo_')) return null;

  const switchTo = async (role) => {
    if (role === user.role) return;
    const u = await demoLogin(role);
    navigate(u.role === 'admin' ? '/admin' : u.role === 'cashier' ? '/staff' : '/account');
  };

  return (
    <div className={styles.bar}>
      <span className={styles.label}>{t('auth.demoNow')}</span>
      <div className={styles.roles}>
        {ROLES.map((role) => (
          <button
            key={role}
            type="button"
            className={`${styles.role} ${role === user.role ? styles.active : ''}`}
            onClick={() => switchTo(role)}
          >
            {t(`auth.demoRole.${role}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
