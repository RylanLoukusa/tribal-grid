// The game API as a plain fetch-style handler: handle(Request) -> Response.
// It runs unchanged on Cloudflare Workers (D1), on Node (node:sqlite) and in the browser
// preview (in-memory store). Answers are checked here, so clients never see an answer list
// until their game is over.
//
// Grid ids:  2026-10-11 (daily)  ·  practice-x7k2p9 (random, free)  ·  pack-new-era-3 (paid pack)
import { CATEGORY_BY_ID, fits, answersFor } from "./categories.js";
import { generate } from "./generate.js";
import { cellShares, toPercent, scoreOf } from "./rarity.js";
import { todayId, isDateId, LAUNCH_DATE } from "./dates.js";
import { layout, cluesPage, gridsIndexPage, gridPage, sitemap, ROBOTS, howToPlayPage, aboutPage, contactPage } from "./pages.js";
import { PACKS, PRODUCTS, PRODUCT_IDS, BUNDLE_SEASON, SEPARATE_CENTS, inPool, owns, bundleOffer, bundleGrant, isGrant, priceFor, usd } from "./products.js";

export const MAX_WRONG = 9;
const PLAYER_RE = /^[A-Za-z0-9_-]{8,64}$/;
const PACK_GRID_RE = /^pack-([a-z0-9-]+)-(\d{1,3})$/;
// The server-rendered content pages (see pages.js). Everything else outside /api/ is the static site.
export const isPagePath = p => /^\/(how-to-play|about|contact|clues|grids(\/\d{4}-\d{2}-\d{2})?)\/?$|^\/(sitemap\.xml|robots\.txt)$/.test(p);

