// What players can buy. Prices here are what the site shows; the amount actually charged
// is whatever the matching Stripe Price (set in env) says, so keep the two in sync.
export const PACKS = [
  { id: "classic-era", title: "Classic Era", description: "Grids built only from castaways who played seasons 1–20.", pool: { seasons: [1, 20] } },
  { id: "middle-era", title: "Blood, Idols & Edges", description: "Grids built only from castaways who played seasons 21–40.", pool: { seasons: [21, 40] } },
  { id: "new-era", title: "New Era", description: "Grids built only from castaways who played seasons 41–50.", pool: { seasons: [41, 50] } },
  { id: "returnees", title: "Returnee Royalty", description: "Grids built only from people who played two or more times.", pool: { tag: "returnee" } },
];
export const PACK_SIZE = 10;

export const PRODUCTS = [
  { id: "archive", title: "Grid archive", price: "$3.99", description: "Play every past daily grid, forever." },
  ...PACKS.map(p => ({ id: "pack:" + p.id, title: p.title + " pack", price: "$1.99", description: `${PACK_SIZE} grids. ${p.description}` })),
  { id: "all", title: "Everything", price: "$7.99", description: "The archive, every pack and every future pack." },
];
export const PRODUCT_IDS = new Set(PRODUCTS.map(p => p.id));

export function inPool(person, pool) {
  if (!pool) return true;
  if (pool.seasons) return person.seasons.some(s => s >= pool.seasons[0] && s <= pool.seasons[1]);
  if (pool.tag) return person.tagSet ? person.tagSet.has(pool.tag) : person.tags.includes(pool.tag);
  return true;
}

// Does this set of owned products unlock `product`?
export function owns(owned, product) {
  return owned.has(product) || owned.has("all");
}
