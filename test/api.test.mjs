// Drives the real HTTP server (node:sqlite, in memory) the way the site does.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startServer } from "../src/server/node.mjs";
import { CATEGORY_BY_ID, answersFor } from "../src/core/categories.js";
import { createGame, MAX_WRONG } from "../src/core/game.js";
import { memoryStore } from "../src/core/store-memory.js";
import { stripePayments } from "../src/core/payments.js";
import { inPool, owns, bundleOffer } from "../src/core/products.js";

const data = JSON.parse(await readFile(new URL("../src/generated/data.json", import.meta.url), "utf8"));
const people = data.castaways.map(p => ({ ...p, tagSet: new Set(p.tags) }));
const ids = Object.keys(data.grids).sort();
const GRID = ids[1], PAST = ids[0];
const NOW = () => new Date(GRID + "T18:00:00Z");
let srv, base;
before(async () => { srv = await startServer({ port: 0, dbPath: ":memory:", now: NOW, env: { SHOP: "1" } }); base = `http://localhost:${srv.port}`; });
after(() => srv.close());

const get = async p => { const r = await fetch(base + p); return { status: r.status, body: await r.json().catch(() => null) }; };
const post = async (p, b) => { const r = await fetch(base + p, { method: "POST", body: JSON.stringify(b), headers: { "content-type": "application/json" } }); return { status: r.status, body: await r.json() }; };
const answersIn = (g, i, pool) => answersFor(pool ? people.filter(p => inPool(p, pool)) : people, CATEGORY_BY_ID.get(g.rows[Math.floor(i / 3)]), CATEGORY_BY_ID.get(g.cols[i % 3]));
const cellAnswers = i => answersIn(data.grids[GRID], i);
const wrongFor = i => people.filter(p => !cellAnswers(i).some(a => a.id === p.id));
let n = 0;
const newPlayer = () => "test-player-" + (++n).toString().padStart(4, "0");
const guess = (player, cell, castaway, grid = GRID) => post("/api/guess", { grid, player, cell, castaway });

test("grid never includes answers", async () => {
  const { status, body } = await get("/api/grid?player=" + newPlayer());
  assert.equal(status, 200);
  assert.equal(body.id, GRID);
  assert.equal(body.maxWrong, MAX_WRONG);
  assert.ok(!/US\d{4}/.test(JSON.stringify(body)), "no castaway ids in the grid payload");
});

test("future grids are hidden", async () => {
  assert.equal((await get("/api/grid?id=" + ids.at(-1))).status, 404);
});

test("right guesses are free and swappable; only misses count", async () => {
  const pl = newPlayer();
  const [first, second] = cellAnswers(0);
  let r = await guess(pl, 0, first.id);
  assert.equal(r.body.correct, true);
  assert.equal(r.body.play.wrongLeft, MAX_WRONG);

  r = await guess(pl, 0, first.id);
  assert.equal(r.status, 409, "same answer again");
  r = await guess(pl, 1, first.id);
  assert.equal(r.status, 409, "castaway already used elsewhere");

  r = await guess(pl, 0, second.id);
  assert.equal(r.body.correct, true);
  assert.equal(r.body.replaced.id, first.id);
  assert.equal(r.body.play.cells[0].id, second.id);
  assert.equal(r.body.play.wrongLeft, MAX_WRONG);

  // A wrong swap costs a miss and keeps the old answer.
  r = await guess(pl, 0, wrongFor(0)[0].id);
  assert.equal(r.body.correct, false);
  assert.equal(r.body.play.cells[0].id, second.id);
  assert.equal(r.body.play.wrongLeft, MAX_WRONG - 1);

  // The swapped-out answer is free to use elsewhere again.
  const elsewhere = [1, 2, 3, 4, 5, 6, 7, 8].find(i => cellAnswers(i).some(a => a.id === first.id));
  if (elsewhere) assert.equal((await guess(pl, elsewhere, first.id)).body.correct, true);

  assert.equal((await guess(pl, 9, first.id)).status, 400);
  assert.equal((await guess("x", 2, first.id)).status, 400);
  assert.equal((await guess(pl, 2, "NOPE")).status, 400);
  const g = await get(`/api/grid?player=${pl}`);
  assert.equal(g.body.play.cells[0].id, second.id, "state lives on the server");
});

