import { spendAction } from "./combat-state.mjs";

export function getChargedKi(actor) {
  const ki = actor.system.resources.ki ?? {};
  return Number(ki.value ?? ki.charged ?? 0);
}

export async function setChargedKi(actor, value) {
  const max = Number(actor.system.resources.ki.max || actor.system.resources.battlePower.effective || 0);
  const next = Math.max(0, Math.min(max, Math.round(Number(value || 0))));
  await actor.update({
    "system.resources.ki.value": next,
    "system.resources.ki.charged": next
  });
  return next;
}

export async function chargeKi(actor, multiplier = 1, options = {}) {
  const consumeAction = options.consumeAction ?? true;
  if (activeSpecies(actor)?.system?.kiChargeMode === "androidLimited") {
    ui.notifications.warn(`${actor.name} cannot charge Ki normally.`);
    return null;
  }
  if (consumeAction && !await spendAction(actor)) return null;
  const charged = getChargedKi(actor);
  const max = Number(actor.system.resources.ki.max || actor.system.resources.battlePower.effective || 0);
  const powerUp = chargeRate(actor);
  const next = Math.min(max, Math.round(charged + (powerUp * multiplier)));
  await actor.update({
    "system.resources.ki.value": next,
    "system.resources.ki.charged": next
  });
  return next;
}

export async function spendKi(actor, amount) {
  const cost = Math.max(0, Math.round(Number(amount || 0)));
  const charged = getChargedKi(actor);
  if (cost > charged) return { ok: false, charged, cost };
  const spent = Number(actor.system.resources.ki.spent || 0);
  await actor.update({
    "system.resources.ki.value": charged - cost,
    "system.resources.ki.charged": charged - cost,
    "system.resources.ki.spent": spent + cost
  });
  return { ok: true, charged: charged - cost, cost };
}

function chargeRate(actor) {
  const species = activeSpecies(actor);
  if (species?.system?.kiChargeMode === "androidLimited") return 0;
  if (species?.system?.kiChargeMode === "androidInfinite") {
    const max = Number(actor.system.resources.ki.max || actor.system.resources.battlePower.effective || 0);
    return Math.round(max * 0.2);
  }
  return Number(actor.system.resources.powerUp.value || 0);
}

function activeSpecies(actor) {
  return Array.from(actor.items ?? []).find(item => item.type === "species" && item.system?.active);
}
