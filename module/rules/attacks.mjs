import { applyDamageToTarget, homingAttackBonusDice, parseQualityRatings } from "./damage.mjs";
import { getChargedKi, spendKi } from "./ki.mjs";
import { clearPending, spendAction } from "./combat-state.mjs";
import { embeddedQualityKiCost, modifierCapacityForAttack, normalModifierCount, qualitySummary } from "./qualities.mjs";
import { evaluateDicePool } from "./dice-pool.mjs";
import { effectValue } from "./value-formula.mjs";

const ATTACK_CONFIG = {
  fighting: {
    label: "Fighting Attack",
    skillKey: "fighting",
    damageBase: actor => Number(actor.system.characteristics.physical.effective || 0) + Number(actor.system.skills.fighting.effectiveRank || 0),
    breakdown: actor => [
      `Physical effective: ${actor.system.characteristics.physical.effective}`,
      `Fighting effective rank: ${actor.system.skills.fighting.effectiveRank}`
    ]
  },
  power: {
    label: "Power Attack",
    skillKey: "power",
    damageBase: actor => Number(actor.system.characteristics.mental.effective || 0) + Number(actor.system.skills.power.effectiveRank || 0),
    breakdown: actor => [
      `Mental effective: ${actor.system.characteristics.mental.effective}`,
      `Power effective rank: ${actor.system.skills.power.effectiveRank}`
    ]
  },
  body: {
    label: "Body Attack",
    skillKey: "body",
    damageBase: actor => Number(actor.system.characteristics.physical.effective || 0) + Number(actor.system.skills.body.effectiveRank || 0),
    breakdown: actor => [
      `Physical effective: ${actor.system.characteristics.physical.effective}`,
      `Body effective rank: ${actor.system.skills.body.effectiveRank}`
    ]
  },
  weapon: {
    label: "Weapon Attack",
    skillKey: "weapon",
    damageBase: (actor, data) => Number(actor.system.characteristics.physical.effective || 0) + Number(actor.system.skills.weapon.effectiveRank || 0) + Number(data.weaponDamageDice || 0),
    breakdown: (actor, data) => [
      `Physical effective: ${actor.system.characteristics.physical.effective}`,
      `Weapon effective rank: ${actor.system.skills.weapon.effectiveRank}`,
      `Weapon damage dice: ${Number(data.weaponDamageDice || 0)}`,
    ]
  },
  evasion: {
    label: "Evasion Attack",
    skillKey: "evasion",
    damageBase: actor => Number(actor.system.characteristics.physical.effective || 0) + Number(actor.system.skills.evasion.effectiveRank || 0),
    breakdown: actor => [
      `Physical effective: ${actor.system.characteristics.physical.effective}`,
      `Evasion effective rank: ${actor.system.skills.evasion.effectiveRank}`
    ]
  },
  mind: {
    label: "Mind Attack",
    skillKey: "mind",
    damageBase: actor => Number(actor.system.characteristics.mental.effective || 0) + Number(actor.system.skills.mind.effectiveRank || 0),
    breakdown: actor => [
      `Mental effective: ${actor.system.characteristics.mental.effective}`,
      `Mind effective rank: ${actor.system.skills.mind.effectiveRank}`
    ]
  },
  custom: {
    label: "Custom Skill Attack",
    skillKey: "custom",
    damageBase: (actor, data) => Number(data.customSkill?.total || 0),
    breakdown: (actor, data) => [
      `Custom skill: ${data.customSkill?.name || "Custom Skill"}`,
      `Custom skill total: ${Number(data.customSkill?.total || 0)}`
    ]
  }
};

