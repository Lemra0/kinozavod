import { ApiError } from '../errors.js';

/** Admin user list with basic counts. */
export function adminListUsers(db, { q = '' } = {}) {
  const like = `%${q.trim()}%`;
  const rows = db
    .prepare(
      `SELECT id, email, nickname, first_name AS firstName, last_name AS lastName,
              birth_date AS birthDate, role, is_blocked AS isBlocked, avatar_path AS avatarPath,
              created_at AS createdAt
       FROM users
       WHERE (? = '' OR email LIKE ? COLLATE NOCASE OR nickname LIKE ? COLLATE NOCASE)
       ORDER BY created_at DESC
       LIMIT 200`,
    )
    .all(q.trim(), like, like);
  return rows.map((u) => ({
    ...u,
    isBlocked: Boolean(u.isBlocked),
    hasCustomAvatar: Boolean(u.avatarPath),
  }));
}

const ROLES = ['user', 'cashier', 'admin'];
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Updates an admin-editable user field: role, block, birth date, resets. */
export function adminUpdateUser(db, id, patch, actingUserId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');

  if (patch.role !== undefined) {
    if (user.is_demo) throw new ApiError(403, 'DEMO_LOCKED', 'Demo accounts cannot change role');
    if (!ROLES.includes(patch.role)) throw new ApiError(400, 'BAD_ROLE', 'Unknown role');
    if (id === actingUserId && patch.role !== 'admin') {
      throw new ApiError(409, 'CANNOT_DEMOTE_SELF', 'You cannot remove your own admin role');
    }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(patch.role, id);
  }
  if (patch.isBlocked !== undefined) {
    if (id === actingUserId && patch.isBlocked) {
      throw new ApiError(409, 'CANNOT_BLOCK_SELF', 'You cannot block yourself');
    }
    db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(patch.isBlocked ? 1 : 0, id);
    if (patch.isBlocked) db.prepare('DELETE FROM sessions_auth WHERE user_id = ?').run(id);
  }
  if (patch.birthDate !== undefined) {
    if (!isDate(patch.birthDate))
      throw new ApiError(400, 'BAD_DATE', 'birthDate must be YYYY-MM-DD');
    db.prepare('UPDATE users SET birth_date = ? WHERE id = ?').run(patch.birthDate, id);
  }
  if (patch.resetAvatar) {
    db.prepare('UPDATE users SET avatar_path = NULL WHERE id = ?').run(id);
  }
  if (patch.resetNickname) {
    // Give a neutral placeholder nickname the user must change later.
    const placeholder = `user${id}`;
    db.prepare('UPDATE users SET nickname = ?, nickname_changed_at = NULL WHERE id = ?').run(
      placeholder,
      id,
    );
  }
  return adminListUsers(db).find((u) => u.id === id);
}
