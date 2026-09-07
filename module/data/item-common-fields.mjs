const fields = foundry.data.fields;

export function activeField() {
  return new fields.BooleanField({ required: true, nullable: false, initial: false });
}

export function effectsField() {
  return new fields.ArrayField(new fields.SchemaField({
    enabled: new fields.BooleanField({ required: true, nullable: false, initial: true }),
    label: new fields.StringField({ initial: "" }),
    target: new fields.StringField({ initial: "attacks.all.damageDice" }),
    mode: new fields.StringField({ initial: "add" }),
    value: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
    // Optional stat-referencing formula (e.g. "15%(evasion)"). When set it overrides `value`.
    valueFormula: new fields.StringField({ initial: "" }),
    valueResolved: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
    kiCostRaw: new fields.StringField({ initial: "" }),
    kiCostResolved: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
    rulesText: new fields.StringField({ initial: "" })
  }), { initial: [] });
}

export function embeddedQualitiesField() {
  return new fields.ArrayField(new fields.SchemaField({
    name: new fields.StringField({ initial: "" }),
    key: new fields.StringField({ initial: "" }),
    uuid: new fields.StringField({ initial: "" }),
    rating: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
    costKi: new fields.BooleanField({ required: true, nullable: false, initial: false }),
    cost: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
    rulesText: new fields.StringField({ initial: "" })
  }), { initial: [] });
}
