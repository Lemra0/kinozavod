import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DemoBanner } from './DemoBanner.jsx';
import { DemoRoleBar } from './DemoRoleBar.jsx';
import { Header } from './Header.jsx';
import { Footer } from './Footer.jsx';
import { LanguageDialog } from './LanguageDialog.jsx';

export function Layout() {
  const { t } = useTranslation();

  return (
    <>
      <a href="#main" className="skip-link">
        {t('a11y.skipToContent')}
      </a>
      <DemoBanner />
      <DemoRoleBar />
      <Header />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <LanguageDialog />
    </>
  );
}
