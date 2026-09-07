import { chargeKi, getChargedKi, spendKi } from "./ki.mjs";
import { spendAction, spendReaction, setPending } from "./combat-state.mjs";
import { parseKiCost } from "./ki-cost-parser.mjs";
import { applyDamageToTarget } from "./damage.mjs";
import { applyChatDamage } from "./chat-damage.mjs";
import { evaluateDicePool } from "./dice-pool.mjs";

const REACTION_INFO = {
  allOut: {
    name: "All Out",
    summary: "Spend your Reaction to prime the next offensive attack.",
    details: "The next offensive check gains +10% Skill Total as an attack bonus and +10% base damage dice. The pending bonus clears after the next attack."
  },
  block: {
    name: "Block",
    summary: "Body check to stop a physical attack.",
    details: "Roll 3d6 + Body Total. Apply -20 if blocking a weapon attack. Success against the incoming attack total negates damage."
  },
  deflect: {
    name: "Deflect",
    summary: "Mind check to negate a Ki attack.",
    details: "Roll 3d6 + Mind Total against the incoming Power/Ki attack total. Homing does not apply against Deflect."
  },
  fakeOut: {
    name: "Fake Out",
    summary: "Spend Ki to bait a target reaction.",
    details: "Spend the supposed technique cost, then roll 3d6 + Mind Total. GM adjudicates whether the target commits a reaction."
  },
  kiBarrier: {
    name: "Ki Barrier",
    summary: "Spend Ki to negate incoming damage dice.",
    details: "Requested dice are clamped by incoming damage dice, charged Ki, and Power Total + Mind Total. Cost is 10 Ki per die negated."
  },
  nullify: {
    name: "Nullify",
    summary: "Fighting check against a Power or Magic attack.",
    details: "On success, Fighting damage can act as a barrier against the incoming attack. This pass reports the roll for GM resolution."
  },
  parry: {
    name: "Parry",
    summary: "Weapon, Body, or Fighting check against a weapon attack.",
    details: "Weapon uses full Weapon Total. Body or Fighting parries apply -20."
  },
  quickCharge: {
    name: "Quick Charge",
    summary: "Spend Reaction to charge half Power Up.",
    details: "Adds 0.5x Power Up to charged Ki and clamps at max Ki."
  },
  powerQuickCharge: {
    name: "Power Up + Quick Charge",
    summary: "Spend Action and Reaction to charge 1.5x Power Up.",
    details: "Adds normal Power Up plus half Power Up to charged Ki and clamps at max Ki."
  },
  counterblast: {
    name: "Counterblast",
    summary: "Counter a Ki or Magic attack with a costly opposed blast.",
    details: "Cost is 10 times incoming attack total plus Power Total, plus technique and extra Ki if supplied. Roll 3d6 + half Mind/Power combined. On success, your Counterblast damage and effects combine with the incoming attack and hit the attacker. On failure, you are hit by the combined blast."
  },
  slipFree: {
    name: "Slip Free",
    summary: "Evasion check to escape a grapple.",
    details: "Reaction mode rolls 3d6 + 125% Evasion Total. Action mode rolls 3d6 + 150% Evasion Total."
  },
  breakFree: {
    name: "Break Free",
    summary: "Prime a stronger Body escape attempt.",
    details: "Spend Reaction to set a pending +50% Body bonus for the next escape attempt."
  },
  raiseCharacteristic: {
    name: "Raise Characteristic",
    summary: "Spend Ki to temporarily raise a Characteristic for 1 Phase.",
    details: "As a Reaction, any Characteristic except Combat can be increased for 1 Phase by up to its own value, spending 10 Ki per point increased."
  }
};

export function reactionChoices() {
  return Object.entries(REACTION_INFO).map(([key, data]) => ({ key, ...data }));
}

// Minimal confirm dialog shared by the simple reaction prompts (Slip Free, Fake Out).
function reactionPrompt({ title, content, submit }) {
  if (foundry.applications?.api?.DialogV2) {
    return foundry.applications.api.DialogV2.confirm({
      window: { title },
      content,
      yes: { label: title, callback: (event, button, dialog) => submit(dialog.element) },
      no: { label: "Cancel" }
    });
  }
  return new Promise(resolve => new Dialog({
    title,
    content,
    buttons: {
      go: { label: title, callback: html => resolve(submit(html[0])) },
      cancel: { label: "Cancel", callback: () => resolve(null) }
    },
    default: "go"
  }).render(true));
}

