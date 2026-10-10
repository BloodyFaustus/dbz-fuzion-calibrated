import { addCondition } from "./status-effects.mjs";
import { needsGmRelay, requestGmAction } from "./gm-relay.mjs";
import { parseQualityRatings } from "./qualities.mjs";

export { parseQualityRatings } from "./qualities.mjs";

export function homingAttackBonusDice(qualitiesText, { attackType, defenseType = "evasion", embeddedQualities = [] } = {}) {
  if (attackType !== "power" || defenseType === "deflect") return 0;
  return parseQualityRatings(qualitiesText, embeddedQualities).homing * 3;
}

export async function applyDamageToTarget(targetActor, rawDamage, options = {}) {
  // A player can only write to actors they own, so damage aimed at anyone else (an enemy, or an
  // ally they do not own) is applied by the connected GM's client instead of failing outright.
  if (needsGmRelay(targetActor)) {
    const response = await requestGmAction("applyDamage", {
      targetUuid: targetActor.uuid,
      rawDamage: Number(rawDamage || 0),
      options: relayableDamageOptions(options)
    });
    return response.ok ? response.result : null;
  }
  const qualityRatings = options.qualityRatings ?? parseQualityRatings(options.qualities ?? "", options.embeddedQualities ?? []);
  if (qualityRatings.multi > 0 && options.ignoreMulti !== true) {
    return applyMultiDamageToTarget(targetActor, rawDamage, { ...options, qualityRatings });
  }
  // Control techniques (Sealing, Immobilization and friends) land their condition without dealing
  // damage. Everything is still computed so the chat card can show what WOULD have landed, but no
  // HITs, Temp HITs or armor are touched.
  // Control qualities are pure control: a Sealing/Immobilization attack lands its condition and
  // deals no damage. `forceDamage` is the escape hatch for a technique that is meant to do both.
  const controlOnly = (Number(qualityRatings.sealing || 0) > 0 || Number(qualityRatings.immobilization || 0) > 0)
    && options.forceDamage !== true;
  // forceDamage is the single override for every automatic zeroing path.
  const effectsOnly = options.forceDamage === true
    ? options.effectsOnly === true
    : (options.effectsOnly === true || options.zeroDamage === true || controlOnly);
  const deadly = Number(options.deadly ?? qualityRatings.deadly);
  const defense = Number(targetActor.system.resources.defense.value || 0);
  const adjustedDefense = Math.max(0, defense - (deadly * 10));
  const areaAdjustedRaw = options.areaSecondary ? Math.floor(Number(rawDamage || 0) / 2) : Number(rawDamage || 0);
  const kiDeflection = options.kiDeflection ?? null;
  const blockedDamage = Math.max(0, Number(kiDeflection?.blocked ?? 0));
  const reducedRaw = Math.max(0, areaAdjustedRaw - blockedDamage);
  // Defense reduces the hit BEFORE it reaches any layer, so Temp HITs, armor, and current HITs all
  // sit behind Defense. An active armor's Defense bonus is part of Defense here; once that armor is
  // destroyed (its HP reaches 0) the bonus is dropped from Defense for later hits (via re-derive).
  const afterDefense = Math.max(0, Math.round(reducedRaw - adjustedDefense));
  const tempBefore = Number(targetActor.system.resources.tempHits.value || 0);
  const hitsBefore = Number(targetActor.system.resources.hits.value || 0);

  // Post-defense damage then flows Temp HITs -> Armor -> current HITs.
  const bypassTempHits = options.bypassTempHits === true || (qualityRatings.penetrate > 0 && options.barrierBypassed === true);
  const tempDamage = bypassTempHits ? 0 : Math.min(tempBefore, afterDefense);
  const afterTemp = afterDefense - tempDamage;
  const tempAfter = tempBefore - tempDamage;

  const armorResult = effectsOnly ? { absorbed: 0, destroyed: [], hits: [] } : await absorbArmorHits(targetActor, afterTemp);
  const afterArmor = Math.max(0, afterTemp - armorResult.absorbed);

  const actorHitDamage = effectsOnly ? 0 : afterArmor;
  const hitsAfter = hitsBefore - actorHitDamage;

  // Total damage that got past Defense (Temp + armor + current HITs). Used for conditions/breaks.
  const effectiveDamage = effectsOnly ? 0 : afterDefense;
  const conditionsApplied = [];

  if (!effectsOnly) {
    await targetActor.update({
      "system.resources.tempHits.value": tempAfter,
      "system.resources.hits.value": hitsAfter
    });
    await breakConditionsFromDamage(targetActor, effectiveDamage);
  }

  // In effects-only mode the conditions apply on their own merit, with no damage gate.
  if ((effectsOnly || effectiveDamage > 0) && options.skipConditions !== true) {
    if (qualityRatings.burn) {
      conditionsApplied.push(await addCondition(targetActor, {
        key: "burn",
        sourceName: options.sourceName || "Attack",
        rating: qualityRatings.burn,
        value: Math.floor(Number(rawDamage || 0) / 2),
        remainingTicks: qualityRatings.burn,
        saveSkill: "mind",
        saveDC: qualityRatings.burn * 10
      }));
    }
    if (qualityRatings.slow) {
      conditionsApplied.push(await addCondition(targetActor, {
        key: "slow",
        sourceName: options.sourceName || "Attack",
        rating: qualityRatings.slow,
        remainingTicks: qualityRatings.slow,
        saveSkill: "body",
        saveDC: qualityRatings.slow
      }));
    }
    if (qualityRatings.immobilization) {
      conditionsApplied.push(await addCondition(targetActor, {
        key: "immobilized",
        sourceName: options.sourceName || "Attack",
        rating: qualityRatings.immobilization,
        saveSkill: "body",
        saveDC: qualityRatings.immobilization * 10,
        remainingTicks: qualityRatings.immobilization,
        breakDamageThreshold: qualityRatings.immobilization * 20
      }));
    }
    if (qualityRatings.sealing) {
      conditionsApplied.push(await addCondition(targetActor, {
        key: "sealed",
        sourceName: options.sourceName || "Attack",
        rating: qualityRatings.sealing,
        saveSkill: "mind",
        saveDC: qualityRatings.sealing * 10,
        remainingTicks: qualityRatings.sealing,
        breakDamageThreshold: qualityRatings.sealing * 20
      }));
    }
  }

  return {
    targetName: targetActor.name,
    effectsOnly,
    zeroDamageReason: !effectsOnly ? "" : (controlOnly ? "control" : (options.zeroDamage === true ? "technique" : "manual")),
    rawDamage: effectsOnly ? 0 : Math.round(reducedRaw),
    originalRawDamage: Math.round(Number(rawDamage || 0)),
    preDeflectionRawDamage: Math.round(areaAdjustedRaw),
    kiDeflection,
    defense,
    deadly,
    adjustedDefense,
    effectiveDamage,
    armor: armorResult,
    actorHitDamage,
    tempHitsBefore: tempBefore,
    tempHitsAfter: effectsOnly ? tempBefore : tempAfter,
    hitsBefore,
    hitsAfter: effectsOnly ? hitsBefore : hitsAfter,
    conditionsApplied
  };
}

