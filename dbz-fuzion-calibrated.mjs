import { DBZFActor, seedPowerUpCaC } from "./module/documents/actor.mjs";
import { DBZFItem } from "./module/documents/item.mjs";
import { CharacterData } from "./module/data/actor-character-data.mjs";
import { TechniqueData } from "./module/data/item-technique-data.mjs";
import { TransformationData } from "./module/data/item-transformation-data.mjs";
import { QualityData } from "./module/data/item-quality-data.mjs";
import { SpeciesData } from "./module/data/item-species-data.mjs";
import { TraitData } from "./module/data/item-trait-data.mjs";
import { BoostData } from "./module/data/item-boost-data.mjs";
import { EquipmentData } from "./module/data/item-equipment-data.mjs";
import { WeaponData } from "./module/data/item-weapon-data.mjs";
import { ArmorData } from "./module/data/item-armor-data.mjs";
import { ConsumableData } from "./module/data/item-consumable-data.mjs";
import { DBZFCharacterSheet } from "./module/sheets/actor-character-sheet.mjs";
import { DBZFItemSheet } from "./module/sheets/item-sheet.mjs";
import { rollCustomSkill, rollSkill } from "./module/rules/rolls.mjs";
import { openAttackDialog, rollAttack } from "./module/rules/attacks.mjs";
import { chargeKi, getChargedKi, setChargedKi, spendKi } from "./module/rules/ki.mjs";
import { applyDamageToTarget, parseQualityRatings, homingAttackBonusDice, relayableDamageOptions } from "./module/rules/damage.mjs";
import { needsGmRelay, registerGmRelay, requestGmAction } from "./module/rules/gm-relay.mjs";
import { applyChatDamage, applyChatDamageToTargets } from "./module/rules/chat-damage.mjs";
import * as qualities from "./module/rules/qualities.mjs";
import * as statusEffects from "./module/rules/status-effects.mjs";
import * as combatState from "./module/rules/combat-state.mjs";
import * as boosts from "./module/rules/boosts.mjs";
import * as reactions from "./module/rules/reactions.mjs";
import { recoverHits, recoverySettings, rollSurvivalCheck } from "./module/rules/recovery.mjs";
import { effectValue, resolveValueFormula } from "./module/rules/value-formula.mjs";
import { applyFightXp, calculateFightXp, openXpEncounterTool } from "./module/rules/xp.mjs";
import { calculateTravel, openTravelDialog, spendTravelKi } from "./module/rules/travel.mjs";
import { calculateActorDerivedData } from "./module/rules/calculations.mjs";
import { XP_BP_BANDS, battlePowerFromXp, calculatePowerCalibration, roundBattlePowerSuggestion, xpFromBattlePower } from "./module/rules/power-calibration.mjs";
import { DBZF_TRANSFORMATIONS, getTransformationChoices } from "./module/rules/transformations.mjs";
import { DBZF_EFFECT_MODES, DBZF_EFFECT_TARGETS } from "./module/rules/effect-targets.mjs";
import { DBZF_SPECIES, getSpeciesChoices } from "./module/rules/species.mjs";
import { DBZF_STARTER_CONTENT } from "./module/rules/starter-content.mjs";
import { seedRulebookCompendium, seedStarterCompendia, unlockSystemCompendia } from "./module/rules/compendium-seeder.mjs";
import { migrateOnReady, pendingMigrationVersions, registerMigrationSetting, runWorldMigration } from "./module/rules/migrations.mjs";

const SYSTEM_ID = "dbz-fuzion-calibrated";