export async function openCounterblastDialog(actor) {
  const techniques = actor.items.filter(item => item.type === "technique");
  const content = `
    <div class="dbzf-attack-dialog dbzf-dialog-form">
      <label><span>Incoming Total</span><input type="number" name="dc" value="20" min="0" /></label>
      <label><span>Incoming Name</span><input type="text" name="incomingName" value="Incoming Ki Attack" /></label>
      <label><span>Incoming Damage Total</span><input type="number" name="incomingDamage" value="0" min="0" /></label>
      <label><span>Incoming Effects / Qualities</span><input type="text" name="incomingQualities" value="" /></label>
      <label><span>Technique</span><select name="techniqueId"><option value="">None</option>${techniques.map(technique => `<option value="${technique.id}">${escapeHtml(technique.name)}</option>`).join("")}</select></label>
      <label><span>Extra Ki</span><input type="number" name="extraKi" value="0" min="0" title="Costs this much extra Ki and adds +1 counter damage die per 10" /></label>
      <label><span>Check Modifier</span><input type="number" name="checkModifier" value="0" title="Flat bonus or penalty added to the Counterblast check" /></label>
      <label><span>Bonus Damage Dice</span><input type="number" name="bonusDice" value="0" min="0" /></label>
      <label><span>Qualities</span><input type="text" name="qualities" value="" /></label>
      <label class="dbzf-inline-check"><input type="checkbox" name="useTechniqueCost" checked /><span>Use technique Ki cost</span></label>
      <label class="dbzf-inline-check"><input type="checkbox" name="calledName" /><span>Called technique name aloud (+10)</span></label>
    </div>
  `;
  const submit = async html => {
    const form = html instanceof HTMLFormElement ? html : html.querySelector("form");
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.useTechniqueCost = formData.has("useTechniqueCost");
    data.calledName = formData.has("calledName");
    return rollCounterblast(actor, data);
  };

  if (foundry.applications?.api?.DialogV2) {
    return foundry.applications.api.DialogV2.confirm({
      window: { title: "Counterblast" },
      content,
      yes: { label: "Counterblast", callback: (event, button, dialog) => submit(dialog.element) },
      no: { label: "Cancel" }
    });
  }

  return new Promise(resolve => {
    new Dialog({
      title: "Counterblast",
      content,
      buttons: {
        counterblast: { label: "Counterblast", callback: html => resolve(submit(html[0])) },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "counterblast"
    }).render(true);
  });
}

export async function rollAllOut(actor) {
  if (!await spendReaction(actor)) return null;
  await setPending(actor, "allOut", true);
  return chat(actor, "allOut", `${actor.name} is going all out on the next offensive attack.`, {
    resource: "Reaction spent",
    effect: "Next attack gains +10% attack and damage bonuses"
  });
}

export function openBlockDialog(actor) {
  return openNegationDialog(actor, {
    title: "Block",
    extraFieldsHtml: `<label class="dbzf-inline-check"><input type="checkbox" name="weapon" /><span>Attacker used a weapon (-20)</span></label>`,
    hint: "Body check to stop a purely physical attack. Success negates it.",
    run: data => rollBlock(actor, { ...data, weapon: data.form.querySelector('[name="weapon"]').checked })
  });
}

export async function rollBlock(actor, data = {}) {
  if (!await spendReaction(actor)) return null;
  const penalty = data.weapon ? -20 : 0;
  return resolveNegationReaction(actor, "block", Number(actor.system.skills.body.total || 0) + penalty, data);
}

// Shared form for damage-negating/absorbing reactions (Deflect, Block, Parry, Nullify):
// capture the incoming attack roll total and its raw damage, plus reaction-specific fields.
function openNegationDialog(actor, { title, hint = "", extraFieldsHtml = "", run }) {
  const content = `
    <div class="dbzf-attack-dialog dbzf-dialog-form">
      <label><span>Incoming Attack Total</span><input type="number" name="dc" value="20" min="0" /></label>
      <label><span>Incoming Raw Damage</span><input type="number" name="incomingDamage" value="0" min="0" /></label>
      ${extraFieldsHtml}
      ${hint ? `<p class="dbzf-dialog-hint">${hint}</p>` : ""}
    </div>
  `;
  const submit = async html => {
    const form = html instanceof HTMLFormElement ? html : html.querySelector("form");
    const data = Object.fromEntries(new FormData(form).entries());
    return run({ dc: Number(data.dc || 0), incomingDamage: Number(data.incomingDamage || 0), data, form, autoApply: true });
  };
  if (foundry.applications?.api?.DialogV2) {
    return foundry.applications.api.DialogV2.confirm({
      window: { title },
      content,
      yes: { label: title, callback: (event, button, dialog) => submit(dialog.element) },
      no: { label: "Cancel" }
    });
  }
  return new Promise(resolve => new Dialog({
    title,
    content,
    buttons: { go: { label: title, callback: html => resolve(submit(html[0])) }, cancel: { label: "Cancel", callback: () => resolve(null) } },
    default: "go"
  }).render(true));
}

// "Negate on success, take the hit on failure" resolver shared by Deflect, Block and Parry.
async function resolveNegationReaction(actor, key, skillTotal, data = {}) {
  const roll = await new Roll(`3d6 + ${Number(skillTotal || 0)}`).evaluate();
  const hasDc = Number.isFinite(Number(data.dc));
  const success = hasDc ? roll.total >= Number(data.dc) : null;
  const incomingDamage = Math.max(0, Number(data.incomingDamage || 0));

  let damageApplication = null;
  let outcome;
  if (success === true) {
    outcome = "Negated: incoming attack stopped (0 damage).";
  } else if (success === false) {
    if (data.autoApply && incomingDamage > 0) {
      damageApplication = await applyDamageToTarget(actor, incomingDamage, { sourceName: `${REACTION_INFO[key]?.name ?? key} (failed)` });
      outcome = `Failed: takes ${damageApplication.effectiveDamage} damage (${damageApplication.hitsBefore} -> ${damageApplication.hitsAfter} HITs).`;
    } else {
      outcome = "Failed: the attack lands.";
    }
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content: reactionCard(actor, key, {
      formula: roll.formula,
      total: roll.total,
      dc: hasDc ? Number(data.dc) : null,
      success,
      ...(data.mode ? { mode: data.mode } : {}),
      ...(outcome ? { outcome } : {})
    })
  });
  return { roll, dc: hasDc ? Number(data.dc) : null, success, damageApplication };
}

