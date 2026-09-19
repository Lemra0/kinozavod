import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo.jsx';
import { LanguageSwitcher } from './LanguageSwitcher.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { SearchBox } from './SearchBox.jsx';
import { UserMenu } from './UserMenu.jsx';
import styles from './Header.module.css';

const NAV_ITEMS = [
  { to: '/', key: 'nav.schedule', end: true },
  { to: '/movies', key: 'nav.movies' },
  { to: '/search', key: 'nav.search' },
  { to: '/about', key: 'nav.about' },
];

export function Header() {
  const { t } = useTranslation();

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Logo />
        <nav aria-label={t('a11y.mainNav')} className={styles.nav}>
          <ul className={styles.list}>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
                >
                  {t(item.key)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <SearchBox />
        <div className={styles.tools}>
          <UserMenu />
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
