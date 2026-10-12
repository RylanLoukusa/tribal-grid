// Rarity = the share of today's players who picked the same person for a cell. Lower is better.
//
// On day one there are no players, so each cell starts from a "fame prior": well-known
// castaways are assumed to be picked more. Real picks are blended in and soon dominate.
export const PRIOR_PLAYERS = 40;

export function cellShares(answers, picks) {
  // answers: [{id, fame}], picks: Map(castawayId -> count)
  const weights = answers.map(p => Math.pow(Math.max(1, p.fame), 2));
  const W = weights.reduce((s, w) => s + w, 0) || 1;
  let total = 0;
  for (const p of answers) total += picks.get(p.id) || 0;
  const denom = total + PRIOR_PLAYERS;
  return new Map(answers.map((p, i) => [p.id, ((picks.get(p.id) || 0) + PRIOR_PLAYERS * weights[i] / W) / denom]));
}

export const toPercent = share => Math.max(0.1, Math.round(share * 1000) / 10);

export const EMPTY_CELL_SCORE = 100;
export const scoreOf = rarities => Math.round(rarities.reduce((s, r) => s + (r == null ? EMPTY_CELL_SCORE : r), 0) * 10) / 10;