test("nine misses end the game", async () => {
  const pl = newPlayer();
  let last;
  for (const p of wrongFor(4).slice(0, MAX_WRONG)) last = await guess(pl, 4, p.id);
  assert.equal(last.body.play.done, true);
  assert.equal(last.body.play.wrongLeft, 0);
  assert.equal((await guess(pl, 4, cellAnswers(4)[0].id)).status, 409);
});

test("results unlock after submit, with every answer rarest first", async () => {
  const pl = newPlayer();
  await guess(pl, 2, cellAnswers(2)[0].id);
  assert.equal((await get(`/api/results?id=${GRID}&player=${pl}`)).status, 403);
  await post("/api/finish", { grid: GRID, player: pl });
  const r = await get(`/api/results?id=${GRID}&player=${pl}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.cells[2].answers.length, cellAnswers(2).length);
  assert.equal(r.body.cells[2].mine, cellAnswers(2)[0].id);
  const rar = r.body.cells[2].answers.map(a => a.rarity);
  assert.deepEqual(rar, [...rar].sort((a, b) => a - b), "rarest first");
  assert.equal((await guess(pl, 3, cellAnswers(3)[0].id)).status, 409, "no guesses after submit");
});

test("picks only count once a grid is submitted", async () => {
  const ans = cellAnswers(8);
  const obscure = ans.reduce((a, b) => a.fame <= b.fame ? a : b);
  const rarity = async () => (await guess(newPlayer(), 8, obscure.id)).body.play.cells[8].rarity;
  const before = await rarity();
  for (let i = 0; i < 10; i++) await guess(newPlayer(), 8, obscure.id);
  assert.equal(await rarity(), before, "unsubmitted games don't move rarity");
  for (let i = 0; i < 30; i++) { const pl = newPlayer(); await guess(pl, 8, obscure.id); await post("/api/finish", { grid: GRID, player: pl }); }
  assert.ok(await rarity() > before * 2, "rarity rises as submitted players pick them");
});

test("past grids need the archive", async () => {
  const r = await get(`/api/grid?id=${PAST}&player=${newPlayer()}`);
  assert.equal(r.status, 402);
  assert.equal(r.body.product, "archive");
  assert.equal((await post("/api/checkout", { player: newPlayer(), product: "archive" })).status, 503, "no payments configured");
  const a = await get(`/api/archive?player=${newPlayer()}`);
  assert.equal(a.body.daily[0].id, PAST);
  assert.equal(a.body.daily[0].locked, true);
  assert.equal(a.body.packs.length, 4);
  assert.ok(a.body.packs.every(p => p.locked));
});

test("practice grids are free", async () => {
  const g = await get(`/api/grid?id=practice-abc123&player=${newPlayer()}`);
  assert.equal(g.status, 200);
  assert.equal(g.body.kind, "practice");
  assert.equal((await get(`/api/grid?id=practice-../../x`)).status, 400);
});

test("share links put the score in the link preview", async () => {
  const html = await (await fetch(`${base}/r/${GRID}-237-112010200`)).text();
  assert.match(html, /<title>Tribal Grid #2: scored 237 \(5\/9\)<\/title>/);
  assert.match(html, /og:title" content="Tribal Grid #2: scored 237/);
  assert.match(await (await fetch(`${base}/r/nonsense`)).text(), /<title>Tribal Grid<\/title>/);
});

test("reports are accepted", async () => {
  assert.equal((await post("/api/report", { grid: GRID, player: newPlayer(), cell: 3, castaway: null, note: "Should count" })).status, 200);
});

test("unreviewed grids are refused when review is required", async () => {
  const game = createGame({ castaways: data.castaways, grids: { [GRID]: { ...data.grids[GRID], reviewed: false } }, store: memoryStore(), requireReview: true, now: NOW });
  assert.equal((await game.handle(new Request("http://x/api/grid"))).status, 503);
});

// ---- Purchases, on an in-memory game
const call = (game, path, b) => game.handle(new Request("http://x" + path, b ? { method: "POST", body: JSON.stringify(b) } : undefined)).then(async r => ({ status: r.status, body: await r.json() }));

test("unlocking packs and restoring on another device", async () => {
  const game = createGame({ castaways: data.castaways, grids: data.grids, packs: data.packs, store: memoryStore(), now: NOW, freeUnlock: true });
  const a = "device-a-000001", b = "device-b-000001";
  const pack = data.packs["new-era"], pg = pack.grids[0];
  assert.equal((await call(game, `/api/grid?id=pack-new-era-1&player=${a}`)).status, 402);
  assert.equal((await call(game, "/api/checkout", { player: a, product: "pack:new-era" })).body.granted, true);
  assert.equal((await call(game, `/api/grid?id=pack-new-era-1&player=${a}`)).status, 200);
  assert.equal((await call(game, `/api/grid?id=pack-classic-era-1&player=${a}`)).status, 402, "other packs stay locked");

  // Pack answers only come from the pack's castaways.
  const outside = answersIn(pg, 0).find(p => !inPool(p, pack.pool));
  if (outside) assert.equal((await call(game, "/api/guess", { grid: "pack-new-era-1", player: a, cell: 0, castaway: outside.id })).body.correct, false);
  assert.equal((await call(game, "/api/guess", { grid: "pack-new-era-1", player: a, cell: 1, castaway: answersIn(pg, 1, pack.pool)[0].id })).body.correct, true);

  const arch = (await call(game, `/api/archive?player=${a}`)).body;
  assert.equal(arch.restoreCodes.length, 1);
  assert.equal((await call(game, "/api/restore", { player: b, code: "WRONGCODE1" })).status, 404);
  const restored = await call(game, "/api/restore", { player: b, code: arch.restoreCodes[0].toLowerCase() });
  assert.deepEqual(restored.body.owned, ["pack:new-era"]);

  await call(game, "/api/checkout", { player: b, product: "all" });
  assert.equal((await call(game, `/api/grid?id=${PAST}&player=${b}`)).status, 200, "everything includes the archive");
});

test("Stripe checkout, confirm and signed webhooks", async () => {
  const sessions = {}, amounts = [];
  const fakeFetch = async (url, init) => {
    if (init.method === "POST") {
      const f = new URLSearchParams(init.body);
      const id = "cs_test_" + Object.keys(sessions).length;
      amounts.push(+f.get("line_items[0][price_data][unit_amount]"));
      sessions[id] = { id, url: "https://checkout.stripe.com/" + id, payment_status: "unpaid", metadata: { product: f.get("metadata[product]"), player: f.get("metadata[player]") } };
      return new Response(JSON.stringify(sessions[id]));
    }
    return new Response(JSON.stringify(sessions[url.split("/").pop()]));
  };
  const payments = stripePayments({ secretKey: "sk_test", webhookSecret: "whsec_test", fetchImpl: fakeFetch });
  const game = createGame({ castaways: data.castaways, grids: data.grids, packs: data.packs, store: memoryStore(), now: NOW, payments });
  const pl = "stripe-buyer-0001";

  const co = await call(game, "/api/checkout", { player: pl, product: "archive" });
  assert.match(co.body.url, /checkout\.stripe\.com/);
  assert.equal((await call(game, "/api/purchase/confirm", { player: pl, session: "cs_test_0" })).status, 402, "not paid yet");
  sessions.cs_test_0.payment_status = "paid";
  assert.deepEqual((await call(game, "/api/purchase/confirm", { player: pl, session: "cs_test_0" })).body.owned, ["archive"]);

  // Webhook path, for a second buyer.
  const pl2 = "stripe-buyer-0002";
  await call(game, "/api/checkout", { player: pl2, product: "archive" });
  const event = JSON.stringify({ type: "checkout.session.completed", data: { object: { ...sessions.cs_test_1, payment_status: "paid" } } });
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("whsec_test"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${event}`)))].map(b => b.toString(16).padStart(2, "0")).join("");
  const hook = s => game.handle(new Request("http://x/api/stripe/webhook", { method: "POST", body: event, headers: { "stripe-signature": s } }));
  assert.equal((await hook(`t=${t},v1=${"0".repeat(64)}`)).status, 400, "bad signature rejected");
  assert.equal((await hook(`t=${t},v1=${sig}`)).status, 200);
  assert.equal((await call(game, `/api/grid?id=${PAST}&player=${pl2}`)).status, 200);

  // Upgrading to Everything is charged at the bundle price minus the archive already owned,
  // and grants this season's bundle rather than a bare "all".
  await call(game, "/api/checkout", { player: pl, product: "all" });
  assert.deepEqual(amounts, [499, 499, 500]);
  assert.equal(sessions.cs_test_2.metadata.product, "all:51");
});

