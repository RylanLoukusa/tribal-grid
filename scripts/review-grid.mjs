// Print a grid with every valid answer so a person can sanity-check it before it goes live.
//   npm run review -- 2026-10-12             show it
//   npm run review -- 2026-10-12 --approve   mark it reviewed (the live site only serves reviewed grids)
//   npm run review -- --pending              list grids not yet reviewed
import { readFile, writeFile, readdir } from "node:fs/promises";
import { CATEGORY_BY_ID, answersFor } from "../src/core/categories.js";

const argv = process.argv.slice(2);
const dir = new URL("../grids/", import.meta.url);
const { castaways } = JSON.parse(await readFile(new URL("../data/castaways.json", import.meta.url), "utf8"));
const people = castaways.map(p => ({ ...p, tagSet: new Set(p.tags) }));

if (argv.includes("--pending")) {
  const files = (await readdir(dir)).filter(f => f.endsWith(".json")).sort();
  for (const f of files) { const g = JSON.parse(await readFile(new URL(f, dir), "utf8")); if (!g.reviewed) console.log(g.id); }
  process.exit(0);
}
const id = argv.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!id) { console.error("Usage: npm run review -- YYYY-MM-DD [--approve]"); process.exit(1); }
const file = new URL(id + ".json", dir);
const g = JSON.parse(await readFile(file, "utf8"));
const rows = g.rows.map(c => CATEGORY_BY_ID.get(c)), cols = g.cols.map(c => CATEGORY_BY_ID.get(c));

console.log(`\nTribal Grid #${g.number} · ${g.id} · ${g.reviewed ? "REVIEWED" : "not reviewed"}\n`);
console.log("Rows:    " + rows.map(c => c.label).join("  |  "));
console.log("Columns: " + cols.map(c => c.label).join("  |  ") + "\n");
rows.forEach((a, r) => cols.forEach((b, c) => {
  const ans = answersFor(people, a, b).sort((x, y) => y.fame - x.fame);
  console.log(`[${r * 3 + c + 1}] ${a.label} × ${b.label}  (${ans.length})`);
  console.log("    " + ans.map(p => `${p.name} (S${p.seasons.join(",")})`).join("; ") + "\n");
}));

if (argv.includes("--approve")) {
  g.reviewed = true;
  g.reviewedAt = new Date().toISOString();
  await writeFile(file, JSON.stringify(g, null, 2) + "\n");
  console.log(`Marked ${id} as reviewed. Run \`npm run bundle\` to ship it.`);
}