async function absorbArmorHits(actor, incomingToArmor) {
  let remaining = Math.max(0, Number(incomingToArmor || 0));
  const hits = [];
  if (remaining <= 0) return { absorbed: 0, destroyed: [], hits };

  const armorItems = Array.from(actor.items ?? []).filter(item =>
    item.type === "armor"
    && item.system?.active === true
    && item.system?.destroyed !== true
    && Number(item.system?.bonusHits || 0) > 0
  );

  for (const armor of armorItems) {
    if (remaining <= 0) break;
    const before = Math.max(0, Number(armor.system.currentHits || armor.system.bonusHits || 0));
    const absorbed = Math.min(before, remaining);
    const after = before - absorbed;
    remaining -= absorbed;
    const destroyed = after <= 0;
    await armor.update({
      "system.currentHits": after,
      "system.destroyed": destroyed,
      "system.active": destroyed ? false : armor.system.active
    });
    hits.push({ name: armor.name, before, after, absorbed, destroyed });
  }

  return {
    absorbed: hits.reduce((total, hit) => total + hit.absorbed, 0),
    destroyed: hits.filter(hit => hit.destroyed).map(hit => hit.name),
    hits
  };
}

async function applyMultiDamageToTarget(targetActor, rawDamage, options = {}) {
  const rating = Number(options.qualityRatings?.multi || 0);
  const roll = await new Roll(`1d${rating + 1} - 1`).evaluate();
  const extraStrikes = Math.max(0, Number(roll.total || 0));
  const hits = [];
  let totalEffectiveDamage = 0;

  for (let index = 0; index <= extraStrikes; index++) {
    const strikeRaw = Math.floor(Number(rawDamage || 0) / (2 ** index));
    const result = await applyDamageToTarget(targetActor, strikeRaw, { ...options, ignoreMulti: true, skipConditions: true, sourceName: `${options.sourceName || "Attack"} Strike ${index + 1}` });
    hits.push(result);
    totalEffectiveDamage += Number(result.effectiveDamage || 0);
  }

  const first = hits[0] ?? {};
  const last = hits.at(-1) ?? {};
  const conditionsApplied = [];
  if (totalEffectiveDamage > 0 && options.skipConditions !== true) {
    conditionsApplied.push(...await applyAttackConditions(targetActor, options.qualityRatings ?? {}, rawDamage, options.sourceName || "Attack"));
  }

  return {
    ...last,
    targetName: targetActor.name,
    rawDamage: Math.round(Number(rawDamage || 0)),
    // `last` carries the FINAL strike's halved raw as originalRawDamage, which made the card report
    // a nonsense "original" for any Multi attack. The original is the damage the attack rolled.
    originalRawDamage: Math.round(Number(rawDamage || 0)),
    effectiveDamage: totalEffectiveDamage,
    tempHitsBefore: first.tempHitsBefore ?? 0,
    hitsBefore: first.hitsBefore ?? 0,
    multi: {
      rating,
      // ADDITIONAL hits beyond the first, which is what the roll actually produces. Reporting the
      // total made a roll of 0 read as "1 hits" and looked broken.
      additionalHits: extraStrikes,
      extraStrikes,
      formula: roll.formula,
      totalHits: hits.length,
      // Effective damage of the opening strike vs the whole Multi chain, so the card can show both.
      baseEffectiveDamage: Number(first.effectiveDamage || 0),
      totalEffectiveDamage,
      hits
    },
    conditionsApplied
  };
}

