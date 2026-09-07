import { activeField, effectsField, embeddedQualitiesField } from "./item-common-fields.mjs";
const fields = foundry.data.fields;

export class TraitData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      category: new fields.StringField({ initial: "" }),
      // Raw cost expression: plain numbers and/or %-of-BP, combinable with "+" (e.g. "10% + 5").
      // Resolved against the owner's Battle Power in prepareDerivedData. (Was an integer field;
      // existing numeric values are cast to their string form on load with no data loss.)
      cost: new fields.StringField({ required: true, nullable: false, initial: "" }),
      costResolved: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      // Bookkeeping only: how many upgrades/improvements have been made to this trait.
      upgradeCount: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      rulesText: new fields.HTMLField({ initial: "" }),
      description: new fields.HTMLField({ initial: "" }),
      active: activeField(),
      effects: effectsField(),
      embeddedQualities: embeddedQualitiesField()
    };
  }
}