export function openDeflectDialog(actor) {
  return openNegationDialog(actor, {
    title: "Deflect",
    hint: `Mind vs the incoming Ki attack. Success negates it; failure applies the damage to ${escapeHtml(actor.name)}.`,
    run: data => rollDeflect(actor, data)
  });
}

export async function rollDeflect(actor, data = {}) {
  if (!await spendReaction(actor)) return null;
  return resolveNegationReaction(actor, "deflect", actor.system.skills.mind.total, data);
}

export function openFakeOutDialog(actor) {
  const content = `
    <div class="dbzf-attack-dialog dbzf-dialog-form">
      <label><span>Target Mind DC</span><input type="number" name="dc" value="20" min="0" /></label>
      <label><span>Ki Cost (supposed technique)</span><input type="number" name="cost" value="0" min="0" /></label>
      <p class="dbzf-dialog-hint">Spend Ki equal to the supposed technique cost, then roll Mind vs the target's Mind DC to bait a reaction.</p>
    </div>`;
  const submit = html => {
    const form = html instanceof HTMLFormElement ? html : html.querySelector("form");
    const data = Object.fromEntries(new FormData(form).entries());
    return rollFakeOut(actor, { dc: Number(data.dc || 0), cost: Number(data.cost || 0) });
  };
  return reactionPrompt({ title: "Fake Out", content, submit });
}

export async function rollFakeOut(actor, data = {}) {
  const cost = Number(data.cost || 0);
  if (cost > getChargedKi(actor)) {
    ui.notifications.warn(`${actor.name} does not have enough charged Ki for Fake Out.`);
    return null;
  }
  if (!await spendReaction(actor)) return null;
  const spent = await spendKi(actor, cost);
  if (!spent.ok) return null;
  return rollVs(actor, "fakeOut", `3d6 + ${Number(actor.system.skills.mind.total || 0)}`, data.dc, { kiSpent: cost, kiRemaining: spent.charged });
}

// Recent attack chat cards this actor might need to barrier, newest first. Flags which one
// targeted this actor so the dialog can pre-select "the attack that hit me".
function parseDiceCount(formula) {
  const match = /^(\d+)d/.exec(String(formula || ""));
  return match ? Number(match[1]) : 0;
}

function recentAttackMessages(actor, limit = 8) {
  const actorUuids = new Set([actor.uuid]);
  for (const token of actor.getActiveTokens?.() ?? []) if (token.actor?.uuid) actorUuids.add(token.actor.uuid);
  return game.messages.contents
    .filter(message => message.getFlag("dbz-fuzion-calibrated", "attack"))
    .slice(-limit)
    .reverse()
    .map(message => {
      const attack = message.getFlag("dbz-fuzion-calibrated", "attack");
      const damageDice = Number(attack.damageDice ?? parseDiceCount(attack.damageFormula));
      const rawDamage = Number(attack.rawDamage || 0);
      const targeted = (attack.targetedActorUuids ?? []).some(uuid => actorUuids.has(uuid));
      const area = Number(attack.area || 0);
      // Area hits its primary target in full and everyone else for half. The attacker's first
      // target is the primary, so anyone else caught in an Area attack takes the halved damage.
      const secondary = area > 0 && !actorUuids.has((attack.targetedActorUuids ?? [])[0]);
      const label = `${attack.attackName || "Attack"} - ${damageDice}d6 (${rawDamage} dmg)${area ? ` [Area ${area}]` : ""}${targeted ? " [targeted you]" : ""}`;
      return { message, attack, damageDice, rawDamage, targeted, area, secondary, label };
    })
    .filter(entry => !actorUuids.has(entry.attack.actorUuid));
}

