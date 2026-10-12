// Packs the castaway table, the daily grids and the grid packs into src/generated/data.json, which both
// servers import. Run after build-data, generate or review.
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const { castaways, seasons, source } = JSON.parse(await readFile(new URL("data/castaways.json", root), "utf8"));
const grids = {};
for (const f of (await readdir(new URL("grids/", root))).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
  const g = JSON.parse(await readFile(new URL("grids/" + f, root), "utf8"));
  grids[g.id] = { id: g.id, number: g.number, rows: g.rows, cols: g.cols, reviewed: !!g.reviewed };
}
const packs = {};
for (const f of (await readdir(new URL("packs/", root))).filter(f => f.endsWith(".json")).sort()) {
  const p = JSON.parse(await readFile(new URL("packs/" + f, root), "utf8"));
  packs[p.id] = { id: p.id, pool: p.pool, reviewed: !!p.reviewed, grids: p.grids.map(({ n, rows, cols }) => ({ n, rows, cols })) };
}
await mkdir(new URL("src/generated/", root), { recursive: true });
const slim = castaways.map(({ id, name, search, seasons, tags, fame }) => ({ id, name, search, seasons, tags, fame }));
await writeFile(new URL("src/generated/data.json", root), JSON.stringify({ source, seasons, castaways: slim, grids, packs }));
const reviewed = Object.values(grids).filter(g => g.reviewed).length;
console.log(`Bundled ${slim.length} castaways and ${Object.keys(grids).length} grids (${reviewed} reviewed) and ${Object.keys(packs).length} packs.`);
