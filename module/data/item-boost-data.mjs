import { activeField, effectsField, embeddedQualitiesField } from "./item-common-fields.mjs";
const fields = foundry.data.fields;

export class BoostData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      activationCost: new fields.StringField({ required: true, nullable: false, initial: "none" }),
      // Ki/point cost as a raw expression: plain numbers and/or %-of-BP, combinable with "+"
      // (e.g. "10% + 5"). Resolved against the owner's Battle Power in prepareDerivedData.
      cost: new fields.StringField({ required: true, nullable: false, initial: "" }),
      costResolved: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      // Bookkeeping only: how many upgrades/improvements have been made to this boost.
      upgradeCount: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      durationPhases: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      remainingPhases: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      showChatOnActivation: new fields.BooleanField({ required: true, nullable: false, initial: true }),
      rulesText: new fields.HTMLField({ initial: "" }),
      description: new fields.HTMLField({ initial: "" }),
      active: activeField(),
      effects: effectsField(),
      embeddedQualities: embeddedQualitiesField()
    };
  }
}
