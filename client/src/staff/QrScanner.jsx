import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './StaffCheck.module.css';

/**
 * Camera QR scanner (progressive enhancement). Loads html5-qrcode lazily,
 * needs HTTPS or localhost for camera access, and calls onScan(code).
 */
export function QrScanner({ onScan, active }) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const scannerRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let html5Qr;

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        html5Qr = new Html5Qrcode(containerRef.current.id);
        scannerRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 220 },
          (decoded) => onScan(decoded),
          () => {},
        );
      } catch (err) {
        if (!cancelled) setError(err?.message || 'camera');
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [active, onScan]);

  return (
    <div className={styles.scanner}>
      <div id="qr-reader" ref={containerRef} className={styles.reader} />
      {error && <p className={styles.scannerHint}>{t('staff.check.cameraHint')}</p>}
    </div>
  );
}
