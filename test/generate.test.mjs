import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { generate, evaluate, hasDistinctFill } from "../src/core/generate.js";
import { CATEGORY_BY_ID, CATEGORIES } from "../src/core/categories.js";

const { castaways } = JSON.parse(await readFile(new URL("../data/castaways.json", import.meta.url), "utf8"));
const people = castaways.map(p => ({ ...p, tagSet: new Set(p.tags) }));

test("every category has people", () => {
  for (const c of CATEGORIES) assert.ok(people.some(p => p.tagSet.has(c.tag)), c.id);
});

test("generation is deterministic and valid", () => {
  const a = generate(people, "seed-1"), b = generate(people, "seed-1");
  assert.deepEqual(a, b);
  for (let i = 0; i < 40; i++) {
    const g = generate(people, "test-" + i);
    const ev = evaluate(people, g.rows.map(id => CATEGORY_BY_ID.get(id)), g.cols.map(id => CATEGORY_BY_ID.get(id)));
    assert.ok(ev, "grid should re-validate");
    assert.ok(ev.counts.every(n => n >= 4));
  }
});

test("distinct-fill check catches impossible grids", () => {
  const p = id => ({ id });
  assert.equal(hasDistinctFill([[p(1)], [p(1)]]), false);
  assert.equal(hasDistinctFill([[p(1), p(2)], [p(1)]]), true);
});

test("scheduled grid files are all valid", async () => {
  const dir = new URL("../grids/", import.meta.url);
  for (const f of (await readdir(dir)).filter(f => f.endsWith(".json"))) {
    const g = JSON.parse(await readFile(new URL(f, dir), "utf8"));
    assert.ok(evaluate(people, g.rows.map(id => CATEGORY_BY_ID.get(id)), g.cols.map(id => CATEGORY_BY_ID.get(id))), f);
  }
});
