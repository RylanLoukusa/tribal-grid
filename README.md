# Tribal Grid

A daily 3x3 Survivor trivia grid. Each row and column is a fact about castaways; name someone who fits both. Right answers score by how many other players picked the same person, so obscure picks win. Built to add more shows later (Love Island USA and The Traitors are stubbed in the show switcher).

## How it fits together

```
survivoR JSON ──► scripts/build-castaways.mjs ──► data/castaways.json   (751 castaways, tags per person)
                                                        │
src/core/categories.js (47 categories = tag queries)    │
                                                        ▼
scripts/generate-grids.mjs ──► grids/YYYY-MM-DD.json ──► scripts/review-grid.mjs --approve
                                                        │
scripts/bundle-data.mjs ──► src/generated/data.json ────┤
                                                        ▼
src/core/game.js  (the API: answer checking, rarity, results)
   ├── src/server/worker.js   Cloudflare Worker + D1      (production)
   ├── src/server/node.mjs    Node + node:sqlite          (local dev, tests)
   └── scripts/build-preview  in-browser, one HTML file   (try-it preview)
public/  the site (no build step): index.html, app.js, styles.css
```

- **Answers stay on the server.** The client gets category labels and the name list for autocomplete, never which names fit. Results (every right answer, top picks) unlock only after that player finishes.
- **Play state is server-side** per anonymous device ID. Right answers are free and can be swapped for a rarer one until the player submits; only wrong guesses count (9 per grid). Each castaway can be used once.
- **Picks count when a grid is submitted** (or the 9th miss), so rarity reflects final answers, not ones people swapped out.
- **Rarity** = share of players who picked that castaway in that cell. Day one has no crowd, so each cell starts from a fame prior (confessional count, seasons played, winning) worth 40 pretend players; real picks take over quickly. See `src/core/rarity.js`.
- **Spoilers:** seasons without a winner in the dataset (currently Survivor 51) are left out entirely.
- **Grids are reviewed by a person.** The production config (`REQUIRE_REVIEW=1`) refuses to serve a grid nobody approved. Players can report a wrong answer after finishing; reports land in the `reports` table.

## Commands

Needs Node 22.5+.

| | |
|---|---|
| `npm run dev` | Site + API at http://localhost:8787 (SQLite in `data/local.db`) |
| `npm test` | 21 tests: data facts, generator, game rules, archive and packs, Stripe flow, share links |
| `npm run fetch-data` | Re-download survivoR (after a season finishes) |
| `npm run build-data` | Rebuild `data/castaways.json` |
| `npm run generate -- --from 2026-11-11 --days 30` | Write upcoming grids (never overwrites existing ones without `--force`) |
| `npm run generate-packs` | Write the season packs in `packs/` (kept unless `--force`) |
| `npm run review -- 2026-10-11` | Print a grid with every valid answer; add `--approve` to mark it reviewed; `--pending` lists unreviewed |
| `npm run bundle` | Pack data + grids for the servers (run after any of the above) |
| `npm run build-preview` | `dist/preview.html`, the whole game in one file |

## Deploying (Cloudflare, free tier)

Not done yet; needs a Cloudflare account.

1. `npm install`
2. `npx wrangler d1 create tribal-grid` and paste the id into `wrangler.toml`
3. `npx wrangler d1 migrations apply tribal-grid --remote`
4. Review and approve upcoming grids (and set `"reviewed": true` in each `packs/*.json` you've checked), `npm run bundle`, then `npm run deploy`
5. Optional: add the Stripe and AdSense settings with `npx wrangler secret put NAME`

Verified locally with `wrangler dev` against a local D1 database.

## Money: archive, packs and ads

Today's grid and practice grids are free. Everything else is in `src/core/products.js`:

| Product | Shown price | Unlocks |
|---|---|---|
| `archive` | $3.99 | Every past daily grid |
| `pack:<id>` | $1.99 each | One season pack (10 grids from one slice of history) |
| `all` | $7.99 | Archive plus every pack, including future ones |

- **Payments use Stripe Checkout** (`src/core/payments.js`, no SDK). Set these as Worker secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ARCHIVE`, `STRIPE_PRICE_PACK`, `STRIPE_PRICE_ALL`. Point a Stripe webhook at `/api/stripe/webhook` for `checkout.session.completed`. Until they're set, buy buttons say "Coming soon".
- **No accounts:** a purchase belongs to the device. Each buyer gets a restore code (shown on the Archive page) that unlocks the same things on another device.
- **Ads use Google AdSense.** Set `ADSENSE_CLIENT` (ca-pub-…) and optionally `ADSENSE_SLOT_GAME`; the site then loads ads in the slot under the grid and serves `/ads.txt`. Anyone who has bought something sees no ads. Turn on Google's consent message in AdSense (Privacy & messaging) for EU/UK visitors.
- `npm run dev` turns on `FREE_UNLOCK=1` (buying is free) and ad placeholders so you can try both locally.

## Share links

Finishing a grid shows a link like `/r/2026-10-11-237-112010200` (grid, score, one digit per square). The server writes the score into that page's title and preview tags, so it shows up when pasted into a chat, and the page shows a "can you beat it?" banner above the grid.

## Adding a category

Add a tag in `scripts/build-castaways.mjs` (if the fact isn't tagged yet) and one line in `src/core/categories.js`. Same-`family` categories never cross in a cell. Then `npm run build-data && npm test`.

## Known gaps / next steps

- Anyone can make new device IDs, so rarity can be gamed by a determined person. Add per-IP rate limiting (Cloudflare rules) before a big launch.
- Tribe colours are bucketed from hex values; fans may argue about orange vs. red on a few tribes. Those categories have low weight; check them during review.
- Not built yet: friend leagues, sign-in (purchases and streaks across devices without a restore code), image share cards, episode-night bonus grids, the second show.

Data: [survivoR](https://github.com/doehm/survivoR) by Dan Oehm, MIT licence. Not affiliated with CBS, Paramount or Survivor.
