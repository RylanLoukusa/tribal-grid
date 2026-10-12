// Tribal Grid client. All answer checking happens on the server (/api/*); this file only
// knows castaway names for autocomplete. The offline preview build swaps in an in-page
// API by setting window.TRIBAL_GRID_FETCH before this script runs.
const apiFetch = window.TRIBAL_GRID_FETCH || ((path, init) => fetch(path, init));
const shareLink = window.TRIBAL_GRID_SHARE_LINK || (token => `${location.origin}/r/${token}`);
// Rarity tiers, rarest first. Share-link digits: 0 empty, then the tier's digit.
const TIERS = [
  { key: "legendary", name: "Legendary", max: 1, emoji: "🟪", digit: 4 },
  { key: "rare", name: "Rare", max: 5, emoji: "🟦", digit: 3 },
  { key: "uncommon", name: "Uncommon", max: 15, emoji: "🟩", digit: 2 },
  { key: "common", name: "Common", max: Infinity, emoji: "🟨", digit: 1 },
];
const tierOf = rarity => TIERS.find(t => rarity < t.max);
const EMOJI = ["⬛", "🟨", "🟩", "🟦", "🟪"];
const patternOf = cells => cells.map(c => c ? tierOf(c.rarity).digit : 0).join("");
const SHARE_RE = /^(?:r-)?(\d{4}-\d{2}-\d{2}|practice)-(\d{1,3})-([0-4]{9})$/;

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[“”"'’.]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const fmtDate = (id, year = false) => new Date(id + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });

// ---- Local storage (best effort: the game still works without it)
const store = {
  get(k, d) { try { const v = localStorage.getItem("tribalgrid:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("tribalgrid:" + k, JSON.stringify(v)); } catch {} },
};
const player = store.get("player") || (() => {
  const id = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^A-Za-z0-9-]/g, "");
  store.set("player", id);
  return id;
})();

async function api(path, body) {
  const init = body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, player }) } : undefined;
  const res = await apiFetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Couldn't reach the server. Check your connection and try again."), { status: res.status, data });
  return data;
}

// ---- State
let config = { products: [], ads: null };
let people = [], byId = new Map();
let grid = null, play = null, results = null, archive = null;
let view = "game";

