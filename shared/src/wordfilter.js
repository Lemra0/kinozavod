// Steam-style word filter shared by client (preview) and server (authoritative).
import { MASK_CHAR } from './constants.js';

export { MASK_CHAR };
//
// Two ideas:
//  1) Detection is done on a *canonical* form of each word that undoes common
//     evasions (case, ё→е, latin/cyrillic look-alikes, digit/symbol swaps,
//     repeated letters). A word matches a pattern if the pattern's canonical
//     form is contained in the word's canonical form (root match) or equals it
//     (whole-word match).
//  2) Masking replaces the *original* characters of a matched word with ╱,
//     keeping length, so "просто хрень" → "просто ╱╱╱╱╱".

// Look-alike folding: map confusable latin/cyrillic and digit/symbol swaps to
// a single canonical letter.
const FOLD = {
  // latin → cyrillic-ish canonical
  a: 'а',
  e: 'е',
  o: 'о',
  p: 'р',
  c: 'с',
  y: 'у',
  x: 'х',
  k: 'к',
  m: 'м',
  t: 'т',
  h: 'н',
  b: 'в',
  // digits / symbols → letters
  0: 'о',
  1: 'и',
  3: 'е',
  4: 'ч',
  5: 'ѕ',
  6: 'б',
  8: 'в',
  9: 'g',
  '@': 'а',
  $: 'ѕ',
  // cyrillic ё → е
  ё: 'е',
};

/** Canonical form of a single token: fold look-alikes, drop repeats. */
export function canonicalize(token) {
  const lower = token.toLowerCase();
  let out = '';
  let prev = '';
  for (const ch of lower) {
    const folded = FOLD[ch] ?? ch;
    if (folded === prev) continue; // collapse repeated letters (bбб → б)
    out += folded;
    prev = folded;
  }
  return out;
}

// A "word" for filtering: a run of letters/digits, possibly split by single
// separators (spaces, dots) used to smuggle words like "х р е н ь".
// We tokenize on whitespace into segments, then within a segment also try the
// de-spaced join of adjacent short tokens.
const LETTER = /[\p{L}\p{N}@$]/u;

/** Splits text into tokens with their start/end offsets in the original string. */
function tokenize(text) {
  const tokens = [];
  let start = -1;
  for (let i = 0; i <= text.length; i += 1) {
    const isLetter = i < text.length && LETTER.test(text[i]);
    if (isLetter && start === -1) start = i;
    else if (!isLetter && start !== -1) {
      tokens.push({ text: text.slice(start, i), start, end: i });
      start = -1;
    }
  }
  return tokens;
}

/**
 * Builds matcher functions from filter rows.
 * rows: [{ list, pattern, matchType }] already scoped to the needed locales.
 */
export function buildMatchers(rows) {
  const make = (list) =>
    rows
      .filter((r) => r.list === list)
      .map((r) => ({ canon: canonicalize(r.pattern), whole: r.matchType === 'word' }))
      .filter((r) => r.canon);
  return {
    profanity: make('profanity'),
    hate: make('hate'),
    exceptions: rows.filter((r) => r.list === 'exception').map((r) => canonicalize(r.pattern)),
  };
}

function tokenMatches(canonToken, matchers, exceptions) {
  if (exceptions.some((ex) => ex && canonToken.includes(ex))) return false;
  return matchers.some((m) =>
    m.whole ? canonToken === m.canon : m.canon && canonToken.includes(m.canon),
  );
}

/**
 * Finds words in `text` that match a matcher list, returning their original
 * offsets. Also catches words split by single separators (e.g. "х.р.е.н").
 */
function findMatches(text, matchers, exceptions) {
  const tokens = tokenize(text);
  const matched = [];

  for (const tok of tokens) {
    if (tokenMatches(canonicalize(tok.text), matchers, exceptions)) {
      matched.push({ start: tok.start, end: tok.end });
    }
  }

  // De-spaced smuggling: join runs of tokens where each is 1–2 chars.
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].text.length > 2) continue;
    let joined = '';
    for (let j = i; j < tokens.length && j < i + 12; j += 1) {
      if (tokens[j].text.length > 2) break;
      joined += tokens[j].text;
      if (j > i && tokenMatches(canonicalize(joined), matchers, exceptions)) {
        matched.push({ start: tokens[i].start, end: tokens[j].end });
      }
    }
  }

  return matched;
}

/** Are there any hate matches? (used to block publishing) */
export function findHate(text, filter) {
  return findMatches(text, filter.hate, filter.exceptions);
}

/**
 * Renders text into segments for display, applying the filter.
 * `maskProfanity` = false lets a user see profanity (hate is always masked).
 * Returns an array of { text } | { masked: n } | { spoiler: segments[] }.
 */
export function renderReview(text, filter, { maskProfanity = true } = {}) {
  // Split spoilers first: ||...|| becomes nested segments.
  const parts = [];
  const re = /\|\|([\s\S]*?)\|\|/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ plain: text.slice(last, m.index) });
    parts.push({ spoiler: m[1] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ plain: text.slice(last) });

  const renderPlain = (str) => maskSegments(str, filter, maskProfanity);
  const out = [];
  for (const p of parts) {
    if (p.plain !== undefined) out.push(...renderPlain(p.plain));
    else out.push({ spoiler: renderPlain(p.spoiler) });
  }
  return out;
}

/** Masks a plain string into text / masked segments. */
function maskSegments(str, filter, maskProfanity) {
  // Hate is always masked; profanity only when maskProfanity is true.
  const ranges = [...findMatches(str, filter.hate, filter.exceptions)];
  if (maskProfanity) ranges.push(...findMatches(str, filter.profanity, filter.exceptions));
  if (ranges.length === 0) return str ? [{ text: str }] : [];

  ranges.sort((a, b) => a.start - b.start);
  // merge overlaps
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }

  const segs = [];
  let pos = 0;
  for (const r of merged) {
    if (r.start > pos) segs.push({ text: str.slice(pos, r.start) });
    segs.push({ masked: r.end - r.start });
    pos = r.end;
  }
  if (pos < str.length) segs.push({ text: str.slice(pos) });
  return segs;
}

export function hasSpoilers(text) {
  return /\|\|[\s\S]*?\|\|/.test(text);
}
