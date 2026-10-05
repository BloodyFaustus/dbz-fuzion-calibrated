import { getTransformation, getTransformationChoices } from "../rules/transformations.mjs";
import { rollCustomSkill, rollSkill } from "../rules/rolls.mjs";
import { attackDamageDicePreview, openAttackDialog } from "../rules/attacks.mjs";
import { getSpeciesChoices, DBZF_SPECIES } from "../rules/species.mjs";
import { chargeKi, getChargedKi } from "../rules/ki.mjs";
import { advancePhase, resetPhase, restartPhases, spendAction, spendReaction, setPending } from "../rules/combat-state.mjs";
import { recoverHits, recoverySettings, rollSurvivalCheck } from "../rules/recovery.mjs";
import { openXpEncounterTool } from "../rules/xp.mjs";
import { openTravelDialog } from "../rules/travel.mjs";
import * as reactions from "../rules/reactions.mjs";
import { activateBoost, deactivateBoost } from "../rules/boosts.mjs";
import { removeCondition, rollConditionSave, conditionSummary, labelCondition } from "../rules/status-effects.mjs";
import { capturePartState, restorePartState, withScrollPreserved } from "./scroll-preservation.mjs";
import { needsGmRelay, requestGmAction } from "../rules/gm-relay.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
const FoundryTextEditor = foundry.applications.ux.TextEditor.implementation;

async function enrichHtml(value) {
  return FoundryTextEditor.enrichHTML(String(value ?? ""), { async: true });
}

function normalizeQualityToken(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

function qualityIdentity(quality) {
  const uuid = String(quality?.uuid ?? "").trim();
  if (uuid) return `uuid:${uuid}`;
  const key = normalizeQualityToken(quality?.key);
  if (key) return `key:${key}`;
  const name = normalizeQualityToken(quality?.name);
  return name ? `name:${name}` : "";
}

function qualityFromItem(item) {
  return {
    name: item.name,
    key: item.system.key ?? "",
    uuid: item.uuid,
    rating: item.system.rating ?? 0,
    costKi: true,
    cost: item.system.cost ?? 0,
    rulesText: item.system.rulesText ?? ""
  };
}

function dedupeQualities(qualities = []) {
  const seen = new Set();
  const deduped = [];
  for (const quality of qualities ?? []) {
    const normalized = {
      name: quality?.name ?? "",
      key: quality?.key ?? "",
      uuid: quality?.uuid ?? "",
      rating: Number(quality?.rating ?? 0),
      costKi: Boolean(quality?.costKi),
      cost: Number(quality?.cost ?? 0),
      rulesText: quality?.rulesText ?? ""
    };
    const identity = qualityIdentity(normalized);
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    deduped.push(normalized);
  }
  return deduped;
}

// Aura colour per transformation family. Purely presentational: it tints the portrait ring, the
// form dropdown, and the boosted characteristic/skill readouts so a transformed sheet reads at a
// glance. Matched by key prefix so new members of a family inherit their family's colour.
const AURA_COLOURS = [
  [/^kaioken/, "var(--dbzf-aura-kaioken)"],
  [/^superSaiyan/, "var(--dbzf-aura-super)"],
  [/^saiyanRage/, "var(--dbzf-aura-kaioken)"],
  [/^oozaru/, "var(--dbzf-aura-monster)"],
  [/^giantNamekian/, "var(--dbzf-aura-namek)"],
  [/^monsterForm/, "var(--dbzf-aura-monster)"],
  [/^reductionForm/, "var(--dbzf-aura-frost)"],
  [/^highTension/, "var(--dbzf-ki)"],
  [/^enhancementState/, "var(--dbzf-temp-hits)"]
];

const CONDITION_STYLE = {
  burn: { icon: "cond-burn", color: "var(--dbzf-danger)" },
  slow: { icon: "cond-slow", color: "var(--dbzf-warn)" },
  immobilized: { icon: "cond-immobilized", color: "var(--dbzf-armor)" },
  sealed: { icon: "cond-sealed", color: "var(--dbzf-aura-frost)" }
};

const REACTION_GROUPS = [
  {
    label: "Negate",
    items: [
      { key: "block", label: "Block", title: "Body check against a physical attack. On success the damage is negated entirely." },
      { key: "deflect", label: "Deflect", title: "Mind check to negate an incoming Ki attack." },
      { key: "nullify", label: "Nullify", title: "Fighting check against an incoming Power/Magic attack." },
      { key: "parry", label: "Parry", title: "Weapon (full), Body (-20) or Fighting (-20) against a weapon attack." }
    ]
  },
  {
    label: "Spend Ki",
    items: [
      { key: "kiBarrier", label: "Ki Barrier", ki: true, title: "Spend 10 Ki per die, roll them, and subtract the total from incoming damage." },
      { key: "counterblast", label: "Counterblast", ki: true, title: "Oppose an incoming Ki/Magic attack with your own blast. Costs (10 x incoming total) + Power total + technique + extra Ki." },
      { key: "fakeOut", label: "Fake Out", ki: true, title: "Spend Ki to bait a reaction out of a target with a Mind check." }
    ]
  },
  {
    label: "Charge",
    items: [
      { key: "quickCharge", label: "Quick Charge", title: "Charge half your Power Up value." },
      { key: "powerQuickCharge", label: "Power + Quick", title: "Spend Action and Reaction to charge 1.5x Power Up." },
      { key: "allOut", label: "All Out", title: "Prime your next attack for +10% attack and damage." }
    ]
  },
  {
    label: "Escape / Boost",
    items: [
      { key: "breakFree", label: "Break Free", title: "Prime a +50% Body escape attempt against a grapple." },
      { key: "slipFree", label: "Slip Free", title: "Evasion check to slip out of a grapple." },
      { key: "raiseCharacteristic", label: "Raise Char.", ki: true, title: "Spend 10 Ki per point to raise Physical, Mental or Movement for 1 Phase." }
    ]
  }
];

const ATTACK_BUTTONS = {
  primary: [
    { key: "fighting", label: "Fighting", icon: "attack-fighting", title: "Fighting Attack — damage dice = effective Physical + effective Fighting rank" },
    { key: "power", label: "Power", icon: "attack-power", title: "Power Attack — damage dice = effective Mental + effective Power rank" },
    { key: "weapon", label: "Weapon", icon: "attack-weapon", title: "Weapon Attack — damage dice = effective Physical + effective Weapon rank + weapon dice" },
    { key: "body", label: "Body", icon: "attack-body", title: "Body Attack — damage dice = effective Physical + effective Body rank" }
  ],
  special: [
    { key: "evasion", label: "Evasion", icon: "attack-evasion", title: "Evasion Attack — damage dice = effective Physical + effective Evasion rank" },
    { key: "mind", label: "Mind", icon: "attack-mind", title: "Mind Attack — damage dice = effective Mental + effective Mind rank" },
    { key: "custom", label: "Custom", icon: "attack-custom", title: "Custom Skill Attack — damage dice = the chosen custom skill's total" }
  ]
};

const ITEM_SECTION_META = {
  technique: item => [item.system.attackType, item.system.kiCostResolved ? `${item.system.kiCostResolved} Ki` : ""].filter(Boolean).join(" · "),
  weapon: item => item.system.damageDice ? `${item.system.damageDice}d6` : "",
  armor: item => `Def +${item.system.defenseBonus || 0}`,
  equipment: item => item.system.quantity > 1 ? `x${item.system.quantity}` : "",
  consumable: item => item.system.quantity ? `x${item.system.quantity}` : "",
  quality: item => item.system.rating ? `Rating ${item.system.rating}` : "",
  trait: item => item.system.costResolved ? `${item.system.costResolved}` : "",
  boost: item => item.system.durationPhases ? `${item.system.durationPhases} phase(s)` : "Indefinite",
  transformation: item => item.system.cost || "",
  species: item => item.system.variant || ""
};

// A Team Attack assist shares 10% of each contributed quality's rating (rounded up, so a rating of
// 1 still passes something along). Returns the shared text plus the parsed ratings.
function shareQualities(text) {
  const raw = String(text || "").trim();
  if (!raw) return { text: "", ratings: {} };
  const ratings = {};
  const parts = [];
  for (const chunk of raw.split(/[;,]/)) {
    const match = /^\s*([A-Za-z ,]+?)\s*(\d+)?\s*$/.exec(chunk);
    if (!match) continue;
    const name = match[1].trim();
    if (!name) continue;
    const rating = Math.max(0, Number(match[2] || 1));
    const shared = Math.max(1, Math.ceil(rating * 0.1));
    ratings[name.toLowerCase()] = shared;
    parts.push(`${name} ${shared}`);
  }
  return { text: parts.join("; "), ratings };
}

function auraFor(key) {
  for (const [pattern, colour] of AURA_COLOURS) if (pattern.test(key)) return colour;
  return "";
}

function pct(value, max) {
  const cap = Number(max || 0);
  if (cap <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(value || 0) / cap) * 100)));
}