async function boot() {
  try {
    const [cfg, list] = await Promise.all([api("/api/config"), api("/api/castaways")]);
    config = cfg;
    people = list.map(p => { const k = norm([p.name, ...p.search].join(" ")); return { ...p, key: k, words: k.split(" ") }; });
    byId = new Map(people.map(p => [p.id, p]));

    const purchase = new URLSearchParams(location.search).get("purchase");
    if (purchase) await confirmPurchase(purchase);

    const challenge = readChallenge();
    if (location.hash === "#archive") { await openGrid(""); await showArchive(); }
    else if (challenge) { showChallenge(challenge); await openGrid(challenge.grid === "practice" ? "" : challenge.grid, { fallbackToday: true }); }
    else await openGrid(location.hash.match(/^#(\d{4}-\d{2}-\d{2}|practice-[a-z0-9]+|pack-[a-z0-9-]+)$/)?.[1] || "");
    refreshArchive().then(renderAds);
  } catch (e) {
    showError(e.message);
  }
}

async function openGrid(id, { fallbackToday = false } = {}) {
  $("loading").hidden = false;
  try {
    grid = await api(`/api/grid?player=${encodeURIComponent(player)}${id ? "&id=" + encodeURIComponent(id) : ""}`);
    play = grid.play;
    results = null;
    $("error").hidden = true;
    if (play.done) await loadResults();
    showView("game");
    render();
    const token = grid.kind === "daily" && grid.id === grid.today ? "" : "#" + grid.id;
    history.replaceState(null, "", location.pathname.startsWith("/r/") ? "/" + token : location.pathname + token);
  } catch (e) {
    if (e.status === 402) {
      toast(e.data?.product === "archive" ? "Past grids are part of the archive. Unlock it to play this one." : "Unlock this pack to play it.");
      if (fallbackToday || !grid) await openGrid("");
      else await showArchive();
    } else if (id) { toast(e.message); if (!grid || fallbackToday) await openGrid(""); }
    else showError(e.message);
  } finally {
    $("loading").hidden = true;
  }
}

function showError(msg) {
  $("loading").hidden = true;
  $("error").hidden = false;
  $("error").textContent = msg;
}

async function loadResults() {
  results = await api(`/api/results?id=${encodeURIComponent(grid.id)}&player=${encodeURIComponent(player)}`);
  play = results.play;
  if (grid.kind === "daily") recordStats();
}

function showView(v) {
  view = v;
  $("game").hidden = v !== "game";
  $("archive-view").hidden = v !== "archive";
  $("tab-today").setAttribute("aria-current", v === "game" ? "page" : "false");
  $("tab-archive").setAttribute("aria-current", v === "archive" ? "page" : "false");
  $("how").hidden = v !== "game";
}

// ---- Challenge links (someone shared their score)
function readChallenge() {
  const token = location.pathname.startsWith("/r/") ? location.pathname.slice(3) : location.hash.slice(1);
  const m = token.match(SHARE_RE);
  return m && { grid: m[1], score: +m[2], pattern: m[3] };
}
function emojiOf(pattern) {
  return [0, 3, 6].map(i => [...pattern.slice(i, i + 3)].map(d => EMOJI[d]).join("")).join("\n");
}
function showChallenge(c) {
  const box = $("challenge");
  box.innerHTML = "";
  const right = [...c.pattern].filter(d => d !== "0").length;
  const text = el("div", "challenge-text");
  text.append(el("b", "", `A friend scored ${c.score}`), el("span", "", ` with ${right}/9 right${c.grid !== "practice" ? " on " + fmtDate(c.grid) + "'s grid" : ""}. Lower is better. Can you beat it?`));
  box.append(el("pre", "challenge-emoji", emojiOf(c.pattern)), text);
  box.hidden = false;
}

// ---- Render the game
const isToday = () => grid.kind === "daily" && grid.id === grid.today;
function headLabel(c) {
  const d = el("div", "", c.short || c.label);
  if (c.note) d.append(el("small", "", c.note));
  return d;
}
function gridTitle() {
  if (grid.kind === "practice") return "Practice grid";
  if (grid.kind === "pack") return `${grid.pack.title} · ${grid.pack.n} of ${grid.pack.of}`;
  return `#${grid.number} · ${fmtDate(grid.id, true)}`;
}

function render() {
  $("meta").textContent = gridTitle() + (grid.players ? ` · ${grid.players.toLocaleString()} playing` : "");
  const board = $("board");
  board.innerHTML = "";
  board.append(el("div", "corner", grid.kind === "practice" ? "Practice" : grid.kind === "pack" ? "Pack " + grid.pack.n : "#" + grid.number));
  grid.cols.forEach(c => { const h = el("div", "head col"); h.title = c.label; h.append(headLabel(c)); board.append(h); });
  grid.rows.forEach((rc, r) => {
    const h = el("div", "head row"); h.title = rc.label; h.append(headLabel(rc)); board.append(h);
    grid.cols.forEach((cc, c) => {
      const i = r * 3 + c, cell = play.cells[i];
      const b = el("button", "cell");
      b.dataset.i = i;
      b.setAttribute("role", "gridcell");
      if (cell) {
        b.classList.add("ok");
        const t = tierOf(cell.rarity);
        b.classList.add("t-" + t.key);
        b.append(el("span", "who", cell.name), el("span", "pct", cell.rarity + "%"), el("span", "tier", t.name));
      } else {
        if (play.done) b.classList.add("dead");
        else if (play.misses[i]) b.classList.add("miss");
        b.append(el("span", "plus", play.done ? "?" : "+"));
        if (!play.done && play.misses[i]) b.append(el("span", "tries", play.misses[i] === 1 ? "1 miss" : play.misses[i] + " misses"));
      }
      if (play.done) {
        b.classList.add("reveal");
        b.setAttribute("aria-label", `${rc.label} and ${cc.label}: see every answer`);
        b.addEventListener("click", () => openAnswers(i));
      } else {
        b.setAttribute("aria-label", `${rc.label} and ${cc.label}${cell ? ": " + cell.name + ". Tap to swap for a rarer answer" : ""}`);
        b.addEventListener("click", () => openSheet(i));
      }
      board.append(b);
    });
  });
  const correct = play.cells.filter(Boolean).length;
  $("s-wrong").textContent = play.wrongLeft;
  $("s-correct").textContent = correct + "/9";
  $("s-score").textContent = Math.round(play.score);
  $("board-hint").textContent = play.done ? "Tap any square to see every right answer, rarest first."
    : correct ? "Tap a filled square to swap in a rarer answer. Submit when you're happy." : "";
  $("btn-submit").hidden = play.done;
  resetSubmit();
  $("btn-daily").hidden = isToday();
  $("btn-practice").textContent = grid.kind === "practice" ? "New practice grid" : "Practice grid";
  renderShare();
  renderStats();
  tick();
}

// Score = each filled square's % added up, plus 100 for each empty square. Spell that out.
function scoreMath() {
  const filled = play.cells.filter(Boolean).map(c => c.rarity), empty = 9 - filled.length;
  const parts = [...filled.map(String), ...(empty ? [`(${empty} empty × 100)`] : [])];
  return `Score = ${parts.join(" + ")} = ${Math.round(play.score)}`;
}

// ---- Share card
function shareToken() {
  const pattern = patternOf(play.cells);
  return `${grid.kind === "daily" ? grid.id : "practice"}-${Math.min(999, Math.round(play.score))}-${pattern}`;
}
function shareText() {
  const rows = emojiOf(patternOf(play.cells));
  const rarities = play.cells.filter(Boolean).map(c => c.rarity);
  const title = grid.kind === "practice" ? `Tribal Grid practice · ${grid.show}` : grid.kind === "pack" ? `Tribal Grid · ${grid.pack.title} ${grid.pack.n}` : `Tribal Grid #${grid.number} · ${grid.show}`;
  const rarest = rarities.length ? ` · rarest pick ${Math.min(...rarities)}%` : "";
  return `${title}\n${rows}\nScore ${Math.round(play.score)}${rarest}\n${grid.kind === "pack" ? "" : shareLink(shareToken())}`.trim();
}
function renderShare() {
  const card = $("share-card");
  card.hidden = !play.done;
  if (!play.done) return;
  const right = play.cells.filter(Boolean).length;
  const rarities = play.cells.filter(Boolean).map(c => c.rarity);
  $("share-score").textContent = Math.round(play.score);
  $("share-sub").textContent = `${right}/9 right${rarities.length ? ` · rarest pick ${Math.min(...rarities)}%` : ""}${results?.players ? ` · ${results.players.toLocaleString()} ${results.players === 1 ? "player" : "players"}` : ""}`;
  $("share-math").textContent = scoreMath();
  $("share-emoji").textContent = emojiOf(patternOf(play.cells));
  const link = grid.kind === "pack" ? "" : shareLink(shareToken());
  $("share-link").value = link;
  $("share-link").hidden = !link;
  $("btn-copy-link").hidden = !link;
  document.querySelector(".share-link-label").hidden = !link;
  $("share-text").textContent = shareText();
  $("btn-share").hidden = !navigator.share;
}
async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch { $("share-link").select(); toast("Copy was blocked. The link is selected, so press Ctrl+C or Cmd+C."); }
}

// ---- Answers for a square, after submitting
function openAnswers(i) {
  const cell = results?.cells[i];
  if (!cell) return;
  const a = grid.rows[Math.floor(i / 3)], b = grid.cols[i % 3];
  $("answers-title").textContent = `${a.label} × ${b.label}`;
  const mine = cell.answers.find(x => x.id === cell.mine);
  $("answers-meta").textContent = `${cell.answers.length} right answers, rarest first.` + (mine ? ` You picked ${mine.name} (${mine.rarity}%, ${tierOf(mine.rarity).name.toLowerCase()}).` : " You left this one empty.");
  const ol = $("answers-list");
  ol.innerHTML = "";
  for (const x of cell.answers) {
    const li = el("li", x.id === cell.mine ? "me" : "");
    const name = el("span", "a-name");
    name.append(el("span", "", x.name), el("small", "", "S" + x.seasons.join(", ")));
    li.append(name, el("span", "a-pct t-" + tierOf(x.rarity).key, x.rarity + "%"));
    ol.append(li);
  }
  const rep = $("answers-report");
  rep.innerHTML = "";
  const btn = el("button", "report", "Report a problem with this square");
  btn.addEventListener("click", () => openReport(rep, i, btn));
  rep.append(btn);
  $("answers").hidden = false;
  document.body.classList.add("modal-open");
  ol.scrollTop = 0;
  $("answers-close").focus();
}
function closeAnswers() { $("answers").hidden = true; document.body.classList.remove("modal-open"); }

function openReport(box, i, btn) {
  btn.hidden = true;
  const form = el("form", "report-form");
  const ta = el("textarea");
  ta.id = "report-note";
  ta.placeholder = "What's wrong? For example: \"Kelly Wiglesworth should count here.\"";
  ta.maxLength = 500;
  const row = el("div", "row");
  const send = el("button", "btn primary", "Send report"); send.type = "submit";
  const cancel = el("button", "btn", "Cancel"); cancel.type = "button";
  cancel.addEventListener("click", () => { form.remove(); btn.hidden = false; });
  row.append(send, cancel);
  form.append(ta, row);
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!ta.value.trim()) { ta.focus(); return; }
    send.disabled = true;
    try {
      await api("/api/report", { grid: grid.id, cell: i, castaway: play.cells[i]?.id ?? null, note: ta.value.trim() });
      form.replaceWith(el("div", "valid", "Thanks. We'll check it."));
    } catch (err) { toast(err.message); send.disabled = false; }
  });
  box.append(form);
  ta.focus();
}

