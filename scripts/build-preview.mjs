// Builds dist/preview.html: the whole game in one file with the API running in the page
// (in-memory store, saved to localStorage). For trying the game without a server. Because
// everything runs in the browser, answers are inspectable and picks aren't shared between
// players, so this is a preview, never the real site.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = p => readFile(new URL(p, root), "utf8");
const strip = src => src.replace(/^import .*?;\s*$/gm, "").replace(/^export (?=(async )?(function|const|let|class))/gm, "");

const core = ["src/core/categories.js", "src/core/generate.js", "src/core/rarity.js", "src/core/dates.js", "src/core/products.js", "src/core/store-memory.js", "src/core/game.js"];
const coreSrc = (await Promise.all(core.map(read))).map(strip).join("\n");
const data = JSON.parse(await read("src/generated/data.json"));
const html = await read("public/index.html");
const app = html.slice(html.indexOf("<!--APP-->") + 10, html.indexOf("<!--/APP-->"))
  .replace('<p class="foot">', '<p class="foot">Preview build: the game runs in your browser, so rarity comes from how well known each castaway is rather than other players, unlocking is free and ads are placeholders. ');
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];

const page = `<title>Tribal Grid</title>
<meta name="theme-color" content="#12141a">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>
${await read("public/styles.css")}
</style>
${app}
<script>
(() => {
${coreSrc}
const DATA = ${JSON.stringify({ castaways: data.castaways, grids: data.grids, packs: data.packs })};
const persist = {
  load() { try { return JSON.parse(localStorage.getItem("tribalgrid:preview-db")); } catch { return null; } },
  save(s) { try { localStorage.setItem("tribalgrid:preview-db", JSON.stringify(s)); } catch {} },
};
const game = createGame({ castaways: DATA.castaways, grids: DATA.grids, packs: DATA.packs, store: memoryStore(persist), freeUnlock: true, ads: { placeholder: true } });
window.TRIBAL_GRID_SHARE_LINK = token => ${JSON.stringify(process.env.PREVIEW_URL || "https://tribalgrid.example")} + "#r-" + token;
window.TRIBAL_GRID_FETCH = (path, init) => game.handle(new Request("https://preview.local" + path, init));
})();
</script>
<script type="module">
${await read("public/app.js")}
</script>
`;
await mkdir(new URL("dist/", root), { recursive: true });
await writeFile(new URL("dist/preview.html", root), page);
console.log(`dist/preview.html  ${(page.length / 1024).toFixed(0)} KB`);
