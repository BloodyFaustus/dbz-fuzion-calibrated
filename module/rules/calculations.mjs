import { applyTransformation } from "./transformations.mjs";
import { highestConditionRating } from "./status-effects.mjs";
import { calculatePowerCalibration } from "./power-calibration.mjs";
import { parseKiCost } from "./ki-cost-parser.mjs";
import { effectValue, resolveValueFormula } from "./value-formula.mjs";

export const DBZF_SKILL_CHARACTERISTICS = {
  fighting: "combat",
  power: "combat",
  weapon: "combat",
  evasion: "combat",
  mind: "mental",
  body: "physical"
};

export function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function calculateSkillTotal(rank, characteristicValue) {
  return toNumber(rank) + toNumber(characteristicValue);
}

export function calculateDefense(physicalEffective, bodyEffectiveRank) {
  return (toNumber(physicalEffective) * 5) + toNumber(bodyEffectiveRank);
}

export function calculateTempHitsMax(mentalEffective) {
  return toNumber(mentalEffective) * 10;
}

export function calculateHitsMax(physicalEffective, expTotal, bodyEffectiveRank) {
  return (toNumber(physicalEffective) * 20) + (toNumber(expTotal) * 3) + 100 + toNumber(bodyEffectiveRank);
}

export function calculateSuggestedBattlePower(physicalEffective, mentalEffective) {
  return (toNumber(physicalEffective) + toNumber(mentalEffective)) * 10;
}

export function calculatePowerUp(basePhysical, baseMental, battlePowerEffective) {
  return Math.round(((toNumber(basePhysical) + toNumber(baseMental)) / 100) * toNumber(battlePowerEffective));
}

const DBZF_CHARACTERISTIC_KEYS = ["physical", "mental", "combat", "movement"];

export function derivedScalingSettings(system) {
  const scaling = system?.derivedScaling ?? {};
  const pick = (value, fallback) => (DBZF_CHARACTERISTIC_KEYS.includes(value) ? value : fallback);
  return {
    hitsCharacteristic: pick(scaling.hitsCharacteristic, "physical"),
    defenseCharacteristic: pick(scaling.defenseCharacteristic, "physical"),
    tempHitsCharacteristic: pick(scaling.tempHitsCharacteristic, "mental"),
    source: scaling.source === "effective" ? "effective" : "base"
  };
}

// Add active "Raise Characteristic" reaction boosts to the effective characteristic values.
function applyTemporaryCharacteristics(system) {
  const temps = system?.combatState?.temporaryCharacteristics ?? [];
  for (const temp of temps) {
    if (!temp || toNumber(temp.remainingPhases) <= 0) continue;
    const characteristic = system.characteristics?.[temp.characteristic];
    if (characteristic) characteristic.effective = toNumber(characteristic.effective) + toNumber(temp.amount);
  }
}

