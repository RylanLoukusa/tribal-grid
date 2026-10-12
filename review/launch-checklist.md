# Tribal Grid launch checklist

Short answer: **not yet.** The game, payments code and share links work and have tests (21 passing). It still has no host or domain, nothing is reviewed, there's no abuse protection, and the legal pages are missing.

## Needs you (only you can do these)

1. **GitHub repo.** Make an empty private repo (for example `rylanloukusa/tribal-grid`) or tell me to create one, and I'll push the code.
2. **Cloudflare account** (free tier is enough to start). Then run `wrangler d1 create tribal-grid`, paste the id into `wrangler.toml`, and run the migrations. I won't deploy until you say go.
3. **Domain.** You'll need one for AdSense, Stripe and share links. About $10/yr through Cloudflare Registrar.
4. **Review the grids.** All 31 dailies (Oct 11 to Nov 10) and the 4 packs are still unreviewed. Production refuses to serve unreviewed grids, so the site shows "no grid today" until you approve them. Use `npm run review -- <date>`, then `--approve`.
5. **Stripe account.** Create three Prices (archive, single pack, everything) and set the final prices. Right now they're placeholders: $3.99, $1.99 and $7.99.
6. **AdSense.** Apply after the site is live with the privacy page up. Approval usually takes days to weeks, so launch without ads and turn them on later.
7. **Name check.** "Survivor" is a CBS trademark. We use no logos or show art, the footer says we're not affiliated, and "Tribal Grid" doesn't use the mark. Contestant names are factual data. Still, before you spend money on branding, do a quick USPTO search on "Tribal Grid" and avoid "Survivor" in the domain.

## Must fix in code before launch (I can do all of these now)

- **Rate limiting.** Nothing stops a script from making thousands of anonymous players. That would skew rarity or reveal answers through give-up. Plan: per-IP limits on guess, finish, report and restore (Cloudflare rate-limit binding or a small D1 counter), plus a cap on how many new players one IP can create per day for rarity counting.
- **Report button.** It only has a 500-character cap. Add a per-player and per-IP limit and drop duplicates.
- **Restore codes.** These work like passwords. Add a limit on wrong attempts so nobody can guess them.
- **Privacy policy and terms pages.** These are required by AdSense and Stripe. They need to cover what's stored (a random player id in localStorage, guesses, and purchase email through Stripe), cookies from ads, and a refund policy.
- **Cookie consent.** Google requires a certified consent banner for EU and UK visitors once ads are on. AdSense has a built-in option for this.
- **Security headers.** Add a Content-Security-Policy (allowing Google ads and Stripe), HSTS, X-Content-Type-Options and Referrer-Policy.
- **Stripe test-mode run.** Run a full purchase with test keys against the deployed Worker, including the webhook.

## Already done

- Stripe webhook signatures are verified (HMAC, 5-minute window, constant-time compare) and tested. Purchases are also confirmed on return, so a slow webhook doesn't lose a sale.
- Answers are checked on the server, so the client never receives the answer list before you finish.
- Optimistic locking stops double-submits from corrupting a game.
- The review gate keeps unreviewed grids out of production.

## Can follow after launch

- **More grids.** There are only 31 days of puzzles. Set up a weekly routine that generates the next batch and queues it for your review.
- **Season 51 data.** Refresh after the finale airs.
- **Error monitoring and analytics.** Cloudflare Web Analytics is free and doesn't use cookies.
- **D1 backups.** Schedule a weekly `wrangler d1 export`.
- **Sales tax.** Stripe Tax, once sales are meaningful.
- **Image share card.** Better previews when links are posted.
- **Accessibility and phone testing.** Screen reader labels and contrast on the tier colors, plus a pass on real iOS and Android devices.
- **Accounts or sign-in.** Only if restore codes turn out to confuse people.
