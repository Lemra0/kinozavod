import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.js';
import { ProfileSection } from '../components/account/ProfileSection.jsx';
import { OrdersSection } from '../components/account/OrdersSection.jsx';
import { WatchlistSection } from '../components/account/WatchlistSection.jsx';
import { ReviewsSection } from '../components/account/ReviewsSection.jsx';
import { Loading } from '../components/States.jsx';
import styles from './AccountPage.module.css';

const TABS = ['profile', 'orders', 'watchlist', 'reviews'];

export function AccountPage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'profile';

  useEffect(() => {
    document.title = `${t('account.title')} · KINOZAVOD`;
  }, [t]);
  useEffect(() => {
    if (!loading && !user) navigate('/login?next=/account', { replace: true });
  }, [loading, user, navigate]);

  if (loading || !user)
    return (
      <div className="container">
        <Loading />
      </div>
    );

  return (
    <div className={`container ${styles.page}`}>
      <h1 className={styles.title}>{t('account.title')}</h1>
      <div className={styles.tabs} role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            className={styles.tab}
            onClick={() => setParams(name === 'profile' ? {} : { tab: name }, { replace: true })}
          >
            {t(`account.tab.${name}`)}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileSection key={user.id} />}
      {tab === 'orders' && <OrdersSection />}
      {tab === 'watchlist' && <WatchlistSection />}
      {tab === 'reviews' && <ReviewsSection />}
    </div>
  );
}
