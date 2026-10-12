// Turns the raw survivoR tables into data/castaways.json: one row per person (US version),
// with every appearance in a finished season and the tags that categories query.
//
// Seasons still airing are left out entirely so grids never spoil an episode.
import { readFile, writeFile } from "node:fs/promises";

const raw = async t => JSON.parse(await readFile(new URL(`../data/raw/${t}.json`, import.meta.url), "utf8"));
const US = r => r.version === "US";

const [castaways, details, seasons, challenges, advMoves, advDetails, tribeMap, tribeColours, juryVotes, confessionals] =
  await Promise.all(["castaways", "castaway_details", "season_summary", "challenge_results", "advantage_movement",
    "advantage_details", "tribe_mapping", "tribe_colours", "jury_votes", "confessionals"].map(raw));
const { _note, ...aliases } = JSON.parse(await readFile(new URL("../data/aliases.json", import.meta.url), "utf8"));

// ---- Seasons: only finished ones (the season summary has a winner and an end date).
const finished = new Map();
for (const s of seasons.filter(US)) {
  if (s.winner_id && s.ended) finished.set(s.season, { season: s.season, name: s.season_name, ended: s.ended });
}
const done = r => US(r) && finished.has(r.season);

// A "returnee season" is one where at least half the cast had played before.
const firstSeason = new Map();
for (const c of castaways.filter(US).sort((a, b) => a.season - b.season)) {
  if (!firstSeason.has(c.castaway_id)) firstSeason.set(c.castaway_id, c.season);
}
const returneeSeasons = new Set();
for (const s of finished.keys()) {
  const cast = castaways.filter(c => US(c) && c.season === s);
  const vets = cast.filter(c => firstSeason.get(c.castaway_id) < s).length;
  if (vets * 2 >= cast.length) returneeSeasons.add(s);
}

// ---- Per-appearance facts gathered from the other tables. Key: "castaway_id|season".
const key = (id, s) => id + "|" + s;
const bump = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);

const indImmunity = new Map();
for (const c of challenges.filter(done)) if (c.won_individual_immunity) bump(indImmunity, key(c.castaway_id, c.season));

const advType = new Map(advDetails.filter(US).map(a => [a.season + "|" + a.advantage_id, a.advantage_type]));
const isIdol = t => /Hidden Immunity Idol(?! Clue)|Super Idol/.test(t || "");
const foundIdol = new Set(), playedIdol = new Set(), outWithAdv = new Set(), gotAdvantage = new Set();
for (const m of advMoves.filter(done)) {
  const k = key(m.castaway_id, m.season), t = advType.get(m.season + "|" + m.advantage_id);
  if (/^Found/.test(m.event) && isIdol(t)) foundIdol.add(k);
  if (m.event === "Played" && isIdol(t)) playedIdol.add(k);
  if (/with advantage/.test(m.event)) outWithAdv.add(k);
  if (/^(Found|Received|Won|Bought)/.test(m.event) && t && !isIdol(t) && !/Clue/.test(t)) gotAdvantage.add(k);
}

const statuses = new Map();
for (const t of tribeMap.filter(done)) {
  const k = key(t.castaway_id, t.season);
  if (!statuses.has(k)) statuses.set(k, new Set());
  statuses.get(k).add(t.tribe_status);
}

// Tribe colour names from hex, by hue. Greys and near-whites have no colour category.
function colourName(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.18 || max < 0.15) return null;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 330) return "red";
  if (h < 40) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 255) return "blue";
  return "purple";
}
const tribeColour = new Map(tribeColours.filter(t => done(t) && t.tribe_status === "Original")
  .map(t => [t.season + "|" + t.tribe, colourName(t.tribe_colour)]));

const juryVotesFor = new Map();
for (const v of juryVotes.filter(done)) bump(juryVotesFor, key(v.finalist_id, v.season), v.vote);

const confCount = new Map();
for (const c of confessionals.filter(done)) bump(confCount, key(c.castaway_id, c.season), c.confessional_count || 0);

// ---- People
const detail = new Map(details.filter(d => d.castaway_id?.startsWith("US")).map(d => [d.castaway_id, d]));
const clean = s => (s || "").replace(/\s+/g, " ").trim();

function displayName(d, short) {
  // full_name_detailed carries nicknames as 'Ozzy'; show them with curly quotes.
  const det = clean(d.full_name_detailed).replace(/^([A-Za-z]+)' /, "'$1' "); // fix "Purple' Kelly Shinn"
  const m = det.match(/^(.*?)'([^']+)'(.*)$/);
  if (m) return clean(`${m[1]}“${m[2]}”${m[3]}`);
  return clean(d.full_name) || short;
}

const people = new Map();
for (const c of castaways.filter(done)) {
  const d = detail.get(c.castaway_id) || { full_name: c.full_name };
  if (!people.has(c.castaway_id)) {
    const short = clean(c.castaway);
    const nick = (clean(d.full_name_detailed).match(/'([^']+)'/) || [])[1];
    people.set(c.castaway_id, {
      id: c.castaway_id,
      name: displayName(d, short),
      search: [...new Set([clean(d.full_name), short.replace(/ [A-Z]\.$/, ""), nick, ...(aliases[clean(d.full_name)] || [])].filter(Boolean))],
      gender: d.gender || null,
      apps: [],
    });
  }
  const k = key(c.castaway_id, c.season), st = statuses.get(k) || new Set();
  people.get(c.castaway_id).apps.push({
    season: c.season,
    age: c.age ?? null,
    state: c.state || null,
    result: c.result || null,
    place: c.place ?? null,
    jury: !!c.jury,
    finalist: !!c.finalist,
    winner: !!c.winner,
    tribe: c.original_tribe || null,
    tribeColour: tribeColour.get(c.season + "|" + c.original_tribe) || null,
    indImmunity: indImmunity.get(k) || 0,
    foundIdol: foundIdol.has(k),
    playedIdol: playedIdol.has(k),
    outWithAdvantage: outWithAdv.has(k),
    gotAdvantage: gotAdvantage.has(k),
    merged: st.has("Merged") || !!c.jury || !!c.finalist,
    swapped: [...st].some(s => s.startsWith("Swapped")),
    secondChanceIsland: [...st].some(s => /Edge of Extinction|Redemption|Dead Man/.test(s)),
    juryVotes: c.finalist ? (juryVotesFor.get(k) || 0) : null,
    confessionals: confCount.get(k) || 0,
  });
}

