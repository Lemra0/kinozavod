import { buildMatchers, findHate } from '@kinozavod/shared';

// Nickname check reuses the shared word filter (hate list blocks a nickname).
// A few built-in roots guard the case where the DB list is still empty.
const BUILTIN_HATE = ['fuck', 'shit', 'nazi', 'хуй', 'бляд', 'сука', 'пидор'];

/** Returns { allowed } — false if the text contains an offensive root. */
export function checkNicknameFactory(db) {
  return (nickname) => {
    const rows = [
      ...BUILTIN_HATE.map((pattern) => ({ list: 'hate', pattern, matchType: 'root' })),
      ...db
        .prepare(
          "SELECT list, pattern, match_type AS matchType FROM word_filter WHERE list = 'hate'",
        )
        .all(),
    ];
    const filter = buildMatchers(rows);
    return { allowed: findHate(nickname, filter).length === 0 };
  };
}
