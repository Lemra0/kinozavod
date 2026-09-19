import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminUpdateUser, adminUsers } from '../api/admin.js';
import { useAuth } from '../auth/context.js';
import { Loading } from '../components/States.jsx';
import styles from './admin.module.css';

const ROLES = ['user', 'cashier', 'admin'];

export function AdminUsersPage() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = `${t('admin.nav.users')} · KINOZAVOD`;
  }, [t]);

  const load = (query = q) => adminUsers(query).then((r) => setUsers(r.users));
  useEffect(() => {
    let active = true;
    adminUsers('').then((r) => active && setUsers(r.users));
    return () => {
      active = false;
    };
  }, []);

  const update = async (id, patch) => {
    setError(null);
    try {
      await adminUpdateUser(id, patch);
      load();
    } catch (err) {
      setError(err);
    }
  };

  if (!users)
    return (
      <div className={styles.page}>
        <Loading />
      </div>
    );

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>{t('admin.nav.users')}</h1>
        <form
          className={styles.actions}
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <input
            className={styles.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('admin.users.search')}
          />
          <button type="submit" className={styles.btn}>
            {t('admin.users.find')}
          </button>
        </form>
      </div>
      {error && <p className={styles.error}>{t([`errors.${error.code}`, 'errors.generic'])}</p>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('admin.users.nickname')}</th>
            <th>{t('admin.users.email')}</th>
            <th>{t('admin.users.role')}</th>
            <th>{t('admin.users.status')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.isBlocked ? styles.archived : ''}>
              <td>{u.nickname}</td>
              <td>{u.email}</td>
              <td>
                <select
                  className={styles.select}
                  value={u.role}
                  disabled={u.id === me.id}
                  onChange={(e) => update(u.id, { role: e.target.value })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`admin.users.roles.${r}`)}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {u.isBlocked ? (
                  <span className={styles.badge}>{t('admin.users.blocked')}</span>
                ) : (
                  t('admin.users.active')
                )}
              </td>
              <td>
                <div className={styles.rowActions}>
                  {u.id !== me.id && (
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => update(u.id, { isBlocked: !u.isBlocked })}
                    >
                      {u.isBlocked ? t('admin.users.unblock') : t('admin.users.block')}
                    </button>
                  )}
                  {u.hasCustomAvatar && (
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => update(u.id, { resetAvatar: true })}
                    >
                      {t('admin.users.resetAvatar')}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={() => update(u.id, { resetNickname: true })}
                  >
                    {t('admin.users.resetNickname')}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
