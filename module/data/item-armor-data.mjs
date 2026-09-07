import { activeField, effectsField, embeddedQualitiesField } from "./item-common-fields.mjs";
const fields = foundry.data.fields;

export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      defenseBonus: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      bonusHits: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      currentHits: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      destroyed: new fields.BooleanField({ required: true, nullable: false, initial: false }),
      qualities: new fields.StringField({ initial: "" }),
      description: new fields.HTMLField({ initial: "" }),
      active: activeField(),
      effects: effectsField(),
      embeddedQualities: embeddedQualitiesField()
    };
  }
}
