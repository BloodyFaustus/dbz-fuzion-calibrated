import { advanceOngoingEffects } from "./status-effects.mjs";
import { advanceBoostDurations } from "./boosts.mjs";

export function hasAction(actor) {
  return actor.system.combatState?.actionAvailable !== false;
}

export function hasReaction(actor) {
  return actor.system.combatState?.reactionAvailable !== false;
}

export async function spendAction(actor, { warn = true } = {}) {
  if (!hasAction(actor)) {
    if (warn) ui.notifications.warn(`${actor.name} has no action available.`);
    return false;
  }
  await actor.update({ "system.combatState.actionAvailable": false });
  return true;
}

export async function spendReaction(actor, { warn = true } = {}) {
  if (!hasReaction(actor)) {
    if (warn) ui.notifications.warn(`${actor.name} has no reaction available.`);
    return false;
  }
  await actor.update({ "system.combatState.reactionAvailable": false });
  return true;
}

export async function resetPhase(actor) {
  await actor.update({
    "system.combatState.actionAvailable": true,
    "system.combatState.reactionAvailable": true
  });
  return true;
}

export async function restartPhases(actor) {
  await actor.update({
    "system.combatState.phaseCounter": 1,
    "system.combatState.roundCounter": 1,
    "system.combatState.phasesSinceRecovery": 0,
    "system.combatState.actionAvailable": true,
    "system.combatState.reactionAvailable": true,
    "system.combatState.temporaryCharacteristics": []
  });
  return true;
}

export async function advancePhase(actor) {
  const phaseCounter = Number(actor.system.combatState?.phaseCounter || 0) + 1;
  const phasesSinceRecovery = Number(actor.system.combatState?.phasesSinceRecovery || 0) + 1;
  const currentTemps = actor.system.combatState?.temporaryCharacteristics ?? [];
  const nextTemps = currentTemps
    .map(temp => ({ ...temp, remainingPhases: Number(temp.remainingPhases || 0) - 1 }))
    .filter(temp => temp.remainingPhases > 0);
  const updateData = {
    "system.combatState.phaseCounter": phaseCounter,
    "system.combatState.phasesSinceRecovery": phasesSinceRecovery,
    "system.combatState.actionAvailable": true,
    "system.combatState.reactionAvailable": true
  };
  if (currentTemps.length) updateData["system.combatState.temporaryCharacteristics"] = nextTemps;
  await actor.update(updateData);
  const ongoingEffects = await advanceOngoingEffects(actor);
  const expiredBoosts = await advanceBoostDurations(actor);
  const expiredCharacteristics = currentTemps.length - nextTemps.length;
  return { phaseCounter, phasesSinceRecovery, ongoingEffects, expiredBoosts, expiredCharacteristics };
}

export async function setPending(actor, key, value = true) {
  await actor.update({ [`system.combatState.pending.${key}`]: value });
  return value;
}

export async function clearPending(actor, key) {
  return setPending(actor, key, false);
}
