// Builds a 3x3 grid: three row and three column categories where every cell has a
// healthy number of answers and the nine cells can be filled with nine different people.
import { CATEGORIES, answersFor, fits } from "./categories.js";

export function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

export const RULES = { minAnswers: 4, maxBigCells: 3, bigCell: 80, minHardCells: 1, maxHardCells: 4, hardCell: 10, maxVeryHardCells: 2, veryHardCell: 5 };

// Share of the smaller category that also fits the other one.
export function overlap(people, a, b) {
  const inA = people.filter(p => fits(p, a)), inB = people.filter(p => fits(p, b));
  const both = inA.filter(p => fits(p, b)).length;
  return both / Math.max(1, Math.min(inA.length, inB.length));
}

// Can nine different people fill the nine cells? (Small bipartite matching; cells are tiny.)
export function hasDistinctFill(cellAnswers) {
  const owner = new Map();
  const tryCell = (i, seen) => {
    for (const p of cellAnswers[i]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      if (!owner.has(p.id) || tryCell(owner.get(p.id), seen)) { owner.set(p.id, i); return true; }
    }
    return false;
  };
  return cellAnswers.every((_, i) => tryCell(i, new Set()));
}

export function evaluate(people, rows, cols) {
  const size = c => people.filter(p => fits(p, c)).length;
  const cells = [];
  for (const a of rows) for (const b of cols) {
    if (a.family === b.family) return null;
    const ans = answersFor(people, a, b);
    // Thin cells, and pairs where one category (nearly) implies the other, make dull squares.
    if (ans.length < RULES.minAnswers || ans.length >= 0.9 * Math.min(size(a), size(b))) return null;
    cells.push(ans);
  }
  const counts = cells.map(c => c.length);
  const hard = counts.filter(n => n <= RULES.hardCell).length;
  const big = counts.filter(n => n >= RULES.bigCell).length;
  if (counts.filter(n => n <= RULES.veryHardCell).length > RULES.maxVeryHardCells) return null;
  if (hard < RULES.minHardCells || hard > RULES.maxHardCells || big > RULES.maxBigCells) return null;
  if (!hasDistinctFill(cells)) return null;
  return { counts, cells };
}

// avoid: category ids used recently, so consecutive days feel different.
export function generate(people, seed, { avoid = new Set(), tries = 20000 } = {}) {
  const r = rng(seed);
  const pool = CATEGORIES.filter(c => !avoid.has(c.id));
  const total = pool.reduce((s, c) => s + c.weight, 0);
  const pick = () => { let x = r() * total; for (const c of pool) { x -= c.weight; if (x <= 0) return c; } return pool[pool.length - 1]; };
  for (let t = 0; t < tries; t++) {
    const rows = [], cols = [];
    let guard = 0;
    while ((rows.length < 3 || cols.length < 3) && guard++ < 50) {
      const c = pick();
      if (rows.includes(c) || cols.includes(c)) continue;
      const axis = rows.length < 3 ? rows : cols, other = axis === rows ? cols : rows;
      // A family may appear twice, on one axis only, and only if the two barely overlap
      // (two eras are fine; "Played 2+ times" next to "Played 3+ times" is not).
      if (other.some(o => o.family === c.family)) continue;
      const kin = axis.filter(o => o.family === c.family);
      if (kin.length >= 2 || (kin.length === 1 && overlap(people, kin[0], c) > 0.5)) continue;
      axis.push(c);
    }
    if (rows.length < 3 || cols.length < 3) continue;
    const ev = evaluate(people, rows, cols);
    if (ev) return { rows: rows.map(c => c.id), cols: cols.map(c => c.id), counts: ev.counts };
  }
  throw new Error("No valid grid found for seed " + seed);
}
