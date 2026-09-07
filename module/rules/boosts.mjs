import { hasAction, hasReaction } from "./combat-state.mjs";
import { getChargedKi } from "./ki.mjs";
import { effectValue } from "./value-formula.mjs";

export async function activateBoost(actor, boost, { render = false } = {}) {
  if (!actor || !boost || boost.type !== "boost") return null;
  if (boost.system.active) return deactivateBoost(actor, boost);

  const activationCost = boost.system.activationCost || "none";
  const needsAction = activationCost === "action" || activationCost === "actionReaction";
  const needsReaction = activationCost === "reaction" || activationCost === "actionReaction";

  // Validate every cost (action, reaction, Ki) BEFORE committing anything, so we never
  // spend an action and then bail because Ki was short.
  if (needsAction && !hasAction(actor)) {
    ui.notifications.warn(`${actor.name} has no action available.`);
    return null;
  }
  if (needsReaction && !hasReaction(actor)) {
    ui.notifications.warn(`${actor.name} has no reaction available.`);
    return null;
  }
  const kiCost = Math.max(0, Number(boost.system.costResolved || 0));
  const chargedKi = getChargedKi(actor);
  if (kiCost > chargedKi) {
    ui.notifications.warn(`${actor.name} does not have enough charged Ki to activate ${boost.name}.`);
    return null;
  }

  const actorUpdate = {};
  if (needsAction) actorUpdate["system.combatState.actionAvailable"] = false;
  if (needsReaction) actorUpdate["system.combatState.reactionAvailable"] = false;
  if (kiCost > 0) {
    actorUpdate["system.resources.ki.value"] = chargedKi - kiCost;
    actorUpdate["system.resources.ki.charged"] = chargedKi - kiCost;
    actorUpdate["system.resources.ki.spent"] = Number(actor.system.resources.ki.spent || 0) + kiCost;
  }

  const durationPhases = Math.max(0, Number(boost.system.durationPhases || 0));
  if (Object.keys(actorUpdate).length) await actor.update(actorUpdate, { render });
  await boost.update({
    "system.active": true,
    "system.remainingPhases": durationPhases
  }, { render });
  const healed = await applyItemInstantHeals(actor, boost, { render });
  if (boost.system.showChatOnActivation !== false) await boostActivationChat(actor, boost, durationPhases, activationCost, kiCost, healed);
  return boost;
}

// Current HITs / Temp HITs cannot be modified by continuous derived effects (they would
// fight damage tracking on every re-derive, so calculations.mjs ignores those targets).
// Instead, an effect on ANY activatable item (boost, trait, technique, ...) that targets
// resources.hits.value / resources.tempHits.value applies as a one-time heal the moment the
// item is activated, spending each effect's resolved Ki cost. This is the supported way to
// "recover current HITs through effects" (e.g. a Majin regeneration trait).
export async function applyItemInstantHeals(actor, item, { render = false } = {}) {
  const healTargets = { "resources.hits.value": "hits", "resources.tempHits.value": "tempHits" };
  const healEffects = (item.system.effects ?? []).filter(effect => effect?.enabled && healTargets[effect.target]);
  if (!healEffects.length) return [];

  const kiCost = healEffects.reduce((sum, effect) => sum + Math.max(0, Number(effect.kiCostResolved || 0)), 0);
  if (kiCost > getChargedKi(actor)) {
    ui.notifications.warn(`${actor.name} needs ${kiCost} charged Ki to resolve ${item.name}.`);
    return [];
  }

  const updates = {};
  const summary = [];
  for (const effect of healEffects) {
    const pool = healTargets[effect.target];
    const key = `system.resources.${pool}.value`;
    const resource = actor.system.resources?.[pool] ?? {};
    const max = Number(resource.max ?? 0);
    const current = Number(updates[key] ?? resource.value ?? 0);
    const value = effectValue(effect, actor.system);
    let next = current;
    if (effect.mode === "override") next = value;
    else if (effect.mode === "multiply") next = current * value;
    else if (effect.mode === "percent") next = current + (max * (value / 100));
    else next = current + value;
    next = Math.min(max, Math.max(0, Math.round(next)));
    updates[key] = next;
    summary.push(`${pool === "tempHits" ? "Temp HITs" : "HITs"} ${current} -> ${next}`);
  }
  if (kiCost > 0) {
    const charged = getChargedKi(actor);
    updates["system.resources.ki.value"] = Math.max(0, charged - kiCost);
    updates["system.resources.ki.charged"] = Math.max(0, charged - kiCost);
    updates["system.resources.ki.spent"] = Number(actor.system.resources.ki.spent || 0) + kiCost;
    summary.push(`Ki -${kiCost}`);
  }
  if (Object.keys(updates).length) await actor.update(updates, { render });
  return summary;
}

export async function deactivateBoost(actor, boost, { render = false } = {}) {
  if (!boost || boost.type !== "boost") return null;
  await boost.update({
    "system.active": false,
    "system.remainingPhases": 0
  }, { render });
  return boost;
}

export async function advanceBoostDurations(actor) {
  const expired = [];
  const updates = [];
  for (const boost of actor.items.filter(item => item.type === "boost" && item.system?.active)) {
    const remaining = Number(boost.system.remainingPhases || 0);
    if (remaining <= 0) continue;
    const next = remaining - 1;
    updates.push({
      _id: boost.id,
      "system.remainingPhases": next,
      "system.active": next > 0
    });
    if (next <= 0) expired.push(boost.name);
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  return expired;
}

async function boostActivationChat(actor, boost, durationPhases, activationCost, kiCost = 0, healed = []) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <article class="dbzf-chat-card" data-kind="item">
        <header>
          <h3>${escapeHtml(boost.name)}</h3>
          <p>${escapeHtml(actor.name)} activates a boost.</p>
        </header>
        <dl class="dbzf-chat-grid">
          <dt>Cost</dt><dd>${activationLabel(activationCost)}</dd>
          ${kiCost > 0 ? `<dt>Ki Spent</dt><dd>${kiCost} (${getChargedKi(actor)} remaining)</dd>` : ""}
          ${(healed ?? []).length ? `<dt>Healed</dt><dd>${escapeHtml(healed.join("; "))}</dd>` : ""}
          <dt>Duration</dt><dd>${durationPhases > 0 ? `${durationPhases} phase(s)` : "Indefinite"}</dd>
        </dl>
        ${boost.system.rulesText ? `<section>${boost.system.rulesText}</section>` : ""}
        ${boost.system.description ? `<section>${boost.system.description}</section>` : ""}
      </article>
    `
  });
}

function activationLabel(value) {
  if (value === "action") return "Action";
  if (value === "reaction") return "Reaction";
  if (value === "actionReaction") return "Action + Reaction";
  return "None";
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}
