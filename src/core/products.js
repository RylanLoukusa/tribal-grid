// What players can buy. Prices live here only: checkout sends these amounts to Stripe directly.

// The season airing now. Buying Everything covers every pack tagged with this season, including
// ones released before its finale. Bump this at each premiere and tag new packs with it.
export const BUNDLE_SEASON = { number: 51, name: "Survivor 51" };

export const PACKS = [
  { id: "classic-era", season: 51, title: "Classic Era", description: "Grids built only from castaways who played seasons 1–20.", pool: { seasons: [1, 20] } },
  { id: "middle-era", season: 51, title: "Blood, Idols & Edges", description: "Grids built only from castaways who played seasons 21–40.", pool: { seasons: [21, 40] } },
  { id: "new-era", season: 51, title: "New Era", description: "Grids built only from castaways who played seasons 41–50.", pool: { seasons: [41, 50] } },
  { id: "returnees", season: 51, title: "Returnee Royalty", description: "Grids built only from people who played two or more times.", pool: { tag: "returnee" } },
];
export const PACK_SIZE = 10;

export const PACK_BY_ID = new Map(PACKS.map(p => [p.id, p]));
export const CENTS = { archive: 499, pack: 299, all: 999 };
// The lowest an upgrade to Everything can cost, however much credit a player has.
export const MIN_UPGRADE_CENTS = 199;
export const usd = cents => "$" + (cents / 100).toFixed(2);

export const PRODUCTS = [
  { id: "archive", title: "Grid archive", cents: CENTS.archive, description: "Play every past daily grid, forever, including ones added after you buy." },
  ...PACKS.map(p => ({ id: "pack:" + p.id, title: p.title + " pack", cents: CENTS.pack, description: `${PACK_SIZE} grids. ${p.description}` })),
  { id: "all", title: "Everything", cents: CENTS.all,
    description: `The archive, every pack so far, and every new pack released through the ${BUNDLE_SEASON.name} finale.` },
].map(p => ({ ...p, price: usd(p.cents) }));
export const PRODUCT_IDS = new Set(PRODUCTS.map(p => p.id));
export const SEPARATE_CENTS = CENTS.archive + PACKS.filter(p => p.season === BUNDLE_SEASON.number).length * CENTS.pack;

// Buying "all" grants "all:<season>", so the bundle covers that season's packs and no later ones.
// A bare "all" (granted before seasons existed) still covers everything.
export const bundleGrant = () => "all:" + BUNDLE_SEASON.number;
export const isGrant = id => PRODUCT_IDS.has(id) || /^all:\d+$/.test(id);

export function inPool(person, pool) {
  if (!pool) return true;
  if (pool.seasons) return person.seasons.some(s => s >= pool.seasons[0] && s <= pool.seasons[1]);
  if (pool.tag) return person.tagSet ? person.tagSet.has(pool.tag) : person.tags.includes(pool.tag);
  return true;
}

// Does this set of owned products unlock `product`?
export function owns(owned, product) {
  if (owned.has(product) || owned.has("all")) return true;
  if (product === "all") return owned.has(bundleGrant());
  if (product === "archive") return [...owned].some(x => x.startsWith("all:"));
  if (product.startsWith("pack:")) return owned.has("all:" + PACK_BY_ID.get(product.slice(5))?.season);
  return false;
}

// What Everything costs this player: full price minus what they already own from it
// (the archive, and this season's packs), never below MIN_UPGRADE_CENTS.
export function bundleOffer(owned) {
  const credit = (owns(owned, "archive") ? CENTS.archive : 0)
    + PACKS.filter(p => p.season === BUNDLE_SEASON.number && owns(owned, "pack:" + p.id)).length * CENTS.pack;
  const cents = Math.max(MIN_UPGRADE_CENTS, CENTS.all - credit);
  return { cents, price: usd(cents), credit: CENTS.all - cents };
}

// The price a player pays for one product right now.
export function priceFor(owned, product) {
  const p = PRODUCTS.find(x => x.id === product);
  if (!p) return null;
  const cents = product === "all" ? bundleOffer(owned).cents : p.cents;
  return { cents, title: p.title };
}
