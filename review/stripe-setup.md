# Setting up Stripe for Tribal Grid

You don't need to create any Products or Prices in Stripe. The site sends the amounts ($4.99, $2.99, $9.99 or the upgrade price) at checkout. You only need **two secrets**: an API secret key and a webhook signing secret.

Do Part A, then Part B (free, nothing goes live), then Part C when you're ready to launch.

## Part A: Create the account (about 10 minutes)

1. Go to [dashboard.stripe.com/register](https://dashboard.stripe.com/register) and sign up with your email. It's free, and Stripe only takes a cut of each sale.
2. Click **Activate payments** (or **Complete your profile**) and fill in:
   - **Business type:** Individual / sole proprietor, unless you have an LLC.
   - **Industry:** Digital products → *Games* or *Other digital goods*.
   - **Website:** `https://tribalgrid.app`
   - **Product description:** "Daily trivia puzzle game. Players can buy one-time unlocks for past puzzles and themed puzzle packs."
   - Your legal name, address, date of birth, the last 4 digits of your SSN, and the **bank account** for payouts.
3. Go to **Settings → Business → Public details**:
   - **Statement descriptor:** `TRIBALGRID`. This is what buyers see on their card statement, and a name they recognize means fewer chargebacks.
   - **Support email:** an address you check.
4. Go to **Settings → Product tax categories / Stripe Tax** and turn on **threshold monitoring only**. Don't register for any state yet. Stripe will warn you if you get close to a state's limit (usually 200 sales or $100k a year).
5. Go to **Settings → Emails** and turn on **Successful payments** so buyers get a receipt.

## Part B: Test on your Mac with fake cards (no deploy, no real money)

6. In the dashboard, switch on **Test mode** (the toggle at the top). Everything below uses test data.
7. Go to **Developers → API keys** and copy the **Secret key** (`sk_test_...`). Keep it private and never commit it.
8. Install the Stripe CLI and log in:
   ```
   brew install stripe/stripe-cli/stripe
   stripe login
   ```
9. In one Terminal window, forward Stripe's events to your Mac:
   ```
   stripe listen --forward-to localhost:8787/api/stripe/webhook
   ```
   It prints a signing secret (`whsec_...`). Copy it.
10. In a second Terminal window, start the site with payments on:
    ```
    cd ~/repos/tribal-grid
    FREE_UNLOCK=0 STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... npm run dev
    ```
11. Open `http://localhost:8787/#archive`. Buy a pack using card `4242 4242 4242 4242`, any future expiry date, and any CVC and ZIP. Check that:
    - you land back on the site and the pack is unlocked;
    - the `stripe listen` window shows `checkout.session.completed [200]`;
    - Everything now shows **$7.00** (the upgrade credit is working);
    - the restore code works in a private browser window.
12. Optional: card `4000 0000 0000 0002` shows what a declined payment looks like.

## Part C: Switch to live (only when you're ready to launch)

Part C needs the site deployed to tribalgrid.app, so it waits for your go-ahead on the deploy.

13. Turn **Test mode** off. Go to **Developers → API keys** and copy the live **Secret key** (`sk_live_...`).
14. Go to **Developers → Webhooks → Add endpoint**:
    - **URL:** `https://tribalgrid.app/api/stripe/webhook`
    - **Events:** `checkout.session.completed` only.
    - Save, then click **Reveal** under *Signing secret* and copy it (`whsec_...`). This is a different secret from the one in Part B.
15. Store both secrets in Cloudflare from your Mac. Wrangler asks you to paste each one:
    ```
    cd ~/repos/tribal-grid
    npx wrangler secret put STRIPE_SECRET_KEY
    npx wrangler secret put STRIPE_WEBHOOK_SECRET
    ```
16. Buy the cheapest thing (a $2.99 pack) with your own card on the live site. Then refund it in **Payments → the payment → Refund**. That confirms the whole flow works for real.

## Good to know

- **Fees:** 2.9% + 30¢ per sale. You keep about $2.60 of a pack, $4.55 of the archive and $9.40 of Everything.
- **Payouts:** the first payout takes about 7 days. After that they're on a rolling 2-day schedule.
- **Refunds:** refund freely when someone asks. A refund only loses the fee, but a chargeback costs $15.
- **Where the secrets live:** only in Cloudflare (step 15) and in the Terminal command in Part B. They are never in the code or on GitHub.
