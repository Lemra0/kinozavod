import { Link } from 'react-router-dom';
import styles from './Logo.module.css';

export function Logo() {
  return (
    <Link to="/" className={styles.logo} aria-label="KINOZAVOD">
      <span className={styles.word} aria-hidden="true">
        KINO<span className={styles.accent}>ZAVOD</span>
      </span>
    </Link>
  );
}