export async function openAttackDialog(actor, attackType) {
  const config = ATTACK_CONFIG[attackType];
  if (!config) {
    ui.notifications.warn(`Unknown attack type: ${attackType}`);
    return null;
  }

  const weapons = actor.items.filter(item => item.type === "weapon");
  const techniques = actor.items.filter(item => item.type === "technique" && techniqueMatchesAttackType(item, attackType));
  const customSkills = actor.system.customSkills ?? [];
  const content = buildAttackDialogContent(config, weapons, techniques, customSkills);

  const submit = async html => {
    const form = html instanceof HTMLFormElement ? html : html.querySelector("form");
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Weapon damage dice / name / qualities / embedded qualities are merged once in
    // rollAttack -> applyWeaponData. Do NOT merge them here too, or weapon qualities get
    // counted twice (e.g. "Rapid 1" becomes "Rapid 1; Rapid 1" -> parsed Rapid 2).
    if (attackType === "custom") data.customSkill = getCustomSkillData(actor, data.customSkillIndex);

    return rollAttack(actor, attackType, data);
  };

  if (foundry.applications?.api?.DialogV2) {
    return foundry.applications.api.DialogV2.confirm({
      window: { title: config.label },
      content,
      yes: { label: "Attack", callback: (event, button, dialog) => submit(dialog.element) },
      no: { label: "Cancel" }
    });
  }

  return new Promise(resolve => {
    new Dialog({
      title: config.label,
      content,
      buttons: {
        attack: {
          label: "Attack",
          callback: html => resolve(submit(html[0]))
        },
        cancel: {
          label: "Cancel",
          callback: () => resolve(null)
        }
      },
      default: "attack"
    }).render(true);
  });
}

