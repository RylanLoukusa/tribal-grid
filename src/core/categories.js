// Every grid row and column is one of these. A category is a query over the tags that
// scripts/build-castaways.mjs writes, so adding a category means adding (at most) a tag.
//
// family: two categories from the same family never meet in a cell (no "Winner x Made final tribal").
// weight: how often the generator reaches for it. Fuzzy or niche categories get less.

const SEASON_NAMES = {
  7: "Pearl Islands", 8: "All-Stars", 16: "Micronesia", 20: "Heroes vs. Villains", 27: "Blood vs. Water",
  28: "Cagayan", 31: "Cambodia", 34: "Game Changers", 37: "David vs. Goliath", 40: "Winners at War", 50: "Survivor 50",
};

export const CATEGORIES = [
  // Result
  { id: "winner", family: "result", label: "Sole Survivor", tag: "winner", weight: 3 },
  { id: "finalist", family: "result", label: "Made final tribal council", tag: "finalist", weight: 3 },
  { id: "finalist-never-won", family: "result", label: "Lost at final tribal (never won)", tag: "finalist-never-won", weight: 2 },
  { id: "zero-jury-votes", family: "result", label: "Got zero jury votes at final tribal", tag: "zero-jury-votes", weight: 1 },
  { id: "final-four", family: "result", label: "Finished in the final four", tag: "final-four", weight: 2 },
  { id: "jury", family: "result", label: "Sat on a jury", tag: "jury", weight: 3 },
  { id: "first-boot", family: "boot", label: "Was the first person voted out", tag: "first-boot", weight: 2 },
  { id: "top-three-boot", family: "boot", label: "One of the first three voted out", tag: "top-three-boot", weight: 2 },
  { id: "never-merged", family: "boot", label: "Never made the merge", tag: "never-merged", weight: 2 },
  { id: "medevac-or-quit", family: "exit", label: "Medically evacuated or quit", tag: "medevac-or-quit", weight: 2 },
  { id: "lost-fire", family: "exit", label: "Lost a fire-making challenge", tag: "lost-fire", weight: 1 },

  // Gameplay
  { id: "ind-immunity", family: "immunity", label: "Won individual immunity", tag: "ind-immunity", weight: 3 },
  { id: "ind-immunity-3", family: "immunity", label: "Won 3+ individual immunities (career)", tag: "ind-immunity-3", weight: 2 },
  { id: "found-idol", family: "idol", label: "Found a hidden immunity idol", tag: "found-idol", weight: 3 },
  { id: "played-idol", family: "idol", label: "Played a hidden immunity idol", tag: "played-idol", weight: 2 },
  { id: "out-with-advantage", family: "idol", label: "Voted out holding an idol or advantage", tag: "out-with-advantage", weight: 2 },
  { id: "non-idol-advantage", family: "advantage", label: "Had an advantage that wasn't an idol", tag: "non-idol-advantage", weight: 1 },
  { id: "most-confessionals", family: "edit", label: "Had the most confessionals of their season", tag: "most-confessionals", weight: 1 },

  // Career
  { id: "one-season", family: "career", label: "Played only once", tag: "one-season", weight: 2 },
  { id: "returnee", family: "career", label: "Played 2+ times", tag: "returnee", weight: 3 },
  { id: "three-plus", family: "career", label: "Played 3+ times", tag: "three-plus", weight: 2 },
  { id: "returnee-season", family: "returnee-season", label: "Played on an all-returnee or returnee-heavy season", short: "Played on a returnee season", tag: "returnee-season", weight: 2 },

  // Tribe life
  { id: "swapped", family: "tribe-path", label: "Went through a tribe swap", tag: "swapped", weight: 2 },
  { id: "second-chance-island", family: "tribe-path", label: "Went to Redemption Island or the Edge of Extinction", short: "Went to Redemption Island or the Edge", tag: "second-chance-island", weight: 1 },
  ...["red", "orange", "yellow", "green", "blue", "purple"].map(c => ({
    id: "tribe-" + c, family: "tribe-colour", label: `Started a season on ${c === "orange" ? "an" : "a"} ${c} tribe`, tag: "tribe:" + c, weight: c === "green" ? 0.5 : 0.8,
  })),

  // Era
  ...[[1, 10], [11, 20], [21, 30], [31, 40], [41, 50]].map(([lo, hi]) => ({
    id: `era-${lo}-${hi}`, family: "era", label: `Played in seasons ${lo}–${hi}`, tag: `era:${lo}-${hi}`, weight: 2,
  })),
  { id: "era-1-20", family: "era", label: "Played in seasons 1–20", tag: "era:1-20", weight: 2 },
  { id: "era-21-40", family: "era", label: "Played in seasons 21–40", tag: "era:21-40", weight: 2 },

  // Specific seasons
  ...Object.entries(SEASON_NAMES).map(([n, name]) => ({
    id: "season-" + n, family: "season", label: `Played on ${name}`, tag: "season:" + n, weight: 1,
    note: name === "Survivor 50" ? null : `Season ${n}`,
  })),

  // Bio (at their first appearance)
  { id: "woman", family: "gender", label: "Woman", tag: "woman", weight: 1 },
  { id: "man", family: "gender", label: "Man", tag: "man", weight: 1 },
  { id: "age-40-plus", family: "age", label: "Was 40+ on their first season", tag: "age-40-plus", weight: 2 },
  { id: "age-under-25", family: "age", label: "Was under 25 on their first season", tag: "age-under-25", weight: 2 },
  ...["California", "Texas", "New York", "Florida"].map(s => ({
    id: "state-" + s.toLowerCase().replace(/ /g, "-"), family: "state", label: `Listed as from ${s}`, tag: "state:" + s, weight: s === "California" ? 1.5 : 1,
  })),
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map(c => [c.id, c]));

export function fits(person, category) {
  return person.tagSet ? person.tagSet.has(category.tag) : person.tags.includes(category.tag);
}

export function answersFor(people, a, b) {
  return people.filter(p => fits(p, a) && fits(p, b));
}
