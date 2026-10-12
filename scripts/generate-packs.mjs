// Writes packs/<id>.json: PACK_SIZE grids per pack, built only from that pack's castaways.
// Existing pack files are kept unless --force (players may have played them).
import { readFile, writeFile, access } from "node:fs/promises";
import { generate } from "../src/core/generate.js";
import { PACKS, PACK_SIZE, inPool } from "../src/core/products.js";

const force = process.argv.includes("--force");
const { castaways } = JSON.parse(await readFile(new URL("../data/castaways.json", import.meta.url), "utf8"));
const people = castaways.map(p => ({ ...p, tagSet: new Set(p.tags) }));

for (const pack of PACKS) {
  const file = new URL(`../packs/${pack.id}.json`, import.meta.url);
  if (!force && await access(file).then(() => true, () => false)) { console.log(`${pack.id}: kept existing`); continue; }
  const pool = people.filter(p => inPool(p, pack.pool));
  const grids = [], recent = [];
  for (let n = 1; grids.length < PACK_SIZE; n++) {
    if (n > PACK_SIZE * 10) throw new Error(`${pack.id}: couldn't make ${PACK_SIZE} grids from this pool`);
    let g;
    try { g = generate(pool, `pack:${pack.id}:${n}`, { avoid: new Set(recent.flat()), tries: 4000 }); } catch { continue; }
    grids.push({ n: grids.length + 1, rows: g.rows, cols: g.cols, counts: g.counts });
    recent.unshift([...g.rows, ...g.cols]); recent.length = Math.min(recent.length, 2);
  }
  await writeFile(file, JSON.stringify({ id: pack.id, pool: pack.pool, reviewed: false, grids }, null, 2) + "\n");
  console.log(`${pack.id}: ${pool.length} castaways, ${grids.length} grids`);
}
