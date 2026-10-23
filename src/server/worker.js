// Cloudflare Worker entry: /api/*, /ads.txt and the content pages go to the game on D1, /r/* share links get the
// score written into the link preview, and everything else is the static site.
import data from "../generated/data.json";
import { createGame, isPagePath } from "../core/game.js";
import { sqlStore, d1Adapter } from "../core/store-sql.js";
import { shareHtml, parseShare } from "../core/share.js";
import { gameOptions } from "./config.js";

let game;
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/r/")) {
      const page = await env.ASSETS.fetch(new Request(new URL("/", url), request));
      const token = url.pathname.slice(3), s = parseShare(token);
      return new Response(shareHtml(await page.text(), token, s && data.grids[s.grid]?.number), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (!url.pathname.startsWith("/api/") && url.pathname !== "/ads.txt" && !isPagePath(url.pathname)) return env.ASSETS.fetch(request);
    game ||= createGame({ castaways: data.castaways, grids: data.grids, packs: data.packs, store: sqlStore(d1Adapter(env.DB)), ...gameOptions(env) });
    return game.handle(request);
  },
};
