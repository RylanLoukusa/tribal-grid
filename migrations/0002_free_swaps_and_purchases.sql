-- Guesses: only wrong guesses are limited now, so plays get a move counter for safe concurrent writes.
ALTER TABLE plays ADD COLUMN moves INTEGER NOT NULL DEFAULT 0;

-- What each device has unlocked (archive, packs, everything).
CREATE TABLE IF NOT EXISTS entitlements (
  player_id TEXT NOT NULL,
  product TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (player_id, product)
);

-- One row per completed purchase. restore_code lets a buyer unlock the same things on another device.
CREATE TABLE IF NOT EXISTS purchases (
  session_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  product TEXT NOT NULL,
  restore_code TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS purchases_restore ON purchases (restore_code);
CREATE INDEX IF NOT EXISTS purchases_player ON purchases (player_id);
