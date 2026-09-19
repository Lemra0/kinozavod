import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MASK_CHAR } from '@kinozavod/shared';
import styles from './ReviewSegments.module.css';

/** Renders review segments: plain text, masked spans, and click-to-reveal spoilers. */
export function ReviewSegments({ segments }) {
  return (
    <span>
      {segments.map((seg, i) => (
        <Segment key={i} seg={seg} />
      ))}
    </span>
  );
}

function Segment({ seg }) {
  const { t } = useTranslation();
  if (seg.text !== undefined) return seg.text;
  if (seg.masked !== undefined) {
    return (
      <span className={styles.masked} title={t('reviews.maskedHint')}>
        {MASK_CHAR.repeat(seg.masked)}
      </span>
    );
  }
  if (seg.spoiler !== undefined) return <Spoiler inner={seg.spoiler} />;
  return null;
}

function Spoiler({ inner }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <span className={styles.spoilerOpen}>
        {inner.map((seg, i) => (
          <Segment key={i} seg={seg} />
        ))}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={styles.spoiler}
      onClick={() => setOpen(true)}
      aria-label={t('reviews.spoilerReveal')}
    >
      {t('reviews.spoilerHidden')}
    </button>
  );
}
