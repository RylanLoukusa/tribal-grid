// Share links: /r/<grid>-<score>-<pattern>, e.g. /r/2026-10-11-237-112010200.
// pattern has one digit per square: 0 empty, 1 common (15%+), 2 uncommon (5–15%), 3 rare (1–5%), 4 legendary (under 1%).
export const SHARE_RE = /^(?:r-)?(\d{4}-\d{2}-\d{2}|practice)-(\d{1,3})-([0-4]{9})$/;

export function parseShare(token) {
  const m = (token || "").match(SHARE_RE);
  if (!m) return null;
  return { grid: m[1], score: +m[2], pattern: m[3] };
}

export const shareEmoji = pattern => [0, 3, 6].map(i => [...pattern.slice(i, i + 3)].map(d => ["⬛", "🟨", "🟩", "🟦", "🟪"][d]).join("")).join("\n");

// Rewrites index.html's title and preview tags so a pasted link shows the score.
export function shareHtml(html, token, gridNumber) {
  const s = parseShare(token);
  if (!s) return html;
  const right = [...s.pattern].filter(d => d !== "0").length;
  const title = `Tribal Grid${gridNumber ? " #" + gridNumber : ""}: scored ${s.score} (${right}/9)`;
  const desc = "Name Survivor castaways who fit both clues. Rarer picks score lower, and low wins. Can you beat it?";
  const esc = v => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`);
}