export function calculateActorDerivedData(system, actor = system.parent) {
  const characteristics = system.characteristics ?? {};

  for (const characteristic of Object.values(characteristics)) {
    if (!characteristic || typeof characteristic !== "object") continue;
    characteristic.effective = toNumber(characteristic.base);
  }

  const skills = system.skills ?? {};
  for (const skill of Object.values(skills)) {
    if (!skill || typeof skill !== "object") continue;
    skill.effectiveRank = toNumber(skill.rank);
  }

  // Seed each custom skill's effective rank from its base rank BEFORE owned-item effects run,
  // so effects targeting customSkills.*.effectiveRank can modify it (mirrors named skills).
  const customSkillsSeed = Array.isArray(system.customSkills) ? system.customSkills : [];
  for (const customSkill of customSkillsSeed) {
    if (!customSkill || typeof customSkill !== "object") continue;
    customSkill.effectiveRank = toNumber(customSkill.rank);
  }

  const resources = system.resources ?? {};
  resources.battlePower ??= {};
  resources.battlePower.effective = toNumber(resources.battlePower.value);
  resources.ki ??= {};
  resources.ki.value = Math.max(0, toNumber(resources.ki.value));
  resources.ki.charged = resources.ki.value;

  const transformation = applyTransformation(system);
  applyOwnedItemEffects(system, "afterTransformation", actor);
  applyTemporaryCharacteristics(system);

  const physical = toNumber(characteristics.physical?.effective);
  const mental = toNumber(characteristics.mental?.effective);
  const slowRating = highestConditionRating(actor, "slow");
  if (slowRating > 0 && characteristics.movement) {
    characteristics.movement.effective = Math.max(1, toNumber(characteristics.movement.effective) - slowRating);
  }
  for (const [skillKey, skill] of Object.entries(skills)) {
    if (!skill || typeof skill !== "object") continue;
    const characteristicKey = DBZF_SKILL_CHARACTERISTICS[skillKey];
    const value = toNumber(characteristics[characteristicKey]?.effective);
    skill.value = value;
    skill.total = calculateSkillTotal(skill.effectiveRank, skill.value);
  }

  const customSkills = Array.isArray(system.customSkills) ? system.customSkills : [];
  for (const customSkill of customSkills) {
    if (!customSkill || typeof customSkill !== "object") continue;
    const linked = customSkill.linkedCharacteristic;
    const linkedValue = linked === "manual"
      ? toNumber(customSkill.value)
      : toNumber(characteristics[linked]?.effective);
    customSkill.value = linkedValue;
    const effectiveRank = Number.isFinite(Number(customSkill.effectiveRank)) ? toNumber(customSkill.effectiveRank) : toNumber(customSkill.rank);
    customSkill.effectiveRank = effectiveRank;
    customSkill.total = calculateSkillTotal(effectiveRank, customSkill.value);
  }

  const bodyRank = toNumber(skills.body?.effectiveRank);
  const expTotal = toNumber(system.experience?.total);
  const basePhysical = toNumber(characteristics.physical?.base);
  const baseMental = toNumber(characteristics.mental?.base);
  const baseBodyRank = toNumber(skills.body?.rank);

  // Derived stats (HITs, Defense, Temp HITs) read a configurable characteristic and either the
  // base or effective value. Actual transformations keep their own hit/defense mode; in base form
  // the actor's derivedScaling.source decides (default "base", so boosts/effects that raise
  // effective ranks or characteristics do not inflate these derived stats).
  const scaling = derivedScalingSettings(system);
  const baseChar = key => toNumber(characteristics[key]?.base);
  const effChar = key => toNumber(characteristics[key]?.effective);
  const isBaseForm = (system.transformation?.selected ?? "base") === "base";
  const hitDefMode = isBaseForm
    ? (scaling.source === "effective" ? "dynamic" : "base")
    : transformation.hitDefenseMode;

  const baseDefense = calculateDefense(baseChar(scaling.defenseCharacteristic), baseBodyRank);
  const dynamicDefense = calculateDefense(effChar(scaling.defenseCharacteristic), bodyRank);
  const baseHits = calculateHitsMax(baseChar(scaling.hitsCharacteristic), expTotal, baseBodyRank);
  const dynamicHits = calculateHitsMax(effChar(scaling.hitsCharacteristic), expTotal, bodyRank);
  const baseTempHits = calculateTempHitsMax(baseChar(scaling.tempHitsCharacteristic));
  const dynamicTempHits = calculateTempHitsMax(effChar(scaling.tempHitsCharacteristic));

  resources.defense ??= {};
  resources.tempHits ??= {};
  resources.hits ??= {};
  if (hitDefMode === "base") {
    resources.defense.value = baseDefense;
    resources.hits.max = baseHits;
    resources.tempHits.max = baseTempHits;
  } else if (hitDefMode === "direct") {
    resources.defense.value = Math.round(baseDefense * toNumber(transformation.direct?.defenseMultiplier, 1));
    resources.hits.max = Math.round(baseHits * toNumber(transformation.direct?.hitsMultiplier, 1));
    resources.tempHits.max = baseTempHits;
  } else {
    resources.defense.value = dynamicDefense;
    resources.hits.max = dynamicHits;
    resources.tempHits.max = dynamicTempHits;
  }
  const armorStats = activeArmorStats(actor);
  // Active armor adds its Defense bonus. Its HIT pool (bonusHits/currentHits) is a SEPARATE
  // absorbing layer handled in damage.mjs (Temp -> Armor -> current HITs), so it is intentionally
  // NOT added to the character's max HITs here (that would double-count the armor's protection).
  resources.defense.value += armorStats.defenseBonus;

  system.powerScaling ??= {};
  const calibration = calculatePowerCalibration({
    basePhysical,
    baseMental,
    experienceTotal: expTotal,
    currentBattlePower: resources.battlePower.effective,
    powerScaling: system.powerScaling
  });
  Object.assign(system.powerScaling, calibration);
  resources.battlePower.suggested = calibration.suggestedBattlePower;
  resources.ki.max = toNumber(resources.battlePower.effective);
  // Charged Ki can never exceed max Ki. Clamp here so a transformation/boost that lowers
  // effective Battle Power (e.g. High Tension, Reduction Form 1) also caps spendable Ki,
  // instead of leaving the old, now over-cap value usable.
  resources.ki.value = Math.max(0, Math.min(toNumber(resources.ki.value), toNumber(resources.ki.max)));
  resources.ki.charged = resources.ki.value;

  resources.powerUp ??= {};
  // Power Up % is the fixed Character-Creation baseline (baseCaC). Raising base Physical/Mental
  // afterward does NOT change it; only techniques/traits/bonuses (effects targeting
  // resources.powerUp.percent, applied below) do. The value is computed after those effects.
  resources.powerUp.percent = toNumber(resources.powerUp.baseCaC);

  applyOwnedItemEffects(system, "afterResources", actor);
  resources.powerUp.value = Math.round((toNumber(resources.powerUp.percent) / 100) * toNumber(resources.battlePower.effective));
  resources.ki.max = toNumber(resources.battlePower.effective);
  // Max Ki is derived from effective Battle Power, so an effect targeting it has to land AFTER
  // that derivation or it gets overwritten. Previously "resources.ki.max" was silently ignored,
  // which is why a Boost raising Max Ki left the character charging to their old cap.
  applyOwnedItemEffects(system, "afterKiMax", actor);
  resources.ki.max = Math.max(0, toNumber(resources.ki.max));
  // Charged Ki can never exceed max Ki. Clamp here so a transformation/boost that lowers
  // effective Battle Power (e.g. High Tension, Reduction Form 1) also caps spendable Ki,
  // instead of leaving the old, now over-cap value usable.
  resources.ki.value = Math.max(0, Math.min(toNumber(resources.ki.value), toNumber(resources.ki.max)));
  resources.ki.charged = resources.ki.value;

  // Resolve owned-item costs (%-of-BP and raw) against the now-known effective Battle
  // Power. This must happen here, not in Item#prepareDerivedData, because an item's
  // prepare runs during prepareEmbeddedDocuments — BEFORE the actor's effective BP is
  // computed — so item-side resolution would read a stale/unready BP. Guard against the
  // clone path used by _preUpdate (maxHitsForSelection) so we never mutate real items
  // while deriving a throwaway clone.
  if (actor && system === actor.system) resolveOwnedItemCosts(actor, resources.battlePower.effective);
}

