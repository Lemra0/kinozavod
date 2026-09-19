-- KINOZAVOD initial schema.
-- Conventions:
--   * timestamps are ISO-8601 strings in UTC (e.g. 2026-09-16T18:30:00.000Z);
--   * money is stored in cents (INTEGER);
--   * booleans are INTEGER 0/1.

-- ---------------------------------------------------------------- settings
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('price.seat.standard', '800'),
  ('price.seat.vip', '1100'),
  ('price.seat.sofa', '1600'),
  ('price.surcharge_3d_per_viewer', '200'),
  ('price.morning_discount_per_viewer', '200'),
  ('price.morning_until', '12:00');

-- ---------------------------------------------------------------- users
CREATE TABLE users (
  id                  INTEGER PRIMARY KEY,
  is_demo             INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  email               TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash       TEXT,
  nickname            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nickname_changed_at TEXT,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  birth_date          TEXT NOT NULL,              -- YYYY-MM-DD
  avatar_path         TEXT,
  role                TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'cashier', 'admin')),
  locale              TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ru', 'et')),
  email_verified      INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  is_blocked          INTEGER NOT NULL DEFAULT 0 CHECK (is_blocked IN (0, 1)),
  show_profanity      INTEGER NOT NULL DEFAULT 0 CHECK (show_profanity IN (0, 1)),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE tokens (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('verify_email', 'reset_password')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- movies
CREATE TABLE genres (
  id      INTEGER PRIMARY KEY,
  tmdb_id INTEGER UNIQUE
);

CREATE TABLE genre_translations (
  genre_id INTEGER NOT NULL REFERENCES genres (id) ON DELETE CASCADE,
  locale   TEXT NOT NULL CHECK (locale IN ('en', 'ru', 'et')),
  name     TEXT NOT NULL,
  PRIMARY KEY (genre_id, locale)
);

CREATE TABLE movies (
  id             INTEGER PRIMARY KEY,
  source         TEXT NOT NULL CHECK (source IN ('tmdb', 'demo')),
  tmdb_id        INTEGER UNIQUE,
  original_title TEXT NOT NULL,
  duration_min   INTEGER NOT NULL CHECK (duration_min > 0),
  age_rating_ee  TEXT CHECK (age_rating_ee IN ('PERE', 'L', 'MS-6', 'MS-12', 'K-12', 'K-14', 'K-16')),
  release_date   TEXT,
  rental_start   TEXT,
  rental_end     TEXT,
  poster_path    TEXT,
  backdrop_path  TEXT,
  trailer_key    TEXT,
  country        TEXT,
  year           INTEGER,
  director       TEXT,
  cast_json      TEXT NOT NULL DEFAULT '[]',
  is_archived    INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  fetched_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE movie_translations (
  movie_id INTEGER NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  locale   TEXT NOT NULL CHECK (locale IN ('en', 'ru', 'et')),
  title    TEXT NOT NULL,
  overview TEXT,
  PRIMARY KEY (movie_id, locale)
);

CREATE TABLE movie_genres (
  movie_id INTEGER NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres (id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, genre_id)
);

-- Full-text index. Filled by the application with normalized text
-- (titles in all languages, original title, director, cast).
CREATE VIRTUAL TABLE movies_search USING fts5 (
  content,
  movie_id UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE user_genres (
  user_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, genre_id)
);

CREATE TABLE watchlist (
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  movie_id    INTEGER NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  notified_at TEXT,
  PRIMARY KEY (user_id, movie_id)
);

-- ---------------------------------------------------------------- halls
CREATE TABLE halls (
  id              INTEGER PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,         -- p1, p2, p3
  name_key        TEXT NOT NULL,                -- i18n key
  formats         TEXT NOT NULL DEFAULT '2D',   -- comma-separated: 2D,3D
  has_zavod_sound INTEGER NOT NULL DEFAULT 0 CHECK (has_zavod_sound IN (0, 1))
);

CREATE TABLE seats (
  id        INTEGER PRIMARY KEY,
  hall_id   INTEGER NOT NULL REFERENCES halls (id) ON DELETE CASCADE,
  row       INTEGER NOT NULL CHECK (row > 0),
  number    INTEGER NOT NULL CHECK (number > 0),
  type      TEXT NOT NULL CHECK (type IN ('standard', 'vip', 'sofa')),
  grid_x    INTEGER NOT NULL,
  grid_y    INTEGER NOT NULL,
  width     INTEGER NOT NULL DEFAULT 1 CHECK (width IN (1, 2)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  UNIQUE (hall_id, row, number)
);

-- ---------------------------------------------------------------- sessions (screenings)
CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY,
  movie_id   INTEGER NOT NULL REFERENCES movies (id),
  hall_id    INTEGER NOT NULL REFERENCES halls (id),
  start_time TEXT NOT NULL,
  end_time   TEXT NOT NULL,
  format     TEXT NOT NULL CHECK (format IN ('2D', '3D')),
  language   TEXT NOT NULL,
  subtitles  TEXT,
  status     TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (end_time > start_time)
);

CREATE INDEX idx_sessions_start ON sessions (start_time);
CREATE INDEX idx_sessions_hall_start ON sessions (hall_id, start_time);
CREATE INDEX idx_sessions_movie_start ON sessions (movie_id, start_time);

-- ---------------------------------------------------------------- orders
CREATE TABLE orders (
  id                INTEGER PRIMARY KEY,
  user_id           INTEGER REFERENCES users (id) ON DELETE SET NULL,
  email             TEXT,
  buyer_first_name  TEXT,
  buyer_last_name   TEXT,
  age_check         TEXT NOT NULL DEFAULT 'none' CHECK (age_check IN ('none', 'profile', 'demo_isikukood')),
  locale            TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ru', 'et')),
  session_id        INTEGER NOT NULL REFERENCES sessions (id),
  channel           TEXT NOT NULL CHECK (channel IN ('online', 'box_office')),
  cashier_id        INTEGER REFERENCES users (id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded', 'cancelled')),
  total             INTEGER NOT NULL CHECK (total >= 0),
  access_token_hash TEXT UNIQUE,
  expires_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (channel = 'box_office' OR email IS NOT NULL)
);

CREATE INDEX idx_orders_user ON orders (user_id);
CREATE INDEX idx_orders_email ON orders (email COLLATE NOCASE);
CREATE INDEX idx_orders_pending ON orders (status, expires_at);

CREATE TABLE tickets (
  id         INTEGER PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES sessions (id),
  seat_id    INTEGER NOT NULL REFERENCES seats (id),
  price      INTEGER NOT NULL CHECK (price >= 0),
  code       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'reserved'
             CHECK (status IN ('reserved', 'valid', 'used', 'refunded', 'released')),
  used_at    TEXT,
  checked_by INTEGER REFERENCES users (id) ON DELETE SET NULL
);

-- One seat can be taken only once per session.
-- Refunded and released tickets do not block the seat.
CREATE UNIQUE INDEX ux_ticket_seat
  ON tickets (session_id, seat_id)
  WHERE status IN ('reserved', 'valid', 'used');

CREATE INDEX idx_tickets_order ON tickets (order_id);

CREATE TABLE payments (
  id           INTEGER PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL,
  method       TEXT NOT NULL CHECK (method IN ('card_demo', 'cash', 'card_terminal')),
  status       TEXT NOT NULL CHECK (status IN ('success', 'declined', 'refunded')),
  card_last4   TEXT,
  processed_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------- reviews
CREATE TABLE reviews (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  movie_id     INTEGER NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
  text         TEXT,                             -- original text; spoilers marked as ||...||
  has_spoilers INTEGER NOT NULL DEFAULT 0 CHECK (has_spoilers IN (0, 1)),
  is_hidden    INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, movie_id)
);

CREATE INDEX idx_reviews_movie ON reviews (movie_id, is_hidden);

CREATE TABLE word_filter (
  id         INTEGER PRIMARY KEY,
  locale     TEXT NOT NULL CHECK (locale IN ('en', 'ru', 'et')),
  list       TEXT NOT NULL CHECK (list IN ('profanity', 'hate', 'exception')),
  pattern    TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'word' CHECK (match_type IN ('word', 'root')),
  created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (locale, list, pattern)
);
