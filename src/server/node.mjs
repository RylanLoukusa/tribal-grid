// Local server: the game API on node:sqlite plus the static site from public/.
//   npm run dev            -> http://localhost:8787
// Env: PORT, DB_PATH (default data/local.db, ":memory:" for throwaway), plus everything in
// src/server/config.js (REQUIRE_REVIEW, FREE_UNLOCK, STRIPE_*, ADSENSE_*, ADS_PLACEHOLDER).
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createGame } from "../core/game.js";
import { sqlStore } from "../core/store-sql.js";
import { shareHtml, parseShare } from "../core/share.js";
import { gameOptions } from "./config.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const data = JSON.parse(await readFile(join(root, "src/generated/data.json"), "utf8"));

export function openSqlite(path) {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  return {
    raw: db,
    all: async (sql, p) => db.prepare(sql).all(...p),
    first: async (sql, p) => db.prepare(sql).get(...p) ?? null,
    run: async (sql, p) => ({ changes: Number(db.prepare(sql).run(...p).changes) }),
  };
}

// Applies migrations/*.sql once each, in order (wrangler does the same for D1).
async function migrate(db) {
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)");
  const done = new Set(db.prepare("SELECT name FROM _migrations").all().map(r => r.name));
  for (const f of (await readdir(join(root, "migrations"))).filter(f => f.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    db.exec(await readFile(join(root, "migrations", f), "utf8"));
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(f);
  }
}

export async function startServer({ port = 8787, dbPath = join(root, "data/local.db"), env = process.env, now, payments } = {}) {
  const db = openSqlite(dbPath);
  await migrate(db.raw);
  const opts = gameOptions(env);
  const game = createGame({ castaways: data.castaways, grids: data.grids, packs: data.packs, store: sqlStore(db), now, ...opts, ...(payments ? { payments } : {}) });

  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain" };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/") || url.pathname === "/ads.txt") {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const r = await game.handle(new Request(new URL(url.pathname + url.search, `http://${req.headers.host || "localhost"}`), { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }));
        res.writeHead(r.status, Object.fromEntries(r.headers));
        return res.end(Buffer.from(await r.arrayBuffer()));
      }
      // Share links (/r/<grid>-<score>-<squares>) serve the game with the score in the link preview.
      if (url.pathname.startsWith("/r/")) {
        const token = url.pathname.slice(3);
        const html = await readFile(join(root, "public/index.html"), "utf8");
        const s = parseShare(token);
        res.writeHead(200, { "content-type": types[".html"] });
        return res.end(shareHtml(html, token, s && data.grids[s.grid]?.number));
      }
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
      if (path.endsWith("/")) path += "index.html";
      const file = join(root, "public", path);
      if (!file.startsWith(join(root, "public"))) { res.writeHead(403); return res.end(); }
      const body = await readFile(file).catch(() => null);
      if (!body) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Not found"); }
      res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch (e) {
      console.error(e);
      res.writeHead(500); res.end();
    }
  });
  await new Promise(r => server.listen(port, r));
  return { server, port: server.address().port, close: () => new Promise(r => server.close(r)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = { FREE_UNLOCK: "1", ADS_PLACEHOLDER: "1", ...process.env };
  const s = await startServer({ port: +(process.env.PORT || 8787), dbPath: process.env.DB_PATH, env });
  console.log(`Tribal Grid running at http://localhost:${s.port}`);
  if (env.FREE_UNLOCK === "1") console.log("Dev mode: purchases unlock for free (FREE_UNLOCK=1). Ads show as placeholders.");
}
