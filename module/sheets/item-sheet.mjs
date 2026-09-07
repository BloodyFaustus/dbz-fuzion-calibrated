import { DBZF_EFFECT_MODES, DBZF_EFFECT_TARGETS } from "../rules/effect-targets.mjs";
import { capturePartState, restorePartState, withScrollPreserved } from "./scroll-preservation.mjs";

const { ItemSheetV2 } = foundry.applications.sheets;
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

// Each item type gets a colour on the header's bottom edge and its type caption, so an open sheet
// is identifiable at a glance in a stack of windows.
const TYPE_COLORS = {
  technique: "var(--dbzf-ki)",
  weapon: "var(--dbzf-hits)",
  armor: "var(--dbzf-armor)",
  equipment: "var(--dbzf-text-faint)",
  consumable: "var(--dbzf-ready)",
  quality: "var(--dbzf-warn)",
  trait: "var(--dbzf-temp-hits)",
  boost: "var(--dbzf-aura-monster)",
  transformation: "var(--dbzf-aura-super)",
  species: "var(--dbzf-aura-namek)"
};

const TYPE_LABELS = {
  technique: "Technique",
  weapon: "Weapon",
  armor: "Armor",
  equipment: "Equipment",
  consumable: "Consumable",
  quality: "Quality",
  trait: "Trait",
  boost: "Boost",
  transformation: "Transformation",
  species: "Species"
};

function percent(value, max) {
  const cap = Number(max || 0);
  if (cap <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(value || 0) / cap) * 100)));
}