Hooks.once("init", () => {
  game.dbzf = {
    rollSkill,
    rollCustomSkill,
    openAttackDialog,
    rollAttack,
    chargeKi,
    getChargedKi,
    setChargedKi,
    spendKi,
    applyDamageToTarget,
    relayableDamageOptions,
    needsGmRelay,
    requestGmAction,
    applyChatDamage,
    applyChatDamageToTargets,
    parseQualityRatings,
    homingAttackBonusDice,
    qualities,
    statusEffects,
    combatState,
    boosts,
    reactions,
    recoverHits,
    recoverySettings,
    resolveValueFormula,
    effectValue,
    rollSurvivalCheck,
    calculateFightXp,
    openXpEncounterTool,
    applyFightXp,
    calculateTravel,
    openTravelDialog,
    spendTravelKi,
    xpBpBands: XP_BP_BANDS,
    xpFromBattlePower,
    battlePowerFromXp,
    roundBattlePowerSuggestion,
    calculatePowerCalibration,
    calculateActorDerivedData,
    transformations: DBZF_TRANSFORMATIONS,
    getTransformationChoices,
    effectTargets: DBZF_EFFECT_TARGETS,
    effectModes: DBZF_EFFECT_MODES,
    species: DBZF_SPECIES,
    getSpeciesChoices,
    starterContent: DBZF_STARTER_CONTENT,
    seedStarterCompendia,
    seedRulebookCompendium,
    unlockSystemCompendia,
    runWorldMigration: (options) => runWorldMigration(SYSTEM_ID, game.system.version, options),
    pendingMigrationVersions
  };

  registerMigrationSetting(SYSTEM_ID);
  statusEffects.registerStatusEffects();
  // Registered on every client: players to send the request, the GM to execute it.
  registerGmRelay(RELAY_ACTIONS);

  CONFIG.Actor.documentClass = DBZFActor;
  CONFIG.Item.documentClass = DBZFItem;
  CONFIG.Actor.trackableAttributes = {
    character: {
      bar: ["resources.hits", "resources.tempHits", "resources.ki"],
      value: ["resources.defense.value", "resources.powerUp.value", "resources.battlePower.effective"]
    }
  };
  CONFIG.Combat.initiative = {
    formula: "3d6 + @characteristics.mental.effective + (@characteristics.combat.effective / 100)",
    decimals: 2
  };

  CONFIG.Actor.dataModels ??= {};
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Item.dataModels ??= {};
  CONFIG.Item.dataModels.technique = TechniqueData;
  CONFIG.Item.dataModels.transformation = TransformationData;
  CONFIG.Item.dataModels.quality = QualityData;
  CONFIG.Item.dataModels.species = SpeciesData;
  CONFIG.Item.dataModels.trait = TraitData;
  CONFIG.Item.dataModels.boost = BoostData;
  CONFIG.Item.dataModels.equipment = EquipmentData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.consumable = ConsumableData;

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("dbz-fuzion-calibrated", DBZFCharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "DBZ Fuzion Character Sheet"
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("dbz-fuzion-calibrated", DBZFItemSheet, {
    makeDefault: true,
    label: "DBZ Fuzion Item Sheet"
  });
});

const RELAY_ACTIONS = {
  async applyDamage({ targetUuid, rawDamage, options }) {
    const target = await fromUuid(String(targetUuid ?? ""));
    if (!(target instanceof Actor)) throw new Error(`Relayed damage target "${targetUuid}" is not an Actor`);
    return applyDamageToTarget(target, Number(rawDamage || 0), relayableDamageOptions(options ?? {}));
  },

  async recordChatApplication({ messageId, entry }) {
    const message = game.messages.get(String(messageId ?? ""));
    if (!message) throw new Error(`Relayed application refers to an unknown chat message "${messageId}"`);
    const applications = message.getFlag(SYSTEM_ID, "applications") ?? [];
    if (applications.some(application => application.targetUuid === entry?.targetUuid)) return false;
    await message.setFlag(SYSTEM_ID, "applications", [...applications, entry]);
    return true;
  },

  async teamAttackAssist({ targetUuid, contribution }) {
    const target = await fromUuid(String(targetUuid ?? ""));
    if (!(target instanceof Actor)) throw new Error(`Team Attack target "${targetUuid}" is not an Actor`);
    const pending = foundry.utils.deepClone(target.system.combatState?.pending?.teamAttack ?? []);
    pending.push({
      assister: String(contribution?.assister ?? ""),
      label: String(contribution?.label ?? ""),
      bonus: Number(contribution?.bonus || 0),
      techniqueName: String(contribution?.techniqueName ?? ""),
      bonusDice: Number(contribution?.bonusDice || 0),
      qualities: String(contribution?.qualities ?? "")
    });
    await target.update({ "system.combatState.pending.teamAttack": pending });
    return true;
  }
};

function attachChatDamageButtons(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0] ?? null;
  if (!root) return;
  // Mark the message wrapper so the system stylesheet can darken Foundry's default light message
  // frame around our cards, without a :has() selector or touching non-system messages.
  if (root.querySelector(".dbzf-chat-card")) root.classList.add("dbzf-chat-message");
  for (const button of root.querySelectorAll("[data-action='dbzf-apply-damage']")) {
    bindOnce(button, event => {
      event.preventDefault();
      game.dbzf.applyChatDamage(message);
    });
  }
  for (const button of root.querySelectorAll("[data-action='dbzf-apply-damage-secondary']")) {
    bindOnce(button, event => {
      event.preventDefault();
      game.dbzf.applyChatDamage(message, { areaSecondary: true });
    });
  }
  for (const button of root.querySelectorAll("[data-action='dbzf-apply-damage-targets']")) {
    bindOnce(button, event => {
      event.preventDefault();
      game.dbzf.applyChatDamageToTargets(message);
    });
  }
  // Control techniques: land the condition, deal no damage.
  for (const button of root.querySelectorAll("[data-action='dbzf-apply-effects']")) {
    bindOnce(button, event => {
      event.preventDefault();
      game.dbzf.applyChatDamage(message, { effectsOnly: true });
    });
  }
  for (const button of root.querySelectorAll("[data-action='dbzf-apply-effects-targets']")) {
    bindOnce(button, event => {
      event.preventDefault();
      game.dbzf.applyChatDamageToTargets(message, { effectsOnly: true });
    });
  }
  // Override for a Seal/Immobilize technique that is meant to deal damage as well.
  for (const button of root.querySelectorAll("[data-action='dbzf-apply-force-damage']")) {
    bindOnce(button, event => {
      event.preventDefault();
      game.dbzf.applyChatDamage(message, { forceDamage: true });
    });
  }
  for (const button of root.querySelectorAll("[data-action='dbzf-apply-force-damage-targets']")) {
    bindOnce(button, event => {
      event.preventDefault();
      game.dbzf.applyChatDamageToTargets(message, { forceDamage: true });
    });
  }
}