test("with the shop off, past grids are free and packs are hidden", async () => {
  const game = createGame({ castaways: data.castaways, grids: data.grids, packs: data.packs, store: memoryStore(), now: NOW, shop: false });
  const p = "free-player-0001";
  assert.equal((await call(game, `/api/grid?id=${PAST}&player=${p}`)).status, 200);
  assert.equal((await call(game, `/api/grid?id=pack-new-era-1&player=${p}`)).status, 404);
  const arch = (await call(game, `/api/archive?player=${p}`)).body;
  assert.equal(arch.shop, false);
  assert.deepEqual(arch.packs, []);
  assert.ok(arch.daily.length && arch.daily.every(g => !g.locked));
  assert.equal((await call(game, "/api/checkout", { player: p, product: "archive" })).status, 404);
  assert.equal((await call(game, "/api/config")).body.shop, false);
});

test("bundle covers its own season's packs and credits what you own", () => {
  const owned = (...xs) => new Set(xs);
  assert.equal(bundleOffer(owned()).price, "$9.99");
  assert.equal(bundleOffer(owned("archive")).price, "$5.00");
  assert.equal(bundleOffer(owned("pack:new-era")).price, "$7.00");
  assert.equal(bundleOffer(owned("archive", "pack:new-era", "pack:returnees")).price, "$1.99", "never below the floor");
  const bundle = owned("all:51");
  assert.ok(owns(bundle, "archive") && owns(bundle, "pack:classic-era") && owns(bundle, "all"));
  assert.ok(!owns(owned("all:50"), "pack:classic-era"), "an older season's bundle doesn't cover this season's packs");
  assert.ok(owns(owned("all:50"), "archive"));
  assert.ok(owns(owned("all"), "pack:returnees"), "legacy grants keep everything");
});

test("content pages are plain HTML, and past grid pages list every answer", async () => {
  for (const p of ["/how-to-play", "/about", "/contact", "/clues", "/grids"]) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get("content-type"), /text\/html/);
    assert.match(await r.text(), /<h2>/);
  }
  const past = await (await fetch(base + "/grids/" + PAST)).text();
  const g = data.grids[PAST];
  assert.ok(past.includes(answersIn(g, 0)[0].name.replace(/&/g, "&amp;").replace(/'/g, "'")), "answers on a past grid's page");
  const today = await (await fetch(base + "/grids/" + GRID)).text();
  assert.ok(!today.includes("Show all"), "no answers for today's grid");
  assert.equal((await fetch(base + "/grids/" + ids.at(-1))).status, 404);
  const map = await (await fetch(base + "/sitemap.xml")).text();
  assert.ok(map.includes("/grids/" + PAST) && !map.includes("/grids/" + ids.at(-1)));
});