export class DBZFItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["dbz-fuzion-calibrated", "dbzf-item-app"],
    position: {
      width: 600,
      height: 660
    },
    window: {
      resizable: true
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: false,
      handler: DBZFItemSheet.#onSubmit
    }
  };

  static PARTS = {
    form: {
      template: "systems/dbz-fuzion-calibrated/templates/item/item-sheet.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system;
    context.embeddedQualities = dedupeQualities(this.item.system.embeddedQualities ?? []);
    context.enriched = {
      description: await enrichHtml(this.item.system.description),
      boosts: await enrichHtml(this.item.system.boosts),
      rulesText: await enrichHtml(this.item.system.rulesText),
      effect: await enrichHtml(this.item.system.effect)
    };
    context.owner = this.item.isOwner;
    context.editable = this.isEditable;
    context.cssClass = this.isEditable ? "editable" : "locked";
    context.supportsEffects = ["technique", "weapon", "armor", "equipment", "consumable", "transformation", "species", "trait", "boost"].includes(this.item.type);
    context.effectTargets = DBZF_EFFECT_TARGETS;
    context.effectModes = DBZF_EFFECT_MODES;
    context.typeLabel = TYPE_LABELS[this.item.type] ?? this.item.type;
    context.typeColor = TYPE_COLORS[this.item.type] ?? "var(--dbzf-border-strong)";
    context.armorPct = percent(this.item.system.currentHits, this.item.system.bonusHits);
    context.boostPct = percent(this.item.system.remainingPhases, this.item.system.durationPhases);
    return context;
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
    const form = this.element.querySelector("form.dbzf-item-sheet");
    if (!form) return;
    // Without this the browser submits the form natively: pressing Enter in any text field
    // navigates away from /game with every field in the query string, dropping the session.
    form.addEventListener("submit", this.#onFormSubmit.bind(this));
    form.addEventListener("change", this.#onFormChange.bind(this));
    form.addEventListener("click", this.#onClick.bind(this));
    form.addEventListener("dragover", event => event.preventDefault());
    form.addEventListener("drop", this._onDrop.bind(this));
    // Scroll/focus are preserved synchronously in _syncPartState; no post-render restore needed.
  }

  async #onFormSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    return DBZFItemSheet.#onSubmit.call(this, event, event.currentTarget, {});
  }

  async #onFormChange(event) {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement || field.tagName === "PROSE-MIRROR")) return;
    if (!field.name) return;

    if (field.name.startsWith("system.effects.")) return this.#withScroll(() => this.#saveEffectRow(field));
    if (field.name.startsWith("system.embeddedQualities.")) return this.#withScroll(() => this.#saveQualityRow(field));

    const value = this.#fieldValue(field);
    const updateData = foundry.utils.expandObject({ [field.name]: value });
    if (this.item.type === "armor" && field.name === "system.bonusHits" && !this.item.system.destroyed && Number(this.item.system.currentHits || 0) <= 0) {
      updateData.system.currentHits = Number(value || 0);
    }
    if (this.item.type === "armor" && field.name === "system.destroyed" && value === true) {
      updateData.system.active = false;
    }
    await this.#withScroll(() => this.#updateItem(updateData));
  }

  async #saveEffectRow(field) {
    const match = field.name.match(/^system\.effects\.(\d+)\./);
    const index = Number(match?.[1]);
    if (!Number.isInteger(index)) return;

    const effects = this.#readEffectRows();
    await this.#updateItem({ "system.effects": effects });
  }

  async #saveQualityRow(field) {
    const qualities = this.#readQualityRows();
    await this.#updateItem({ "system.embeddedQualities": qualities });
  }

  async #onClick(event) {
    const image = event.target.closest("[data-action='item-image']");
    if (image) {
      event.preventDefault();
      return this.#openItemImagePicker();
    }
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.action;
    if (action === "effect-add") return this.#withScroll(() => this.#addEffect());
    if (action === "effect-delete") return this.#withScroll(() => this.#deleteEffect(Number(button.dataset.index)));
    if (action === "quality-delete") return this.#withScroll(() => this.#deleteQuality(Number(button.dataset.index)));
  }

  #openItemImagePicker() {
    if (!this.isEditable) return ui.notifications.warn("You do not have permission to edit this item image.");
    const FilePickerClass = foundry.applications.apps.FilePicker ?? globalThis.FilePicker;
    new FilePickerClass({
      type: "image",
      current: this.item.img,
      callback: async path => {
        await this.#withScroll(() => this.#updateItem({ img: path }));
        const image = this.element.querySelector("[data-action='item-image'] img");
        if (image) image.src = path;
      }
    }).browse();
  }

  async _onDrop(event) {
    if (event._dbzfDropHandled) return false;
    event._dbzfDropHandled = true;
    event.stopImmediatePropagation?.();
    event.preventDefault();
    const data = FoundryTextEditor.getDragEventData(event);
    if (data.type !== "Item") return super._onDrop?.(event);
    const item = await Item.implementation.fromDropData(data);
    if (!item || item.type !== "quality") return false;
    if (!this.item.system?.embeddedQualities) {
      ui.notifications.warn("This item type cannot embed qualities.");
      return false;
    }
    const nextQuality = qualityFromItem(item);
    const embeddedQualities = dedupeQualities(this.item.system.embeddedQualities ?? []);
    const nextIdentity = qualityIdentity(nextQuality);
    if (nextIdentity && embeddedQualities.some(quality => qualityIdentity(quality) === nextIdentity)) {
      ui.notifications.warn(`${item.name} is already embedded on ${this.item.name}.`);
      return false;
    }
    embeddedQualities.push(nextQuality);
    await this.#withScroll(() => this.#updateItem({ "system.embeddedQualities": dedupeQualities(embeddedQualities) }));
    ui.notifications.info(`${item.name} added to ${this.item.name}.`);
    return true;
  }

  async #addEffect() {
    const effects = this.#readEffectRows();
    effects.push({
      enabled: true,
      label: "New Effect",
      target: "attacks.all.damageDice",
      mode: "add",
      value: 0,
      valueFormula: "",
      kiCostRaw: "",
      rulesText: ""
    });
    await this.#updateItem({ "system.effects": effects });
    this.render({ force: true });
  }

  async #deleteEffect(index) {
    const effects = this.#readEffectRows();
    effects.splice(index, 1);
    await this.#updateItem({ "system.effects": effects });
    this.render({ force: true });
  }

  async #deleteQuality(index) {
    const qualities = dedupeQualities(this.item.system.embeddedQualities ?? []);
    qualities.splice(index, 1);
    await this.#updateItem({ "system.embeddedQualities": qualities });
    this.render({ force: true });
  }

  static async #onSubmit(event, form, formData) {
    event.preventDefault();
    const source = formData.object ?? Object.fromEntries(new FormData(form).entries());
    // Raw FormData reports a checked box as the string "on", which BooleanField casts to FALSE,
    // and omits an unchecked box entirely. Read both states off the DOM instead.
    for (const input of form.querySelectorAll("input[type='checkbox'][name]")) source[input.name] = input.checked;
    for (const input of form.querySelectorAll("input[type='number'][name]")) source[input.name] = Number(input.value || 0);
    const updateData = foundry.utils.expandObject(source);
    if (this.element.querySelector(".dbzf-effect-row[data-effect-index]")) {
      updateData.system ??= {};
      updateData.system.effects = this.#readEffectRows();
    }
    if (this.element.querySelector(".dbzf-quality-row[data-quality-index]")) {
      updateData.system ??= {};
      updateData.system.embeddedQualities = this.#readQualityRows();
    }
    await withScrollPreserved(this, () => this.#updateItem(updateData));
  }

  #withScroll(callback) {
    return withScrollPreserved(this, callback);
  }

  // Let the update re-render normally. Both this item sheet and the parent actor
  // sheet (if open) refresh, each preserving its own scroll/focus via _syncPartState.
  // That is what propagates item name/description/effect/cost edits to the actor sheet.
  async #updateItem(updateData) {
    return this.item.update(updateData);
  }

  #readEffectRows() {
    const rows = Array.from(this.element.querySelectorAll(".dbzf-effect-row[data-effect-index]"));
    return rows.map(row => ({
      enabled: row.querySelector('[data-effect-field="enabled"]')?.checked ?? false,
      label: row.querySelector('[data-effect-field="label"]')?.value ?? "",
      target: row.querySelector('[data-effect-field="target"]')?.value ?? "attacks.all.damageDice",
      mode: row.querySelector('[data-effect-field="mode"]')?.value ?? "add",
      value: Number(row.querySelector('[data-effect-field="value"]')?.value ?? 0),
      valueFormula: row.querySelector('[data-effect-field="valueFormula"]')?.value ?? "",
      kiCostRaw: row.querySelector('[data-effect-field="kiCostRaw"]')?.value ?? "",
      rulesText: row.querySelector('[data-effect-field="rulesText"]')?.value ?? ""
    }));
  }

  #readQualityRows() {
    const rows = Array.from(this.element.querySelectorAll(".dbzf-quality-row[data-quality-index]"));
    return dedupeQualities(rows.map(row => ({
      name: row.querySelector('[data-quality-field="name"]')?.value ?? "",
      key: row.querySelector('[data-quality-field="key"]')?.value ?? "",
      uuid: row.querySelector('[data-quality-field="uuid"]')?.value ?? "",
      rating: Number(row.querySelector('[data-quality-field="rating"]')?.value ?? 0),
      costKi: row.querySelector('[data-quality-field="costKi"]')?.checked ?? false,
      cost: Number(row.querySelector('[data-quality-field="cost"]')?.value ?? 0),
      rulesText: row.querySelector('[data-quality-field="rulesText"]')?.value ?? ""
    })));
  }

  #fieldValue(field) {
    if (field instanceof HTMLInputElement && field.type === "checkbox") return field.checked;
    if (field instanceof HTMLInputElement && field.type === "number") return Number(field.value || 0);
    if (field.tagName === "PROSE-MIRROR") return field.value ?? "";
    return field.value;
  }

}