export function openKiBarrierDialog(actor) {
  const attacks = recentAttackMessages(actor);
  const maxBySkill = Number(actor.system.skills.power.total || 0) + Number(actor.system.skills.mind.total || 0);
  const maxByKi = Math.floor(getChargedKi(actor) / 10);
  const targetedIndex = attacks.findIndex(entry => entry.targeted);
  const autoIndex = targetedIndex >= 0 ? targetedIndex : 0;
  const selected = attacks[autoIndex];
  const options = attacks.map((entry, index) => `<option value="${index}" ${index === autoIndex ? "selected" : ""}>${escapeHtml(entry.label)}</option>`).join("")
    + `<option value="manual" ${attacks.length === 0 ? "selected" : ""}>Manual entry (no attack card)</option>`;
  const halfDamage = selected?.secondary === true;
  // An Area attack only deals half its raw damage to a secondary target, so the barrier is
  // sized against the halved pool instead of the attacker's full roll.
  const incomingDiceForBarrier = halfDamage ? Math.ceil(Number(selected?.damageDice || 0) / 2) : Number(selected?.damageDice || 0);
  const defaultDice = Math.max(0, Math.min(incomingDiceForBarrier || maxBySkill, maxBySkill, maxByKi));
  const content = `
    <div class="dbzf-attack-dialog dbzf-dialog-form">
      <p class="dbzf-dialog-hint">Spend 10 Ki per incoming damage die negated, then roll that many d6 to reduce the incoming damage. Caps: Power + Mind total = ${maxBySkill}; charged Ki allows up to ${maxByKi} dice.</p>
      <label><span>Incoming Attack</span><select name="attackIndex">${options}</select></label>
      <label class="dbzf-inline-check"><input type="checkbox" name="halfDamage" ${halfDamage ? "checked" : ""} /><span>I take half damage from this (Area secondary target)</span></label>
      <label><span>Dice to Negate</span><input type="number" name="dice" value="${defaultDice}" min="0" /></label>
      <label class="dbzf-inline-check"><input type="checkbox" name="applyDamage" checked /><span>Apply the reduced damage to me now</span></label>
      <p class="dbzf-dialog-hint">Manual entry only (used when "Manual entry" is selected):</p>
      <label><span>Incoming Damage Dice</span><input type="number" name="incomingDice" value="${selected?.damageDice ?? 0}" min="0" /></label>
      <label><span>Incoming Raw Damage</span><input type="number" name="incomingDamage" value="${selected?.rawDamage ?? 0}" min="0" /></label>
    </div>`;
  const submit = html => {
    const form = html instanceof HTMLFormElement ? html : html.querySelector("form");
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    let messageId = "";
    let incomingDice = Number(data.incomingDice || 0);
    let incomingDamage = Number(data.incomingDamage || 0);
    if (data.attackIndex !== "manual") {
      const entry = attacks[Number(data.attackIndex)];
      if (entry) { messageId = entry.message.id; incomingDice = entry.damageDice; incomingDamage = entry.rawDamage; }
    }
    return rollKiBarrier(actor, {
      dice: Number(data.dice || 0),
      incomingDamageDice: incomingDice,
      incomingDamage,
      messageId,
      areaSecondary: formData.has("halfDamage"),
      applyDamage: formData.has("applyDamage")
    });
  };
  return reactionPrompt({ title: "Ki Barrier", content, submit });
}

export async function rollKiBarrier(actor, data = {}) {
  const maxBySkill = Number(actor.system.skills.power.total || 0) + Number(actor.system.skills.mind.total || 0);
  const maxByKi = Math.floor(getChargedKi(actor) / 10);
  const requested = Math.max(0, Number(data.dice || 0));
  const areaSecondary = data.areaSecondary === true;
  const rawIncomingDice = Math.max(0, Number(data.incomingDamageDice ?? requested));
  // Half damage means half the pool to negate; barrier dice were previously capped against the
  // attacker's full roll, which made a barrier unusable against Area and other halved damage.
  const incomingDice = areaSecondary ? Math.ceil(rawIncomingDice / 2) : rawIncomingDice;
  const dice = Math.min(requested, incomingDice || requested, maxBySkill, maxByKi);
  if (dice <= 0) {
    ui.notifications.warn(`${actor.name} cannot form a Ki Barrier - needs charged Ki and Power/Mind skill.`);
    return null;
  }
  if (!await spendReaction(actor)) return null;
  const spent = await spendKi(actor, dice * 10);
  if (!spent.ok) return null;
  const barrierPool = await evaluateDicePool(dice, 6);
  const blocked = Number(barrierPool.total || 0);
  const incomingDamage = Math.max(0, Number(data.incomingDamage || 0));
  const kiDeflection = { rating: dice, blocked, formula: barrierPool.formula, result: barrierPool.result };

  let damageApplication = null;
  if (data.applyDamage !== false && incomingDamage > 0) {
    const message = data.messageId ? game.messages.get(data.messageId) : null;
    if (message?.getFlag?.("dbz-fuzion-calibrated", "attack")) {
      damageApplication = await applyChatDamage(message, { targetActor: actor, kiDeflection, areaSecondary });
    } else {
      damageApplication = await applyDamageToTarget(actor, incomingDamage, { kiDeflection, areaSecondary, sourceName: "Ki Barrier" });
    }
  }

  const outcome = damageApplication
    ? `Blocked ${blocked}; takes ${damageApplication.effectiveDamage} damage (${damageApplication.hitsBefore} -> ${damageApplication.hitsAfter} HITs).`
    : (incomingDamage > 0 ? `Barrier of ${blocked} formed (not auto-applied).` : `Barrier of ${blocked} formed.`);

  return chat(actor, "kiBarrier", `${actor.name} raises a Ki Barrier negating ${dice}d6.`, {
    diceNegated: dice,
    barrierRolled: blocked,
    incomingDamageDice: incomingDice || undefined,
    incomingDamage: incomingDamage || undefined,
    ...(areaSecondary ? { halfDamage: "Area secondary target: raw damage halved before the barrier" } : {}),
    kiSpent: dice * 10,
    kiRemaining: spent.charged,
    skillCap: maxBySkill,
    outcome
  });
}

