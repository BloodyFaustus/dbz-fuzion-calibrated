import { activeField, effectsField, embeddedQualitiesField } from "./item-common-fields.mjs";
const fields = foundry.data.fields;

export class TechniqueData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      attackType: new fields.StringField({ initial: "power" }),
      tags: new fields.StringField({ initial: "" }),
      qualities: new fields.StringField({ initial: "" }),
      kiCostRaw: new fields.StringField({ initial: "" }),
      kiCostResolved: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      extraDice: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      // Control/utility techniques that never deal HIT damage, whatever their dice roll.
      zeroDamage: new fields.BooleanField({ required: true, nullable: false, initial: false }),
      // Bookkeeping only: how many upgrades/improvements have been made to this technique.
      upgradeCount: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      description: new fields.HTMLField({ initial: "" }),
      activation: new fields.StringField({ initial: "" }),
      boosts: new fields.HTMLField({ initial: "" }),
      active: activeField(),
      effects: effectsField(),
      embeddedQualities: embeddedQualitiesField()
    };
  }
}