export async function rollAttack(actor, attackType, data = {}) {
  const config = ATTACK_CONFIG[attackType];
  if (!config) {
    ui.notifications.warn(`Unknown attack type: ${attackType}`);
    return null;
  }
  if (attackType === "weapon" && !data.weaponId) {
    ui.notifications.warn("Select a weapon for a Weapon attack.");
    return null;
  }
  if (attackType === "weapon" && data.weaponId) data = applyWeaponData(actor, data);
  const technique = data.techniqueId ? actor.items.get(data.techniqueId) : null;
  if (technique && !techniqueMatchesAttackType(technique, attackType)) {
    ui.notifications.warn(`${technique.name} is a ${techniqueAttackTypeLabel(technique)} technique and cannot be used for a ${config.label}.`);
    return null;
  }
  data = applyTechniqueData(actor, data);
  const skill = attackType === "custom" ? getCustomSkillData(actor, data.customSkillIndex, data.customSkill) : actor.system.skills[config.skillKey];
  data.customSkill = attackType === "custom" ? skill : data.customSkill;
  if (!skill) {
    ui.notifications.warn("No valid attack skill selected.");
    return null;
  }
  const embeddedQualities = data.embeddedQualities ?? [];
  const qualityKiCost = embeddedQualityKiCost(embeddedQualities, actor.system.resources?.ki?.max ?? actor.system.resources?.battlePower?.effective ?? 0);
  const damageKiSpent = Math.max(0, Number(data.damageKiSpent ?? data.kiSpent ?? 0));
  const activationKiCost = Math.max(0, Number(data.activationKiCost || 0));
  const totalKiCost = damageKiSpent + activationKiCost + qualityKiCost;
  const availableKi = getChargedKi(actor);

  if (totalKiCost > availableKi) {
    ui.notifications.warn(`${actor.name} does not have enough charged Ki.`);
    return null;
  }
  if (data.consumeAction !== false && !await spendAction(actor)) return null;

  const manualBonusDice = Math.max(0, Number(data.bonusDice || 0));
  const techniqueBonusDice = Math.max(0, Number(data.techniqueBonusDice || 0));
  const bonusDice = manualBonusDice + techniqueBonusDice;
  const kiDice = Math.min(Math.floor(damageKiSpent / 10), Number(skill.total || 0));
  // Team Attack assists are merged BEFORE qualities are parsed, so a contributed quality actually
  // reaches qualityRatings (and therefore damage, conditions and modifier capacity).
  const teamAttackContribs = actor.system.combatState?.pending?.teamAttack ?? [];
  const teamAttackBonus = teamAttackContribs.reduce((sum, contrib) => sum + Math.max(0, Number(contrib?.bonus || 0)), 0);
  const teamAttackDice = teamAttackContribs.reduce((sum, contrib) => sum + Math.max(0, Number(contrib?.bonusDice || 0)), 0);
  const teamAttackQualities = teamAttackContribs.map(contrib => contrib?.qualities).filter(Boolean).join("; ");
  if (teamAttackQualities) data.qualities = [data.qualities, teamAttackQualities].filter(Boolean).join("; ");
  const qualityRatings = parseQualityRatings(data.qualities, embeddedQualities);
  const homingDice = homingAttackBonusDice(data.qualities, { attackType, defenseType: data.defenseType ?? "evasion", embeddedQualities });
  const baseDamageDice = Math.round(config.damageBase(actor, data));
  const activeDice = getActiveAttackBonusDice(actor, attackType, baseDamageDice);
  const allOut = actor.system.combatState?.pending?.allOut === true;
  const allOutAttackBonus = allOut ? Math.max(1, Math.round(Number(skill.total || 0) * 0.1)) : 0;
  const allOutDamageBonus = allOut ? Math.round(baseDamageDice * 0.1) : 0;
  // Attack special modifiers (Super / Full Power / True) add a fraction of the ability (skill)
  // total again to damage dice and to modifier capacity. Ki cost for these is charged when they
  // are embedded qualities (embeddedQualityKiCost), matching how other embedded qualities work.
  const abilityTotal = Number(skill.total || 0);
  const specialAttackFraction = (qualityRatings.super > 0 ? 0.25 : 0) + (qualityRatings.fullPower > 0 ? 0.5 : 0) + (qualityRatings.true > 0 ? 1 : 0);
  const specialAttackDamageDice = Math.round(abilityTotal * specialAttackFraction);
  const specialCapacityBonus = Math.floor(specialAttackDamageDice / (attackType === "weapon" ? 20 : 10));
  const damageDice = Math.max(0, Math.round(baseDamageDice + bonusDice + kiDice + activeDice + allOutDamageBonus + specialAttackDamageDice + teamAttackDice));
  const attackRoll = await new Roll(`${3 + homingDice}d6 + ${Number(skill.total || 0)} + ${allOutAttackBonus} + ${teamAttackBonus}`).evaluate();
  // Split oversized damage pools (e.g. 1500d6) into safe chunks so the attack menu never freezes.
  const damage = await evaluateDicePool(damageDice, 6);

  // Individual attack d6 results (base 3d6 plus any Homing bonus dice) for the hover tooltip.
  const attackDiceResults = (attackRoll.dice?.[0]?.results ?? []).map(die => Number(die.result));
  const attackFlatBonus = Number(skill.total || 0) + allOutAttackBonus + teamAttackBonus;
  const attackDiceTooltip = `${attackDiceResults.length || (3 + homingDice)}d6: [${attackDiceResults.join(", ")}]${attackFlatBonus ? ` + ${attackFlatBonus}` : ""} = ${attackRoll.total}`;
  // Actors the attacker had targeted when rolling, so a defender can auto-detect "the attack that hit me".
  const targetedActorUuids = Array.from(game.user?.targets ?? []).map(token => token.actor?.uuid).filter(Boolean);

  const spend = totalKiCost > 0 ? await spendKi(actor, totalKiCost) : { ok: true, charged: availableKi, cost: 0 };
  if (!spend.ok) return null;
  if (allOut) await clearPending(actor, "allOut");
  // A Team Attack assist is a one-shot bonus on the supported fighter's next attack; consume it.
  if (teamAttackContribs.length) await actor.update({ "system.combatState.pending.teamAttack": [] });

  const capacity = modifierCapacityForAttack(actor, attackType, Number(skill.total || 0), specialCapacityBonus);
  const modifierCount = normalModifierCount(qualityRatings);
  if (modifierCount > capacity) ui.notifications.warn(`${data.attackName || config.label} has ${modifierCount} common modifiers; normal capacity is ${capacity}.`);
  const target = data.targetActor ?? null;
  const damageApplication = target ? await applyDamageToTarget(target, damage.total, { qualities: data.qualities, qualityRatings, sourceName: data.attackName || config.label }) : null;
  const areaNote = qualityRatings.area ? `Area ${qualityRatings.area}: secondary targets take half raw damage before Defense.` : "";
  const rapidNote = qualityRatings.rapid ? `Rapid ${qualityRatings.rapid}: use distinct targets; do not repeat the same target.` : "";
  const selectiveNote = qualityRatings.selective ? `Selective ${qualityRatings.selective}: may exclude ${qualityRatings.selective} target(s) from an area/effect.` : "";
  const multiNote = qualityRatings.multi ? `Multi ${qualityRatings.multi}: extra strikes roll 1d${qualityRatings.multi + 1}-1; each extra strike halves raw damage.` : "";
  const manualQualities = String(data.qualities || "").trim();
  const auditNotes = [];
  if (manualQualities) auditNotes.push(`Manual Qualities: ${manualQualities}`);
  if (qualityRatings.homing && attackType !== "power") auditNotes.push("Homing was included on a non-Power attack; GM should confirm this is allowed.");
  if ((data.defenseType ?? "evasion") === "deflect" && attackType !== "power") auditNotes.push("Deflect was selected against a non-Power attack; GM should confirm this is allowed.");

  // Control qualities land a condition rather than damage, so the card offers effects-only buttons.
  const controlQualityNames = ["sealing", "immobilization", "slow", "burn"]
    .filter(key => Number(qualityRatings[key] || 0) > 0)
    .map(key => `${key === "immobilization" ? "Immobilization" : key.charAt(0).toUpperCase() + key.slice(1)} ${qualityRatings[key]}`);
  // Sealing/Immobilization zero the damage automatically, as does a technique flagged zeroDamage.
  const autoZeroDamage = Number(qualityRatings.sealing || 0) > 0 || Number(qualityRatings.immobilization || 0) > 0;
  const techniqueZeroDamage = technique?.system?.zeroDamage === true;

  const content = await foundry.applications.handlebars.renderTemplate("systems/dbz-fuzion-calibrated/templates/chat/attack-card.hbs", {
    hasControlQualities: controlQualityNames.length > 0,
    controlQualityNames: controlQualityNames.join(", "),
    autoZeroDamage: autoZeroDamage || techniqueZeroDamage,
    zeroDamageReason: techniqueZeroDamage ? "this technique is set to deal no damage" : "Sealing/Immobilization are control effects",
    actorName: actor.name,
    attackName: data.attackName || config.label,
    attackType: config.label,
    chatImg: data.techniqueImg || data.weaponImg || actor.img,
    techniqueName: data.techniqueName || "",
    weaponName: data.weaponName || "",
    attackTotal: attackRoll.total,
    damageTotal: damage.total,
    attackRollResult: attackRoll.result ?? attackRoll.formula,
    attackDiceTooltip,
    attackDiceResults,
    damageRollResult: damage.result,
    damageChunked: damage.chunked,
    kiSpent: totalKiCost,
    totalKiCost,
    damageKiSpent,
    activationKiCost,
    kiRemaining: spend.charged,
    qualityKiCost,
    kiDamageDice: kiDice,
    manualBonusDice,
    techniqueBonusDice,
    qualities: data.qualities || "",
    qualitySummary: qualitySummary(qualityRatings),
    qualityNotes: [areaNote, rapidNote, selectiveNote, multiNote, ...auditNotes].filter(Boolean),
    tags: data.tags || "",
    damageApplication,
    attackFormula: attackRoll.formula,
    damageFormula: damage.formula,
    breakdown: [
      ...config.breakdown(actor, data),
      `Manual bonus dice: ${manualBonusDice}`,
      `Technique bonus dice: ${techniqueBonusDice}`,
      `Ki damage dice: ${kiDice}`,
      `Ki for damage: ${damageKiSpent}`,
      `Technique Ki cost: ${activationKiCost}`,
      `Embedded quality Ki cost: ${qualityKiCost}`,
      `Homing attack dice: ${homingDice}`,
      `All Out attack bonus: ${allOutAttackBonus}`,
      `All Out damage dice: ${allOutDamageBonus}`,
      ...(teamAttackContribs.length ? [`Team Attack bonus: +${teamAttackBonus} attack, +${teamAttackDice} damage dice (${teamAttackContribs.map(contrib => `${contrib.assister || "Ally"} ${contrib.label || ""}`.trim()).join(", ")})`] : []),
      ...(teamAttackQualities ? [`Team Attack qualities: ${teamAttackQualities}`] : []),
      ...(specialAttackDamageDice ? [`Special modifier bonus dice: ${specialAttackDamageDice}`, `Special modifier capacity bonus: ${specialCapacityBonus}`] : []),
      `Deadly rating: ${qualityRatings.deadly}`,
      `Modifier capacity: ${modifierCount}/${capacity}`,
      `Active item dice: ${activeDice}`,
      `Damage dice total: ${damageDice}`,
      ...(damage.chunked ? [`Damage pool split into ${damage.chunkRolls.length} rolls of up to ${999}d6 (dice-limit safe)`] : [])
    ]
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [attackRoll, damage.displayRoll],
    content,
    flags: {
      "dbz-fuzion-calibrated": {
        attack: {
          actorUuid: actor.uuid,
          attackType,
          attackName: data.attackName || config.label,
          chatImg: data.techniqueImg || data.weaponImg || actor.img,
          techniqueImg: data.techniqueImg || "",
          weaponImg: data.weaponImg || "",
          techniqueName: data.techniqueName || "",
          weaponName: data.weaponName || "",
          rawDamage: damage.total,
          damageDice: damage.count,
          damageFormula: damage.formula,
          damageResult: damage.result,
          targetedActorUuids,
          attackTotal: attackRoll.total,
          attackResult: attackRoll.result ?? attackRoll.formula,
          qualitiesText: data.qualities || "",
          // Techniques flagged "deals no damage" keep that behaviour wherever damage is applied
          // from later (Take Damage, Apply to All, etc.), not just at roll time.
          zeroDamage: techniqueZeroDamage,
          qualityRatings,
          embeddedQualities,
          kiSpent: totalKiCost,
          totalKiCost,
          damageKiSpent,
          activationKiCost,
          qualityKiCost,
          kiDamageDice: kiDice,
          manualBonusDice,
          techniqueBonusDice,
          tags: data.tags || "",
          deadly: qualityRatings.deadly,
          burn: qualityRatings.burn,
          slow: qualityRatings.slow,
          immobilization: qualityRatings.immobilization,
          sealing: qualityRatings.sealing,
          penetrate: qualityRatings.penetrate,
          area: qualityRatings.area,
          selective: qualityRatings.selective,
          multi: qualityRatings.multi,
          rapid: qualityRatings.rapid,
          defenseType: data.defenseType ?? "evasion"
        },
        applications: []
      }
    }
  });

  return { attackRoll, damageRoll: damage.displayRoll, damage, attackDiceResults };
}