export function openNullifyDialog(actor) {
  return openNegationDialog(actor, {
    title: "Nullify",
    hint: "Fighting vs an incoming Power/Magic attack. On success your Fighting damage becomes a barrier that reduces the incoming damage.",
    run: data => rollNullify(actor, data)
  });
}

export async function rollNullify(actor, data = {}) {
  if (!await spendReaction(actor)) return null;
  const roll = await new Roll(`3d6 + ${Number(actor.system.skills.fighting.total || 0)}`).evaluate();
  const hasDc = Number.isFinite(Number(data.dc));
  const success = hasDc ? roll.total >= Number(data.dc) : null;
  const incomingDamage = Math.max(0, Number(data.incomingDamage || 0));

  let barrier = 0;
  let barrierRoll = null;
  let damageApplication = null;
  let outcome;
  if (success === true) {
    // Fighting attack damage dice = Physical Total + Fighting effective ranks (per the rulebook).
    const dice = Math.max(0, Number(actor.system.characteristics.physical.effective || 0) + Number(actor.system.skills.fighting.effectiveRank || 0));
    const barrierPool = dice > 0 ? await evaluateDicePool(dice, 6) : null;
    barrierRoll = barrierPool?.displayRoll ?? null;
    barrier = Number(barrierPool?.total || 0);
    if (data.autoApply && incomingDamage > 0) {
      damageApplication = await applyDamageToTarget(actor, incomingDamage, {
        kiDeflection: { blocked: barrier, formula: barrierRoll?.formula ?? "", result: barrierRoll?.result ?? barrierRoll?.formula ?? "" },
        sourceName: "Nullify barrier"
      });
      outcome = `Success: Fighting barrier ${barrier} reduces the blast; takes ${damageApplication.effectiveDamage} damage.`;
    } else {
      outcome = `Success: Fighting barrier of ${barrier} formed.`;
    }
  } else if (success === false) {
    if (data.autoApply && incomingDamage > 0) {
      damageApplication = await applyDamageToTarget(actor, incomingDamage, { sourceName: "Nullify (failed)" });
      outcome = `Failed: takes ${damageApplication.effectiveDamage} damage.`;
    } else {
      outcome = "Failed: the attack lands.";
    }
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll, barrierRoll].filter(Boolean),
    content: reactionCard(actor, "nullify", {
      formula: roll.formula,
      total: roll.total,
      dc: hasDc ? Number(data.dc) : null,
      success,
      ...(barrier ? { barrier } : {}),
      ...(outcome ? { outcome } : {})
    })
  });
  return { roll, dc: hasDc ? Number(data.dc) : null, success, barrier, damageApplication };
}

export function openParryDialog(actor) {
  return openNegationDialog(actor, {
    title: "Parry",
    extraFieldsHtml: `<label><span>Parry Skill</span><select name="mode"><option value="weapon">Weapon (full)</option><option value="body">Body (-20)</option><option value="fighting">Fighting (-20)</option></select></label>`,
    hint: "Block a Weapon attack. Weapon uses full total; Body or Fighting apply -20.",
    run: data => rollParry(actor, { ...data, mode: data.data.mode || "weapon" })
  });
}

export async function rollParry(actor, data = {}) {
  if (!await spendReaction(actor)) return null;
  const mode = data.mode ?? "weapon";
  const total = mode === "weapon"
    ? Number(actor.system.skills.weapon.total || 0)
    : mode === "body"
      ? Number(actor.system.skills.body.total || 0) - 20
      : Number(actor.system.skills.fighting.total || 0) - 20;
  return resolveNegationReaction(actor, "parry", total, { ...data, mode });
}

