// Server-rendered content pages: the guides, the clue glossary and an answers page for every
// past grid. They are plain HTML so search engines (and AdSense's review) can read them without
// running the game's JavaScript.
import { CATEGORIES } from "./categories.js";

const SITE = "https://tribalgrid.app";
export const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const longDate = id => new Date(id + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDate = id => new Date(id + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const seasonList = s => (s.length === 1 ? "Season " : "Seasons ") + s.join(", ");

export const NAV = [
  ["/", "Play"], ["/how-to-play", "How to play"], ["/grids", "Past answers"], ["/clues", "Clue guide"], ["/about", "About"],
];

export function layout({ title, description, path, body, adsClient }) {
  const nav = NAV.map(([href, label]) => `<a href="${href}"${href === path ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${path}">
<meta name="theme-color" content="#12141a">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap">
<link rel="stylesheet" href="/styles.css">
${adsClient ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(adsClient)}" crossorigin="anonymous"></script>\n` : ""}</head>
<body>
<div class="wrap legal">
  <header>
    <div class="brand"><h1><a href="/">Tribal <span>Grid</span></a></h1></div>
    <nav class="site-nav" aria-label="Site">${nav}</nav>
  </header>
  <main>
${body}
  </main>
  ${FOOTER}
</div>
</body>
</html>`;
}

export const FOOTER = `<p class="foot">A fan-made game. Not affiliated with CBS, Paramount or Survivor. · <a href="/how-to-play">How to play</a> · <a href="/grids">Past answers</a> · <a href="/clues">Clue guide</a> · <a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/privacy.html">Privacy</a></p>`;

// ---- Clue guide

// What each clue counts, in more words than fit on the board.
const EXPLAIN = {
  "winner": "Won at least one season at final tribal council.",
  "finalist": "Sat in the final two or three at final tribal council, whether they won or lost.",
  "finalist-never-won": "Reached final tribal council at least once and never won any season.",
  "zero-jury-votes": "Sat at final tribal council and didn't get a single jury vote.",
  "final-four": "Finished fourth or better on at least one season.",
  "jury": "Was voted out after the jury started and voted for the winner.",
  "first-boot": "Was the first person voted out of a season (medical exits and quits don't count).",
  "top-three-boot": "Was one of the first three people voted out of a season.",
  "never-merged": "Left the game before the merge on every season they played.",
  "medevac-or-quit": "Left a season without being voted out: medically evacuated, quit or removed from the game.",
  "lost-fire": "Was eliminated in a fire-making challenge.",
  "ind-immunity": "Won at least one individual immunity challenge, on any season.",
  "ind-immunity-3": "Won three or more individual immunity challenges, added up across every season they played.",
  "found-idol": "Found a hidden immunity idol, at camp or on a journey. Idols handed over by someone else don't count.",
  "played-idol": "Played a hidden immunity idol at tribal council, for themselves or for someone else.",
  "out-with-advantage": "Was voted out while holding an idol or another advantage they never used.",
  "non-idol-advantage": "Held an advantage that wasn't an idol, such as an extra vote, a steal-a-vote or a shot in the dark.",
  "most-confessionals": "Had more confessionals than anyone else on their season, based on survivoR's confessional counts.",
  "one-season": "Has played exactly one season.",
  "returnee": "Has played two or more seasons.",
  "three-plus": "Has played three or more seasons.",
  "returnee-season": "Played on a season where at least half the cast had played before, such as All-Stars or Winners at War.",
  "swapped": "Was moved to a new tribe by a tribe swap or dissolve on at least one season.",
  "second-chance-island": "Was sent to Redemption Island or the Edge of Extinction after being voted out.",
  "woman": "Counted from how castaways are listed in the survivoR dataset.",
  "man": "Counted from how castaways are listed in the survivoR dataset.",
  "age-40-plus": "Was 40 or older when their first season was filmed.",
  "age-under-25": "Was 24 or younger when their first season was filmed.",
};
function explain(c) {
  if (EXPLAIN[c.id]) return EXPLAIN[c.id];
  if (c.family === "tribe-colour") return "Was placed on a tribe of this colour on day one of at least one season. Swapped tribes don't count.";
  if (c.family === "era") return "Played at least one season in this range. A returnee who played across ranges counts for each.";
  if (c.family === "season") return "Was in the cast of this season.";
  if (c.family === "state") return "Was listed as being from this state on at least one of their seasons.";
  return "";
}
const GROUPS = [
  ["How their game ended", ["result", "boot", "exit"]],
  ["Gameplay", ["immunity", "idol", "advantage", "edit"]],
  ["Career", ["career", "returnee-season"]],
  ["Tribe life", ["tribe-path", "tribe-colour"]],
  ["When they played", ["era", "season"]],
  ["Who they are", ["gender", "age", "state"]],
];

export function cluesPage(people, { adsClient }) {
  const count = c => people.filter(p => p.tagSet.has(c.tag)).length;
  const famous = c => people.filter(p => p.tagSet.has(c.tag)).sort((a, b) => b.fame - a.fame).slice(0, 3).map(p => p.name);
  const sections = GROUPS.map(([title, fams]) => {
    const rows = CATEGORIES.filter(c => fams.includes(c.family)).map(c => `      <li><b>${esc(c.label)}</b>${c.note ? ` <span class="muted">(${esc(c.note)})</span>` : ""}. ${esc(explain(c))} <span class="muted">${count(c)} castaways fit, including ${esc(famous(c).join(", "))}.</span></li>`).join("\n");
    return `    <h3>${title}</h3>\n    <ul>\n${rows}\n    </ul>`;
  }).join("\n");
  const body = `    <h2>Clue guide</h2>
    <p>Every row and column on a Tribal Grid is one of the ${CATEGORIES.length} clues below. Each one is checked against the survivoR dataset of every US castaway, so you can see exactly what counts. Only seasons that have finished airing are included.</p>
${sections}
    <p>Something counted wrong? Submit your grid, tap the square and use "Report a problem", or <a href="/contact">get in touch</a>.</p>
    <p><a class="btn" href="/">Play today's grid</a></p>`;
  return layout({ title: "Clue guide · Tribal Grid", description: `What each of Tribal Grid's ${CATEGORIES.length} Survivor clues means and how many castaways fit it.`, path: "/clues", body, adsClient });
}

// ---- Past grids

export function gridsIndexPage(list, { adsClient }) {
  const items = list.map(g => `      <li><a href="/grids/${g.id}"><b>Tribal Grid #${g.number}</b> · ${esc(longDate(g.id))}</a><br><span class="muted">${esc(g.rows.map(c => c.short || c.label).join(" · "))} × ${esc(g.cols.map(c => c.short || c.label).join(" · "))}</span></li>`).join("\n");
  const body = `    <h2>Past answers</h2>
    <p>Every daily grid so far, newest first. Each page lists the nine clues, every right answer for each square and how often players picked it. You can still play any of these grids from the "Past grids" tab on the game page.</p>
    <ul class="grid-list">
${items || "      <li>The first answers page goes up the day after the first grid.</li>"}
    </ul>`;
  return layout({ title: "Past answers · Tribal Grid", description: "Answers and pick rates for every past Tribal Grid, the daily Survivor trivia grid.", path: "/grids", body, adsClient });
}

// cells: [{ row, col, answers: [{ name, seasons, rarity, picks }] }], answers sorted most-picked first.
export function gridPage(g, { cells, players, past, prev, next, adsClient }) {
  const head = `    <p class="muted"><a href="/grids">Past answers</a> / #${g.number}</p>
    <h2>Tribal Grid #${g.number}</h2>
    <p>${esc(longDate(g.id))}. ${past ? `${players ? `${players} player${players === 1 ? "" : "s"} submitted this grid.` : ""} Want to try it before reading the answers? <a href="/#${g.id}">Play grid #${g.number}</a>.` : `This is today's grid. The answers go up here after midnight Eastern, when the next grid comes out. <a href="/">Play it now</a>.`}</p>
    <h3>The clues</h3>
    <p><b>Rows:</b> ${esc(g.rows.map(c => c.label).join("; "))}.<br><b>Columns:</b> ${esc(g.cols.map(c => c.label).join("; "))}.</p>`;
  let answers = "";
  if (past) {
    answers = cells.map((c, i) => {
      const a = c.answers, picked = a.filter(x => x.picks > 0);
      const top = picked.slice(0, 3).map(x => `${esc(x.name)} (${x.rarity}%)`).join(", ");
      const rare = picked.length > 3 ? picked.at(-1) : null;
      const summary = `${a.length} castaway${a.length === 1 ? "" : "s"} fit${a.length === 1 ? "s" : ""}.${top ? ` Most picked: ${top}.` : ""}${rare ? ` Rarest pick: ${esc(rare.name)} (${rare.rarity}%).` : ""}`;
      const list = a.map(x => `<li>${esc(x.name)} <span class="muted">${esc(seasonList(x.seasons))} · ${x.rarity}%</span></li>`).join("");
      return `    <h3>Square ${i + 1}: ${esc(c.row.label)} × ${esc(c.col.label)}</h3>
    <p>${summary}</p>
    <details><summary>Show all ${a.length} answers</summary><ol class="answer-list">${list}</ol></details>`;
    }).join("\n");
    answers = `    <h3>Answers</h3>\n    <p class="muted">Percent is the share of players who picked that castaway for that square. Lower is rarer, and rarer picks score better. Before many people have played, it's estimated from how well known each castaway is.</p>\n${answers}`;
  }
  const pager = `    <p class="pager">${prev ? `<a href="/grids/${prev.id}">← #${prev.number} · ${shortDate(prev.id)}</a>` : ""}${next ? `<a href="/grids/${next.id}">#${next.number} · ${shortDate(next.id)} →</a>` : ""}</p>`;
  return layout({
    title: `Tribal Grid #${g.number} answers (${shortDate(g.id)}) · Tribal Grid`,
    description: past ? `Every answer to Tribal Grid #${g.number}, the Survivor trivia grid for ${longDate(g.id)}, with how often players picked each castaway.` : `The clues for today's Tribal Grid, #${g.number}.`,
    path: "/grids/" + g.id, body: [head, answers, pager].filter(Boolean).join("\n"), adsClient,
  });
}

export function sitemap(gridIds) {
  const urls = ["/", "/how-to-play", "/grids", "/clues", "/about", "/contact", "/privacy.html", ...gridIds.map(id => "/grids/" + id)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${SITE}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
}

export const ROBOTS = `User-agent: *\nDisallow: /api/\nSitemap: ${SITE}/sitemap.xml\n`;

// ---- Guides

export function howToPlayPage({ adsClient }) {
  const body = `    <h2>How to play</h2>
    <p>Tribal Grid is a daily Survivor trivia puzzle. You get a 3×3 board with a clue on each row and each column. Fill each square with a castaway who fits both its row clue and its column clue. Everyone gets the same grid, and a new one comes out every day at midnight Eastern.</p>

    <h3>The rules</h3>
    <ul>
      <li>Tap a square and start typing a castaway's name. Pick them from the list.</li>
      <li>If they fit both clues, they go in the square. If not, you lose one of your 9 torches. When all 9 are out, the grid ends.</li>
      <li>Right answers don't cost anything, and you can swap a right answer for a rarer one any time before you submit.</li>
      <li>Each castaway can only fill one square on a grid.</li>
      <li>Every US season that has finished airing counts. Seasons still on TV don't, so the grid never spoils an episode.</li>
      <li>When you're done, press <b>Submit grid</b>. You'll see your score, every right answer and how often each was picked.</li>
    </ul>

    <h3>How scoring works</h3>
    <p>Tribal Grid rewards deep cuts. Each right answer scores the percent of players who picked the same castaway for that square. An empty square scores 100. Your total is those nine numbers added up, and <b>low wins</b>.</p>
    <p>Here's an example. Say a square is <i>Sole Survivor × Played on Heroes vs. Villains</i>. If 60% of players put Sandra there, Sandra scores 60. If you pick Parvati, who won Micronesia and played Heroes vs. Villains, and only 4% of players picked her, you score 4. Leave it empty and you score 100.</p>
    <p>A blank grid scores 900. A grid full of obvious answers usually lands between 250 and 400. A grid of rare picks can score under 50.</p>

    <h3>Rarity colours</h3>
    <ul>
      <li>🟪 <b>Legendary:</b> under 1% of players picked it.</li>
      <li>🟦 <b>Rare:</b> 1% to 5%.</li>
      <li>🟩 <b>Uncommon:</b> 5% to 15%.</li>
      <li>🟨 <b>Common:</b> 15% or more.</li>
      <li>⬛ <b>Empty:</b> no answer.</li>
    </ul>
    <p>Your share result uses these squares, so you can post how you did without giving away any answers.</p>

    <h3>Tips</h3>
    <ul>
      <li><b>Fill the hard squares first.</b> Some squares have only a handful of answers. Save the easy, wide-open squares for last, so you don't use up a castaway you needed somewhere else.</li>
      <li><b>Returnees are your friends.</b> Someone who played three or four seasons fits far more clues than a one-time player. Think Cirie, Ozzy, Rupert or Boston Rob.</li>
      <li><b>Then trade them for rarer picks.</b> Once a square is safe, swap the obvious answer for someone fewer people will think of. A pre-merge boot from an early season is often legendary.</li>
      <li><b>Read the clue exactly.</b> "Made final tribal council" includes winners, but "Lost at final tribal (never won)" doesn't. The <a href="/clues">clue guide</a> spells out every one.</li>
      <li><b>Misses are cheap early.</b> You have 9. Guessing on a half-remembered name is often worth it.</li>
      <li><b>Use practice grids.</b> Press <b>Practice grid</b> for an unlimited random grid that doesn't touch your stats.</li>
    </ul>

    <h3>Questions</h3>
    <p><b>Why was my answer marked wrong?</b> Every clue is checked against the survivoR dataset. If you think a castaway should count, submit the grid, tap the square and use "Report a problem". We read every report and fix the data when it's wrong.</p>
    <p><b>Can I play yesterday's grid?</b> Yes. Every past grid is free to play from the "Past grids" tab, and each has an <a href="/grids">answers page</a> for after you've played.</p>
    <p><b>Do I need an account?</b> No. Your browser remembers your games, streak and stats on this device.</p>
    <p><b>Why is my score different from my friend's for the same answers?</b> Rarity updates as more people play. Scores are worked out when you submit, so someone who submits later may see slightly different percents.</p>

    <p><a class="btn" href="/">Play today's grid</a></p>`;
  return layout({ title: "How to play · Tribal Grid", description: "Rules, scoring and tips for Tribal Grid, the daily Survivor trivia grid where rarer answers score better.", path: "/how-to-play", body, adsClient });
}

export function aboutPage({ adsClient, castaways, seasons }) {
  const body = `    <h2>About Tribal Grid</h2>
    <p>Tribal Grid is a daily trivia puzzle for Survivor fans. It's for people who can tell you who got blindsided on day 33 of a season from twenty years ago, and for anyone who wants a few minutes of Survivor every day between episodes.</p>
    <p>It's inspired by sports grid games, with a twist. You're scored on how few other players thought of the same castaway, so the best answer is the one nobody else came up with, not just one that fits.</p>

    <h3>Where the facts come from</h3>
    <p>Castaway facts come from <a href="https://github.com/doehm/survivoR" target="_blank" rel="noopener">survivoR</a>, an open dataset of every US season compiled by Dan Oehm and its contributors (MIT licence). It covers ${castaways} castaways across ${seasons} finished seasons: boot order, jury votes, challenge wins, idols, advantages, tribe swaps, confessional counts and more. Seasons still airing are left out until their finale, so the game never spoils an episode.</p>

    <h3>How grids are made</h3>
    <p>Each grid is built from the <a href="/clues">clue list</a> so that every square has enough right answers to be fair, and no two clues on a grid overlap (you won't see "Sole Survivor" next to "Made final tribal council"). Every daily grid is then checked by hand before it goes live, looking at the answers for each square and swapping out any clue that's ambiguous or too obscure.</p>

    <h3>How rarity works</h3>
    <p>A square's rarity numbers are the share of players who picked each castaway there. On a brand-new grid, before many people have played, rarity is estimated from how well known each castaway is. It then shifts to real picks as people submit. The <a href="/grids">past answers</a> pages show where every grid ended up.</p>

    <h3>Who makes it</h3>
    <p>Tribal Grid is an independent fan project made by a longtime Survivor viewer. It isn't affiliated with CBS, Paramount or the makers of Survivor, and it uses no logos or show artwork. Castaway names and game facts are used as factual information.</p>
    <p>Ideas, corrections and bug reports are welcome. See the <a href="/contact">contact page</a>.</p>

    <p><a class="btn" href="/">Play today's grid</a></p>`;
  return layout({ title: "About · Tribal Grid", description: "Who makes Tribal Grid, where its Survivor data comes from, and how the daily grids are built and checked.", path: "/about", body, adsClient });
}

export function contactPage({ adsClient, email }) {
  const body = `    <h2>Contact</h2>
    <p>Email <a href="mailto:${esc(email)}">${esc(email)}</a>. We read everything and usually reply within a few days.</p>
    <h3>What to write about</h3>
    <ul>
      <li><b>A wrong answer.</b> Name the grid number, the square and the castaway. The quickest way is the "Report a problem" button on the square after you submit.</li>
      <li><b>Deleting your data.</b> Include the player ID shown under About on the game page, and we'll remove the games tied to it.</li>
      <li><b>Clue ideas.</b> Suggest a new row or column. The best ones are clear-cut facts with 10 or more castaways who fit.</li>
      <li><b>Bugs.</b> Say what device and browser you were using and what happened.</li>
    </ul>
    <p>Read our <a href="/privacy.html">privacy policy</a> for what we store.</p>`;
  return layout({ title: "Contact · Tribal Grid", description: "Report a wrong answer, suggest a clue or ask about your data.", path: "/contact", body, adsClient });
}