function applyTechniqueData(actor, data) {
  if (!data.techniqueId) return data;
  const technique = actor.items.get(data.techniqueId);
  if (!technique) return data;
  return {
    ...data,
    attackName: technique.name,
    techniqueName: technique.name,
    techniqueImg: technique.img,
    techniqueBonusDice: Number(data.techniqueBonusDice || 0) + Number(technique.system?.extraDice || 0),
    qualities: [data.qualities, technique.system?.qualities].filter(Boolean).join("; "),
    embeddedQualities: [...(data.embeddedQualities ?? []), ...(technique.system?.embeddedQualities ?? [])],
    tags: [data.tags, technique.system?.tags].filter(Boolean).join(", "),
    activationKiCost: Number(data.activationKiCost || 0) + Number(technique.system?.kiCostResolved || 0)
  };
}

function techniqueMatchesAttackType(technique, attackType) {
  const type = String(technique.system?.attackType || "").trim().toLowerCase();
  if (!type) return true;
  if (["all", "any", "universal"].includes(type)) return true;
  if (type === attackType) return true;
  if (attackType === "custom" && ["magic", "science", "telekinesis", "custom"].includes(type)) return true;
  return false;
}

function techniqueAttackTypeLabel(technique) {
  return String(technique.system?.attackType || "untyped");
}