function bindOnce(button, handler) {
  if (button.dataset.damageHandlerReady === "true") return;
  button.dataset.damageHandlerReady = "true";
  button.addEventListener("click", handler);
}

Hooks.on("renderChatMessageHTML", attachChatDamageButtons);
Hooks.on("renderChatMessage", attachChatDamageButtons);

// The icon sprite is injected into the document instead of referenced as an external file. An
// external `<use href="file.svg#id">` does not inherit the host document's `color`, so every icon
// would render black instead of taking its `currentColor` tint from CSS.
async function injectIconSprite() {
  if (document.getElementById("dbzf-icon-sprite")) return;
  try {
    const response = await fetch(`systems/${SYSTEM_ID}/assets/dbzf-sprite.svg`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const wrapper = document.createElement("div");
    wrapper.id = "dbzf-icon-sprite";
    wrapper.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.innerHTML = await response.text();
    document.body.prepend(wrapper);
  } catch (error) {
    console.warn(`${SYSTEM_ID} | icon sprite unavailable, icons will not render`, error);
  }
}

Hooks.once("setup", injectIconSprite);

// Keep the token HUD's Status Effects tab in step with system.combatState.activeConditions.
Hooks.on("updateActor", (actor, changed) => {
  if (!foundry.utils.hasProperty(changed, "system.combatState.activeConditions")) return;
  // Prefer the GM's client so it happens once; with no GM connected an owner does it instead.
  const gm = game.users.activeGM;
  if (gm ? !gm.isSelf : !actor.isOwner) return;
  statusEffects.syncConditionStatuses(actor);
});

// A GM toggling an icon in the token HUD should add/remove the real system condition.
Hooks.on("preCreateActiveEffect", (effect) => {
  const actor = effect.parent;
  if (!(actor instanceof Actor) || actor.type !== "character" || !actor.isOwner) return;
  for (const status of effect.statuses ?? []) statusEffects.onToggleStatusEffect(actor, status, true);
});
Hooks.on("preDeleteActiveEffect", (effect) => {
  const actor = effect.parent;
  if (!(actor instanceof Actor) || actor.type !== "character" || !actor.isOwner) return;
  for (const status of effect.statuses ?? []) statusEffects.onToggleStatusEffect(actor, status, false);
});

Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  game.dbzf.unlockSystemCompendia?.();
  await migrateOnReady(SYSTEM_ID, game.system.version);
  // One-time seed of the Power Up CaC baseline for characters created before this field existed.
  for (const actor of game.actors) {
    if (actor.type === "character" && actor.system.resources?.powerUp?.caCSeeded !== true) await seedPowerUpCaC(actor);
  }
});