export async function rollQuickCharge(actor, data = {}) {
  const combined = data.combined === true;
  if (combined) {
    if (!await spendAction(actor)) return null;
    if (!await spendReaction(actor)) return null;
  } else if (!await spendReaction(actor)) return null;
  const before = getChargedKi(actor);
  const next = await chargeKi(actor, combined ? 1.5 : 0.5, { consumeAction: false });
  return chat(actor, combined ? "powerQuickCharge" : "quickCharge", `${before} -> ${next} charged Ki.`, {
    before,
    gained: next - before,
    after: next,
    maxKi: actor.system.resources.ki.max
  });
}

export async function rollCounterblast(actor, data = {}) {
  const dc = Number(data.dc || 0);
  const technique = data.techniqueId ? actor.items.get(data.techniqueId) : null;
  const techniqueCost = technique && data.useTechniqueCost !== false ? resolvedTechniqueCost(actor, technique) : Number(data.techniqueCost || 0);
  const techniqueTags = technique?.system?.tags || "";
  const techniqueQualities = technique?.system?.qualities || "";
  if (technique && !["power", "magic", "custom"].includes(technique.system?.attackType) && !String(techniqueTags).toLowerCase().includes("counter")) {
    ui.notifications.warn(`${technique.name} is not a normal Counterblast technique. Continuing for GM adjudication.`);
  }
  const baseCost = (10 * dc) + Number(actor.system.skills.power.total || 0);
  const totalCost = baseCost + techniqueCost + Number(data.extraKi || 0);
  if (totalCost > getChargedKi(actor)) {
    ui.notifications.warn(`${actor.name} does not have enough charged Ki for Counterblast.`);
    return null;
  }
  if (!await spendReaction(actor)) return null;
  const spent = await spendKi(actor, totalCost);
  if (!spent.ok) {
    ui.notifications.warn(`${actor.name} does not have enough charged Ki for Counterblast.`);
    return null;
  }
  const calledNameBonus = data.calledName ? 10 : 0;
  const checkModifier = Math.round(Number(data.checkModifier || 0));
  const skillHalf = Math.floor((Number(actor.system.skills.mind.total || 0) + Number(actor.system.skills.power.total || 0)) / 2);
  const formula = `3d6 + ${skillHalf} + ${calledNameBonus} + ${checkModifier}`;
  const roll = await new Roll(formula).evaluate();
  const outcome = await resolveCounterblastOutcome(actor, {
    ...data,
    dc,
    rollTotal: roll.total,
    technique,
    techniqueQualities,
    techniqueTags
  });

  // Auto-apply the combined blast: on success it hits the selected target (the attacker);
  // on failure it backlashes onto the counterblaster. Qualities/effects carry through.
  // On failure the combined blast backlashes onto the counterblaster (by design). On SUCCESS it
  // must hit the attacker, never the counterblaster: targeting yourself was applying your own
  // blast to you and reading as "it targets the user automatically".
  const successTarget = selectedTargetActor();
  const selfTargeted = successTarget && successTarget.id === actor.id;
  if (outcome.success && selfTargeted) {
    ui.notifications.warn(`${actor.name} is their own target; target the attacker to apply the Counterblast.`);
  }
  const damageTarget = outcome.success ? (selfTargeted ? null : successTarget) : actor;
  let appliedDamage;
  if (damageTarget && outcome.combinedDamage > 0) {
    const application = await applyDamageToTarget(damageTarget, outcome.combinedDamage, {
      qualities: outcome.combinedQualities,
      sourceName: "Counterblast"
    });
    // A player's blast against the attacker is applied by the GM's client; if that could not
    // happen (no GM connected) there is no result to report.
    appliedDamage = application
      ? `${damageTarget.name}: ${application.effectiveDamage} damage (${application.hitsBefore} -> ${application.hitsAfter} HITs)`
      : `${damageTarget.name}: damage could not be applied - the GM must apply ${outcome.combinedDamage} raw manually.`;
  } else {
    appliedDamage = outcome.success ? "Success - select a target to apply the combined blast." : "No damage to apply.";
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll, outcome.counterDamageRoll].filter(Boolean),
    content: reactionCard(actor, "counterblast", {
      formula,
      total: roll.total,
      dc,
      success: outcome.success,
      resultTarget: outcome.resultTargetName,
      incomingName: data.incomingName || "Incoming Ki Attack",
      incomingDamage: outcome.incomingDamage,
      counterDamage: outcome.counterDamage,
      counterDamageDice: outcome.counterDamageDice,
      extraKi: Math.max(0, Number(data.extraKi || 0)),
      extraKiDice: Math.floor(Math.max(0, Number(data.extraKi || 0)) / 10),
      checkModifier,
      combinedDamage: outcome.combinedDamage,
      combinedQualities: outcome.combinedQualities,
      technique: technique?.name || "None",
      tags: [data.tags, techniqueTags].filter(Boolean).join(", "),
      qualities: [data.qualities, techniqueQualities].filter(Boolean).join("; "),
      baseCost,
      techniqueCost,
      extraKi: Number(data.extraKi || 0),
      totalCost,
      kiRemaining: spent.charged,
      appliedDamage
    })
  });
  return { roll, dc, success: outcome.success, outcome };
}