function applyWeaponData(actor, data) {
  const weapon = actor.items.get(data.weaponId);
  if (!weapon) return data;
  return {
    ...data,
    weaponDamageDice: data.weaponDamageDice ?? weapon.system?.damageDice ?? 0,
    weaponName: weapon.name,
    weaponImg: weapon.img,
    qualities: [data.qualities, weapon.system?.qualities].filter(Boolean).join("; "),
    embeddedQualities: [...(data.embeddedQualities ?? []), ...(weapon.system?.embeddedQualities ?? [])]
  };
}

// Base damage dice an attack type would roll right now, before dialog choices (weapon, technique,
// qualities). Used for the at-a-glance dice count on the sheet's attack buttons. Reads the same
// ATTACK_CONFIG the roll itself uses, so the preview can never drift from the real formula.
export function attackDamageDicePreview(actor, attackType) {
  const config = ATTACK_CONFIG[attackType];
  if (!config) return 0;
  const data = {};
  if (attackType === "weapon") {
    const weapon = actor.items.find(item => item.type === "weapon" && item.system?.active)
      ?? actor.items.find(item => item.type === "weapon");
    data.weaponDamageDice = Number(weapon?.system?.damageDice || 0);
  }
  if (attackType === "custom") data.customSkill = (actor.system.customSkills ?? [])[0] ?? null;
  const base = Number(config.damageBase(actor, data) || 0);
  return Math.max(0, base + getActiveAttackBonusDice(actor, attackType, base));
}