// ---- Personal stats (this device only, daily grids)
function recordStats() {
  store.set("result:" + grid.id, { score: Math.round(play.score), correct: play.cells.filter(Boolean).length });
  const days = store.get("days", []);
  if (!days.includes(grid.id)) { days.push(grid.id); days.sort(); store.set("days", days); }
}
function renderStats() {
  if (grid.kind !== "daily" || !play.done) { $("stats").hidden = true; return; }
  const days = store.get("days", []);
  const scores = days.map(d => store.get("result:" + d)?.score).filter(n => n != null);
  let streak = 0;
  for (let d = new Date(grid.today + "T12:00:00Z"); days.includes(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1)) streak++;
  $("stats").hidden = !scores.length;
  $("st-played").textContent = scores.length;
  $("st-streak").textContent = streak;
  $("st-avg").textContent = scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : "–";
  $("st-best").textContent = scores.length ? Math.min(...scores) : "–";
}

// ---- Guess sheet
let active = null, hl = 0, matches = [], busy = false;
function openSheet(i) {
  active = i;
  const a = grid.rows[Math.floor(i / 3)], b = grid.cols[i % 3], cur = play.cells[i];
  $("sheet-q").innerHTML = "";
  $("sheet-q").append(cur ? "Swap your answer: " : "Name a castaway: ", el("b", "", a.label), " and ", el("b", "", b.label));
  if (cur) $("sheet-q").append(el("div", "swap-note", `Now: ${cur.name} (${cur.rarity}%). A right swap is free; a wrong one costs a miss and keeps ${cur.name}.`));
  $("guess-input").value = "";
  $("opts").innerHTML = "";
  $("sheet").hidden = false;
  $("guess-input").focus();
}
function closeSheet() { $("sheet").hidden = true; active = null; }
const usedIds = () => new Set(play.cells.filter(Boolean).map(c => c.id));
const seasonsLabel = p => "S" + p.seasons.join(", ");

