import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildMatchers, renderReview } from '@kinozavod/shared';
import { useMeta } from '../api/queries.js';
import { StarRating } from './StarRating.jsx';
import { ReviewSegments } from './ReviewSegments.jsx';
import { Button } from './Button.jsx';
import styles from './ReviewForm.module.css';

/**
 * Review editor with a live preview and a "spoiler" button that wraps the
 * selected text in ||…||. The preview masks profanity using the same shared
 * filter as the server (best-effort; the server is authoritative).
 */
export function ReviewForm({ initial, onSubmit, onCancel, busy, error }) {
  const { t } = useTranslation();
  const { data: meta } = useMeta();
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [text, setText] = useState(initial?.text ?? '');
  const textareaRef = useRef(null);

  // Preview filter from meta (only profanity/exception matter for preview;
  // hate blocks on submit and the server reports it).
  const filter = useMemo(() => buildMatchers(meta?.wordFilter ?? []), [meta]);
  const previewSegments = useMemo(
    () => (text ? renderReview(text, filter, { maskProfanity: true }) : []),
    [text, filter],
  );

  const wrapSpoiler = () => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    if (s === e) {
      setText((v) => `${v}||${t('reviews.spoilerPlaceholder')}||`);
      return;
    }
    setText((v) => `${v.slice(0, s)}||${v.slice(s, e)}||${v.slice(e)}`);
  };

  const submit = (ev) => {
    ev.preventDefault();
    if (rating < 1) return;
    onSubmit({ rating, text: text.trim() });
  };

  const errorText = error ? t([`errors.${error.code}`, 'errors.generic']) : null;

  return (
    <form className={styles.form} onSubmit={submit}>
      <StarRating value={rating} onChange={setRating} />
      <div className={styles.toolbar}>
        <button type="button" className={styles.tool} onClick={wrapSpoiler}>
          {t('reviews.spoilerButton')}
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        rows={4}
        maxLength={4000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('reviews.placeholder')}
      />
      {text && (
        <div className={styles.preview}>
          <span className={styles.previewLabel}>{t('reviews.preview')}</span>
          <p className={styles.previewBody}>
            <ReviewSegments segments={previewSegments} />
          </p>
        </div>
      )}
      {errorText && (
        <p className={styles.error} role="alert">
          {errorText}
        </p>
      )}
      <div className={styles.actions}>
        <Button variant="primary" type="submit" disabled={busy || rating < 1}>
          {initial ? t('reviews.save') : t('reviews.publish')}
        </Button>
        {onCancel && (
          <Button variant="ghost" type="button" onClick={onCancel}>
            {t('common.close')}
          </Button>
        )}
      </div>
    </form>
  );
}
