-- Extra movie fields used by the catalog and the schedule generator.
ALTER TABLE movies ADD COLUMN original_language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE movies ADD COLUMN supports_3d INTEGER NOT NULL DEFAULT 0 CHECK (supports_3d IN (0, 1));
ALTER TABLE movies ADD COLUMN popularity REAL NOT NULL DEFAULT 0;

CREATE INDEX idx_movies_rental ON movies (is_archived, rental_start, rental_end);
