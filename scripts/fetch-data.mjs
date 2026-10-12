// Downloads the survivoR tables we use (MIT licensed, https://github.com/doehm/survivoR)
// into data/raw. Run after each finished season, then `npm run build-data`.
import { mkdir, writeFile } from "node:fs/promises";

const BASE = "https://raw.githubusercontent.com/doehm/survivoR/master/dev/json/";
const TABLES = [
  "castaways", "castaway_details", "season_summary", "boot_order", "challenge_results",
  "advantage_movement", "advantage_details", "tribe_mapping", "tribe_colours", "jury_votes", "confessionals",
];

const dir = new URL("../data/raw/", import.meta.url);
await mkdir(dir, { recursive: true });
for (const t of TABLES) {
  const res = await fetch(BASE + t + ".json");
  if (!res.ok) throw new Error(`${t}: HTTP ${res.status}`);
  const text = await res.text();
  JSON.parse(text); // fail loudly on a truncated download
  await writeFile(new URL(t + ".json", dir), text);
  console.log(`${t}.json  ${(text.length / 1024).toFixed(0)} KB`);
}
