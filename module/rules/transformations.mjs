export const DBZF_TRANSFORMATIONS = {
  base: { label: "Base", battlePower: 1, characteristics: {}, skills: {}, hitDefenseMode: "dynamic" },
  kaiokenx1: {
    label: "Kaioken x1", actionType: "reaction", duration: "unspecified / GM", costText: "20% of HITs value",
    battlePower: 1.5, characteristics: { physical: 1.5 }, skills: { fighting: 1.5 }, hitDefenseMode: "base"
  },
  kaiokenx2: {
    label: "Kaioken x2", actionType: "reaction", duration: "1d10 phases", costText: "25% of HITs value (10% if entering from previous stage)",
    battlePower: 2, characteristics: { physical: 2, movement: 1.25 }, skills: { fighting: 2, power: 1.5, body: 1.25, mind: 0.75 }, hitDefenseMode: "base"
  },
  kaiokenx3: {
    label: "Kaioken x3", actionType: "reaction", duration: "1d8 phases", costText: "30% of HITs value (15% if entering from previous stage)",
    battlePower: 2.5, characteristics: { physical: 2.5, movement: 1.25 }, skills: { fighting: 2.5, power: 2, body: 1.25, mind: 0.75 }, hitDefenseMode: "base"
  },
  kaiokenx10: {
    label: "Kaioken x10", actionType: "reaction", duration: "1d6 phases", costText: "35% of HITs value (no discount)",
    battlePower: 6, characteristics: { physical: 4, movement: 1.5 }, skills: { fighting: 2.5, power: 2.5, body: 1.5, mind: 0.5 }, hitDefenseMode: "base"
  },
  kaiokenx20: {
    label: "Kaioken x20", actionType: "reaction", duration: "1d4 phases", costText: "40% of HITs value (no discount)",
    battlePower: 11, characteristics: { physical: 6, movement: 2 }, skills: { fighting: 3, power: 3, body: 2, mind: 0.25 }, hitDefenseMode: "base"
  },
  saiyanRage: {
    label: "Saiyan Rage", actionType: "reaction / trigger", duration: "1d6-1 rounds", costText: "Triggered by emotional outbreak or near death at 5% HITs or less",
    battlePower: 2, characteristics: { physical: 1.5 }, skills: { body: 1.5, fighting: 1.5, power: 1.5 }, hitDefenseMode: "base",
    // "HITs +50%" heals for half the HIT total on entry; it does NOT raise maximum HITs.
    onEnter: { healPercentOfMax: 50 },
    rulesText: "Entering Saiyan Rage restores HITs equal to 50% of the HIT total. Maximum HITs and Defense are unchanged."
  },
  oozaru: {
    label: "Oozaru", actionType: "special trigger", duration: "while exposed to Blutz waves / GM", costText: "Full Moon / Blutz waves",
    battlePower: 2.5, characteristics: { physical: 2, movement: 1.5 }, skills: { body: 2, fighting: 1.5, power: 1.5 }, hitDefenseMode: "direct",
    direct: { hitsMultiplier: 1.5, defenseMultiplier: 1.5 },
    rulesText: "Oozaru control and tail-targeting rules are noted for GM adjudication."
  },
  highTension: {
    label: "High Tension", actionType: "reaction", duration: "1d6-1 rounds", costText: "Earthling state; Physical & Fighting +100%; restores 50% HITs; Ki -50%",
    battlePower: 0.5, characteristics: { physical: 2 }, skills: { fighting: 2 }, hitDefenseMode: "base",
    onEnter: { healPercentOfMax: 50 },
    rulesText: "Earthling High Tension. Reaction at GM discretion or when reaching 0 HITs. Entering restores HITs equal to 50% of the HIT total. Does not recalculate HITs/Defense from the boosted Physical."
  },
  monsterForm: {
    label: "Monster Form", actionType: "action", duration: "1d6+1 rounds", costText: "Alien/Majin state; Ki +100%; HITs & Defense +100%; all Skills +50%",
    battlePower: 2, skills: { fighting: 1.5, power: 1.5, weapon: 1.5, evasion: 1.5, mind: 1.5, body: 1.5 }, hitDefenseMode: "direct",
    direct: { hitsMultiplier: 2, defenseMultiplier: 2 },
    rulesText: "Alien/Majin Monster Form. HITs and Defense are doubled directly rather than recalculated from Physical/Body. Can be combined with Reduction Forms and Kaioken."
  },
  enhancementState: {
    label: "Enhancement State", actionType: "action", duration: "1d6+1 phases", costText: "Sufinkusu-jin state; Ki +25%; Move +50%; Combat +25%; Fighting gains Multi 1 at no Ki cost",
    battlePower: 1.25, characteristics: { combat: 1.25, movement: 1.5 }, hitDefenseMode: "base",
    rulesText: "Sufinkusu-jin Enhancement State. Fighting checks gain Multi 1 (1d2-1) at no Ki cost. Can be upgraded through training."
  },
  superSaiyan1Mastered: {
    label: "Super Saiyan 1 / Mastered", actionType: "reaction", duration: "3d6 rounds, or until charged Ki reaches 0 if mastered", costText: "Reaction",
    battlePower: 6, characteristics: { physical: 1.5, mental: 1.5, combat: 1.5, movement: 1.5 }, skills: { fighting: 1.5, power: 1.5, weapon: 1.5, evasion: 1.5, mind: 1.5, body: 1.5 }, hitDefenseMode: "base"
  },
  superSaiyanGrade2: {
    label: "Super Saiyan Grade 2", actionType: "reaction", duration: "3d6-1 rounds", costText: "Reaction",
    battlePower: 7.25, characteristics: { physical: 1.625, mental: 1.625, combat: 1.625, movement: 0.75 }, skills: { fighting: 1.625, power: 1.625, weapon: 1.625, evasion: 0.75, mind: 1.625, body: 1.625 }, hitDefenseMode: "base"
  },
  superSaiyanGrade3: {
    label: "Super Saiyan Grade 3", actionType: "reaction", duration: "2d6 drop highest rounds", costText: "Reaction",
    battlePower: 8.5, characteristics: { physical: 1.75, mental: 1.75, combat: 1.75, movement: 0.5 }, skills: { fighting: 1.75, power: 1.75, weapon: 1.75, evasion: 0.5, mind: 1.75, body: 1.75 }, hitDefenseMode: "base"
  },
  superSaiyan2: {
    label: "Super Saiyan 2", actionType: "reaction", duration: "2d6 rounds or until charged Ki reaches 0", costText: "Reaction",
    battlePower: 11, characteristics: { physical: 2, mental: 2, combat: 2, movement: 2 }, skills: { fighting: 2, power: 2, weapon: 2, evasion: 2, mind: 2, body: 2 }, hitDefenseMode: "base"
  },
  superSaiyan3: {
    label: "Super Saiyan 3", actionType: "reaction", duration: "1d6-1 phases", costText: "Reaction; exiting SSJ3 drains charged Ki to 0",
    battlePower: 31, characteristics: { physical: 3, mental: 3, combat: 3, movement: 3 }, skills: { fighting: 3, power: 3, weapon: 3, evasion: 3, mind: 3, body: 3 }, hitDefenseMode: "base",
    onExit: { drainChargedKi: true }
  },
  giantNamekian: {
    label: "Giant Namekian", actionType: "action", duration: "until dropped; reaction to drop out", costText: "Action; Ki decreases by 50%; Namekian regeneration disabled",
    battlePower: 0.5, characteristics: { physical: 3 }, skills: { body: 2.5 }, hitDefenseMode: "direct",
    direct: { hitsMultiplier: 3, defenseMultiplier: 2.5 }, flags: { disablesNamekianRegeneration: true }
  },
  reductionForm1: {
    label: "Reduction Form 1", actionType: "action", duration: "transition to Form 2 takes 1d2 phases",
    battlePower: 0.5, characteristics: { physical: 0.75, mental: 0.75, combat: 0.75, movement: 0.75 }, skills: { fighting: 0.75, power: 0.75, weapon: 0.75, evasion: 0.75, mind: 0.75, body: 0.75 }, hitDefenseMode: "dynamic"
  },
  reductionForm2: {
    label: "Reduction Form 2", actionType: "action", duration: "transition to Form 3 takes 1d3 phases; reverting is an Action",
    battlePower: 1, characteristics: { physical: 1, mental: 1, combat: 1, movement: 1 }, skills: { fighting: 1, power: 1, weapon: 1, evasion: 1, mind: 1, body: 1 }, hitDefenseMode: "dynamic"
  },
  reductionForm3: {
    label: "Reduction Form 3", actionType: "action", duration: "transition to Form 4 takes 1d4 phases; reverting is an Action",
    battlePower: 3, characteristics: { physical: 1.25, mental: 1.25, combat: 1.25, movement: 1.25 }, skills: { fighting: 1.25, power: 1.25, weapon: 1.25, evasion: 1.25, mind: 1.25, body: 1.25 }, hitDefenseMode: "dynamic"
  },
  reductionForm4: {
    label: "Reduction Form 4", actionType: "action", duration: "transition to Form 5 takes 1d5 phases; reverting is an Action",
    battlePower: 4, characteristics: { physical: 1.5, mental: 1.5, combat: 1.5, movement: 1.5 }, skills: { fighting: 1.5, power: 1.5, weapon: 1.5, evasion: 1.5, mind: 1.5, body: 1.5 }, hitDefenseMode: "dynamic"
  },
  reductionForm5: {
    label: "Reduction Form 5", actionType: "action", duration: "reverting is an Action",
    battlePower: 5, characteristics: { physical: 1.75, mental: 1.75, combat: 1.75, movement: 1.75 }, skills: { fighting: 1.75, power: 1.75, weapon: 1.75, evasion: 1.75, mind: 1.75, body: 1.75 }, hitDefenseMode: "dynamic"
  }
};

export function getTransformation(key) {
  return DBZF_TRANSFORMATIONS[key] ?? DBZF_TRANSFORMATIONS.base;
}

export function getTransformationChoices() {
  return Object.entries(DBZF_TRANSFORMATIONS).map(([key, data]) => ({ key, label: data.label }));
}

export function applyTransformation(system) {
  const selected = system.transformation?.selected ?? "base";
  const transformation = getTransformation(selected);

  for (const [key, multiplier] of Object.entries(transformation.characteristics ?? {})) {
    const characteristic = system.characteristics?.[key];
    if (characteristic) characteristic.effective = roundEffective(toNumber(characteristic.base) * multiplier);
  }

  for (const [key, multiplier] of Object.entries(transformation.skills ?? {})) {
    const skill = system.skills?.[key];
    if (skill) skill.effectiveRank = roundEffective(toNumber(skill.rank) * multiplier);
  }

  const battlePower = system.resources?.battlePower;
  if (battlePower) battlePower.effective = roundEffective(toNumber(battlePower.value) * toNumber(transformation.battlePower, 1));

  return transformation;
}

export function roundEffective(value) {
  return Math.round(toNumber(value));
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
