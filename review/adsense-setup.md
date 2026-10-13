# Setting up ads (Google AdSense)

The site code is ready. It has the ad spaces (one under the grid, plus left and right rails on wide screens), `/ads.txt`, and a privacy policy at `/privacy.html`. What's left happens in Google and Cloudflare, and **the site has to be live first**, because Google reviews the real site.

## Step 0: Deploy

```
cd ~/repos/tribal-grid
git pull
npm run deploy
```
Open https://tribalgrid.app and make sure the game loads.

## Step 1: Make the privacy email work (free, 2 minutes)

The privacy page lists `privacy@tribalgrid.app`. Forward it to your own inbox:

1. Cloudflare dashboard → **tribalgrid.app** → **Email** → **Email Routing** → **Get started**.
2. Create a custom address: `privacy` → **Send to** your Gmail. Confirm the email Cloudflare sends you.
3. Let Cloudflare add the DNS records it asks for.

## Step 2: Sign up for AdSense

1. Go to https://adsense.google.com and sign in with the Google account you want paid to.
2. Enter **tribalgrid.app** as your site and **United States** as your country. Accept the terms.
3. AdSense shows your **publisher ID**, which looks like `ca-pub-1234567890123456`. Copy it.

## Step 3: Put your publisher ID on the site

Paste the ID here in the thread and I'll add it and push. Or do it yourself: in `wrangler.toml`, under `[vars]`, add
```
ADSENSE_CLIENT = "ca-pub-1234567890123456"
```
Then run `npm run deploy`. Check https://tribalgrid.app/ads.txt. It should show one line starting with `google.com, pub-…`.

Until Google approves the site, the ad spaces may show as empty gaps. That's normal.

## Step 4: Verify the site and request review

1. In AdSense, go to **Sites → tribalgrid.app → Verify**.
2. Choose the **ads.txt snippet** method. The site already serves it, so click **Verify**.
3. Click **Request review**. Google usually answers in a few days, sometimes up to 2–4 weeks.

If Google rejects the site for "low value content", that's common with brand-new sites. Wait a week or two of daily grids and reapply. The past-grids list, How to play and About sections help.

## Step 5: Turn on the consent message (while you wait)

This is required for visitors from the EU, UK and Switzerland, and it replaces a cookie banner.

1. AdSense → **Privacy & messaging** → **European regulations** → **Create message**.
2. Pick tribalgrid.app, keep Google's defaults, set the privacy policy URL to `https://tribalgrid.app/privacy.html`, and **Publish**.
3. Optional: do the same under **US state regulations**.

## Step 6: After approval, create the two ad units

1. AdSense → **Ads → By ad unit → Display ads**.
2. Create **"Under grid"**: square or responsive. Copy its `data-ad-slot` number.
3. Create **"Side rail"**: choose **Fixed size, 160 × 600**. Copy its `data-ad-slot` number.
4. Send me both numbers, or add them under `[vars]` in `wrangler.toml` yourself:
   ```
   ADSENSE_SLOT_GAME = "1234567890"
   ADSENSE_SLOT_RAIL = "0987654321"
   ```
   Then run `npm run deploy`.
5. Leave **Auto ads** off. The site places its own ads, and auto ads could cover the grid.

## Step 7: Get paid

- **Payments → Settings:** add your tax info (W-9) and bank account.
- Google pays monthly once you pass $100.
- **Never click your own ads.** It's the quickest way to get banned.
