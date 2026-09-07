import { calculateActorDerivedData } from "../rules/calculations.mjs";
import { getTransformation } from "../rules/transformations.mjs";

export class DBZFActor extends Actor {
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);
    if (this.type !== "character") return;

    const nextCharged = getUpdatePath(changed, "system.resources.ki.charged");
    const nextValue = getUpdatePath(changed, "system.resources.ki.value");
    if (nextCharged !== undefined && nextValue === undefined) {
      const normalized = Math.max(0, Number(nextCharged || 0));
      setUpdatePath(changed, "system.resources.ki.value", normalized);
      setUpdatePath(changed, "system.resources.ki.charged", normalized);
    }

    const selected = getUpdatePath(changed, "system.transformation.selected");
    if (!selected || selected === this.system.transformation.selected) return;

    const expanded = foundry.utils.expandObject(foundry.utils.deepClone(changed));
    const baseMax = maxHitsForSelection(this.system, this, "base", expanded);
    const newMax = maxHitsForSelection(this.system, this, selected, expanded);
    const oldBonus = Number(this.system.resources?.hits?.transformationBonusApplied || 0);
    const newBonus = newMax - baseMax;
    const currentHits = Number(getUpdatePath(changed, "system.resources.hits.value") ?? this.system.resources.hits.value ?? 0);
    const prior = getTransformation(this.system.transformation.selected);
    // Forms whose "HITs +X%" is a heal rather than a maximum increase (Saiyan Rage, High Tension)
    // restore a share of the HIT total on entry, clamped to the new maximum.
    const healPercent = Number(getTransformation(selected).onEnter?.healPercentOfMax || 0);
    const healed = healPercent > 0 ? Math.round(newMax * (healPercent / 100)) : 0;
    const nextHits = currentHits - oldBonus + newBonus + healed;
    setUpdatePath(changed, "system.resources.hits.value", healed > 0 ? Math.min(newMax, nextHits) : nextHits);
    setUpdatePath(changed, "system.resources.hits.transformationBonusApplied", newBonus);
    setUpdatePath(changed, "system.transformation.previousSelected", this.system.transformation.selected);
    if (prior.onExit?.drainChargedKi) {
      setUpdatePath(changed, "system.resources.ki.value", 0);
      setUpdatePath(changed, "system.resources.ki.charged", 0);
    }
  }

  async _onCreate(data, options, userId) {
    await super._onCreate(data, options, userId);
    if (this.type !== "character" || game.userId !== userId) return;
    await seedNewCharacter(this);
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    if (this.type !== "character") return;
    calculateActorDerivedData(this.system, this);
  }

  getRollData() {
    if (this.type !== "character") return super.getRollData();
    // Return a serialized copy of the PREPARED system so @-references in roll formulas
    // (e.g. initiative's @characteristics.mental.effective) resolve to current derived
    // values. toObject(false) serializes the prepared (derived) state; toObject(true)
    // would return source data with stale persisted derived fields.
    //
    // We must NOT merge a source copy over the live system the way the previous code did:
    // super.getRollData() returns the LIVE system object, and mergeObject(live, source,
    // {inplace:false}) does not deep-clone nested DataModel objects, so it overwrote the
    // live derived values (e.g. transformation-boosted "effective") with stale source
    // values every time a chat card or roll was built. That was the root cause of
    // transformations and other derived stats "reverting" right after acting.
    return this.system.toObject(false);
  }
}

// The Character-Creation percentage: a character's starting Physical + Mental.
function characterCreationPercent(actor) {
  return Number(actor.system.characteristics?.physical?.base || 0)
    + Number(actor.system.characteristics?.mental?.base || 0);
}

// Seed the Power Up Character-Creation baseline (%) from a character's starting Physical + Mental,
// exactly once (tracked by caCSeeded). After this it stays fixed as base stats grow; only
// techniques/traits/bonuses change the total %. Editable on the sheet if it needs correcting.
//
// This is the BACKFILL path, used by the ready hook for characters that predate the CaC field.
// It touches nothing but the CaC figure — seeding Battle Power or HITs here would overwrite
// values a GM has already assigned on every existing character in the world.
export async function seedPowerUpCaC(actor) {
  if (actor?.type !== "character") return;
  if (actor.system.resources?.powerUp?.caCSeeded === true) return;
  await actor.update({
    "system.resources.powerUp.baseCaC": characterCreationPercent(actor),
    "system.resources.powerUp.caCSeeded": true
  });
}

// Creation-time seeding: every starting value the rules derive from a character's opening stats.
//   CaC %       = Physical + Mental
//   Battle Power = CaC x 10                         ("Battle Power / Ki Capacity = (P + M) x 10")
//   HITs        = (20 x Physical) + (3 x EXP) + 100 + Body ranks, read off the prepared maximum
// Guarded by caCSeeded so duplicating, importing or restoring a character never re-seeds it.
export async function seedNewCharacter(actor) {
  if (actor?.type !== "character") return;
  if (actor.system.resources?.powerUp?.caCSeeded === true) return;
  const startingPercent = characterCreationPercent(actor);
  await actor.update({
    "system.resources.powerUp.baseCaC": startingPercent,
    "system.resources.powerUp.caCSeeded": true,
    "system.resources.battlePower.value": startingPercent * 10,
    // hits.max is derived every prepare, so this is the formula's own result rather than a
    // hardcoded starting total — a new character opens at full health whatever its stats are.
    "system.resources.hits.value": Number(actor.system.resources?.hits?.max || 0)
  });
}

function maxHitsForSelection(system, actor, selected, expandedUpdate = {}) {
  const clone = foundry.utils.deepClone(system.toObject?.() ?? system);
  foundry.utils.mergeObject(clone, expandedUpdate, { inplace: true });
  clone.transformation ??= {};
  clone.transformation.selected = selected || "base";
  calculateActorDerivedData(clone, actor);
  return Number(clone.resources?.hits?.max || 0);
}

function getUpdatePath(update, path) {
  if (Object.hasOwn(update, path)) return update[path];
  return foundry.utils.getProperty(update, path);
}

function setUpdatePath(update, path, value) {
  if (Object.keys(update).some(key => key.includes("."))) update[path] = value;
  else foundry.utils.setProperty(update, path, value);
}