function resolveOwnedItemCosts(actor, battlePowerEffective) {
  const bp = toNumber(battlePowerEffective);
  for (const item of actor.items ?? []) {
    const sys = item.system;
    if (!sys) continue;
    if (item.type === "technique" && String(sys.kiCostRaw ?? "").trim()) {
      sys.kiCostResolved = parseKiCost(sys.kiCostRaw, bp, { warn: false });
    }
    if (item.type === "boost" || item.type === "trait") {
      sys.costResolved = parseKiCost(sys.cost ?? "", bp, { warn: false });
    }
    for (const effect of sys.effects ?? []) {
      effect.kiCostResolved = parseKiCost(effect.kiCostRaw ?? "", bp, { warn: false });
      // Display-only: what the value formula currently works out to on this actor.
      effect.valueResolved = resolveValueFormula(effect.valueFormula, actor.system) ?? toNumber(effect.value);
    }
  }
}

function activeArmorStats(actor) {
  const stats = { defenseBonus: 0, bonusHits: 0 };
  for (const item of actor?.items ?? []) {
    if (item.type !== "armor") continue;
    if (!item.system?.active) continue;
    if (item.system?.destroyed) continue;
    stats.defenseBonus += toNumber(item.system.defenseBonus);
    stats.bonusHits += toNumber(item.system.bonusHits);
  }
  return stats;
}

