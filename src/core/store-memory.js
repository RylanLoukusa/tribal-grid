// In-memory store with the same interface as sqlStore. Used by the offline preview build.
// Pass `persist` ({load, save}) to keep state across reloads (e.g. localStorage).
export function memoryStore(persist) {
  const s = { plays: {}, picks: {}, reports: [], entitlements: {}, purchases: {}, ...(persist?.load() || {}) };
  const save = () => persist?.save(s);
  return {
    async getPlay(grid, player) { const p = s.plays[grid + "|" + player]; return p ? structuredClone(p) : null; },
    async putPlay(p, prevMoves) {
      const k = p.grid + "|" + p.player, cur = s.plays[k];
      if ((cur?.moves ?? 0) !== prevMoves) return false;
      s.plays[k] = structuredClone(p); save(); return true;
    },
    async playedGrids(player) {
      return Object.values(s.plays).filter(p => p.player === player).map(p => ({ grid: p.grid, done: p.done, filled: p.cells.filter(Boolean).length }));
    },
    async addPick(grid, cell, castaway) { const k = grid + "|" + cell + "|" + castaway; s.picks[k] = (s.picks[k] || 0) + 1; save(); },
    async cellPicks(grid) {
      return Object.entries(s.picks).filter(([k]) => k.startsWith(grid + "|"))
        .map(([k, n]) => { const [, cell, castaway] = k.split("|"); return { cell: +cell, castaway, n }; });
    },
    async playerCount(grid) { return Object.keys(s.plays).filter(k => k.startsWith(grid + "|")).length; },
    async addReport(r) { s.reports.push({ ...r, at: new Date().toISOString() }); save(); },
    async entitlements(player) { return [...(s.entitlements[player] || [])]; },
    async grant(player, product) { const e = new Set(s.entitlements[player] || []); e.add(product); s.entitlements[player] = [...e]; save(); },
    async addPurchase({ session, player, product, restoreCode }) {
      if (s.purchases[session]) return false;
      s.purchases[session] = { player, product, restoreCode }; save(); return true;
    },
    async purchasesByCode(code) { return Object.values(s.purchases).filter(p => p.restoreCode === code).map(p => p.product); },
    async restoreCodes(player) { return [...new Set(Object.values(s.purchases).filter(p => p.player === player).map(p => p.restoreCode))]; },
  };
}