// ---- Tags: every category is a query over these. Keep names stable; grids reference categories, not tags.
const ordinal = r => +((r || "").match(/^(\d+)(st|nd|rd|th) voted out/) || [])[1] || null;
for (const p of people.values()) {
  const a = p.apps.sort((x, y) => x.season - y.season), first = a[0];
  const any = f => a.some(f);
  const t = new Set();
  const seasonsPlayed = a.map(x => x.season);
  seasonsPlayed.forEach(s => t.add("season:" + s));
  if (any(x => x.winner)) t.add("winner");
  if (any(x => x.finalist)) t.add("finalist");
  if (any(x => x.finalist) && !any(x => x.winner)) t.add("finalist-never-won");
  if (any(x => x.finalist && x.juryVotes === 0)) t.add("zero-jury-votes");
  if (any(x => ordinal(x.result) === 1)) t.add("first-boot");
  if (any(x => ordinal(x.result) && ordinal(x.result) <= 3)) t.add("top-three-boot");
  if (any(x => x.jury)) t.add("jury");
  if (any(x => /Medically|Quit|Withdrew|Ejected/.test(x.result || ""))) t.add("medevac-or-quit");
  if (any(x => /fire challenge/.test(x.result || ""))) t.add("lost-fire");
  if (any(x => x.merged)) t.add("merged"); else t.add("never-merged");
  if (any(x => x.place != null && x.place <= 4)) t.add("final-four");
  const imm = a.reduce((s, x) => s + x.indImmunity, 0);
  if (imm >= 1) t.add("ind-immunity");
  if (imm >= 3) t.add("ind-immunity-3");
  if (any(x => x.foundIdol)) t.add("found-idol");
  if (any(x => x.playedIdol)) t.add("played-idol");
  if (any(x => x.outWithAdvantage)) t.add("out-with-advantage");
  if (any(x => x.gotAdvantage)) t.add("non-idol-advantage");
  if (a.length === 1) t.add("one-season");
  if (a.length >= 2) t.add("returnee");
  if (a.length >= 3) t.add("three-plus");
  if (any(x => returneeSeasons.has(x.season))) t.add("returnee-season");
  if (any(x => x.swapped)) t.add("swapped");
  if (any(x => x.secondChanceIsland)) t.add("second-chance-island");
  for (const [lo, hi] of [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50]]) {
    if (any(x => x.season >= lo && x.season <= hi)) t.add(`era:${lo}-${hi}`);
  }
  if (any(x => x.season <= 20)) t.add("era:1-20");
  if (any(x => x.season >= 21 && x.season <= 40)) t.add("era:21-40");
  if (first.age != null && first.age >= 40) t.add("age-40-plus");
  if (first.age != null && first.age < 25) t.add("age-under-25");
  if (p.gender === "Female") t.add("woman");
  if (p.gender === "Male") t.add("man");
  for (const st of ["California", "Texas", "New York", "Florida"]) if (any(x => x.state === st)) t.add("state:" + st);
  for (const col of ["red", "orange", "yellow", "green", "blue", "purple"]) if (any(x => x.tribeColour === col)) t.add("tribe:" + col);
  if (any(x => x.confessionals > 0) && rankConfessionals(p, a)) t.add("most-confessionals");
  p.tags = [...t].sort();
  p.seasons = seasonsPlayed;
  // Fame prior for day-one rarity: screen time, seasons played and winning.
  const conf = a.reduce((s, x) => s + x.confessionals, 0);
  p.fame = Math.round((Math.sqrt(conf) * 2 + a.length * 6 + (t.has("winner") ? 10 : 0) + (t.has("finalist") ? 3 : 0)) * 10) / 10;
}

// Most confessionals among their own cast in at least one season.
function rankConfessionals(p, apps) {
  return apps.some(x => {
    const cast = castaways.filter(c => done(c) && c.season === x.season);
    const best = Math.max(...cast.map(c => confCount.get(key(c.castaway_id, c.season)) || 0));
    return best > 0 && x.confessionals === best;
  });
}

const unmatched = Object.keys(aliases).filter(n => ![...people.values()].some(p => p.search[0] === n));
if (unmatched.length) throw new Error("aliases.json names with no castaway: " + unmatched.join(", "));

const out = [...people.values()].map(({ apps, ...p }) => p).sort((a, b) => a.id.localeCompare(b.id));
const seasonList = [...finished.values()].sort((a, b) => a.season - b.season)
  .map(s => ({ ...s, returnee: returneeSeasons.has(s.season) }));
const payload = { source: "survivoR (MIT) https://github.com/doehm/survivoR", builtAt: new Date().toISOString().slice(0, 10), seasons: seasonList, castaways: out };
await writeFile(new URL("../data/castaways.json", import.meta.url), JSON.stringify(payload));
console.log(`${out.length} castaways across ${seasonList.length} finished US seasons (${[...returneeSeasons].join(", ")} counted as returnee seasons)`);