async function applyAttackConditions(targetActor, qualityRatings, rawDamage, sourceName) {
  const conditionsApplied = [];
  if (qualityRatings.burn) {
    conditionsApplied.push(await addCondition(targetActor, {
      key: "burn",
      sourceName,
      rating: qualityRatings.burn,
      value: Math.floor(Number(rawDamage || 0) / 2),
      remainingTicks: qualityRatings.burn,
      saveSkill: "mind",
      saveDC: qualityRatings.burn * 10
    }));
  }
  if (qualityRatings.slow) {
    conditionsApplied.push(await addCondition(targetActor, {
      key: "slow",
      sourceName,
      rating: qualityRatings.slow,
      remainingTicks: qualityRatings.slow,
      saveSkill: "body",
      saveDC: qualityRatings.slow
    }));
  }
  if (qualityRatings.immobilization) {
    conditionsApplied.push(await addCondition(targetActor, {
      key: "immobilized",
      sourceName,
      rating: qualityRatings.immobilization,
      saveSkill: "body",
      saveDC: qualityRatings.immobilization * 10,
      remainingTicks: qualityRatings.immobilization,
      breakDamageThreshold: qualityRatings.immobilization * 20
    }));
  }
  if (qualityRatings.sealing) {
    conditionsApplied.push(await addCondition(targetActor, {
      key: "sealed",
      sourceName,
      rating: qualityRatings.sealing,
      saveSkill: "mind",
      saveDC: qualityRatings.sealing * 10,
      remainingTicks: qualityRatings.sealing,
      breakDamageThreshold: qualityRatings.sealing * 20
    }));
  }
  return conditionsApplied;
}

async function breakConditionsFromDamage(actor, effectiveDamage) {
  if (effectiveDamage <= 0) return;
  const conditions = actor.system.combatState?.activeConditions ?? [];
  const remaining = conditions.filter(condition => {
    const threshold = Number(condition.breakDamageThreshold || 0);
    return !threshold || effectiveDamage < threshold;
  });
  if (remaining.length !== conditions.length) await actor.update({ "system.combatState.activeConditions": remaining });
}

const RELAYED_DAMAGE_FLAGS = ["areaSecondary", "barrierBypassed", "bypassTempHits", "effectsOnly",
  "forceDamage", "zeroDamage", "ignoreMulti", "skipConditions", "skipKiDeflection"];

export function relayableDamageOptions(options = {}) {
  const relayed = { sourceName: String(options.sourceName ?? "") };
  for (const flag of RELAYED_DAMAGE_FLAGS) if (options[flag] === true) relayed[flag] = true;
  if (options.qualities) relayed.qualities = String(options.qualities);
  if (options.qualityRatings) relayed.qualityRatings = foundry.utils.deepClone(options.qualityRatings);
  if (options.embeddedQualities) relayed.embeddedQualities = foundry.utils.deepClone(options.embeddedQualities);
  if (options.deadly !== undefined) relayed.deadly = Number(options.deadly || 0);
  if (options.kiDeflection) relayed.kiDeflection = {
    rating: Number(options.kiDeflection.rating || 0),
    blocked: Math.max(0, Number(options.kiDeflection.blocked || 0)),
    formula: String(options.kiDeflection.formula ?? ""),
    result: String(options.kiDeflection.result ?? "")
  };
  return relayed;
}