export function createGame({
  castaways, grids, packs = {}, store, now = () => new Date(), requireReview = false, showName = "Survivor",
  payments = null, freeUnlock = false, ads = null, shop = true, contactEmail = "hello@tribalgrid.app",
}) {
  // shop off: no store at all. Past daily grids are free, packs are hidden, purchase routes 404.
  const people = castaways.map(p => ({ ...p, tagSet: new Set(p.tags) }));
  const byId = new Map(people.map(p => [p.id, p]));
  const publicList = people.map(p => ({ id: p.id, name: p.name, search: p.search, seasons: p.seasons }));
  const practiceCache = new Map();
  const packInfo = new Map(PACKS.map(p => [p.id, p]));

  // ---- Grids
  function loadGrid(id) {
    if (id.startsWith("practice-")) {
      if (!/^practice-[a-z0-9]{4,24}$/.test(id)) return { error: [400, "Bad practice grid id"] };
      if (!practiceCache.has(id)) {
        if (practiceCache.size > 500) practiceCache.clear();
        const g = generate(people, id);
        practiceCache.set(id, { id, kind: "practice", number: null, rows: g.rows, cols: g.cols });
      }
      return { grid: practiceCache.get(id) };
    }
    const pm = id.match(PACK_GRID_RE);
    if (pm) {
      if (!shop) return { error: [404, "No such pack grid"] };
      const pack = packs[pm[1]], info = packInfo.get(pm[1]);
      const pg = pack?.grids.find(g => g.n === +pm[2]);
      if (!pg || !info) return { error: [404, "No such pack grid"] };
      if (requireReview && !pack.reviewed) return { error: [503, "This pack is still being checked."] };
      return { grid: { id, kind: "pack", pack: info.id, packTitle: info.title, n: pg.n, of: pack.grids.length, pool: pack.pool, rows: pg.rows, cols: pg.cols } };
    }
    if (!isDateId(id)) return { error: [400, "Bad grid id"] };
    if (id > todayId(now())) return { error: [404, "That grid isn't out yet"] };
    const g = grids[id];
    if (!g) return { error: [404, "No grid for that day"] };
    if (requireReview && !g.reviewed) return { error: [503, "Today's grid is still being checked. Try again soon."] };
    return { grid: { ...g, kind: "daily" } };
  }
  const productFor = g => g.kind === "pack" ? "pack:" + g.pack : g.kind === "daily" && g.id !== todayId(now()) ? "archive" : null;
  const ownedBy = async player => new Set(PLAYER_RE.test(player || "") ? await store.entitlements(player) : []);

  // Today's grid and practice are free. Past grids need the archive (or a game already started
  // on them); pack grids need that pack.
  async function lockFor(g, player) {
    if (!shop) return null;
    const product = productFor(g);
    if (!product) return null;
    if (owns(await ownedBy(player), product)) return null;
    if (g.kind === "daily" && PLAYER_RE.test(player || "") && await store.getPlay(g.id, player)) return null;
    return product;
  }
  async function open(id, player) {
    const r = loadGrid(id);
    if (r.error) return r;
    const product = await lockFor(r.grid, player);
    if (product) return { error: [402, "Unlock this grid to play it"], product };
    return r;
  }

  const cats = g => ({ rows: g.rows.map(id => CATEGORY_BY_ID.get(id)), cols: g.cols.map(id => CATEGORY_BY_ID.get(id)) });
  const cellCats = (g, i) => { const c = cats(g); return [c.rows[Math.floor(i / 3)], c.cols[i % 3]]; };
  const answerCache = new Map();
  function cellAnswers(g, i) {
    const k = g.id + ":" + i;
    if (!answerCache.has(k)) {
      if (answerCache.size > 4000) answerCache.clear();
      const pool = g.pool ? people.filter(p => inPool(p, g.pool)) : people;
      answerCache.set(k, answersFor(pool, ...cellCats(g, i)));
    }
    return answerCache.get(k);
  }

  // ---- Plays
  const blank = (g, player) => ({ grid: g.id, player, wrongLeft: MAX_WRONG, moves: 0, cells: Array(9).fill(null), misses: Array(9).fill(0), done: false });
  const practicePlays = new Map();
  async function getPlay(g, player) {
    if (g.kind === "practice") return practicePlays.get(g.id + ":" + player) || blank(g, player);
    return (await store.getPlay(g.id, player)) || blank(g, player);
  }
  async function savePlay(g, play, prevMoves) {
    if (g.kind === "practice") {
      if (practicePlays.size > 5000) practicePlays.clear();
      practicePlays.set(g.id + ":" + play.player, play);
      return true;
    }
    return store.putPlay(play, prevMoves);
  }
  // A finished game's answers become everyone else's rarity data.
  async function recordPicks(g, play) {
    if (g.kind === "practice") return;
    for (let i = 0; i < 9; i++) if (play.cells[i]) await store.addPick(g.id, i, play.cells[i]);
  }
  async function picksFor(g) {
    const byCell = Array.from({ length: 9 }, () => new Map());
    if (g.kind !== "practice") for (const r of await store.cellPicks(g.id)) byCell[r.cell]?.set(r.castaway, r.n);
    return byCell;
  }
  async function view(g, play) {
    const picks = await picksFor(g);
    const r = play.cells.map((id, i) => id == null ? null : toPercent(cellShares(cellAnswers(g, i), picks[i]).get(id) || 0));
    return {
      wrongLeft: play.wrongLeft, done: play.done, misses: play.misses, moves: play.moves,
      cells: play.cells.map((id, i) => id == null ? null : { id, name: byId.get(id)?.name, rarity: r[i] }),
      score: scoreOf(r),
    };
  }

  // ---- Routes
  async function getConfig() {
    return json({
      launch: LAUNCH_DATE, show: showName,
      shop, payments: shop && (!!payments || freeUnlock), freeUnlock,
      products: shop ? PRODUCTS : [],
      ads: ads?.client || ads?.placeholder ? { client: ads.client || null, slots: ads.slots || {}, placeholder: !!ads.placeholder } : null,
    }, { "cache-control": "public, max-age=300" });
  }

  async function getGrid(url) {
    const player = url.searchParams.get("player");
    const r = await open(url.searchParams.get("id") || todayId(now()), player);
    if (r.error) return err(...r.error, r.product ? { product: r.product } : undefined);
    const g = r.grid, c = cats(g);
    const label = x => ({ id: x.id, label: x.label, short: x.short || null, note: x.note || null });
    const body = {
      id: g.id, kind: g.kind, number: g.number ?? null, practice: g.kind === "practice",
      pack: g.kind === "pack" ? { id: g.pack, title: g.packTitle, n: g.n, of: g.of } : null,
      show: showName, today: todayId(now()), launch: LAUNCH_DATE, maxWrong: MAX_WRONG,
      rows: c.rows.map(label), cols: c.cols.map(label),
    };
    if (player && PLAYER_RE.test(player)) body.play = await view(g, await getPlay(g, player));
    if (g.kind !== "practice") body.players = await store.playerCount(g.id);
    return json(body, { "cache-control": "no-store" });
  }

  async function postGuess(req) {
    const b = await body(req);
    if (!b) return err(400, "Send JSON");
    const { grid: gid, player, cell, castaway } = b;
    if (!PLAYER_RE.test(player || "")) return err(400, "Bad player id");
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) return err(400, "Bad cell");
    const person = byId.get(castaway);
    if (!person) return err(400, "Unknown castaway");
    const r = await open(String(gid || ""), player);
    if (r.error) return err(...r.error);
    const g = r.grid;
    const play = await getPlay(g, player);
    if (play.done) return err(409, "This game is already finished");
    if (play.cells[cell] === castaway) return err(409, "That's already your answer for this square");
    if (play.cells.some((id, i) => id === castaway && i !== cell)) return err(409, "You've already used that castaway");

    const [a, c] = cellCats(g, cell);
    const correct = inPool(person, g.pool) && fits(person, a) && fits(person, c);
    const next = { ...play, cells: [...play.cells], misses: [...play.misses], moves: play.moves + 1 };
    const replaced = correct && play.cells[cell] ? play.cells[cell] : null;
    if (correct) next.cells[cell] = castaway;
    else { next.misses[cell]++; next.wrongLeft--; }
    if (next.wrongLeft <= 0) next.done = true;
    if (!(await savePlay(g, next, play.moves))) return err(409, "Another guess landed at the same time. Refresh and try again.");
    if (next.done) await recordPicks(g, next);
    return json({ correct, replaced: replaced && { id: replaced, name: byId.get(replaced)?.name }, castaway: { id: person.id, name: person.name }, cell, play: await view(g, next) });
  }

  // Submit: ends the game and counts this player's answers toward everyone's rarity.
  async function postFinish(req) {
    const b = await body(req);
    if (!b || !PLAYER_RE.test(b.player || "")) return err(400, "Bad player id");
    const r = await open(String(b.grid || ""), b.player);
    if (r.error) return err(...r.error);
    const g = r.grid;
    const play = await getPlay(g, b.player);
    if (play.done) return json({ play: await view(g, play) });
    const next = { ...play, done: true, moves: play.moves + 1 };
    if (!(await savePlay(g, next, play.moves))) return err(409, "Another guess landed at the same time. Refresh and try again.");
    await recordPicks(g, next);
    return json({ play: await view(g, next) });
  }

  // After a game is over: every right answer per square, rarest first.
  async function getResults(url) {
    const player = url.searchParams.get("player") || "";
    const r = await open(url.searchParams.get("id") || "", player);
    if (r.error) return err(...r.error);
    const g = r.grid;
    const play = PLAYER_RE.test(player) ? await getPlay(g, player) : null;
    if (!play?.done) return err(403, "Submit the grid to see the answers");
    const picks = await picksFor(g);
    const cells = Array.from({ length: 9 }, (_, i) => {
      const ans = cellAnswers(g, i), shares = cellShares(ans, picks[i]);
      const answers = ans.map(p => ({ id: p.id, name: p.name, seasons: p.seasons, rarity: toPercent(shares.get(p.id)), picks: picks[i].get(p.id) || 0 }))
        .sort((x, y) => x.rarity - y.rarity || x.name.localeCompare(y.name));
      return { answers, mine: play.cells[i], players: [...picks[i].values()].reduce((s, n) => s + n, 0) };
    });
    return json({ id: g.id, cells, play: await view(g, play), players: g.kind === "practice" ? null : await store.playerCount(g.id) });
  }

  async function postReport(req) {
    const b = await body(req);
    if (!b) return err(400, "Send JSON");
    const note = String(b.note || "").slice(0, 500);
    if (!PLAYER_RE.test(b.player || "") || !Number.isInteger(b.cell) || b.cell < 0 || b.cell > 8) return err(400, "Bad report");
    if (b.castaway != null && !byId.has(b.castaway)) return err(400, "Unknown castaway");
    const r = loadGrid(String(b.grid || ""));
    if (r.error) return err(...r.error);
    await store.addReport({ grid: r.grid.id, cell: b.cell, castaway: b.castaway || null, player: b.player, note });
    return json({ ok: true });
  }

  // ---- Archive and packs
  async function getArchive(url) {
    const player = url.searchParams.get("player") || "";
    const owned = await ownedBy(player);
    const played = new Map((PLAYER_RE.test(player) ? await store.playedGrids(player) : []).map(p => [p.grid, p]));
    const status = id => { const p = played.get(id); return p ? (p.done ? "done" : "started") : null; };
    const today = todayId(now());
    const daily = Object.values(grids)
      .filter(g => g.id < today && (!requireReview || g.reviewed))
      .sort((a, b) => b.id.localeCompare(a.id))
      .map(g => ({ id: g.id, number: g.number, status: status(g.id), locked: shop && !owns(owned, "archive") && !played.has(g.id) }));
    if (!shop) return json({ today, daily, packs: [], shop: false }, { "cache-control": "no-store" });
    const packList = PACKS.filter(p => packs[p.id] && (!requireReview || packs[p.id].reviewed)).map(p => ({
      id: p.id, title: p.title, description: p.description, product: "pack:" + p.id,
      locked: !owns(owned, "pack:" + p.id),
      grids: packs[p.id].grids.map(g => ({ id: `pack-${p.id}-${g.n}`, n: g.n, status: status(`pack-${p.id}-${g.n}`) })),
    }));
    const offer = bundleOffer(owned);
    return json({
      today, daily, packs: packList, owned: [...owned], shop: true,
      unlocked: { archive: owns(owned, "archive"), all: owns(owned, "all") },
      bundle: { season: BUNDLE_SEASON.name, separately: usd(SEPARATE_CENTS), credit: offer.credit ? usd(offer.credit) : null },
      restoreCodes: PLAYER_RE.test(player) ? await store.restoreCodes(player) : [],
      payments: !!payments || freeUnlock, freeUnlock,
      products: PRODUCTS.map(p => p.id === "all" ? { ...p, price: offer.price, fullPrice: p.price } : p),
    }, { "cache-control": "no-store" });
  }

  // ---- Content pages
  const page = (body, maxAge = 3600, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": `public, max-age=${maxAge}` } });
  async function getPage(path) {
    path = path.replace(/(.)\/$/, "$1");
    const o = { adsClient: ads?.client || null };
    const today = todayId(now());
    const live = Object.values(grids).filter(g => g.id <= today && (!requireReview || g.reviewed)).sort((a, b) => b.id.localeCompare(a.id));
    const withCats = g => ({ ...g, kind: "daily", ...cats(g) });
    switch (path) {
      case "/how-to-play": return page(howToPlayPage(o));
      case "/about": return page(aboutPage({ ...o, castaways: people.length, seasons: new Set(people.flatMap(p => p.seasons)).size }));
      case "/contact": return page(contactPage({ ...o, email: contactEmail }));
      case "/clues": return page(cluesPage(people, o));
      case "/grids": return page(gridsIndexPage(live.filter(g => g.id < today).map(withCats), o), 300);
      case "/sitemap.xml": return new Response(sitemap(live.map(g => g.id)), { headers: { "content-type": "application/xml", "cache-control": "public, max-age=3600" } });
      case "/robots.txt": return new Response(ROBOTS, { headers: { "content-type": "text/plain" } });
    }
    const i = live.findIndex(g => "/grids/" + g.id === path);
    if (i < 0) return page(layout({ ...o, title: "Not found · Tribal Grid", description: "", path, body: `    <h2>Not found</h2>\n    <p>There's no grid for that day yet. See <a href="/grids">every past grid</a>.</p>` }), 300, 404);
    const raw = { ...live[i], kind: "daily" }, g = withCats(raw), past = g.id < today;
    let cells = [];
    if (past) {
      const picks = await picksFor(raw);
      cells = Array.from({ length: 9 }, (_, k) => {
        const ans = cellAnswers(raw, k), shares = cellShares(ans, picks[k]);
        const answers = ans.map(p => ({ name: p.name, seasons: p.seasons, rarity: toPercent(shares.get(p.id)), picks: picks[k].get(p.id) || 0 }))
          .sort((x, y) => y.picks - x.picks || y.rarity - x.rarity || x.name.localeCompare(y.name));
        return { row: g.rows[Math.floor(k / 3)], col: g.cols[k % 3], answers };
      });
    }
    return page(gridPage(g, { ...o, cells, past, players: await store.playerCount(g.id), prev: live[i + 1], next: live[i - 1] }), past ? 3600 : 300);
  }

  function restoreCode() {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", bytes = crypto.getRandomValues(new Uint8Array(10));
    return [...bytes].map(b => abc[b % abc.length]).join("");
  }
  async function fulfil({ session, player, product }) {
    if (!PLAYER_RE.test(player || "") || !isGrant(product || "")) return;
    const code = (await store.restoreCodes(player))[0] || restoreCode();
    await store.addPurchase({ session, player, product, restoreCode: code });
    await store.grant(player, product);
  }

  async function postCheckout(req) {
    const b = await body(req);
    if (!b || !PLAYER_RE.test(b.player || "")) return err(400, "Bad player id");
    if (!PRODUCT_IDS.has(b.product)) return err(400, "Unknown product");
    const owned = await ownedBy(b.player);
    if (owns(owned, b.product)) return json({ owned: true });
    const grant = b.product === "all" ? bundleGrant() : b.product;
    if (freeUnlock) {
      await fulfil({ session: "free-" + restoreCode(), player: b.player, product: grant });
      return json({ granted: true });
    }
    if (!payments) return err(503, "Purchases aren't switched on yet.");
    const origin = new URL(req.url).origin;
    const url = await payments.createCheckout({
      product: grant, ...priceFor(owned, b.product), player: b.player,
      successUrl: `${origin}/?purchase={CHECKOUT_SESSION_ID}#archive`, cancelUrl: `${origin}/#archive`,
    });
    return json({ url });
  }

  // Back from Stripe: grant straight away instead of waiting for the webhook.
  async function postConfirm(req) {
    const b = await body(req);
    if (!b || !PLAYER_RE.test(b.player || "") || !payments) return err(400, "Bad request");
    const s = await payments.getSession(String(b.session || ""));
    if (!s || s.payment_status !== "paid" || s.metadata?.player !== b.player) return err(402, "That payment isn't complete yet.");
    await fulfil({ session: s.id, player: s.metadata.player, product: s.metadata.product });
    return json({ owned: [...await ownedBy(b.player)], restoreCodes: await store.restoreCodes(b.player) });
  }

  async function postWebhook(req) {
    if (!payments) return err(404, "Not found");
    const raw = await req.text();
    const event = await payments.verifyWebhook(raw, req.headers.get("stripe-signature"));
    if (!event) return err(400, "Bad signature");
    const s = event.data?.object;
    if (event.type === "checkout.session.completed" && s?.payment_status === "paid") {
      await fulfil({ session: s.id, player: s.metadata?.player, product: s.metadata?.product });
    }
    return json({ received: true });
  }

  async function postRestore(req) {
    const b = await body(req);
    if (!b || !PLAYER_RE.test(b.player || "")) return err(400, "Bad player id");
    const code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const products = code.length === 10 ? await store.purchasesByCode(code) : [];
    if (!products.length) return err(404, "That code doesn't match a purchase. Check it and try again.");
    for (const p of products) await store.grant(b.player, p);
    return json({ owned: [...await ownedBy(b.player)] });
  }

  async function handle(req) {
    const url = new URL(req.url);
    const route = req.method + " " + url.pathname;
    try {
      // One address per page: /grids/ and the like redirect to the version without the slash.
      if (req.method === "GET" && isPagePath(url.pathname) && url.pathname.length > 1 && url.pathname.endsWith("/"))
        return new Response(null, { status: 301, headers: { location: url.pathname.slice(0, -1) + url.search } });
      if (req.method === "GET" && isPagePath(url.pathname)) return await getPage(url.pathname);
      switch (route) {
        case "GET /api/config": return await getConfig();
        case "GET /api/castaways": return json(publicList, { "cache-control": "public, max-age=3600" });
        case "GET /api/grid": return await getGrid(url);
        case "POST /api/guess": return await postGuess(req);
        case "POST /api/finish": return await postFinish(req);
        case "GET /api/results": return await getResults(url);
        case "POST /api/report": return await postReport(req);
        case "GET /api/archive": return await getArchive(url);
        case "POST /api/checkout": return shop ? await postCheckout(req) : err(404, "Not found");
        case "POST /api/purchase/confirm": return shop ? await postConfirm(req) : err(404, "Not found");
        case "POST /api/stripe/webhook": return shop ? await postWebhook(req) : err(404, "Not found");
        case "POST /api/restore": return shop ? await postRestore(req) : err(404, "Not found");
        case "GET /api/health": return json({ ok: true, castaways: people.length, grids: Object.keys(grids).length, packs: Object.keys(packs).length });
        case "GET /ads.txt":
          if (!ads?.client) return err(404, "Not found");
          return new Response(`google.com, ${ads.client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`, { headers: { "content-type": "text/plain" } });
      }
      return err(404, "Not found");
    } catch (e) {
      console.error(e);
      return err(500, "Something went wrong");
    }
  }

  return { handle, loadGrid };
}

async function body(req) { try { const b = await req.json(); return b && typeof b === "object" ? b : null; } catch { return null; } }
function json(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}
const err = (status, message, extra) => json({ error: message, ...extra }, { "cache-control": "no-store" }, status);