function search(q) {
  if (q.length < 2) return [];
  const scored = [];
  for (const p of people) {
    let s = 0;
    if (p.words.some(w => w === q)) s = 4;
    else if (p.key.startsWith(q)) s = 3;
    else if (p.words.some(w => w.startsWith(q))) s = 2;
    else if (p.key.includes(q)) s = 1;
    if (s) scored.push([s, p]);
  }
  return scored.sort((x, y) => y[0] - x[0] || x[1].name.localeCompare(y[1].name)).slice(0, 8).map(x => x[1]);
}

function updateOpts() {
  const ul = $("opts");
  ul.innerHTML = ""; hl = 0;
  matches = search(norm($("guess-input").value));
  const taken = usedIds();
  matches.forEach((p, k) => {
    const li = el("li"), b = el("button");
    b.type = "button";
    const here = play.cells[active]?.id === p.id;
    b.append(el("span", "", p.name), el("small", "", here ? "your answer" : taken.has(p.id) ? "used" : seasonsLabel(p)));
    b.disabled = taken.has(p.id);
    if (k === 0) b.classList.add("hl");
    b.addEventListener("click", () => guess(p));
    li.append(b); ul.append(li);
  });
  if (!matches.length && $("guess-input").value.trim().length >= 2) ul.append(el("li", "hint", "No castaway by that name. Only US seasons that have finished airing count."));
}

