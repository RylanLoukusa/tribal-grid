// Writes upcoming daily grids to grids/YYYY-MM-DD.json for review.
//   npm run generate -- --from 2026-10-12 --days 30
// Existing grids are never overwritten (a reviewed grid stays as reviewed), unless --force.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { generate } from "../src/core/generate.js";
import { LAUNCH_DATE, gridNumber, addDays } from "../src/core/dates.js";

const args = Object.fromEntries(process.argv.slice(2).join(" ").split("--").filter(Boolean).map(s => s.trim().split(/\s+/)).map(([k, v]) => [k, v ?? true]));
const from = args.from || LAUNCH_DATE;
const days = +(args.days || 30);
const dir = new URL("../grids/", import.meta.url);
const { castaways } = JSON.parse(await readFile(new URL("../data/castaways.json", import.meta.url), "utf8"));
const people = castaways.map(p => ({ ...p, tagSet: new Set(p.tags) }));

const existing = new Set((await readdir(dir)).filter(f => f.endsWith(".json")).map(f => f.slice(0, 10)));
const recent = [];
for (let d = 1; d <= 3; d++) {
  const prev = addDays(from, -d);
  if (existing.has(prev)) { const g = JSON.parse(await readFile(new URL(prev + ".json", dir), "utf8")); recent.push([...g.rows, ...g.cols]); }
}
let made = 0;
for (let i = 0; i < days; i++) {
  const date = addDays(from, i);
  if (existing.has(date) && !args.force) {
    const g = JSON.parse(await readFile(new URL(date + ".json", dir), "utf8"));
    recent.unshift([...g.rows, ...g.cols]); recent.length = Math.min(recent.length, 3);
    continue;
  }
  const g = generate(people, "survivor:" + date, { avoid: new Set(recent.flat()) });
  const grid = { id: date, number: gridNumber(date), show: "survivor", rows: g.rows, cols: g.cols, counts: g.counts, reviewed: false };
  await writeFile(new URL(date + ".json", dir), JSON.stringify(grid, null, 2) + "\n");
  recent.unshift([...g.rows, ...g.cols]); recent.length = Math.min(recent.length, 3);
  made++;
  console.log(`${date}  #${grid.number}  ${g.rows.join(", ")}  x  ${g.cols.join(", ")}  [${g.counts.join(" ")}]`);
}
console.log(`${made} new grid(s). Review them with: npm run review -- <date>`);
