import { describe, expect, it } from 'vitest';
import {
  buildMatchers,
  canonicalize,
  findHate,
  hasSpoilers,
  renderReview,
  MASK_CHAR,
} from '@kinozavod/shared';

const filter = buildMatchers([
  { list: 'profanity', pattern: 'хрень', matchType: 'root' },
  { list: 'profanity', pattern: 'damn', matchType: 'word' },
  { list: 'hate', pattern: 'slur', matchType: 'root' },
  { list: 'exception', pattern: 'употреблять', matchType: 'root' },
]);

const text = (segs) =>
  segs.map((s) => s.text ?? (s.masked ? MASK_CHAR.repeat(s.masked) : '')).join('');

describe('canonicalize', () => {
  it('folds case, ё, look-alikes, digits and repeats', () => {
    expect(canonicalize('ХРЕНЬ')).toBe(canonicalize('хрень'));
    expect(canonicalize('хрёёнь')).toBe(canonicalize('хрень'));
    expect(canonicalize('xpeהb'.replace('ה', 'н'))).toBeTruthy();
    expect(canonicalize('0')).toBe('о');
    expect(canonicalize('соооль')).toBe('соль');
  });
});

describe('profanity masking', () => {
  it('masks a profane word keeping length', () => {
    const segs = renderReview('фильм просто хрень', filter, { maskProfanity: true });
    const masked = segs.find((s) => s.masked);
    expect(masked.masked).toBe('хрень'.length);
    expect(text(segs)).toBe(`фильм просто ${MASK_CHAR.repeat(5)}`);
  });

  it('does not mask when the viewer disabled the filter', () => {
    const segs = renderReview('это хрень', filter, { maskProfanity: false });
    expect(segs.every((s) => !s.masked)).toBe(true);
  });

  it('catches evasions: caps, digits, spacing', () => {
    for (const variant of ['ХРЕНЬ', 'хр3нь', 'х р е н ь']) {
      const segs = renderReview(`ой ${variant} да`, filter, { maskProfanity: true });
      expect(segs.some((s) => s.masked)).toBe(true);
    }
  });

  it('respects the exception list', () => {
    // "употреблять" must not be masked even if it contains a profane-looking root
    const segs = renderReview('не стоит употреблять', filter, { maskProfanity: true });
    expect(segs.every((s) => !s.masked)).toBe(true);
  });

  it('whole-word match does not catch substrings', () => {
    const f = buildMatchers([{ list: 'profanity', pattern: 'ass', matchType: 'word' }]);
    const segs = renderReview('a classy pass', f, { maskProfanity: true });
    expect(segs.every((s) => !s.masked)).toBe(true);
    const hit = renderReview('what an ass', f, { maskProfanity: true });
    expect(hit.some((s) => s.masked)).toBe(true);
  });
});

describe('hate detection', () => {
  it('finds hate words regardless of masking preference', () => {
    expect(findHate('you slur here', filter).length).toBe(1);
    // even with maskProfanity false, hate is still masked in render
    const segs = renderReview('a slur word', filter, { maskProfanity: false });
    expect(segs.some((s) => s.masked)).toBe(true);
  });
});

describe('spoilers', () => {
  it('splits spoiler segments and masks inside them', () => {
    const segs = renderReview('ok ||the хрень dies|| bye', filter, { maskProfanity: true });
    const spoiler = segs.find((s) => s.spoiler);
    expect(spoiler).toBeTruthy();
    expect(spoiler.spoiler.some((s) => s.masked)).toBe(true);
  });
  it('detects spoiler markers', () => {
    expect(hasSpoilers('a ||b|| c')).toBe(true);
    expect(hasSpoilers('no spoilers')).toBe(false);
  });
});