async function guess(p) {
  if (active == null || busy || usedIds().has(p.id)) return;
  const i = active;
  busy = true;
  closeSheet();
  try {
    const r = await api("/api/guess", { grid: grid.id, cell: i, castaway: p.id });
    play = r.play;
    const a = grid.rows[Math.floor(i / 3)], b = grid.cols[i % 3];
    if (r.correct && r.replaced) toast(`Swapped in ${p.name} (${play.cells[i].rarity}%).`);
    else if (r.correct) toast(`${p.name} fits. ${play.cells[i].rarity}% of players picked them.`);
    else toast(`${p.name} doesn't fit ${a.label} and ${b.label}. ${play.wrongLeft} ${play.wrongLeft === 1 ? "miss" : "misses"} left.`);
    if (play.done) { await loadResults(); render(); revealShare(); }
    else render();
    if (!r.correct) document.querySelector(`.cell[data-i="${i}"]`)?.classList.add("flash");
  } catch (e) {
    toast(e.message);
    if (e.status === 409) await openGrid(grid.id);
  } finally {
    busy = false;
  }
}

let confirmSubmit = false, submitTimer;
function resetSubmit() { confirmSubmit = false; clearTimeout(submitTimer); $("btn-submit").textContent = "Submit grid"; }
async function submit() {
  const empty = play.cells.filter(c => !c).length;
  if (empty && !confirmSubmit) {
    confirmSubmit = true;
    $("btn-submit").textContent = `Submit with ${empty} empty ${empty === 1 ? "square" : "squares"}?`;
    submitTimer = setTimeout(resetSubmit, 4000);
    return;
  }
  resetSubmit();
  try {
    play = (await api("/api/finish", { grid: grid.id })).play;
    await loadResults();
    render();
    revealShare();
  } catch (e) { toast(e.message); }
}
function revealShare() {
  toast("Submitted. Tap any square to see every answer.");
  $("share-card").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
}

