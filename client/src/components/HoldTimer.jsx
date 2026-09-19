import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './HoldTimer.module.css';

/** Countdown to `expiresAt`. Calls onExpire once when it reaches zero. */
export function HoldTimer({ expiresAt, onExpire }) {
  const { t } = useTranslation();
  const [left, setLeft] = useState(() => Math.max(0, new Date(expiresAt) - Date.now()));

  useEffect(() => {
    const tick = () => {
      const ms = Math.max(0, new Date(expiresAt) - Date.now());
      setLeft(ms);
      if (ms === 0) onExpire?.();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpire]);

  const totalSeconds = Math.ceil(left / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const warn = left <= 2 * 60 * 1000;

  return (
    <div className={`${styles.timer} ${warn ? styles.warn : ''}`} role="timer" aria-live="off">
      <span className={styles.leader} aria-hidden="true">
        <b>{minutes}</b>
      </span>
      <span className={styles.text}>
        <b className={styles.clock}>
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </b>
        <span className={styles.note}>
          {warn ? t('checkout.holdWarn') : t('checkout.holdNote')}
        </span>
      </span>
    </div>
  );
}
