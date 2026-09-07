import { activeField, effectsField, embeddedQualitiesField } from "./item-common-fields.mjs";
const fields = foundry.data.fields;

export class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      damageDice: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      qualities: new fields.StringField({ initial: "" }),
      description: new fields.HTMLField({ initial: "" }),
      active: activeField(),
      effects: effectsField(),
      embeddedQualities: embeddedQualitiesField()
    };
  }
}