export async function resolveCounterblastOutcome(actor, data = {}) {
  const dc = Number(data.dc || 0);
  const rollTotal = Number(data.rollTotal || 0);
  const success = rollTotal >= dc;
  const technique = data.technique ?? (data.techniqueId ? actor.items.get(data.techniqueId) : null);
  const counterDamageDice = counterblastDamageDice(actor, {
    technique,
    extraKi: data.extraKi,
    bonusDice: data.bonusDice
  });
  const counterPool = counterDamageDice > 0 ? await evaluateDicePool(counterDamageDice, 6) : null;
  const counterDamageRoll = counterPool?.displayRoll ?? null;
  const incomingDamage = Math.max(0, Number(data.incomingDamage || 0));
  const counterDamage = Number(counterPool?.total || 0);
  const combinedDamage = incomingDamage + counterDamage;
  const counterQualities = [data.qualities, technique?.system?.qualities].filter(Boolean).join("; ");
  const combinedQualities = [data.incomingQualities, counterQualities].filter(Boolean).join("; ");
  // On success the blast hits the ATTACKER. If the counterblaster has themselves targeted there is
  // no valid recipient, so report that rather than naming them as the victim of their own blast.
  const successTarget = selectedTargetActor();
  const resultTarget = success ? (successTarget && successTarget.id !== actor.id ? successTarget : null) : actor;
  return {
    success,
    counterDamageDice,
    counterDamageRoll,
    incomingDamage,
    counterDamage,
    combinedDamage,
    combinedQualities,
    resultTargetUuid: resultTarget?.uuid ?? "",
    resultTargetName: resultTarget?.name ?? (success ? "No valid target - target the attacker" : actor.name),
    damageApplication: null,
    pendingDamage: combinedDamage
  };
}

export function counterblastDamageDice(actor, data = {}) {
  const technique = data.technique ?? (data.techniqueId ? actor.items.get(data.techniqueId) : null);
  const base = Number(actor.system.characteristics.mental.effective || 0) + Number(actor.system.skills.power.effectiveRank || 0);
  const techniqueDice = Number(technique?.system?.extraDice || 0);
  const kiDice = Math.floor(Math.max(0, Number(data.extraKi || 0)) / 10);
  return Math.max(0, Math.round(base + techniqueDice + Number(data.bonusDice || 0) + kiDice));
}

function selectedTargetActor() {
  const first = game.user?.targets?.values?.().next?.().value;
  return first?.actor ?? null;
}

function resolvedTechniqueCost(actor, technique) {
  const resolved = Number(technique.system?.kiCostResolved || technique._source?.system?.kiCostResolved || 0);
  if (resolved > 0) return resolved;
  return parseKiCost(technique.system?.kiCostRaw ?? technique._source?.system?.kiCostRaw ?? "", actor.system.resources?.ki?.max ?? actor.system.resources?.battlePower?.effective ?? 0);
}

export function openSlipFreeDialog(actor) {
  const content = `
    <div class="dbzf-attack-dialog dbzf-dialog-form">
      <label><span>Escape DC (grappler's Body)</span><input type="number" name="dc" value="20" min="0" /></label>
      <label><span>Mode</span><select name="mode"><option value="reaction">Reaction (+25% Evasion)</option><option value="action">Action (+50% Evasion)</option></select></label>
      <p class="dbzf-dialog-hint">Roll Evasion against the grappler's Body DC to slip free.</p>
    </div>`;
  const submit = html => {
    const form = html instanceof HTMLFormElement ? html : html.querySelector("form");
    const data = Object.fromEntries(new FormData(form).entries());
    return rollSlipFree(actor, { dc: Number(data.dc || 0), mode: data.mode || "reaction" });
  };
  return reactionPrompt({ title: "Slip Free", content, submit });
}

export async function rollSlipFree(actor, data = {}) {
  const actionMode = data.mode === "action";
  if (actionMode ? !await spendAction(actor) : !await spendReaction(actor)) return null;
  const multiplier = actionMode ? 1.5 : 1.25;
  return rollVs(actor, "slipFree", `3d6 + ${Math.round(Number(actor.system.skills.evasion.total || 0) * multiplier)}`, data.dc, { mode: actionMode ? "Action" : "Reaction", multiplier });
}

export async function rollBreakFree(actor) {
  if (!await spendReaction(actor)) return null;
  await setPending(actor, "breakFree", true);
  return chat(actor, "breakFree", `${actor.name} gains +50% Body for the next escape attempt.`, {
    resource: "Reaction spent",
    effect: "Pending Break Free flag set"
  });
}