let toastTimer;
function toast(msg) { $("toast").textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").textContent = "", 6000); }

// ---- Archive and packs
const product = id => config.products.find(p => p.id === id) || { title: id, price: "" };
const owned = id => archive?.owned.includes(id) || archive?.owned.includes("all");
async function refreshArchive() {
  try { archive = await api(`/api/archive?player=${encodeURIComponent(player)}`); } catch { archive = null; }
}
async function showArchive() {
  showView("archive");
  history.replaceState(null, "", location.pathname.startsWith("/r/") ? "/#archive" : location.pathname + "#archive");
  $("meta").textContent = "Archive & packs";
  await refreshArchive();
  renderArchive();
  renderAds();
}

function buyButton(id, label) {
  const p = product(id);
  const b = el("button", "btn primary", label || `Unlock for ${p.price}`);
  if (!archive?.payments) { b.disabled = true; b.textContent = "Coming soon"; }
  b.addEventListener("click", () => buy(id, b));
  return b;
}

function renderArchive() {
  if (!archive) { $("arch-daily").textContent = "Couldn't load the archive. Check your connection and try again."; return; }
  const unlock = $("unlock-archive");
  unlock.innerHTML = "";
  if (!owned("archive")) {
    const txt = el("div", "unlock-text");
    txt.append(el("b", "", "Play every past grid"), el("span", "", `${product("archive").description} One-time ${product("archive").price}.`));
    const btns = el("div", "unlock-btns");
    btns.append(buyButton("archive"), buyButton("all", `Everything for ${product("all").price}`));
    unlock.append(txt, btns);
    if (archive.freeUnlock) unlock.append(el("p", "arch-note", "Preview build: unlocking is free here so you can try it. The live site charges through Stripe."));
  } else {
    unlock.append(el("div", "unlock-text owned", "The archive is unlocked on this device."));
  }

  const daily = $("arch-daily");
  daily.innerHTML = "";
  if (!archive.daily.length) daily.append(el("p", "arch-note full", "Past grids show up here from tomorrow. Today's is grid #1."));
  for (const g of archive.daily) {
    const b = el("button", "day" + (g.locked ? " locked" : "") + (g.status ? " " + g.status : ""));
    const local = store.get("result:" + g.id);
    b.append(el("b", "", "#" + g.number), el("span", "", fmtDate(g.id)),
      el("small", "", g.locked ? "Locked" : g.status === "done" ? (local ? "Score " + local.score : "Done") : g.status === "started" ? "In progress" : "Play"));
    b.addEventListener("click", () => g.locked ? toast("Unlock the archive to play past grids.") : openGrid(g.id));
    daily.append(b);
  }

  const packs = $("arch-packs");
  packs.innerHTML = "";
  for (const p of archive.packs) {
    const card = el("article", "pack" + (p.locked ? " locked" : ""));
    const head = el("div", "pack-head");
    head.append(el("h3", "", p.title), el("span", "pack-count", `${p.grids.length} grids`));
    card.append(head, el("p", "", p.description));
    if (p.locked) card.append(buyButton(p.product));
    else {
      const row = el("div", "pack-grids");
      for (const g of p.grids) {
        const b = el("button", "pack-n" + (g.status ? " " + g.status : ""), String(g.n));
        b.setAttribute("aria-label", `${p.title} grid ${g.n}${g.status === "done" ? ", done" : ""}`);
        b.addEventListener("click", () => openGrid(g.id));
        row.append(b);
      }
      card.append(row);
    }
    packs.append(card);
  }
  $("restore-codes").textContent = archive.restoreCodes.length
    ? `Your restore code is ${archive.restoreCodes.join(", ")}. Enter it on another phone or computer to unlock the same things there.`
    : "Enter the restore code from your purchase to unlock it on this device.";
}

async function buy(id, btn) {
  btn.disabled = true;
  try {
    const r = await api("/api/checkout", { product: id });
    if (r.url) { location.href = r.url; return; }
    await refreshArchive();
    renderArchive();
    renderAds();
    toast(`${product(id).title} unlocked.`);
  } catch (e) { toast(e.message); btn.disabled = false; }
}
async function confirmPurchase(session) {
  try { await api("/api/purchase/confirm", { session }); toast("Thanks! Your purchase is unlocked."); }
  catch (e) { toast(e.message); }
  history.replaceState(null, "", location.pathname + location.hash);
}

// ---- Ads (only when configured, never for anyone who has bought something)
let adsLoaded = false;
function renderAds() {
  const ads = config.ads, paid = archive?.owned.length > 0;
  for (const slot of document.querySelectorAll(".ad-slot")) {
    const show = !!ads && !paid && !(slot.dataset.slot === "game" && view !== "game");
    slot.hidden = !show;
    if (!show || slot.dataset.filled) continue;
    slot.dataset.filled = "1";
    if (ads.client) {
      if (!adsLoaded) {
        const s = el("script"); s.async = true; s.crossOrigin = "anonymous";
        s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(ads.client);
        document.head.append(s); adsLoaded = true;
      }
      const ins = el("ins", "adsbygoogle");
      ins.style.display = "block";
      ins.dataset.adClient = ads.client;
      if (ads.slots?.[slot.dataset.slot]) ins.dataset.adSlot = ads.slots[slot.dataset.slot];
      ins.dataset.adFormat = "auto";
      ins.dataset.fullWidthResponsive = "true";
      slot.append(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
    } else {
      slot.append(el("span", "", "Ad space"));
      slot.classList.add("placeholder");
    }
  }
}

// ---- Countdown to the next daily grid (midnight US Eastern)
function msToNextGrid() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" })
    .formatToParts(new Date()).map(p => [p.type, +p.value]));
  return (86400 - (parts.hour * 3600 + parts.minute * 60 + parts.second)) * 1000 - new Date().getMilliseconds();
}
const hms = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map((n, i) => i ? String(n).padStart(2, "0") : n).join(":"); };
let rolledOver = false;
function tick() {
  const ms = msToNextGrid(), text = hms(ms);
  $("next-drop").textContent = `Next grid in ${text}`;
  $("next-drop").hidden = !grid;
  $("share-next").textContent = `Next grid in ${text}`;
  $("share-next").hidden = !(grid && play?.done && isToday());
  // A new day: load the new grid if the player is looking at the old one's board.
  if (ms < 1500 && !rolledOver) { rolledOver = true; setTimeout(() => { rolledOver = false; if (view === "game" && grid && isToday()) openGrid(""); }, 3000); }
}
setInterval(tick, 1000);

