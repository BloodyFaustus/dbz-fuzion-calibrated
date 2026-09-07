import { activeField, effectsField, embeddedQualitiesField } from "./item-common-fields.mjs";
const fields = foundry.data.fields;

export class ConsumableData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      quantity: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 1 }),
      activation: new fields.StringField({ initial: "" }),
      effect: new fields.HTMLField({ initial: "" }),
      description: new fields.HTMLField({ initial: "" }),
      active: activeField(),
      effects: effectsField(),
      embeddedQualities: embeddedQualitiesField()
    };
  }
}
