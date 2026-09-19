// Review moderation. Reviews themselves arrive in stage 9; this provides the
// admin hide/restore plumbing and a filter for offensive-word matches.
import { normalizeText } from '@kinozavod/shared';

export function adminListReviews(db, { lang = 'en', onlyHate = false } = {}) {
  const rows = db
    .prepare(
      `SELECT r.id, r.rating, r.text, r.is_hidden AS isHidden, r.has_spoilers AS hasSpoilers,
              r.created_at AS createdAt, u.nickname,
              COALESCE(mt.title, m.original_title) AS movieTitle, m.id AS movieId
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       JOIN movies m ON m.id = r.movie_id
       LEFT JOIN movie_translations mt ON mt.movie_id = m.id AND mt.locale = ?
       ORDER BY r.created_at DESC LIMIT 200`,
    )
    .all(lang);

  let list = rows.map((r) => ({
    ...r,
    isHidden: Boolean(r.isHidden),
    hasSpoilers: Boolean(r.hasSpoilers),
  }));
  if (onlyHate) {
    const roots = db
      .prepare("SELECT pattern FROM word_filter WHERE list = 'hate'")
      .pluck()
      .all()
      .map(normalizeText);
    list = list.filter((r) => {
      const norm = normalizeText(r.text ?? '');
      return roots.some((root) => root && norm.includes(root));
    });
  }
  return list;
}

export function setReviewHidden(db, id, hidden) {
  db.prepare('UPDATE reviews SET is_hidden = ? WHERE id = ?').run(hidden ? 1 : 0, id);
}