export function openRaiseCharacteristicDialog(actor) {
  const chars = [
    { key: "physical", label: "Physical", value: Number(actor.system.characteristics.physical.effective || 0) },
    { key: "mental", label: "Mental", value: Number(actor.system.characteristics.mental.effective || 0) },
    { key: "movement", label: "Movement", value: Number(actor.system.characteristics.movement.effective || 0) }
  ];
  const options = chars.map(characteristic => `<option value="${characteristic.key}">${characteristic.label} (current ${characteristic.value}, max +${characteristic.value})</option>`).join("");
  const content = `
    <div class="dbzf-attack-dialog dbzf-dialog-form">
      <p class="dbzf-dialog-hint">Raise one Characteristic (not Combat) for 1 Phase by up to its own value. Cost is 10 Ki per point.</p>
      <label><span>Characteristic</span><select name="characteristic">${options}</select></label>
      <label><span>Points to Raise</span><input type="number" name="points" value="1" min="1" /></label>
    </div>`;
  const submit = html => {
    const form = html instanceof HTMLFormElement ? html : html.querySelector("form");
    const data = Object.fromEntries(new FormData(form).entries());
    return rollRaiseCharacteristic(actor, { characteristic: data.characteristic, points: Number(data.points || 0) });
  };
  return reactionPrompt({ title: "Raise Characteristic", content, submit });
}

export async function rollRaiseCharacteristic(actor, data = {}) {
  const characteristic = data.characteristic;
  if (!["physical", "mental", "movement"].includes(characteristic)) {
    ui.notifications.warn("Only Physical, Mental, or Movement can be raised as a Reaction (not Combat).");
    return null;
  }
  const currentValue = Number(actor.system.characteristics?.[characteristic]?.effective || 0);
  const points = Math.max(0, Math.floor(Number(data.points || 0)));
  if (points <= 0) return null;
  if (points > currentValue) {
    ui.notifications.warn(`${characteristic} can be raised by at most its own value (${currentValue}).`);
    return null;
  }
  const cost = points * 10;
  if (cost > getChargedKi(actor)) {
    ui.notifications.warn(`${actor.name} needs ${cost} charged Ki to raise ${characteristic} by ${points}.`);
    return null;
  }
  if (!await spendReaction(actor)) return null;
  const spent = await spendKi(actor, cost);
  if (!spent.ok) return null;
  const temps = foundry.utils.deepClone(actor.system.combatState?.temporaryCharacteristics ?? []);
  temps.push({ characteristic, amount: points, remainingPhases: 1 });
  await actor.update({ "system.combatState.temporaryCharacteristics": temps });
  return chat(actor, "raiseCharacteristic", `${actor.name} raises ${characteristic} by ${points} for 1 Phase.`, {
    characteristic: characteristic.charAt(0).toUpperCase() + characteristic.slice(1),
    pointsRaised: points,
    kiSpent: cost,
    kiRemaining: spent.charged,
    duration: "1 Phase"
  });
}

async function rollVs(actor, key, formula, dc, details = {}) {
  const roll = await new Roll(formula).evaluate();
  const hasDc = Number.isFinite(Number(dc));
  const success = hasDc ? roll.total >= Number(dc) : null;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content: reactionCard(actor, key, {
      formula,
      total: roll.total,
      dc: hasDc ? Number(dc) : null,
      success,
      ...details
    })
  });
  return { roll, dc: hasDc ? Number(dc) : null, success };
}

async function chat(actor, key, message, details = {}) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: reactionCard(actor, key, { message, ...details })
  });
  return { title: REACTION_INFO[key]?.name ?? key, message };
}

function reactionCard(actor, key, data = {}) {
  const info = REACTION_INFO[key] ?? { name: key, summary: "", details: "" };
  const detailRows = Object.entries(data)
    .filter(([field]) => !["message"].includes(field))
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([field, value]) => `<dt>${labelize(field)}</dt><dd>${escapeHtml(formatReactionValue(field, value))}</dd>`)
    .join("");
  return `
    <article class="dbzf-chat-card dbzf-reaction-card" data-kind="reaction">
      <header>
        <h3>${escapeHtml(info.name)}</h3>
        <p>${escapeHtml(actor.name)} - ${escapeHtml(info.summary)}</p>
      </header>
      ${data.message ? `<p>${escapeHtml(data.message)}</p>` : ""}
      ${detailRows ? `<dl class="dbzf-chat-grid">${detailRows}</dl>` : ""}
      <details>
        <summary>Reaction Details</summary>
        <p>${escapeHtml(info.details)}</p>
      </details>
    </article>
  `;
}

function formatReactionValue(field, value) {
  if (field === "success") return value === true ? "Success" : value === false ? "Failure" : value;
  if (field === "mode" && typeof value === "string") return value.charAt(0).toUpperCase() + value.slice(1);
  return value;
}

function labelize(value) {
  const overrides = { dc: "DC", ki: "Ki" };
  const raw = String(value);
  if (overrides[raw]) return overrides[raw];
  return raw.replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase());
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}
