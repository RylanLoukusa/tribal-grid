// Stripe Checkout over plain fetch, so it runs on Workers, Node and nowhere needs the SDK.
// Configure with env: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. Amounts come from
// products.js on each checkout, so there are no Price objects to create or keep in sync.
const API = "https://api.stripe.com/v1/";

export function stripePayments({ secretKey, webhookSecret, fetchImpl = fetch }) {
  if (!secretKey || !webhookSecret) return null;
  const call = async (path, form) => {
    const res = await fetchImpl(API + path, {
      method: form ? "POST" : "GET",
      headers: { authorization: "Bearer " + secretKey, ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
      body: form ? new URLSearchParams(form) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error("Stripe: " + (data.error?.message || res.status));
    return data;
  };
  return {
    // product is what gets granted on payment; cents and title are what the buyer sees and pays.
    async createCheckout({ product, cents, title, player, successUrl, cancelUrl }) {
      const s = await call("checkout/sessions", {
        mode: "payment", "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(cents),
        "line_items[0][price_data][product_data][name]": "Tribal Grid: " + title,
        success_url: successUrl, cancel_url: cancelUrl, client_reference_id: player,
        "metadata[product]": product, "metadata[player]": player,
      });
      return s.url;
    },
    async getSession(id) {
      if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return null;
      return call("checkout/sessions/" + id);
    },
    // Returns the parsed event if the Stripe-Signature header is valid, else null.
    async verifyWebhook(rawBody, header) {
      const parts = Object.fromEntries((header || "").split(",").map(kv => kv.split("=")));
      const t = +parts.t;
      if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > 300) return null;
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`));
      const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
      const expected = (header.match(/v1=([0-9a-f]+)/g) || []).map(s => s.slice(3));
      return expected.some(v => timingSafeEqual(v, hex)) ? JSON.parse(rawBody) : null;
    },
  };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
