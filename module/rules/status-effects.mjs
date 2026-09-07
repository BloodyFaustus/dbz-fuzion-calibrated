export async function addCondition(actor, conditionData) {
  const conditions = [...(actor.system.combatState?.activeConditions ?? [])];
  const key = conditionData.key || "custom";
  const existingIndex = key === "slow" ? conditions.findIndex(condition => condition.key === "slow") : -1;
  const condition = {
    id: conditionData.id || foundry.utils.randomID(),
    key,
    sourceName: conditionData.sourceName || "",
    rating: Number(conditionData.rating || 0),
    value: Number(conditionData.value || 0),
    remainingTicks: Number(conditionData.remainingTicks || 0),
    saveSkill: conditionData.saveSkill || "",
    saveDC: Number(conditionData.saveDC || 0),
    breakDamageThreshold: Number(conditionData.breakDamageThreshold || 0),
    metadata: conditionData.metadata || ""
  };

  if (existingIndex >= 0) conditions[existingIndex] = { ...conditions[existingIndex], ...condition };
  else conditions.push(condition);
  await actor.update({ "system.combatState.activeConditions": conditions });
  return condition;
}

export async function removeCondition(actor, conditionId) {
  const conditions = (actor.system.combatState?.activeConditions ?? []).filter(condition => condition.id !== conditionId);
  await actor.update({ "system.combatState.activeConditions": conditions });
  return conditions;
}

export async function advanceOngoingEffects(actor) {
  const conditions = [...(actor.system.combatState?.activeConditions ?? [])];
  const remaining = [];
  const results = [];

  for (const condition of conditions) {
    if (condition.key === "burn") {
      const damage = Number(condition.value || 0);
      const result = await applyDirectConditionDamage(actor, damage, condition.sourceName || "Burn");
      results.push({ key: "burn", damage, result });
      const ticks = Number(condition.remainingTicks || 0) - 1;
      if (ticks > 0) remaining.push({ ...condition, remainingTicks: ticks });
      continue;
    }

    if (condition.key === "slow") {
      const rating = Number(condition.rating || 0) - 1;
      results.push({ key: "slow", rating });
      if (rating > 0) remaining.push({ ...condition, rating, remainingTicks: Math.max(0, Number(condition.remainingTicks || 0) - 1) });
      continue;
    }

    remaining.push(condition);
  }

  if (results.length) await actor.update({ "system.combatState.activeConditions": remaining });
  if (results.length) await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: ongoingEffectsCard(actor, results, remaining)
  });
  return results;
}

export async function rollConditionSave(actor, conditionId) {
  const condition = (actor.system.combatState?.activeConditions ?? []).find(entry => entry.id === conditionId);
  if (!condition) return null;
  const skillKey = condition.saveSkill || "body";
  const total = Number(actor.system.skills?.[skillKey]?.total || 0);
  const dc = Number(condition.saveDC || 0);
  const roll = await new Roll(`3d6 + ${total}`).evaluate();
  const success = roll.total >= dc;
  if (success) await removeCondition(actor, conditionId);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content: `<article class="dbzf-chat-card" data-kind="condition"><h3>${escapeHtml(labelCondition(condition))} Save</h3><p>${escapeHtml(actor.name)} rolled ${roll.total} vs DC ${dc}.</p><p>${success ? "Condition removed." : "Condition remains."}</p><details><summary>Condition Details</summary><p>${escapeHtml(conditionSummary(condition))}</p></details></article>`
  });
  return { roll, success, dc };
}

export async function applyDirectConditionDamage(actor, amount, sourceName = "Condition") {
  const rawDamage = Math.max(0, Math.round(Number(amount || 0)));
  const tempBefore = Number(actor.system.resources.tempHits.value || 0);
  const hitsBefore = Number(actor.system.resources.hits.value || 0);
  const tempDamage = Math.min(tempBefore, rawDamage);
  const hitsDamage = rawDamage - tempDamage;
  const tempAfter = tempBefore - tempDamage;
  const hitsAfter = hitsBefore - hitsDamage;
  await actor.update({
    "system.resources.tempHits.value": tempAfter,
    "system.resources.hits.value": hitsAfter
  });
  return { sourceName, rawDamage, tempHitsBefore: tempBefore, tempHitsAfter: tempAfter, hitsBefore, hitsAfter };
}

export function highestConditionRating(actor, key) {
  return Math.max(0, ...(actor.system.combatState?.activeConditions ?? []).filter(condition => condition.key === key).map(condition => Number(condition.rating || 0)));
}

export function conditionSummary(condition) {
  if (condition.key === "burn") return `Takes ${condition.value} direct damage each tick for ${condition.remainingTicks} more tick(s). Mind save DC ${condition.saveDC} can remove it.`;
  if (condition.key === "slow") return `Movement is reduced by ${condition.rating}, minimum 1. It degrades by 1 each tick.`;
  if (condition.key === "immobilized") return `Cannot act/move normally until Body save DC ${condition.saveDC}, release, or ${condition.breakDamageThreshold} damage breaks it.`;
  if (condition.key === "sealed") return `Cannot act/move normally until Mind save DC ${condition.saveDC}, release, or ${condition.breakDamageThreshold} damage breaks it.`;
  return condition.sourceName || "Custom condition.";
}

export function labelCondition(condition) {
  const labels = { burn: "Burn", slow: "Slow", immobilized: "Immobilized", sealed: "Sealed" };
  return labels[condition.key] ?? condition.key;
}

