export const DBZF_QUALITY_KEYS = [
  "area", "bending", "burn", "deadly", "homing", "immobilization", "pull", "push",
  "rapid", "sealing", "selective", "slow", "super", "fullPower", "true", "duration",
  "multi", "penetrate", "kiDeflection"
];

export const DBZF_QUALITIES = {
  area: { label: "Area", commonModifier: true },
  bending: { label: "Bending", commonModifier: true },
  burn: { label: "Burn", commonModifier: true },
  deadly: { label: "Deadly", commonModifier: true },
  homing: { label: "Homing", commonModifier: true },
  immobilization: { label: "Immobilization", commonModifier: true, aliases: ["immobilize"] },
  pull: { label: "Pull", commonModifier: true },
  push: { label: "Push", commonModifier: true },
  rapid: { label: "Rapid", commonModifier: true },
  sealing: { label: "Sealing", commonModifier: true },
  selective: { label: "Selective", commonModifier: true },
  slow: { label: "Slow", commonModifier: true },
  super: { label: "Attack, Super", commonModifier: false, aliases: ["attack super"] },
  fullPower: { label: "Attack, Full Power", commonModifier: false, aliases: ["full power", "attack full power"] },
  true: { label: "Attack, True", commonModifier: false, aliases: ["attack true", "true attack"] },
  duration: { label: "Duration", commonModifier: false },
  multi: { label: "Multi", commonModifier: false },
  penetrate: { label: "Penetrate", commonModifier: false },
  kiDeflection: { label: "Ki Deflection", commonModifier: false, aliases: ["ki deflect", "deflection"] }
};

export function emptyQualityRatings() {
  return Object.fromEntries(DBZF_QUALITY_KEYS.map(key => [key, 0]));
}

export function parseQualityRatings(text = "", embeddedQualities = []) {
  const ratings = emptyQualityRatings();
  const source = normalizeQualityText(text);

  for (const key of DBZF_QUALITY_KEYS) {
    const names = [...new Set([DBZF_QUALITIES[key].label, key, ...(DBZF_QUALITIES[key].aliases ?? [])].map(normalizeQualityText))];
    ratings[key] += Math.max(0, ...names.map(name => ratingFor(source, name)));
  }

  for (const quality of embeddedQualities ?? []) {
    const key = normalizeQualityKey(quality.key || quality.type || quality.name);
    if (!key || !(key in ratings)) continue;
    ratings[key] += Math.max(1, Number(quality.rating || 1));
  }

  return ratings;
}

export function mergeQualityRatings(...sources) {
  const merged = emptyQualityRatings();
  for (const source of sources) {
    if (!source) continue;
    const ratings = typeof source === "string" ? parseQualityRatings(source) : source;
    for (const key of DBZF_QUALITY_KEYS) merged[key] += Number(ratings[key] || 0);
  }
  return merged;
}

export function modifierCapacityForAttack(actor, attackType, skillTotal, specialCapacityBonus = 0) {
  const divisor = attackType === "weapon" ? 20 : 10;
  return Math.floor(Number(skillTotal || 0) / divisor) + Number(specialCapacityBonus || 0);
}

// Each RATING of a common modifier consumes a slot, not each quality: "Deadly 14" is fourteen
// modifiers against capacity, not one. Capacity is skill total / 10 (weapon attacks / 20).
export function normalModifierCount(ratings) {
  return Object.entries(DBZF_QUALITIES)
    .filter(([, data]) => data.commonModifier)
    .reduce((total, [key]) => total + Math.max(0, Number(ratings[key] || 0)), 0);
}

export function embeddedQualityKiCost(embeddedQualities = [], maxKi = 0) {
  return (embeddedQualities ?? []).reduce((total, quality) => {
    if (quality.costKi !== true) return total;
    const key = normalizeQualityKey(quality.key || quality.type || quality.name);
    const rating = Math.max(1, Number(quality.rating || 1));
    const explicit = Number(quality.cost || 0);
    if (explicit > 0) return total + (explicit * rating);
    return total + defaultQualityKiCost(key, rating, maxKi);
  }, 0);
}

export function defaultQualityKiCost(key, rating = 1, maxKi = 0) {
  const safeRating = Math.max(1, Number(rating || 1));
  if (key === "super") return Math.ceil(Number(maxKi || 0) * 0.1);
  if (key === "fullPower") return Math.ceil(Number(maxKi || 0) * 0.25);
  if (key === "true") return Math.ceil(Number(maxKi || 0) * 0.5);
  if (key === "duration") return Math.ceil(Number(maxKi || 0) * 0.05 * safeRating);
  if (key === "multi") return Math.ceil(Number(maxKi || 0) * 0.05 * safeRating);
  if (key && DBZF_QUALITIES[key]?.commonModifier) return 10 * safeRating;
  return 0;
}

export function qualitySummary(ratings) {
  return DBZF_QUALITY_KEYS
    .filter(key => Number(ratings[key] || 0) > 0)
    .map(key => `${DBZF_QUALITIES[key].label} ${ratings[key]}`)
    .join(", ");
}

export function normalizeQualityKey(value) {
  const normalized = normalizeQualityText(value).replace(/[^a-z]/g, "");
  const map = {
    area: "area",
    bending: "bending",
    burn: "burn",
    deadly: "deadly",
    homing: "homing",
    immobilization: "immobilization",
    immobilize: "immobilization",
    pull: "pull",
    push: "push",
    rapid: "rapid",
    sealing: "sealing",
    selective: "selective",
    slow: "slow",
    attacksuper: "super",
    super: "super",
    attackfullpower: "fullPower",
    fullpower: "fullPower",
    attacktrue: "true",
    trueattack: "true",
    true: "true",
    duration: "duration",
    multi: "multi",
    penetrate: "penetrate",
    kideflection: "kiDeflection",
    kideflect: "kiDeflection",
    deflection: "kiDeflection"
  };
  return map[normalized] ?? null;
}

function normalizeQualityText(value) {
  return String(value ?? "").toLowerCase().replace(/\+/g, " ").replace(/\s+/g, " ").trim();
}

function ratingFor(source, rawName) {
  const escaped = normalizeQualityText(rawName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*,?\\s*");
  const pattern = new RegExp(`(?:^|[;,\\s])${escaped}\\s*(?:\\((\\d+)\\)|x\\s*(\\d+)|(\\d+))?`, "gi");
  let total = 0;
  let match;
  while ((match = pattern.exec(source))) total += Number(match[1] ?? match[2] ?? match[3] ?? 1);
  return total;
}