export function getActiveAttackBonusDice(actor, attackType, baseDamageDice = 0) {
  let total = 0;
  for (const item of actor.items) {
    if (!item.system?.active) continue;
    if (item.type === "armor" && item.system?.destroyed) continue;
    for (const effect of item.system.effects ?? []) {
      if (!effect.enabled) continue;
      if (!["attacks.all.damageDice", `attacks.${attackType}.damageDice`].includes(effect.target)) continue;
      // Value may be a stat formula (e.g. "15%(evasion)"); Percent mode adds a share of the
      // attack's own base damage dice, every other mode adds the value as flat dice.
      const value = effectValue(effect, actor.system);
      total += effect.mode === "percent" ? Math.round(Number(baseDamageDice || 0) * (value / 100)) : value;
    }
  }
  return total;
}

function buildAttackDialogContent(config, weapons, techniques, customSkills) {
  const weaponSelect = weapons.length
    ? `<label><span>Weapon</span><select name="weaponId">${weapons.map(weapon => `<option value="${weapon.id}">${escapeHtml(weapon.name)}</option>`).join("")}</select></label>`
    : "";
  const techniqueSelect = techniques.length
    ? `<label><span>Technique</span><select name="techniqueId"><option value="">None</option>${techniques.map(technique => `<option value="${technique.id}">${escapeHtml(technique.name)}</option>`).join("")}</select></label>`
    : "";
  const customSkillSelect = config.skillKey === "custom"
    ? `<label><span>Custom Skill</span><select name="customSkillIndex">${customSkills.map((skill, index) => `<option value="${index}">${escapeHtml(skill.name || `Custom Skill ${index + 1}`)} (${Number(skill.total || 0)})</option>`).join("")}</select></label>`
    : "";

  return `
    <div class="dbzf-attack-dialog dbzf-dialog-form">
      <label><span>Attack Name</span><input type="text" name="attackName" value="${config.label}" /></label>
      ${customSkillSelect}
      ${techniqueSelect}
      ${weaponSelect}
      <label><span>Ki for Damage</span><input type="number" name="kiSpent" value="0" min="0" /></label>
      <label><span>Manual Bonus Damage Dice</span><input type="number" name="bonusDice" value="0" min="0" /></label>
      <label><span>Defense Type</span><select name="defenseType"><option value="evasion">Evasion</option><option value="deflect">Deflect</option><option value="block">Block</option><option value="counterblast">Counterblast</option></select></label>
      <label><span>Special Qualities</span><input type="text" name="qualities" value="" /></label>
    </div>
  `;
}

function getCustomSkillData(actor, index, fallback = null) {
  if (fallback) return fallback;
  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex)) return null;
  const skill = actor.system.customSkills?.[numericIndex];
  if (!skill) return null;
  return {
    name: skill.name || `Custom Skill ${numericIndex + 1}`,
    total: Number(skill.total || 0),
    rank: Number(skill.rank || 0),
    value: Number(skill.value || 0)
  };
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}
