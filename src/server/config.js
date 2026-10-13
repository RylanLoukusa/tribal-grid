// Turns environment variables into createGame options. Shared by the Node server and the Worker.
import { stripePayments } from "../core/payments.js";

export function gameOptions(env = {}) {
  return {
    requireReview: env.REQUIRE_REVIEW === "1",
    freeUnlock: env.FREE_UNLOCK === "1",
    // The paid archive and packs are off unless SHOP=1. With it off, past grids are free.
    shop: env.SHOP === "1",
    payments: stripePayments({
      secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    }),
    ads: {
      client: env.ADSENSE_CLIENT || null,
      slots: { game: env.ADSENSE_SLOT_GAME || null, results: env.ADSENSE_SLOT_RESULTS || null },
      placeholder: env.ADS_PLACEHOLDER === "1",
    },
  };
}