function multiplierText(transformation) {
  const parts = [];
  for (const [key, value] of Object.entries(transformation.characteristics ?? {})) parts.push(`${key} x${value}`);
  for (const [key, value] of Object.entries(transformation.skills ?? {})) parts.push(`${key} x${value}`);
  return parts.join(" · ");
}

export class DBZFCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  #activeTab = "combat";

  static DEFAULT_OPTIONS = {
    classes: ["dbz-fuzion-calibrated", "dbzf-character-app"],
    position: {
      width: 900,
      height: 800
    },
    window: {
      resizable: true
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: false,
      handler: DBZFCharacterSheet.#onSubmit
    }
  };

  static PARTS = {
    form: {
      template: "systems/dbz-fuzion-calibrated/templates/actor/character-sheet.hbs"
    }
  };

  // The sprite is injected into the document by dbz-fuzion-calibrated.mjs, so icons reference it
  // with a same-document fragment. An external file reference would not inherit `currentColor`.
  static SPRITE_PATH = "";

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;

    context.actor = actor;
    context.system = actor.system;
    context.owner = actor.isOwner;
    context.editable = this.isEditable;
    context.isGM = game.user.isGM;
    context.cssClass = this.isEditable ? "editable" : "locked";
    context.enriched = {
      biography: await enrichHtml(actor.system.biography),
      notes: await enrichHtml(actor.system.notes)
    };
    context.characteristics = [
      { key: "physical", label: "Physical", data: actor.system.characteristics.physical },
      { key: "mental", label: "Mental", data: actor.system.characteristics.mental },
      { key: "combat", label: "Combat", data: actor.system.characteristics.combat },
      { key: "movement", label: "Movement", data: actor.system.characteristics.movement }
    ];
    context.skills = [
      { key: "fighting", label: "Fighting", characteristic: "Combat", data: actor.system.skills.fighting },
      { key: "power", label: "Power", characteristic: "Combat", data: actor.system.skills.power },
      { key: "weapon", label: "Weapon", characteristic: "Combat", data: actor.system.skills.weapon },
      { key: "evasion", label: "Evasion", characteristic: "Combat", data: actor.system.skills.evasion },
      { key: "mind", label: "Mind", characteristic: "Mental", data: actor.system.skills.mind },
      { key: "body", label: "Body", characteristic: "Physical", data: actor.system.skills.body }
    ];
    context.customSkills = actor.system.customSkills ?? [];
    context.characteristicChoices = [
      { key: "physical", label: "Physical" },
      { key: "mental", label: "Mental" },
      { key: "combat", label: "Combat" },
      { key: "movement", label: "Movement" },
      { key: "manual", label: "Manual" }
    ];
    context.transformationChoices = getTransformationChoices();
    context.speciesChoices = getSpeciesChoices();
    context.powerModeChoices = [
      { key: "manual", label: "Manual" },
      { key: "hybridCalibration", label: "Hybrid" },
      { key: "strictFormula", label: "Strict Formula" }
    ];
    context.itemSections = [
      { key: "species", label: "Species", items: actor.items.filter(item => item.type === "species") },
      { key: "technique", label: "Techniques", items: actor.items.filter(item => item.type === "technique") },
      { key: "weapon", label: "Weapons", items: actor.items.filter(item => item.type === "weapon") },
      { key: "armor", label: "Armor", items: actor.items.filter(item => item.type === "armor") },
      { key: "equipment", label: "Equipment", items: actor.items.filter(item => item.type === "equipment") },
      { key: "quality", label: "Qualities", items: actor.items.filter(item => item.type === "quality") },
      { key: "trait", label: "Traits", items: actor.items.filter(item => item.type === "trait") },
      { key: "boost", label: "Boosts", items: actor.items.filter(item => item.type === "boost") },
      { key: "transformation", label: "Transformation Items", items: actor.items.filter(item => item.type === "transformation") },
      { key: "consumable", label: "Consumables", items: actor.items.filter(item => item.type === "consumable") }
    ].filter(section => section.items.length || ["technique", "weapon", "armor", "equipment", "boost"].includes(section.key));
    context.activeConditions = (actor.system.combatState?.activeConditions ?? []).map(condition => {
      const style = CONDITION_STYLE[condition.key] ?? { icon: "state-survival", color: "var(--dbzf-warn)" };
      const meta = [
        condition.rating ? `Rating ${condition.rating}` : "",
        condition.remainingTicks ? `${condition.remainingTicks} tick(s)` : "",
        condition.saveDC ? `DC ${condition.saveDC}` : ""
      ].filter(Boolean).join(" · ");
      return { ...condition, ...style, meta, label: labelCondition(condition), summary: conditionSummary(condition) };
    });
    context.recovery = recoverySettings(actor);

    this.#decorateContext(context);
    return context;
  }

  // Presentation-only derivations. Everything here reads from already-prepared system data or the
  // shared rules modules; nothing recomputes a game formula, so the sheet cannot drift from the
  // engine the way a hand-copied formula would.
  #decorateContext(context) {
    const actor = this.actor;
    const system = actor.system;
    const resources = system.resources ?? {};

    const formKey = system.transformation?.selected || "base";
    const transformation = getTransformation(formKey);
    const aura = auraFor(formKey);
    const isTransformed = formKey !== "base";

    const armor = actor.items
      .filter(item => item.type === "armor" && item.system?.active && !item.system?.destroyed)
      .reduce((total, item) => ({
        value: total.value + Number(item.system.currentHits || 0),
        max: total.max + Number(item.system.bonusHits || 0)
      }), { value: 0, max: 0 });

    const hitsMax = Number(resources.hits?.max || 0);
    const tempMax = Number(resources.tempHits?.max || 0);
    const hitsValue = Number(resources.hits?.value || 0);

    context.ui = {
      sprite: `${DBZFCharacterSheet.SPRITE_PATH}`,
      // `aura` is a border/ring colour and falls back to the neutral border. `accent` is the same
      // colour used as *text*, so in base form it must fall back to readable body text instead.
      aura: aura || "var(--dbzf-border-strong)",
      accent: aura || "var(--dbzf-text)",
      auraOn: Boolean(aura),
      isTransformed,
      formLabel: transformation.label,
      form: {
        battlePower: transformation.battlePower ?? 1,
        actionType: transformation.actionType ?? "",
        duration: transformation.duration ?? "",
        costText: transformation.costText ?? "",
        multiplierText: multiplierText(transformation),
        rulesText: transformation.rulesText ?? "",
        tokenArt: Boolean(formKey === "base"
          ? system.transformation?.baseTokenArt
          : system.transformation?.tokenArt?.[formKey]),
        derivedNote: transformation.hitDefenseMode === "direct"
          ? "This form multiplies maximum HITs and Defense directly."
          : "HITs and Defense are not recalculated from the boosted stats."
      },
      armor,
      bar: {
        tempWeight: Math.max(1, tempMax),
        armorWeight: Math.max(1, armor.max),
        hitsWeight: Math.max(1, hitsMax),
        tempPct: pct(resources.tempHits?.value, tempMax),
        armorPct: pct(armor.value, armor.max),
        hitsPct: pct(hitsValue, hitsMax)
      },
      isNegative: hitsValue < 0,
      isLow: hitsValue >= 0 && hitsMax > 0 && hitsValue / hitsMax <= 0.25,
      bpColor: isTransformed ? (aura || "var(--dbzf-ki)") : "var(--dbzf-text)",
      runMeters: Number(system.characteristics?.movement?.effective || 0) * 4 * 3
    };

    const decorate = (key, base, effective) => {
      const boosted = Number(base) !== Number(effective);
      return {
        boosted,
        color: boosted ? (aura || "var(--dbzf-ki)") : "var(--dbzf-text)",
        multChip: boosted && Number(base) ? `x${Math.round((Number(effective) / Number(base)) * 100) / 100}` : ""
      };
    };

    context.characteristics = context.characteristics.map(char => ({
      ...char,
      ...decorate(char.key, char.data.base, char.data.effective),
      formula: Number(char.data.base) === Number(char.data.effective)
        ? "Equal to base — no active effects"
        : `base ${char.data.base} under ${transformation.label} and active effects`
    }));

    context.skills = context.skills.map(skill => {
      const style = decorate(skill.key, skill.data.rank, skill.data.effectiveRank ?? skill.data.rank);
      return {
        ...skill,
        color: style.color,
        valueTitle: style.boosted
          ? `Effective rank: base rank ${skill.data.rank} boosted to ${skill.data.effectiveRank}`
          : "Effective rank equals base rank",
        totalTitle: `${skill.data.effectiveRank} effective rank + ${skill.data.value} ${skill.characteristic}`
      };
    });

    context.attacksPrimary = ATTACK_BUTTONS.primary.map(atk => ({ ...atk, dice: attackDamageDicePreview(actor, atk.key) }));
    context.attacksSpecial = ATTACK_BUTTONS.special.map(atk => {
      const dice = attackDamageDicePreview(actor, atk.key);
      return { ...atk, dice: atk.key === "custom" && !(system.customSkills ?? []).length ? "—" : `${dice}d6` };
    });
    context.reactionGroups = REACTION_GROUPS;

    context.itemSections = context.itemSections.map(section => ({
      ...section,
      items: section.items.map(item => {
        const meta = ITEM_SECTION_META[item.type]?.(item) ?? "";
        const effects = (item.system.effects ?? []).filter(effect => effect.enabled);
        return {
          id: item.id,
          name: item.name,
          img: item.img,
          type: item.type,
          system: item.system,
          meta,
          active: Boolean(item.system.active),
          // Every type that carries `system.active` can be toggled from the list. Armor and weapons
          // have no effect rows but their active state still drives Defense and attack selection.
          togglable: Object.hasOwn(item.system, "active"),
          effectLines: effects.map(effect => `${effect.label || "Effect"}: ${effect.mode} ${effect.valueResolved ?? effect.value} to ${effect.target}`),
          qualityChips: (item.system.embeddedQualities ?? []).map(quality => `${quality.name || quality.key}${quality.rating ? ` ${quality.rating}` : ""}`),
          armorPct: item.type === "armor" ? pct(item.system.currentHits, item.system.bonusHits) : 0
        };
      })
    }));

    context.tabs = [
      { key: "combat", label: "Combat" },
      { key: "character", label: "Character" },
      { key: "items", label: "Items" },
      { key: "progression", label: "Progression" },
      { key: "bio", label: "Bio" },
      ...(context.isGM ? [{ key: "gm", label: "GM" }] : [])
    ].map(tab => ({ ...tab, active: tab.key === this.#activeTab }));
    if (!context.tabs.some(tab => tab.active)) {
      this.#activeTab = "combat";
      context.tabs[0].active = true;
    }
    context.activeTab = this.#activeTab;
  }

  // Preserve scroll + focused field (with caret) across re-renders, synchronously
  // during the DOM swap so the sheet never visibly jumps to the top.
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    capturePartState(priorElement, state);
  }

  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    restorePartState(newElement, state);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const form = this.element.querySelector("form.dbzf-character-sheet");
    if (!form) return;

    // Without this the browser submits the form natively: pressing Enter in any text field
    // navigates away from /game with every field in the query string, dropping the session.
    form.addEventListener("submit", this.#onFormSubmit.bind(this));
    form.addEventListener("change", this.#onFormChange.bind(this));
    form.addEventListener("click", this.#onSheetClick.bind(this));
    form.addEventListener("dragover", event => event.preventDefault());
    form.addEventListener("drop", this._onDrop.bind(this));
    // Scroll/focus are preserved synchronously in _syncPartState; no post-render restore needed.
  }

  async #onFormSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    return DBZFCharacterSheet.#onSubmit.call(this, event, event.currentTarget, {});
  }

  async #onFormChange(event) {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement || field.tagName === "PROSE-MIRROR")) return;
    if (!field.name) return;

    await this.#withScroll(async () => {
      if (field.name === "system.resources.ki.value") {
        const next = Math.max(0, Number(field.value || 0));
        await this.actor.update({
          "system.resources.ki.value": next,
          "system.resources.ki.charged": next
        });
        return;
      }
      if (field.name === "system.identity.species") {
        await this.#updateSpeciesFromIdentity(field.value);
        return;
      }
      if (field.name === "system.transformation.selected") {
        await this.#changeTransformation(field);
        return;
      }
      if (field.name.startsWith("system.customSkills.")) {
        await this.#updateCustomSkillField(field);
        return;
      }
      const updateData = foundry.utils.expandObject({ [field.name]: this.#fieldValue(field) });
      await this.actor.update(updateData);
    });
  }

  async #onSheetClick(event) {
    const portrait = event.target.closest("[data-action='actor-image']");
    if (portrait) {
      event.preventDefault();
      return this.#openActorImagePicker();
    }

    const button = event.target.closest("button[data-action]");
    if (!button) return;

    event.preventDefault();
    const action = button.dataset.action;
    if (action === "tab") return this.#setTab(button.dataset.tab);
    if (action === "roll-skill") return this.#withScroll(() => rollSkill(this.actor, button.dataset.skill));
    if (action === "roll-custom-skill") return this.#withScroll(() => rollCustomSkill(this.actor, Number(button.dataset.index)));
    if (action === "custom-skill-add") return this.#addCustomSkill();
    if (action === "custom-skill-delete") return this.#deleteCustomSkill(Number(button.dataset.index));
    if (action === "attack") return this.#withScroll(() => openAttackDialog(this.actor, button.dataset.attack));
    if (action === "dodge") return this.#dodge();
    if (action === "run") return this.#run();
    if (action === "team-attack") return this.#teamAttack();
    if (action === "power-up") return this.#powerUp();
    if (action === "reset-phase") return this.#withScroll(() => resetPhase(this.actor));
    if (action === "restart-phases") return this.#withScroll(() => restartPhases(this.actor));
    if (action === "advance-phase") return this.#withScroll(() => advancePhase(this.actor));
    if (action === "spend-action") return this.#withScroll(() => spendAction(this.actor));
    if (action === "spend-reaction") return this.#withScroll(() => spendReaction(this.actor));
    if (action === "recover-hits") return this.#withScroll(() => recoverHits(this.actor));
    if (action === "recovery-settings") return this.#openRecoverySettings();
    if (action === "derived-scaling-settings") return this.#openDerivedScalingSettings();
    if (action === "transformation-token-art") return this.#pickTransformationTokenArt();
    if (action === "make-item") return this.#makeItem();
    if (action === "survival-check") return this.#withScroll(() => rollSurvivalCheck(this.actor));
    if (action === "travel") return this.#withScroll(() => openTravelDialog(this.actor));
    if (action === "xp-tool") return this.#withScroll(() => openXpEncounterTool());
    if (action === "gm-apply-suggested-bp") return this.#withScroll(() => game.dbzfGmTools?.applySuggestedBattlePower?.(this.actor));
    if (action === "gm-calibration-tool") return this.#withScroll(() => game.dbzfGmTools?.openPowerCalibrationTool?.(this.actor));
    if (action === "gm-tools-panel") return this.#withScroll(() => game.dbzfGmTools?.openPanel?.());
    if (action === "reaction") return this.#rollReaction(button.dataset.reaction);
    if (action === "condition-save") return this.#withScroll(() => rollConditionSave(this.actor, button.dataset.conditionId));
    if (action === "condition-remove") return this.#withScroll(() => removeCondition(this.actor, button.dataset.conditionId));
    if (action === "item-open") return this.actor.items.get(button.dataset.itemId)?.sheet?.render(true);
    if (action === "item-to-chat") return this.#itemToChat(button.dataset.itemId);
    if (action === "item-toggle-active") return this.#toggleOwnedItem(button.dataset.itemId);
    if (action === "item-delete") {
      return this.#withScroll(() => this.actor.deleteEmbeddedDocuments("Item", [button.dataset.itemId]));
    }
  }

  // Tabs swap visibility in place rather than re-rendering. A re-render would rebuild every panel
  // and reset the body scroll for what is a pure view change.
  #setTab(tab) {
    if (!tab || tab === this.#activeTab) return;
    this.#activeTab = tab;
    const root = this.element;
    if (!root) return;
    for (const button of root.querySelectorAll(".dbzf-tab[data-tab]")) {
      button.dataset.state = button.dataset.tab === tab ? "active" : "";
    }
    for (const panel of root.querySelectorAll("[data-tab-panel]")) {
      panel.hidden = panel.dataset.tabPanel !== tab;
    }
    const body = root.querySelector(".dbzf-sheet-body");
    if (body) body.scrollTop = 0;
  }

  // Assign token artwork for the currently selected transformation.
  #pickTransformationTokenArt() {
    if (!this.isEditable) return ui.notifications.warn("You do not have permission to edit this actor.");
    const key = this.actor.system.transformation?.selected || "base";
    const current = key === "base"
      ? (this.actor.system.transformation?.baseTokenArt || this.actor.prototypeToken?.texture?.src || "")
      : (this.actor.system.transformation?.tokenArt?.[key] || "");
    if (!game.user.hasPermission("FILES_BROWSE")) {
      return ui.notifications.warn("Browsing artwork needs the \"Use File Browser\" player permission. Ask your GM to enable it, or have them set the art for you.");
    }
    const FilePickerClass = foundry.applications.apps.FilePicker ?? globalThis.FilePicker;
    new FilePickerClass({
      type: "imagevideo",
      current,
      callback: async path => {
        const field = key === "base"
          ? { "system.transformation.baseTokenArt": path }
          : { [`system.transformation.tokenArt.${key}`]: path };
        await this.#withScroll(() => this.actor.update(field));
        await this.#applyTransformationTokenArt(key, key);
        ui.notifications.info(`Token art set for ${key === "base" ? "Base form" : key}.`);
      }
    }).browse();
  }

  #openActorImagePicker() {
    if (!this.isEditable) return ui.notifications.warn("You do not have permission to edit this actor image.");

    const FilePickerClass = foundry.applications.apps.FilePicker ?? globalThis.FilePicker;
    new FilePickerClass({
      type: "image",
      current: this.actor.img,
      callback: async path => {
        await this.#withScroll(async () => this.actor.update({
          img: path,
          "prototypeToken.texture.src": path
        }));
        const portrait = this.element.querySelector("[data-action='actor-image'] img");
        if (portrait) portrait.src = path;
      }
    }).browse();
  }

  async #toggleOwnedItem(itemId) {
    const item = this.actor.items.get(itemId);
    if (!item) return;
    await this.#withScroll(async () => {
      if (item.type === "species" && !item.system.active) {
        const updates = this.actor.items
          .filter(existing => existing.type === "species")
          .map(existing => ({ _id: existing.id, "system.active": existing.id === item.id }));
        await this.actor.updateEmbeddedDocuments("Item", updates);
        await this.actor.update({ "system.identity.species": speciesKeyFromItem(item) });
        return;
      }
      const activating = !item.system.active;
      if (item.type === "armor" && activating && item.system.destroyed) {
        ui.notifications.warn(`${item.name} is destroyed. Repair it by clearing Destroyed before its bonuses can apply.`);
      }
      if (item.type === "boost") {
        if (activating) await activateBoost(this.actor, item, { render: false });
        else await deactivateBoost(this.actor, item, { render: false });
        await this.render({ force: true });
        return;
      }
      await item.update({ "system.active": activating });
    });
  }

  async #updateSpeciesFromIdentity(value) {
    const key = normalizeSpeciesKey(value);
    const speciesItems = this.actor.items.filter(item => item.type === "species");
    const match = speciesItems.find(item => speciesKeyFromItem(item) === key);
    if (match) {
      const updates = speciesItems.map(item => ({ _id: item.id, "system.active": item.id === match.id }));
      await this.actor.updateEmbeddedDocuments("Item", updates);
    } else if (key) {
      ui.notifications.warn("Species identity changed, but no matching Species item is active. Rules will not apply until a matching Species item is added or activated.");
    }
    await this.actor.update({ "system.identity.species": key });
  }

  async #addCustomSkill() {
    return this.#withScroll(() => {
      const skills = foundry.utils.deepClone(this.actor.system.customSkills ?? []);
      skills.push({ name: "", rank: 0, linkedCharacteristic: "combat", value: 0, total: 0 });
      return this.actor.update({ "system.customSkills": skills });
    });
  }

  async #deleteCustomSkill(index) {
    if (!Number.isInteger(index) || index < 0) return;
    return this.#withScroll(() => {
      const skills = foundry.utils.deepClone(this.actor.system.customSkills ?? []);
      skills.splice(index, 1);
      return this.actor.update({ "system.customSkills": skills });
    });
  }

  // Editing a single custom-skill cell must rewrite the entire array. A partial
  // update like { "system.customSkills.1.name": "x" } expands to { customSkills: { 1: {...} } },
  // which Foundry collapses into a one-element array, wiping the other rows (and the
  // unspecified fields of the edited row). That is the "skills reset / can only keep one" bug.
  async #updateCustomSkillField(field) {
    const match = /^system\.customSkills\.(\d+)\.(name|rank|linkedCharacteristic|value)$/.exec(field.name);
    if (!match) return;
    const index = Number(match[1]);
    const key = match[2];
    const skills = foundry.utils.deepClone(this.actor.system.customSkills ?? []);
    if (!skills[index]) return;
    skills[index] = { ...skills[index], [key]: this.#fieldValue(field) };
    await this.actor.update({ "system.customSkills": skills });
  }

  async #dodge() {
    return this.#withScroll(async () => {
      if (!await spendAction(this.actor)) return null;
      await setPending(this.actor, "dodge", true);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<article class="dbzf-chat-card" data-kind="reaction"><header><h3>Dodge</h3><p>${escapeHtml(this.actor.name)} gains +50% Evasion for this Phase and cannot attack this Phase.</p></header></article>`
      });
      return true;
    });
  }

  // Run Action: move up to 4x the Move characteristic (1 Move = 3 meters).
  async #run() {
    return this.#withScroll(async () => {
      if (!await spendAction(this.actor)) return null;
      const move = Number(this.actor.system.characteristics?.movement?.effective || 0);
      const moves = move * 4;
      const meters = moves * 3;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<article class="dbzf-chat-card" data-kind="reaction"><header><h3>Run</h3><p>${escapeHtml(this.actor.name)} runs up to 4x Move this Phase.</p></header><dl class="dbzf-chat-grid"><dt>Move</dt><dd>${move}</dd><dt>Run Distance</dt><dd>${moves} Move (${meters} m)</dd><dt>Resource</dt><dd>Action spent</dd></dl></article>`
      });
      return true;
    });
  }

  // Team Attack Action: ready an Action to support a main fighter, who gains 10% of the
  // assisting character's chosen Skill total. Target the main fighter to name them on the card.
  async #teamAttack() {
    const skills = [
      { key: "fighting", label: "Fighting", total: Number(this.actor.system.skills?.fighting?.total || 0) },
      { key: "power", label: "Power", total: Number(this.actor.system.skills?.power?.total || 0) },
      { key: "weapon", label: "Weapon", total: Number(this.actor.system.skills?.weapon?.total || 0) },
      { key: "evasion", label: "Evasion", total: Number(this.actor.system.skills?.evasion?.total || 0) },
      { key: "mind", label: "Mind", total: Number(this.actor.system.skills?.mind?.total || 0) },
      { key: "body", label: "Body", total: Number(this.actor.system.skills?.body?.total || 0) }
    ];
    (this.actor.system.customSkills ?? []).forEach((skill, index) => {
      skills.push({ key: `custom:${index}`, label: skill.name || `Custom Skill ${index + 1}`, total: Number(skill.total || 0) });
    });
    const targetToken = Array.from(game.user?.targets ?? [])[0] ?? null;
    const mainFighter = targetToken?.actor?.name ?? "the main fighter";
    const options = skills.map(skill => `<option value="${skill.key}">${escapeHtml(skill.label)} (${skill.total})</option>`).join("");
    const techniques = this.actor.items.filter(item => item.type === "technique");
    const techniqueOptions = [`<option value="">None</option>`]
      .concat(techniques.map(technique => `<option value="${technique.id}">${escapeHtml(technique.name)}</option>`)).join("");
    const content = `
      <div class="dbzf-attack-dialog dbzf-dialog-form dbzf-team-attack">
        <p class="dbzf-dialog-hint">Ready an Action to join a Team Attack. ${escapeHtml(mainFighter)} gains 10% of your chosen Skill's total, plus 10% of any qualities you contribute.</p>
        <label><span>Contribute Skill</span><select name="skillKey">${options}</select></label>
        <label><span>Contribute Technique</span><select name="techniqueId">${techniqueOptions}</select></label>
        <label><span>Contribute Qualities</span><input type="text" name="qualities" placeholder="e.g. Deadly 4; Rapid 2" /></label>
      </div>`;
    const submit = async html => {
      const form = html instanceof HTMLFormElement ? html : html.querySelector("form");
      const data = Object.fromEntries(new FormData(form).entries());
      const chosen = skills.find(skill => skill.key === data.skillKey) ?? skills[0];
      const technique = data.techniqueId ? this.actor.items.get(data.techniqueId) : null;
      return this.#withScroll(async () => {
        if (!await spendAction(this.actor)) return null;
        // The assist contributes 10% of the chosen Skill total, plus the technique's extra dice,
        // and 10% of each contributed quality's rating (rounded up so a rating of 1 still counts).
        const skillContribution = Math.round(Number(chosen?.total || 0) * 0.1);
        const techniqueDice = Math.max(0, Number(technique?.system?.extraDice || 0));
        const qualitiesText = [data.qualities, technique?.system?.qualities].filter(Boolean).join("; ");
        const sharedQualities = shareQualities(qualitiesText);
        const contribution = skillContribution;
        const target = targetToken?.actor ?? null;
        const assist = {
          assister: this.actor.name,
          label: chosen?.label || "Skill",
          bonus: contribution,
          techniqueName: technique?.name || "",
          bonusDice: techniqueDice,
          qualities: sharedQualities.text
        };
        let applied = false;
        if (target && needsGmRelay(target)) {
          // Supporting an ally is a write to THEIR sheet, which a player may not own. Rather than
          // telling them to ask the GM to type it in, the GM's client applies it for them.
          applied = (await requestGmAction("teamAttackAssist", { targetUuid: target.uuid, contribution: assist })).ok === true;
        } else if (target) {
          const pending = foundry.utils.deepClone(target.system.combatState?.pending?.teamAttack ?? []);
          pending.push(assist);
          await target.update({ "system.combatState.pending.teamAttack": pending });
          applied = true;
        }
        const outcomeRow = applied
          ? `<dt>Applied To</dt><dd>${escapeHtml(target.name)}: +${contribution} to next attack</dd>`
          : (target
            ? `<dt>Target</dt><dd>${escapeHtml(target.name)} (could not be applied; GM should add manually)</dd>`
            : `<dt>Target</dt><dd>None selected (target the main fighter to auto-apply)</dd>`);
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: `<article class="dbzf-chat-card" data-kind="reaction"><header><h3>Team Attack</h3><p>${escapeHtml(this.actor.name)} readies to support ${escapeHtml(target?.name || mainFighter)}.</p></header><dl class="dbzf-chat-grid"><dt>Contributed Skill</dt><dd>${escapeHtml(chosen?.label || "Skill")} (${Number(chosen?.total || 0)})</dd><dt>Attack Bonus</dt><dd>+${contribution} (10%)</dd>${technique ? `<dt>Technique</dt><dd>${escapeHtml(technique.name)} (+${techniqueDice} dice)</dd>` : ""}${sharedQualities.text ? `<dt>Shared Qualities</dt><dd>${escapeHtml(sharedQualities.text)}</dd>` : ""}${outcomeRow}<dt>Resource</dt><dd>Action readied</dd></dl><details><summary>Team Attack</summary><p>The supported fighter gains 10% of the assisting character's chosen Skill total on their next attack roll, any contributed technique's extra dice, and 10% of each contributed quality's rating.</p></details></article>`
        });
        return true;
      });
    };
    if (foundry.applications?.api?.DialogV2) {
      return foundry.applications.api.DialogV2.confirm({
        window: { title: "Team Attack" },
        content,
        yes: { label: "Ready Team Attack", callback: (event, button, dialog) => submit(dialog.element) },
        no: { label: "Cancel" }
      });
    }
    return new Promise(resolve => new Dialog({
      title: "Team Attack",
      content,
      buttons: {
        go: { label: "Ready Team Attack", callback: html => resolve(submit(html[0])) },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "go"
    }).render(true));
  }

  async #changeTransformation(field) {
    const previous = this.actor.system.transformation?.selected || "base";
    const next = field.value || "base";
    if (previous === next) return;
    const before = snapshotResources(this.actor);
    await this.actor.update({ "system.transformation.selected": next });
    await this.#applyTransformationTokenArt(previous, next);
    const after = snapshotResources(this.actor);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `
        <article class="dbzf-chat-card" data-kind="transformation">
          <header><h3>Transformation</h3><p>${escapeHtml(this.actor.name)} changed form: ${escapeHtml(previous)} -> ${escapeHtml(next)}</p></header>
          <dl class="dbzf-chat-grid">
            <dt>HITs</dt><dd>${before.hits} -> ${after.hits}</dd>
            <dt>Defense</dt><dd>${before.defense} -> ${after.defense}</dd>
            <dt>Charged Ki</dt><dd>${before.ki} -> ${after.ki}</dd>
          </dl>
        </article>
      `
    });
  }

  // Swap token artwork to match the active transformation, if art has been assigned for it.
  // Entering a form remembers the base art first so dropping back always restores it.
  async #applyTransformationTokenArt(previous, next) {
    const art = this.actor.system.transformation?.tokenArt ?? {};
    const baseArt = this.actor.system.transformation?.baseTokenArt || "";
    const nextArt = next === "base" ? (baseArt || this.actor.prototypeToken?.texture?.src || "") : (art[next] || "");
    if (!nextArt) return;

    const updates = { "prototypeToken.texture.src": nextArt };
    // Remember the pre-transformation art the first time a form is entered from Base.
    if (previous === "base" && next !== "base" && !baseArt) {
      updates["system.transformation.baseTokenArt"] = this.actor.prototypeToken?.texture?.src || "";
    }
    await this.actor.update(updates);

    // Update tokens already placed on the current scene so the change is visible immediately.
    const scene = canvas?.scene;
    if (!scene) return;
    const tokenUpdates = scene.tokens
      .filter(token => token.actorId === this.actor.id && !token.actorLink === false)
      .map(token => ({ _id: token.id, "texture.src": nextArt }));
    if (tokenUpdates.length) await scene.updateEmbeddedDocuments("Token", tokenUpdates);
  }

  async #powerUp() {
    const before = getChargedKi(this.actor);
    const next = await this.#withScroll(async () => {
      const charged = await chargeKi(this.actor, 1);
      return charged;
    });
    if (next === null) return;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `
        <article class="dbzf-chat-card" data-kind="action">
          <header><h3>Charge Ki</h3><p>${escapeHtml(this.actor.name)} gathers Ki.</p></header>
          <dl class="dbzf-chat-grid">
            <dt>Before</dt><dd>${before}</dd>
            <dt>Gained</dt><dd>${next - before}</dd>
            <dt>Charged Ki</dt><dd>${next} / ${this.actor.system.resources.ki.max}</dd>
            <dt>Resource</dt><dd>Action spent</dd>
          </dl>
        </article>
      `
    });
  }

  async #openRecoverySettings() {
    const settings = recoverySettings(this.actor);
    const selected = (value, expected) => value === expected ? "selected" : "";
    const content = `
      <div class="dbzf-recovery-settings dbzf-dialog-form">
        <label><span>Phases Required</span><input type="number" name="phasesRequired" value="${settings.phasesRequired}" min="1" ${settings.speciesPhases ? "disabled" : ""} /></label>
        <label class="dbzf-inline-check"><input type="checkbox" name="useSpeciesPhases" ${settings.useSpeciesPhases ? "checked" : ""} /><span>Use species cadence${settings.speciesPhases ? ` (every ${settings.speciesPhases} phase(s))` : ""}</span></label>
        <label>
          <span>HIT Recovery</span>
          <select name="hitMode">
            <option value="species" ${selected(settings.hitMode, "species")}>Species / Physical Default</option>
            <option value="physical" ${selected(settings.hitMode, "physical")}>Physical</option>
            <option value="mental" ${selected(settings.hitMode, "mental")}>Mental</option>
            <option value="doubleMental" ${selected(settings.hitMode, "doubleMental")}>Double Mental</option>
            <option value="doublePhysical" ${selected(settings.hitMode, "doublePhysical")}>Double Physical</option>
            <option value="flat" ${selected(settings.hitMode, "flat")}>Flat Amount</option>
            <option value="none" ${selected(settings.hitMode, "none")}>No HIT Recovery</option>
          </select>
        </label>
        <label><span>Flat HIT Amount</span><input type="number" name="flatHits" value="${settings.flatHits}" /></label>
        <label>
          <span>Temp HIT Recovery</span>
          <select name="tempHitsMode">
            <option value="chargedKi" ${selected(settings.tempHitsMode, "chargedKi")}>Reset if Charged Ki remains</option>
            <option value="always" ${selected(settings.tempHitsMode, "always")}>Always reset to max</option>
            <option value="never" ${selected(settings.tempHitsMode, "never")}>Never reset</option>
          </select>
        </label>
        <label><span>Chat Title</span><input type="text" name="chatTitle" value="${escapeHtml(settings.chatTitle)}" /></label>
        <label><span>Chat Message</span><input type="text" name="chatMessage" value="${escapeHtml(settings.chatMessage)}" /></label>
        <label class="dbzf-recovery-settings-wide"><span>Chat Details</span><textarea name="chatDetails" rows="4">${escapeHtml(settings.chatDetails)}</textarea></label>
      </div>
    `;
    const submit = async html => {
      const form = html instanceof HTMLFormElement ? html : html.querySelector("form");
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      // The Phases Required input is disabled (and so absent from the form data) while a species
      // cadence is in charge; leave the stored value alone in that case instead of resetting it.
      const update = {
        "system.combatState.recovery.useSpeciesPhases": formData.has("useSpeciesPhases"),
        "system.combatState.recovery.hitMode": data.hitMode || "species",
        "system.combatState.recovery.flatHits": Number(data.flatHits || 0),
        "system.combatState.recovery.tempHitsMode": data.tempHitsMode || "chargedKi",
        "system.combatState.recovery.chatTitle": data.chatTitle || "4-Phase Recovery",
        "system.combatState.recovery.chatMessage": data.chatMessage || "{{name}} stabilizes between exchanges.",
        "system.combatState.recovery.chatDetails": data.chatDetails || "Every {{phases}} phases, regular HITs recover by the selected mode. If Temp HIT recovery is enabled and the requirement is met, Temp HITs reset to max."
      };
      if (data.phasesRequired !== undefined) update["system.combatState.recovery.phasesRequired"] = Math.max(1, Number(data.phasesRequired || 4));
      await this.#withScroll(() => this.actor.update(update));
    };

    if (foundry.applications?.api?.DialogV2) {
      return foundry.applications.api.DialogV2.confirm({
        window: { title: "Phase Recovery Settings" },
        content,
        yes: { label: "Save", callback: (event, button, dialog) => submit(dialog.element) },
        no: { label: "Cancel" }
      });
    }

    return new Promise(resolve => {
      new Dialog({
        title: "Phase Recovery Settings",
        content,
        buttons: {
          save: { label: "Save", callback: html => resolve(submit(html[0])) },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "save"
      }).render(true);
    });
  }

  async #openDerivedScalingSettings() {
    const scaling = this.actor.system.derivedScaling ?? {};
    const cap = value => String(value).charAt(0).toUpperCase() + String(value).slice(1);
    const charOptions = selected => ["physical", "mental", "combat", "movement"]
      .map(key => `<option value="${key}" ${selected === key ? "selected" : ""}>${cap(key)}</option>`).join("");
    const content = `
      <div class="dbzf-recovery-settings dbzf-dialog-form">
        <label><span>HITs scale from</span><select name="hitsCharacteristic">${charOptions(scaling.hitsCharacteristic || "physical")}</select></label>
        <label><span>Defense scales from</span><select name="defenseCharacteristic">${charOptions(scaling.defenseCharacteristic || "physical")}</select></label>
        <label><span>Temp HITs scale from</span><select name="tempHitsCharacteristic">${charOptions(scaling.tempHitsCharacteristic || "mental")}</select></label>
        <label class="dbzf-recovery-settings-wide">
          <span>Scale source</span>
          <select name="source">
            <option value="base" ${(scaling.source || "base") === "base" ? "selected" : ""}>Base Stats (effects/transformations do not inflate derived stats)</option>
            <option value="effective" ${scaling.source === "effective" ? "selected" : ""}>Effective Stats (derived stats follow boosted values)</option>
          </select>
        </label>
      </div>`;
    const submit = async html => {
      const form = html instanceof HTMLFormElement ? html : html.querySelector("form");
      const data = Object.fromEntries(new FormData(form).entries());
      await this.#withScroll(() => this.actor.update({
        "system.derivedScaling.hitsCharacteristic": data.hitsCharacteristic || "physical",
        "system.derivedScaling.defenseCharacteristic": data.defenseCharacteristic || "physical",
        "system.derivedScaling.tempHitsCharacteristic": data.tempHitsCharacteristic || "mental",
        "system.derivedScaling.source": data.source || "base"
      }));
    };
    if (foundry.applications?.api?.DialogV2) {
      return foundry.applications.api.DialogV2.confirm({
        window: { title: "Derived Characteristics Scaling" },
        content,
        yes: { label: "Save", callback: (event, button, dialog) => submit(dialog.element) },
        no: { label: "Cancel" }
      });
    }
    return new Promise(resolve => {
      new Dialog({
        title: "Derived Characteristics Scaling",
        content,
        buttons: {
          save: { label: "Save", callback: html => resolve(submit(html[0])) },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "save"
      }).render(true);
    });
  }

  async #makeItem() {
    const types = ["technique", "weapon", "armor", "equipment", "quality", "transformation", "trait", "boost", "consumable", "species"];
    const options = types.map(type => `<option value="${type}">${type.charAt(0).toUpperCase() + type.slice(1)}</option>`).join("");
    const content = `
      <div class="dbzf-attack-dialog dbzf-dialog-form">
        <label><span>Item Type</span><select name="type">${options}</select></label>
        <label><span>Name</span><input type="text" name="name" value="New Item" /></label>
      </div>`;
    const submit = async html => {
      const form = html instanceof HTMLFormElement ? html : html.querySelector("form");
      const data = Object.fromEntries(new FormData(form).entries());
      const type = types.includes(data.type) ? data.type : "equipment";
      const name = String(data.name || "").trim() || `New ${type}`;
      const created = await this.#withScroll(() => this.actor.createEmbeddedDocuments("Item", [{ name, type }]));
      const item = Array.isArray(created) ? created[0] : null;
      if (item) item.sheet.render(true);
    };
    if (foundry.applications?.api?.DialogV2) {
      return foundry.applications.api.DialogV2.confirm({
        window: { title: "Make Item" },
        content,
        yes: { label: "Create", callback: (event, button, dialog) => submit(dialog.element) },
        no: { label: "Cancel" }
      });
    }
    return new Promise(resolve => {
      new Dialog({
        title: "Make Item",
        content,
        buttons: {
          create: { label: "Create", callback: html => resolve(submit(html[0])) },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "create"
      }).render(true);
    });
  }

  async #itemToChat(itemId) {
    const item = this.actor.items.get(itemId);
    if (!item) return;
    const sys = item.system ?? {};
    const rows = [];
    const add = (label, value) => {
      if (value === undefined || value === null || value === "") return;
      rows.push(`<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd>`);
    };
    if (item.type === "technique") {
      add("Attack Type", sys.attackType);
      add("Activation", sys.activation);
      add("Ki Cost", sys.kiCostResolved || sys.kiCostRaw);
      add("Extra Dice", sys.extraDice);
      add("Qualities", sys.qualities);
      add("Tags", sys.tags);
    } else if (item.type === "weapon") {
      add("Damage Dice", sys.damageDice);
      add("Qualities", sys.qualities);
    } else if (item.type === "armor") {
      add("Defense Bonus", sys.defenseBonus);
      add("Armor HP", `${sys.currentHits ?? 0} / ${sys.bonusHits ?? 0}`);
      add("Qualities", sys.qualities);
    } else if (item.type === "boost") {
      add("Activation", sys.activationCost);
      add("Cost", sys.costResolved || sys.cost);
      add("Duration", sys.durationPhases ? `${sys.durationPhases} phase(s)` : "Indefinite");
    } else if (item.type === "trait") {
      add("Category", sys.category);
      add("Cost", sys.costResolved || sys.cost);
    } else if (item.type === "consumable") {
      add("Quantity", sys.quantity);
      add("Activation", sys.activation);
    } else if (item.type === "equipment") {
      add("Category", sys.category);
      add("Quantity", sys.quantity);
    }
    const effects = (sys.effects ?? []).filter(effect => effect.enabled)
      .map(effect => `${escapeHtml(effect.label || "Effect")}: ${escapeHtml(effect.mode)} ${escapeHtml(String(effect.value))} to ${escapeHtml(effect.target)}`);
    const qualities = (sys.embeddedQualities ?? []).map(quality => escapeHtml(quality.name || quality.key)).filter(Boolean);
    const description = await enrichHtml(sys.description || sys.rulesText || sys.effect || "");
    const content = `
      <article class="dbzf-chat-card" data-kind="item">
        <header class="dbzf-chat-header-with-img"><img src="${item.img}" alt="" /><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.type)}</p></div></header>
        ${rows.length ? `<dl class="dbzf-chat-grid">${rows.join("")}</dl>` : ""}
        ${effects.length ? `<p><strong>Effects</strong></p><ul>${effects.map(effect => `<li>${effect}</li>`).join("")}</ul>` : ""}
        ${qualities.length ? `<p><strong>Qualities:</strong> ${qualities.join(", ")}</p>` : ""}
        ${description ? `<div class="dbzf-chat-description">${description}</div>` : ""}
      </article>`;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content });
  }

  async #rollReaction(key) {
    const map = {
      allOut: () => reactions.rollAllOut(this.actor),
      block: () => reactions.openBlockDialog(this.actor),
      deflect: () => reactions.openDeflectDialog(this.actor),
      fakeOut: () => reactions.openFakeOutDialog(this.actor),
      kiBarrier: () => reactions.openKiBarrierDialog(this.actor),
      nullify: () => reactions.openNullifyDialog(this.actor),
      parry: () => reactions.openParryDialog(this.actor),
      quickCharge: () => reactions.rollQuickCharge(this.actor),
      powerQuickCharge: () => reactions.rollQuickCharge(this.actor, { combined: true }),
      counterblast: () => reactions.openCounterblastDialog(this.actor),
      slipFree: () => reactions.openSlipFreeDialog(this.actor),
      breakFree: () => reactions.rollBreakFree(this.actor),
      raiseCharacteristic: () => reactions.openRaiseCharacteristicDialog(this.actor)
    };
    return this.#withScroll(() => map[key]?.());
  }

  async _onDrop(event) {
    if (event._dbzfDropHandled) return false;
    event._dbzfDropHandled = true;
    event.stopImmediatePropagation?.();
    event.preventDefault();
    const data = FoundryTextEditor.getDragEventData(event);
    if (data.type !== "Item") return super._onDrop?.(event);

    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;

    const ownedCard = event.target.closest?.(".dbzf-owned-item-card[data-item-id]");
    if (ownedCard && item.type === "quality") {
      const targetItem = this.actor.items.get(ownedCard.dataset.itemId);
      if (!targetItem?.system?.embeddedQualities) return false;
      const nextQuality = qualityFromItem(item);
      const embeddedQualities = dedupeQualities(targetItem.system.embeddedQualities ?? []);
      const nextIdentity = qualityIdentity(nextQuality);
      if (nextIdentity && embeddedQualities.some(quality => qualityIdentity(quality) === nextIdentity)) {
        ui.notifications.warn(`${item.name} is already embedded on ${targetItem.name}.`);
        return false;
      }
      embeddedQualities.push(nextQuality);
      await this.#withScroll(() => targetItem.update({ "system.embeddedQualities": dedupeQualities(embeddedQualities) }));
      ui.notifications.info(`${item.name} added to ${targetItem.name}.`);
      return true;
    }

    const itemData = item.toObject();
    delete itemData._id;
    if (itemData.type === "species") {
      itemData.system ??= {};
      itemData.system.active = true;
      const updates = this.actor.items.filter(existing => existing.type === "species" && existing.system?.active).map(existing => ({ _id: existing.id, "system.active": false }));
      await this.#withScroll(async () => {
        if (updates.length) await this.actor.updateEmbeddedDocuments("Item", updates);
        await this.actor.createEmbeddedDocuments("Item", [itemData]);
        await this.actor.update({ "system.identity.species": normalizeSpeciesKey(itemData.system.speciesKey || itemData.name) });
      });
      return true;
    }
    await this.#withScroll(() => this.actor.createEmbeddedDocuments("Item", [itemData]));
    return true;
  }

  static async #onSubmit(event, form, formData) {
    event.preventDefault();
    await withScrollPreserved(this, async () => {
      const source = formData.object ?? Object.fromEntries(new FormData(form).entries());
      // Raw FormData reports a checked box as the string "on", which BooleanField casts to FALSE,
      // and omits an unchecked box entirely. Read both states off the DOM instead.
      for (const input of form.querySelectorAll("input[type='checkbox'][name]")) {
        source[input.name] = input.checked;
      }
      for (const input of form.querySelectorAll("input[type='number'][name]")) {
        source[input.name] = Number(input.value || 0);
      }
      if (source["system.resources.ki.value"] !== undefined) {
        const next = Math.max(0, Number(source["system.resources.ki.value"] || 0));
        source["system.resources.ki.value"] = next;
        source["system.resources.ki.charged"] = next;
      }
      const updateData = foundry.utils.expandObject(source);
      await this.actor.update(updateData);
    });
  }

  #withScroll(callback) {
    return withScrollPreserved(this, callback);
  }

  // Derived values are no longer hand-patched into the DOM. Every mutation path above ends in a
  // document update (or explicit render), and the full re-render rebuilds the sheet from the
  // template with current derived data, preserving scroll/focus via _syncPartState. This removed
  // the brittle hardcoded "[data-derived]" list that previously had to be kept in sync by hand.

  #fieldValue(field) {
    if (field instanceof HTMLInputElement && field.type === "checkbox") return field.checked;
    if (field instanceof HTMLInputElement && field.type === "number") return Number(field.value || 0);
    if (field.tagName === "PROSE-MIRROR") return field.value ?? "";
    return field.value;
  }
}

function normalizeSpeciesKey(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  // Already a canonical species key (e.g. "frostDemon"): keep its exact casing so
  // the dropdown selection round-trips instead of reverting to Custom / Unset.
  if (Object.hasOwn(DBZF_SPECIES, raw)) return raw;
  const norm = token => String(token ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(raw) === "human" ? "earthling" : norm(raw);
  for (const [key, data] of Object.entries(DBZF_SPECIES)) {
    if (norm(key) === target || norm(data.label) === target) return key;
  }
  // Genuinely custom species: keep a stable dashed token.
  return raw.toLowerCase().replace(/\s+/g, "-");
}

function speciesKeyFromItem(item) {
  return normalizeSpeciesKey(item.system?.speciesKey || item.name);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function snapshotResources(actor) {
  return {
    hits: Number(actor.system.resources?.hits?.value || 0),
    defense: Number(actor.system.resources?.defense?.value || 0),
    ki: Number(actor.system.resources?.ki?.value || 0)
  };
}