// ---- Events
$("guess-input").addEventListener("input", updateOpts);
$("guess-input").addEventListener("keydown", e => {
  const btns = [...$("opts").querySelectorAll("button")];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault(); if (!btns.length) return;
    btns[hl]?.classList.remove("hl");
    hl = (hl + (e.key === "ArrowDown" ? 1 : btns.length - 1)) % btns.length;
    btns[hl].classList.add("hl"); btns[hl].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") { e.preventDefault(); if (matches[hl] && !btns[hl].disabled) guess(matches[hl]); }
  else if (e.key === "Escape") closeSheet();
});
$("sheet").addEventListener("click", e => { if (e.target === $("sheet")) closeSheet(); });
$("answers").addEventListener("click", e => { if (e.target === $("answers")) closeAnswers(); });
$("answers-close").addEventListener("click", closeAnswers);
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("sheet").hidden) closeSheet();
  if (!$("answers").hidden) closeAnswers();
});

$("btn-submit").addEventListener("click", submit);
$("btn-practice").addEventListener("click", () => openGrid("practice-" + Math.random().toString(36).slice(2, 10)));
$("btn-daily").addEventListener("click", () => openGrid(""));
$("tab-today").addEventListener("click", () => openGrid(""));
$("tab-archive").addEventListener("click", showArchive);
$("home-link").addEventListener("click", e => { e.preventDefault(); openGrid(""); });
$("btn-share").addEventListener("click", async () => {
  try { await navigator.share({ title: "Tribal Grid", text: shareText().replace(/\n\S+$/, ""), url: $("share-link").value || undefined }); }
  catch (e) { if (e.name !== "AbortError") copy(shareText(), "Result copied. Paste it in your group chat."); }
});
$("btn-copy-link").addEventListener("click", () => copy($("share-link").value, "Link copied."));
$("btn-copy-text").addEventListener("click", () => copy(shareText(), "Result copied. Paste it in your group chat."));
$("share-link").addEventListener("focus", e => e.target.select());
$("restore-form").addEventListener("submit", async e => {
  e.preventDefault();
  const code = $("restore-code").value.trim();
  if (!code) { $("restore-code").focus(); return; }
  try { await api("/api/restore", { code }); $("restore-code").value = ""; await refreshArchive(); renderArchive(); renderAds(); toast("Restored. Your purchases are unlocked on this device."); }
  catch (err) { toast(err.message); }
});

boot();
