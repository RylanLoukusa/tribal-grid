// Spot checks against facts any Survivor fan would catch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { castaways, seasons } = JSON.parse(await readFile(new URL("../data/castaways.json", import.meta.url), "utf8"));
const find = name => castaways.find(p => p.search[0] === name) || assert.fail("missing " + name);
const has = (name, tag) => assert.ok(find(name).tags.includes(tag), `${name} should have ${tag}`);
const lacks = (name, tag) => assert.ok(!find(name).tags.includes(tag), `${name} should not have ${tag}`);

test("only finished US seasons are included", () => {
  assert.ok(seasons.length >= 50);
  assert.ok(seasons.every(s => s.ended));
  assert.ok(castaways.every(p => p.seasons.every(n => seasons.some(s => s.season === n))));
});

test("winners", () => {
  for (const n of ["Richard Hatch", "Sandra Diaz-Twine", "Tony Vlachos", "Parvati Shallow", "Kim Spradlin-Wolfe"]) has(n, "winner");
  for (const n of ["Cirie Fields", "Russell Hantz", "Rupert Boneham"]) lacks(n, "winner");
  assert.equal(castaways.filter(p => p.tags.includes("winner")).length, seasons.length - 2, "Sandra and Tony won twice");
});

test("results and gameplay", () => {
  has("Russell Hantz", "finalist-never-won");
  has("Russell Hantz", "found-idol");
  has("Russell Hantz", "zero-jury-votes");
  has("Sonja Christopher", "first-boot");
  has("Kelly Wiglesworth", "finalist-never-won");
  has("Kelly Wiglesworth", "ind-immunity-3");
  has("Rob Mariano", "three-plus");
  has("Rob Mariano", "returnee-season");
  lacks("Rob Mariano", "one-season");
  has("Jonathan Penner", "medevac-or-quit");
});

test("search names include nicknames", () => {
  assert.ok(find("Rob Mariano").search.includes("Boston Rob"));
  assert.ok(find("Oscar Lusth").search.includes("Ozzy"));
  assert.ok(find("Benjamin Wade").search.includes("Coach"));
});
