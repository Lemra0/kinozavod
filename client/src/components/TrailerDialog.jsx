import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './TrailerDialog.module.css';

export function TrailerDialog({ videoKey, title, onClose }) {
  const { t } = useTranslation();
  const closeButton = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    const onKey = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('movie.trailerOf', { title })}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeButton} type="button" className={styles.close} onClick={onClose}>
          {t('common.close')}
        </button>
        <div className={styles.frame}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0`}
            title={t('movie.trailerOf', { title })}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
