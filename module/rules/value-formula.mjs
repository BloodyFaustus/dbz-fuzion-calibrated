import { DBZF_SKILL_CHARACTERISTICS, toNumber } from "./calculations.mjs";

// Effect values can be written as a formula that references the owner's own stats, so a technique
// can say "add 15% of Evasion to damage" instead of a hardcoded number.
//
// Supported terms, combined with + and -:
//   15%(evasion)   15% of the Evasion skill total
//   15% evasion    same thing (parentheses optional)
//   evasion        the full Evasion skill total
//   evasion.rank   Evasion effective rank only (no characteristic)
//   physical       Physical effective characteristic
//   25%            25% of effective Battle Power (matches how Ki costs read a bare %)
//   12             a plain number
//
// References: the six skills (fighting, power, weapon, evasion, mind, body), the four
// characteristics (physical, mental, combat, movement), custom skills by name, and the
// resources hits, hits.max, tempHits, tempHits.max, ki, ki.max, battlePower, defense, powerUp.

const RESOURCE_ALIASES = {
  // "hits" is CURRENT HITs. "hitsTotal" / "maxHits" is the maximum, which is what a heal-for-a-
  // percentage-of-total effect (High Tension, Saiyan Rage) needs to read.
  "hits": ["resources", "hits", "value"],
  "hits.value": ["resources", "hits", "value"],
  "currenthits": ["resources", "hits", "value"],
  "hits.max": ["resources", "hits", "max"],
  "hits.total": ["resources", "hits", "max"],
  "hitstotal": ["resources", "hits", "max"],
  "maxhits": ["resources", "hits", "max"],
  "temphits": ["resources", "tempHits", "value"],
  "temphits.value": ["resources", "tempHits", "value"],
  "temphits.max": ["resources", "tempHits", "max"],
  "temphits.total": ["resources", "tempHits", "max"],
  "maxtemphits": ["resources", "tempHits", "max"],
  // Current (charged) Ki, so an effect can scale off a Ki spike rather than capacity.
  "ki": ["resources", "ki", "value"],
  "ki.value": ["resources", "ki", "value"],
  "currentki": ["resources", "ki", "value"],
  "chargedki": ["resources", "ki", "charged"],
  "ki.charged": ["resources", "ki", "charged"],
  "ki.spent": ["resources", "ki", "spent"],
  "kispent": ["resources", "ki", "spent"],
  "ki.max": ["resources", "ki", "max"],
  "ki.total": ["resources", "ki", "max"],
  "maxki": ["resources", "ki", "max"],
  "battlepower": ["resources", "battlePower", "effective"],
  "bp": ["resources", "battlePower", "effective"],
  "bp.base": ["resources", "battlePower", "value"],
  "battlepower.base": ["resources", "battlePower", "value"],
  "powerup.percent": ["resources", "powerUp", "percent"],
  "defense": ["resources", "defense", "value"],
  "powerup": ["resources", "powerUp", "value"],
  "exp": ["experience", "total"],
  "experience": ["experience", "total"],
  "zeni": ["finances", "zeni"]
};

function normalizeToken(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

// Skill totals are computed from primitives (effective rank + linked characteristic) rather than
// read from skill.total, so a formula resolves correctly no matter which derive phase it runs in.
function skillTotal(system, key) {
  const skill = system?.skills?.[key];
  if (!skill) return null;
  const characteristicKey = DBZF_SKILL_CHARACTERISTICS[key];
  const characteristic = toNumber(system?.characteristics?.[characteristicKey]?.effective);
  return toNumber(skill.effectiveRank) + characteristic;
}

function customSkillTotal(system, token) {
  for (const customSkill of system?.customSkills ?? []) {
    if (!customSkill?.name) continue;
    if (normalizeToken(customSkill.name) !== token) continue;
    const linked = customSkill.linkedCharacteristic;
    const linkedValue = linked === "manual"
      ? toNumber(customSkill.value)
      : toNumber(system?.characteristics?.[linked]?.effective);
    return toNumber(customSkill.effectiveRank ?? customSkill.rank) + linkedValue;
  }
  return null;
}

// Resolve a bare reference (no percent) to a number, or null when it is not a known reference.
export function resolveReference(rawReference, system) {
  const token = normalizeToken(rawReference);
  if (!token) return null;

  const rankMatch = /^([a-z]+)\.(rank|effectiverank)$/.exec(token);
  if (rankMatch && system?.skills?.[rankMatch[1]]) return toNumber(system.skills[rankMatch[1]].effectiveRank);

  if (system?.skills?.[token]) return skillTotal(system, token);
  if (system?.characteristics?.[token]) return toNumber(system.characteristics[token].effective);

  const baseMatch = /^([a-z]+)\.base$/.exec(token);
  if (baseMatch && system?.characteristics?.[baseMatch[1]]) return toNumber(system.characteristics[baseMatch[1]].base);

  const path = RESOURCE_ALIASES[token];
  if (path) return toNumber(path.reduce((node, key) => node?.[key], system));

  return customSkillTotal(system, token);
}

export function resolveValueFormula(rawFormula, system, { warn = false } = {}) {
  const raw = String(rawFormula ?? "").trim();
  if (!raw) return null;

  // Split on + / - while keeping the sign of each term.
  const terms = raw.replace(/\s+/g, "").match(/[+-]?[^+-]+/g) ?? [];
  let total = 0;
  const invalid = [];

  for (const term of terms) {
    const signed = /^[+-]/.test(term);
    const sign = term.startsWith("-") ? -1 : 1;
    const body = signed ? term.slice(1) : term;
    if (!body) continue;

    // percent-of-reference, e.g. 15%(evasion) or 15%evasion
    const percentOf = /^(\d+(?:\.\d+)?)%\(?([a-z][a-z0-9._]*)\)?$/i.exec(body);
    if (percentOf) {
      const reference = resolveReference(percentOf[2], system);
      if (reference === null) { invalid.push(body); continue; }
      total += sign * (toNumber(percentOf[1]) / 100) * reference;
      continue;
    }

    // bare percent -> percent of effective Battle Power
    if (/^\d+(\.\d+)?%$/.test(body)) {
      total += sign * (toNumber(body.slice(0, -1)) / 100) * toNumber(system?.resources?.battlePower?.effective);
      continue;
    }

    // plain number
    if (/^\d+(\.\d+)?$/.test(body)) {
      total += sign * toNumber(body);
      continue;
    }

    // bare reference
    const reference = resolveReference(body, system);
    if (reference === null) { invalid.push(body); continue; }
    total += sign * reference;
  }

  if (invalid.length && warn) {
    const message = `DBZ Fuzion | Unknown value formula term(s): ${invalid.join(", ")}`;
    if (globalThis.ui?.notifications) ui.notifications.warn(message);
    else console.warn(message);
  }

  return Math.round(total);
}

// The number an effect row should apply: its formula when one is set, otherwise its plain value.
export function effectValue(effect, system) {
  const resolved = resolveValueFormula(effect?.valueFormula, system);
  return resolved === null ? toNumber(effect?.value) : resolved;
}
