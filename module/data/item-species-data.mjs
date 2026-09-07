import { activeField, effectsField, embeddedQualitiesField } from "./item-common-fields.mjs";
const fields = foundry.data.fields;

export class SpeciesData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      speciesKey: new fields.StringField({ initial: "" }),
      variant: new fields.StringField({ initial: "" }),
      rulesMode: new fields.StringField({ initial: "primary" }),
      xpMultiplier: new fields.NumberField({ required: true, nullable: false, initial: 1 }),
      xpFightMultiplier: new fields.NumberField({ required: true, nullable: false, initial: 1 }),
      xpLossMultiplier: new fields.NumberField({ required: true, nullable: false, initial: 1 }),
      kiChargeMode: new fields.StringField({ initial: "normal" }),
      kiDecayMode: new fields.StringField({ initial: "normal" }),
      senseDetectionMode: new fields.StringField({ initial: "normal" }),
      regenerationMode: new fields.StringField({ initial: "normal" }),
      unlockedTransformations: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      traits: new fields.StringField({ initial: "" }),
      rulesText: new fields.HTMLField({ initial: "" }),
      description: new fields.HTMLField({ initial: "" }),
      active: activeField(),
      effects: effectsField(),
      embeddedQualities: embeddedQualitiesField()
    };
  }
}