export function applyOwnedItemEffects(system, phase, actor = system.parent) {
  const items = Array.from(actor?.items ?? []);
  for (const item of items) {
    if (!item.system?.active) continue;
    if (item.type === "armor" && item.system?.destroyed) continue;
    for (const effect of item.system.effects ?? []) {
      if (!effect.enabled) continue;
      applyEffect(system, effect, phase);
    }
  }
}

function applyEffect(system, effect, phase) {
  const target = effect.target;
  // Resolve any stat-referencing formula (e.g. "15%(evasion)") against the live system.
  const value = effectValue(effect, system);
  const applyNumericMode = (object, property) => applyNumericModeValue(object, property, effect, value);
  if (phase === "afterTransformation") {
    if (target === "characteristics.all.effective") {
      for (const key of Object.keys(system.characteristics ?? {})) applyNumericMode(system.characteristics[key], "effective");
      return;
    }
    if (target === "skills.all.effectiveRank") {
      for (const key of Object.keys(system.skills ?? {})) applyNumericMode(system.skills[key], "effectiveRank");
      return;
    }
    if (target === "customSkills.all.effectiveRank") {
      for (const customSkill of system.customSkills ?? []) applyNumericMode(customSkill, "effectiveRank");
      return;
    }
    if (target.startsWith("customSkills.") && target.endsWith(".effectiveRank")) {
      const index = Number(target.split(".")[1]);
      if (Number.isInteger(index)) applyNumericMode(system.customSkills?.[index], "effectiveRank");
      return;
    }
    if (target.startsWith("characteristics.") && target.endsWith(".effective")) {
      const key = target.split(".")[1];
      applyNumericMode(system.characteristics?.[key], "effective");
    }
    if (target.startsWith("skills.") && target.endsWith(".effectiveRank")) {
      const key = target.split(".")[1];
      applyNumericMode(system.skills?.[key], "effectiveRank");
    }
  }

  if (phase === "afterResources") {
    if (target === "resources.hits.max") applyNumericMode(system.resources?.hits, "max");
    if (target === "resources.hits.value") return;
    if (target === "resources.tempHits.max") applyNumericMode(system.resources?.tempHits, "max");
    if (target === "resources.tempHits.value") return;
    if (target === "resources.defense.value") applyNumericMode(system.resources?.defense, "value");
    if (target === "resources.battlePower.suggested") applyNumericMode(system.resources?.battlePower, "suggested");
    if (target === "resources.battlePower.value") applyNumericMode(system.resources?.battlePower, "value");
    if (target === "resources.battlePower.effective") applyNumericMode(system.resources?.battlePower, "effective");
    if (target === "resources.ki.max") return;   // handled in the afterKiMax phase below
    if (target === "resources.ki.charged") return;
    // Techniques/traits/bonuses add to the Power Up % here; the value is recomputed from it after
    // this effects pass. (resources.powerUp.value is intentionally not a target anymore.)
    if (target === "resources.powerUp.percent") applyNumericMode(system.resources?.powerUp, "percent");
    if (target === "experience.total") applyNumericMode(system.experience, "total");
    if (target === "experience.unspent") applyNumericMode(system.experience, "unspent");
    if (target === "finances.zeni") applyNumericMode(system.finances, "zeni");
  }

  if (phase === "afterKiMax") {
    if (target === "resources.ki.max") applyNumericMode(system.resources?.ki, "max");
  }
}

function applyNumericModeValue(object, property, effect, value) {
  if (!object) return;
  const current = toNumber(object[property]);
  if (effect.mode === "multiply") object[property] = Math.round(current * value);
  else if (effect.mode === "override") object[property] = value;
  else if (effect.mode === "percent") object[property] = Math.round(current * (1 + (value / 100)));
  else object[property] = Math.round(current + value);
}
