-- One row per player per grid: their guesses so far. Checked and written only by the API.
CREATE TABLE IF NOT EXISTS plays (
  grid_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  guesses_left INTEGER NOT NULL,
  cells TEXT NOT NULL,   -- JSON array of 9 castaway ids or nulls
  misses TEXT NOT NULL,  -- JSON array of 9 wrong-guess counts
  done INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (grid_id, player_id)
);

-- How many players picked each castaway in each cell. This is what rarity is computed from.
CREATE TABLE IF NOT EXISTS picks (
  grid_id TEXT NOT NULL,
  cell INTEGER NOT NULL,
  castaway_id TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (grid_id, cell, castaway_id)
);

-- "Report this answer" submissions, for the daily review.
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grid_id TEXT NOT NULL,
  cell INTEGER NOT NULL,
  castaway_id TEXT,
  player_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