function ongoingEffectsCard(actor, results, remaining) {
  const rows = results.map(result => {
    if (result.key === "burn") return `<li>Burn dealt ${result.damage} direct damage.</li>`;
    if (result.key === "slow") return `<li>Slow degraded to ${Math.max(0, result.rating)}.</li>`;
    return `<li>${escapeHtml(result.key)} advanced.</li>`;
  }).join("");
  const active = remaining.map(condition => `${labelCondition(condition)} ${condition.rating || ""}`).join(", ") || "None";
  return `
    <article class="dbzf-chat-card dbzf-condition-card" data-kind="condition">
      <header><h3>Ongoing Effects</h3><p>${escapeHtml(actor.name)}</p></header>
      <ul>${rows}</ul>
      <details>
        <summary>Remaining Conditions</summary>
        <p>${escapeHtml(active)}</p>
      </details>
    </article>
  `;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

/* ---------------------------------------------------------------------------
   Foundry status-effect integration.

   Conditions live in system.combatState.activeConditions, which is where every rule reads them
   from. Registering them with CONFIG.statusEffects puts matching icons in the token HUD's Status
   Effects tab and mirrors the system state onto the token, so a GM can see at a glance who is
   burning or sealed without opening a sheet.
   --------------------------------------------------------------------------- */

export const DBZF_CONDITIONS = {
  burn: { id: "dbzfBurn", name: "Burn", img: "systems/dbz-fuzion-calibrated/assets/icons/cond-burn.svg",
    saveSkill: "mind", summary: "Direct damage each tick until a Mind save clears it." },
  slow: { id: "dbzfSlow", name: "Slow", img: "systems/dbz-fuzion-calibrated/assets/icons/cond-slow.svg",
    saveSkill: "", summary: "Movement reduced by the rating, degrading by 1 each tick." },
  immobilized: { id: "dbzfImmobilized", name: "Immobilized", img: "systems/dbz-fuzion-calibrated/assets/icons/cond-immobilized.svg",
    saveSkill: "body", summary: "Cannot act or move until a Body save, release, or enough damage breaks it." },
  sealed: { id: "dbzfSealed", name: "Sealed", img: "systems/dbz-fuzion-calibrated/assets/icons/cond-sealed.svg",
    saveSkill: "mind", summary: "Cannot act or move until a Mind save, release, or enough damage breaks it." }
};

const STATUS_ID_TO_KEY = Object.fromEntries(Object.entries(DBZF_CONDITIONS).map(([key, data]) => [data.id, key]));

export function registerStatusEffects() {
  CONFIG.statusEffects = Object.values(DBZF_CONDITIONS).map(data => ({
    id: data.id,
    name: data.name,
    img: data.img,
    description: data.summary
  }));
}

// Actors whose effects the mirror is currently rewriting. The creates and deletes it performs
// fire preCreate/preDeleteActiveEffect, and those handlers write conditions straight back:
// without this guard, creating an effect re-entered the mirror before the create had committed
// (producing a duplicate), and deleting a duplicate cleared the very condition it mirrored.
const syncing = new Set();

// Mirror system conditions onto the actor's ActiveEffects so the token HUD reflects them.
export async function syncConditionStatuses(actor) {
  if (actor?.type !== "character") return;
  if (syncing.has(actor.id)) return;
  syncing.add(actor.id);
  try {
    return await rewriteConditionStatuses(actor);
  } finally {
    syncing.delete(actor.id);
  }
}

async function rewriteConditionStatuses(actor) {
  const active = new Set((actor.system.combatState?.activeConditions ?? [])
    .map(condition => DBZF_CONDITIONS[condition.key]?.id).filter(Boolean));

  // A status can sit on more than one effect (a duplicate from an earlier race, or one a GM
  // added by hand), so collect EVERY effect per status rather than keeping only the last.
  const existing = new Map();
  for (const effect of actor.effects) {
    for (const status of effect.statuses ?? []) {
      if (!existing.has(status)) existing.set(status, []);
      existing.get(status).push(effect);
    }
  }

  const toAdd = [...active].filter(id => !existing.has(id));
  const toRemove = [];
  for (const [id, effects] of existing) {
    if (!STATUS_ID_TO_KEY[id]) continue;             // not one of ours; leave it alone
    if (!active.has(id)) toRemove.push(...effects);  // condition gone: drop all of them
    else toRemove.push(...effects.slice(1));         // condition active: keep one, drop duplicates
  }

  if (toAdd.length) {
    const data = toAdd.map(id => {
      const def = CONFIG.statusEffects.find(effect => effect.id === id) ?? {};
      return { name: def.name ?? id, img: def.img, statuses: [id], origin: actor.uuid };
    });
    await actor.createEmbeddedDocuments("ActiveEffect", data);
  }
  if (toRemove.length) {
    const ids = [...new Set(toRemove.map(effect => effect.id))].filter(id => id && actor.effects.has(id));
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
}

// Clicking an icon in the token HUD adds/removes the matching system condition, so the two
// representations cannot drift apart.
export async function onToggleStatusEffect(actor, statusId, active) {
  const key = STATUS_ID_TO_KEY[statusId];
  if (!key || actor?.type !== "character") return false;
  // Ignore effects the mirror itself is adding or removing; only a real HUD toggle counts.
  if (syncing.has(actor.id)) return false;
  const current = actor.system.combatState?.activeConditions ?? [];
  const match = current.find(condition => condition.key === key);
  if (active && !match) {
    await addCondition(actor, { key, sourceName: "Token HUD", rating: 1, remainingTicks: 1,
      saveSkill: DBZF_CONDITIONS[key].saveSkill, saveDC: 10 });
    return true;
  }
  if (!active && match) {
    await removeCondition(actor, match.id);
    return true;
  }
  return false;
}
