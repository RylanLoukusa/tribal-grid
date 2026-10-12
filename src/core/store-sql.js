// Game storage over SQL. `db` is a small adapter so the same queries run on
// Cloudflare D1 (production) and node:sqlite (local dev and tests):
//   db.all(sql, params) -> rows,  db.first(sql, params) -> row | null,  db.run(sql, params) -> { changes }
export function sqlStore(db) {
  const now = () => new Date().toISOString();
  const toPlay = r => r && ({ grid: r.grid_id, player: r.player_id, wrongLeft: r.guesses_left, moves: r.moves, cells: JSON.parse(r.cells), misses: JSON.parse(r.misses), done: !!r.done });
  return {
    async getPlay(grid, player) {
      return toPlay(await db.first("SELECT * FROM plays WHERE grid_id = ? AND player_id = ?", [grid, player]));
    },
    // Optimistic write: only succeeds if nobody else moved since the caller read the play.
    async putPlay(p, prevMoves) {
      const args = [p.wrongLeft, p.moves, JSON.stringify(p.cells), JSON.stringify(p.misses), p.done ? 1 : 0, now(), p.grid, p.player];
      const upd = await db.run("UPDATE plays SET guesses_left = ?, moves = ?, cells = ?, misses = ?, done = ?, updated_at = ? WHERE grid_id = ? AND player_id = ? AND moves = ?", [...args, prevMoves]);
      if (upd.changes > 0) return true;
      if (prevMoves !== 0) return false;
      const ins = await db.run("INSERT INTO plays (guesses_left, moves, cells, misses, done, updated_at, grid_id, player_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING", args);
      return ins.changes > 0;
    },
    async playedGrids(player) {
      return (await db.all("SELECT grid_id, cells, done FROM plays WHERE player_id = ?", [player]))
        .map(r => ({ grid: r.grid_id, done: !!r.done, filled: JSON.parse(r.cells).filter(Boolean).length }));
    },
    async addPick(grid, cell, castaway) {
      await db.run("INSERT INTO picks (grid_id, cell, castaway_id, n) VALUES (?, ?, ?, 1) ON CONFLICT (grid_id, cell, castaway_id) DO UPDATE SET n = n + 1", [grid, cell, castaway]);
    },
    async cellPicks(grid) {
      return (await db.all("SELECT cell, castaway_id AS castaway, n FROM picks WHERE grid_id = ?", [grid])).map(r => ({ cell: r.cell, castaway: r.castaway, n: r.n }));
    },
    async playerCount(grid) {
      return (await db.first("SELECT COUNT(*) AS n FROM plays WHERE grid_id = ?", [grid]))?.n ?? 0;
    },
    async addReport(r) {
      await db.run("INSERT INTO reports (grid_id, cell, castaway_id, player_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?)", [r.grid, r.cell, r.castaway, r.player, r.note, now()]);
    },
    async entitlements(player) {
      return (await db.all("SELECT product FROM entitlements WHERE player_id = ?", [player])).map(r => r.product);
    },
    async grant(player, product) {
      await db.run("INSERT INTO entitlements (player_id, product, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", [player, product, now()]);
    },
    // Records a purchase once per checkout session. Returns false if it was already recorded.
    async addPurchase({ session, player, product, restoreCode }) {
      const r = await db.run("INSERT INTO purchases (session_id, player_id, product, restore_code, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING", [session, player, product, restoreCode, now()]);
      return r.changes > 0;
    },
    async purchasesByCode(code) {
      return (await db.all("SELECT product FROM purchases WHERE restore_code = ?", [code])).map(r => r.product);
    },
    async restoreCodes(player) {
      return (await db.all("SELECT DISTINCT restore_code AS code FROM purchases WHERE player_id = ?", [player])).map(r => r.code);
    },
  };
}

export function d1Adapter(D1) {
  return {
    all: async (sql, p) => (await D1.prepare(sql).bind(...p).all()).results,
    first: async (sql, p) => await D1.prepare(sql).bind(...p).first(),
    run: async (sql, p) => ({ changes: (await D1.prepare(sql).bind(...p).run()).meta.changes }),
  };
}
