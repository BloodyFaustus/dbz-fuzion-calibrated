const fields = foundry.data.fields;

export class QualityData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      key: new fields.StringField({ initial: "" }),
      type: new fields.StringField({ initial: "" }),
      commonModifier: new fields.BooleanField({ required: true, nullable: false, initial: true }),
      rating: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      cost: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      mechanics: new fields.StringField({ initial: "" }),
      rulesText: new fields.HTMLField({ initial: "" })
    };
  }
}
