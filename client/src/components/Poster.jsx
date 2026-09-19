import { useState } from 'react';
import styles from './Poster.module.css';

export function Poster({ src, alt = '', hall, className = '' }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`${styles.poster} ${className}`}>
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className={styles.placeholder} aria-hidden="true">
          KZ
        </div>
      )}
      {hall && (
        <span className={styles.hall} aria-hidden="true">
          {hall}
        </span>
      )}
    </div>
  );
}
