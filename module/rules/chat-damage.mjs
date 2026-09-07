import { applyDamageToTarget } from "./damage.mjs";
import { needsGmRelay, requestGmAction } from "./gm-relay.mjs";

export async function applyChatDamage(message, options = {}) {
  const attack = message.getFlag("dbz-fuzion-calibrated", "attack");
  if (!attack) {
    ui.notifications.warn("This chat card has no DBZ Fuzion attack data.");
    return null;
  }

  const targetActor = options.targetActor ?? selectedTargetActor();
  if (!targetActor) return null;

  const applications = message.getFlag("dbz-fuzion-calibrated", "applications") ?? [];
  if (applications.some(application => application.targetUuid === targetActor.uuid)) {
    ui.notifications.warn(`${targetActor.name} has already received this damage.`);
    return null;
  }

  // A caller (e.g. the Ki Barrier reaction) can pass a pre-rolled kiDeflection to reduce this
  // attack; otherwise fall back to the target's own Ki Deflection quality prompt.
  // Nothing to deflect when no damage is being dealt, so skip the prompt in effects-only mode.
  const effectsOnly = options.effectsOnly === true;
  const forceDamage = options.forceDamage === true;
  // A technique flagged "deals no damage" zeroes it wherever the damage is applied from.
  const zeroDamage = attack.zeroDamage === true;
  const kiDeflection = (effectsOnly || zeroDamage) ? null : (options.kiDeflection ?? await promptKiDeflection(targetActor, attack, options));
  const result = await applyDamageToTarget(targetActor, attack.rawDamage, {
    qualities: attack.qualitiesText,
    qualityRatings: attack.qualityRatings,
    sourceName: attack.attackName,
    areaSecondary: options.areaSecondary === true,
    barrierBypassed: options.barrierBypassed === true,
    effectsOnly,
    zeroDamage,
    forceDamage,
    kiDeflection
  });
  if (!result) return null;
  const entry = { targetUuid: targetActor.uuid, targetName: targetActor.name, attackImg: attack.chatImg || "", damageResult: attack.damageResult ?? attack.damageFormula ?? "", result };
  await recordApplication(message, entry);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
    content: damageApplicationCard(entry)
  });
  return result;
}

export async function applyChatDamageToTargets(message, options = {}) {
  const attack = message.getFlag("dbz-fuzion-calibrated", "attack");
  if (!attack) {
    ui.notifications.warn("This chat card has no DBZ Fuzion attack data.");
    return [];
  }

  const targetActors = options.targetActors ?? selectedTargetActors();
  if (!targetActors.length) return [];

  const results = [];
  for (const [index, targetActor] of targetActors.entries()) {
    const areaSecondary = options.areaSecondary === true || (index > 0 && Number(attack.area || 0) > 0);
    const result = await applyChatDamage(message, { targetActor, areaSecondary,
      barrierBypassed: options.barrierBypassed === true, effectsOnly: options.effectsOnly === true,
      forceDamage: options.forceDamage === true });
    if (result) results.push(result);
  }
  return results;
}

// The "already applied to" list lives on the attack card, which only its author (usually the
// GM or the attacker) may edit. A defender applying damage to themselves - a Ki Barrier, say -
// must therefore ask the GM's client to record it, and the damage still stands if that fails.
export async function recordApplication(message, entry) {
  const applications = message.getFlag("dbz-fuzion-calibrated", "applications") ?? [];
  if (!needsGmRelay(message)) {
    await message.setFlag("dbz-fuzion-calibrated", "applications", [...applications, entry]);
    return true;
  }
  const response = await requestGmAction("recordChatApplication", { messageId: message.id, entry }, { quiet: true });
  if (!response.ok) console.warn("dbz-fuzion-calibrated | damage applied but not recorded on the attack card", response.reason);
  return response.ok;
}

function selectedTargetActor() {
  // Prefer explicitly TARGETED tokens (crosshair) over merely selected/controlled ones, so
  // "Take Damage" hits the token the attacker aimed at rather than whatever the user has clicked.
  const targeted = Array.from(game.user?.targets ?? []).filter(token => token.actor);
  if (targeted.length === 1) return targeted[0].actor;
  const controlled = Array.from(canvas?.tokens?.controlled ?? []).filter(token => token.actor);
  if (controlled.length === 1) return controlled[0].actor;
  ui.notifications.warn("Target (or select) exactly one character/token.");
  return null;
}

function selectedTargetActors() {
  // Prefer explicitly targeted tokens over selected/controlled ones (see selectedTargetActor).
  const targeted = Array.from(game.user?.targets ?? []).filter(token => token.actor);
  if (targeted.length) return targeted.map(token => token.actor);
  const controlled = Array.from(canvas?.tokens?.controlled ?? []).filter(token => token.actor);
  if (controlled.length) return controlled.map(token => token.actor);
  ui.notifications.warn("Target (or select) one or more character/token targets.");
  return [];
}

