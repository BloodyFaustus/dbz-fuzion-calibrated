import { activeField, effectsField, embeddedQualitiesField } from "./item-common-fields.mjs";
const fields = foundry.data.fields;

export class TransformationData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      multipliers: new fields.StringField({ initial: "" }),
      cost: new fields.StringField({ initial: "" }),
      duration: new fields.StringField({ initial: "" }),
      rulesText: new fields.HTMLField({ initial: "" }),
      active: activeField(),
      effects: effectsField(),
      embeddedQualities: embeddedQualitiesField()
    };
  }
}