function damageApplicationCard(entry) {
  const result = entry.result;
  const conditions = (result.conditionsApplied ?? []).map(condition => condition.key).join(", ") || "None";
  const multi = result.multi ? `
        <dt>Multi</dt><dd>${result.multi.additionalHits} additional hit(s) (${result.multi.formula})</dd>
        <dt>Effective before Multi</dt><dd>${result.multi.baseEffectiveDamage}</dd>
        <dt>Effective after Multi</dt><dd>${result.multi.totalEffectiveDamage}</dd>` : "";
  const original = result.originalRawDamage !== undefined && result.originalRawDamage !== result.rawDamage ? `<dt>Original Raw</dt><dd>${result.originalRawDamage}</dd>` : "";
  const deflection = result.kiDeflection ? `<dt>Ki Deflection</dt><dd>${result.kiDeflection.blocked} blocked (${escapeHtml(result.kiDeflection.result)})</dd>` : "";
  const armor = armorRows(result.armor);
  if (result.effectsOnly) {
    return `
    <article class="dbzf-chat-card" data-kind="condition">
      <header class="dbzf-chat-header-with-img">${entry.attackImg ? `<img src="${entry.attackImg}" alt="" />` : ""}<div><h3>Effects Applied</h3><p>${escapeHtml(entry.targetName)}</p></div></header>
      <dl class="dbzf-chat-grid">
        <dt>Damage</dt><dd>None${result.zeroDamageReason === "control" ? " (Seal/Immobilize)" : result.zeroDamageReason === "technique" ? " (technique deals no damage)" : " (effects only)"}</dd>
        <dt>Conditions</dt><dd>${escapeHtml(conditions)}</dd>
      </dl>
      <p class="dbzf-chat-notes">${result.zeroDamageReason === "control"
        ? "Sealing and Immobilization are control effects: the condition lands and no HIT damage is dealt. Use \"Deal Damage Anyway\" if this technique is meant to do both."
        : "This technique lands its effects without dealing HIT damage."}</p>
    </article>`;
  }
  return `
    <article class="dbzf-chat-card" data-kind="damage">
      <header class="dbzf-chat-header-with-img">${entry.attackImg ? `<img src="${entry.attackImg}" alt="" />` : ""}<div><h3>Damage Applied</h3><p>${escapeHtml(entry.targetName)}</p></div></header>
      <dl class="dbzf-chat-grid">
        ${original}
        <dt>Raw Damage</dt><dd title="${escapeHtml(entry.damageResult)}">${result.rawDamage}</dd>
        ${deflection}
        <dt>Defense</dt><dd>${result.defense}</dd>
        <dt>Deadly</dt><dd>${result.deadly}</dd>
        <dt>Adjusted Defense</dt><dd>${result.adjustedDefense}</dd>
        <dt>Effective Damage</dt><dd>${result.effectiveDamage}</dd>
        ${armor}
        <dt>Temp HITs</dt><dd>${result.tempHitsBefore} -> ${result.tempHitsAfter}</dd>
        <dt>HITs</dt><dd>${result.hitsBefore} -> ${result.hitsAfter}</dd>
        ${multi}
        <dt>Conditions</dt><dd>${escapeHtml(conditions)}</dd>
      </dl>
    </article>
  `;
}

function armorRows(armor) {
  if (!armor?.hits?.length) return "";
  const rows = armor.hits.map(hit => {
    const destroyed = hit.destroyed ? " destroyed" : "";
    return `${escapeHtml(hit.name)} ${hit.before} -> ${hit.after}${destroyed}`;
  }).join("<br>");
  return `<dt>Armor</dt><dd>${rows}</dd>`;
}

async function promptKiDeflection(actor, attack, options = {}) {
  if (options.skipKiDeflection === true) return null;
  if (!isEnergyAttack(attack)) return null;
  const rating = kiDeflectionRating(actor);
  if (rating <= 0) return null;

  const apply = await confirmKiDeflection(actor, attack, rating);
  if (!apply) return null;

  const roll = await new Roll(`${rating}d6`).evaluate();
  return {
    rating,
    blocked: Math.max(0, Number(roll.total || 0)),
    formula: roll.formula,
    result: roll.result ?? roll.formula
  };
}

function isEnergyAttack(attack) {
  if (attack.attackType === "power") return true;
  const text = `${attack.tags || ""} ${attack.qualitiesText || ""} ${attack.attackName || ""}`.toLowerCase();
  return /\b(ki|energy|power|blast|beam)\b/.test(text);
}

function kiDeflectionRating(actor) {
  let total = 0;
  for (const item of actor.items ?? []) {
    if (!["armor", "equipment", "trait", "species", "transformation"].includes(item.type)) continue;
    if (item.system?.active !== true) continue;
    if (item.type === "armor" && item.system?.destroyed === true) continue;
    for (const quality of item.system?.embeddedQualities ?? []) {
      const key = String(quality.key || quality.name || "").toLowerCase().replace(/[^a-z]/g, "");
      if (!["kideflection", "kideflect", "deflection"].includes(key)) continue;
      total += Math.max(1, Number(quality.rating || 1));
    }
  }
  return total;
}

async function confirmKiDeflection(actor, attack, rating) {
  const content = `<p>${escapeHtml(actor.name)} has Ki Deflection ${rating}. Apply it to ${escapeHtml(attack.attackName || "this attack")} and roll ${rating}d6 blocked damage?</p>`;
  if (foundry.applications?.api?.DialogV2) {
    return foundry.applications.api.DialogV2.confirm({
      window: { title: "Apply Ki Deflection?" },
      content,
      yes: { label: "Apply" },
      no: { label: "Do Not Apply" },
      defaultYes: true
    });
  }

  return new Promise(resolve => {
    new Dialog({
      title: "Apply Ki Deflection?",
      content,
      buttons: {
        apply: { label: "Apply", callback: () => resolve(true) },
        skip: { label: "Do Not Apply", callback: () => resolve(false) }
      },
      default: "apply",
      close: () => resolve(false)
    }).render(true);
  });
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}
