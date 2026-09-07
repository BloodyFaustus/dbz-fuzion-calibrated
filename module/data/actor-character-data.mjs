const fields = foundry.data.fields;

function characteristicField(initial = 0) {
  return new fields.SchemaField({
    base: new fields.NumberField({ required: true, nullable: false, integer: true, initial }),
    effective: new fields.NumberField({ required: true, nullable: false, integer: true, initial })
  });
}

function resourceValueMaxField(value = 0, max = 0) {
  return new fields.SchemaField({
    value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: value }),
    max: new fields.NumberField({ required: true, nullable: false, integer: true, initial: max }),
    transformationBonusApplied: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 })
  });
}

function skillField() {
  return new fields.SchemaField({
    rank: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
    effectiveRank: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
    value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
    total: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 })
  });
}

function customSkillField() {
  return new fields.SchemaField({
    name: new fields.StringField({ initial: "" }),
    rank: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
    linkedCharacteristic: new fields.StringField({
      required: true,
      nullable: false,
      initial: "combat"
    }),
    value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
    total: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 })
  });
}

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      identity: new fields.SchemaField({
        species: new fields.StringField({ initial: "" }),
        age: new fields.StringField({ initial: "" }),
        birthYear: new fields.StringField({ initial: "" }),
        sex: new fields.StringField({ initial: "" }),
        hair: new fields.StringField({ initial: "" }),
        eyes: new fields.StringField({ initial: "" }),
        build: new fields.StringField({ initial: "" }),
        sexuality: new fields.StringField({ initial: "" }),
        gimmick: new fields.StringField({ initial: "" }),
        personality: new fields.StringField({ initial: "" })
      }),
      biography: new fields.HTMLField({ initial: "" }),
      characteristics: new fields.SchemaField({
        physical: characteristicField(1),
        mental: characteristicField(1),
        combat: characteristicField(1),
        movement: characteristicField(1)
      }),
      skills: new fields.SchemaField({
        fighting: skillField(),
        power: skillField(),
        weapon: skillField(),
        evasion: skillField(),
        mind: skillField(),
        body: skillField()
      }),
      resources: new fields.SchemaField({
        // Placeholder only: _onCreate immediately sets current HITs to the derived maximum from
        // (20 x Physical) + (3 x EXP) + 100 + Body ranks. This value is what a default character's
        // formula yields, so the sheet is never briefly above its own maximum before that lands.
        // `max` is irrelevant here — it is recomputed every prepare.
        hits: resourceValueMaxField(120, 120),
        tempHits: resourceValueMaxField(0, 100),
        ki: new fields.SchemaField({
          value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          charged: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          max: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          spent: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 })
        }),
        // Battle Power = CaC x 10, i.e. (starting Physical + Mental) x 10. These initials are the
        // default character's figure ((1 + 1) x 10); _onCreate reseeds from the actual starting
        // stats, and `effective`/`suggested` are recomputed every prepare.
        battlePower: new fields.SchemaField({
          value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 20 }),
          manual: new fields.BooleanField({ required: true, nullable: false, initial: true }),
          effective: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 20 }),
          suggested: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 20 })
        }),
        powerUp: new fields.SchemaField({
          // Derived every prepare from percent x effective Battle Power.
          value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          // Fixed Character-Creation charge % (starting Physical + Mental). Raising base stats
          // afterward does NOT change it; only techniques/traits/bonuses (effects targeting
          // resources.powerUp.percent) do. Seeded from starting stats once; editable.
          baseCaC: new fields.NumberField({ required: true, nullable: false, initial: 2 }),
          // Set true once baseCaC has been seeded from starting stats, so it never auto-reseeds.
          caCSeeded: new fields.BooleanField({ required: true, nullable: false, initial: false }),
          // Derived total % actually used = baseCaC + effect bonuses.
          percent: new fields.NumberField({ required: true, nullable: false, initial: 2 })
        }),
        defense: new fields.SchemaField({
          value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 50 })
        })
      }),
      powerScaling: new fields.SchemaField({
        battlePowerMode: new fields.StringField({ required: true, nullable: false, initial: "manual" }),
        canonPowerLevel: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        canonPowerSource: new fields.StringField({ initial: "" }),
        canonCharacterName: new fields.StringField({ initial: "" }),
        canonForm: new fields.StringField({ initial: "" }),
        strictFormulaBattlePower: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 200 }),
        xpBandSuggestedBattlePower: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 200 }),
        suggestedBattlePower: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 200 }),
        xpFromCurrentBattlePower: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        lowerBandBattlePower: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        upperBandBattlePower: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        canonToStrictRatio: new fields.NumberField({ required: true, nullable: false, initial: 1 }),
        preserveManualBattlePower: new fields.BooleanField({ required: true, nullable: false, initial: true })
      }),
      experience: new fields.SchemaField({
        total: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        unspent: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 })
      }),
      finances: new fields.SchemaField({
        zeni: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 })
      }),
      // Which characteristic drives each derived stat, and whether derived stats read the base or
      // the effective value. Default source "base" so transformation/boost effects that raise
      // effective ranks/characteristics do not inflate HITs, Defense, Temp HITs or Power Up.
      derivedScaling: new fields.SchemaField({
        hitsCharacteristic: new fields.StringField({ required: true, nullable: false, initial: "physical" }),
        defenseCharacteristic: new fields.StringField({ required: true, nullable: false, initial: "physical" }),
        tempHitsCharacteristic: new fields.StringField({ required: true, nullable: false, initial: "mental" }),
        source: new fields.StringField({ required: true, nullable: false, initial: "base" })
      }),
      transformation: new fields.SchemaField({
        // Optional token artwork per built-in transformation key, e.g.
        // { superSaiyan1Mastered: "worlds/x/ssj1.webp" }. Set from the Transformation panel; the
        // token image swaps automatically when the form changes and reverts on Base.
        tokenArt: new fields.ObjectField({ required: true, nullable: false, initial: () => ({}) }),
        baseTokenArt: new fields.StringField({ initial: "" }),
        selected: new fields.StringField({ initial: "base" }),
        previousSelected: new fields.StringField({ initial: "base" }),
        durationRemaining: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        durationUnit: new fields.StringField({ initial: "" })
      }),
      combatState: new fields.SchemaField({
        actionAvailable: new fields.BooleanField({ required: true, nullable: false, initial: true }),
        reactionAvailable: new fields.BooleanField({ required: true, nullable: false, initial: true }),
        phaseCounter: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        roundCounter: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        phasesSinceRecovery: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        recovery: new fields.SchemaField({
          phasesRequired: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 4 }),
          // When true (default) an active species with its own regeneration cadence overrides
          // phasesRequired (Namekians every phase, Majin Boo lineage every 2 phases).
          useSpeciesPhases: new fields.BooleanField({ required: true, nullable: false, initial: true }),
          hitMode: new fields.StringField({ required: true, nullable: false, initial: "species" }),
          flatHits: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          tempHitsMode: new fields.StringField({ required: true, nullable: false, initial: "chargedKi" }),
          chatTitle: new fields.StringField({ initial: "4-Phase Recovery" }),
          chatMessage: new fields.StringField({ initial: "{{name}} stabilizes between exchanges." }),
          chatDetails: new fields.StringField({ initial: "Every {{phases}} phases, regular HITs recover by the selected mode. If Temp HIT recovery is enabled and the requirement is met, Temp HITs reset to max." })
        }),
        pending: new fields.SchemaField({
          allOut: new fields.BooleanField({ required: true, nullable: false, initial: false }),
          breakFree: new fields.BooleanField({ required: true, nullable: false, initial: false }),
          dodge: new fields.BooleanField({ required: true, nullable: false, initial: false }),
          teamAttack: new fields.ArrayField(new fields.SchemaField({
            assister: new fields.StringField({ initial: "" }),
            label: new fields.StringField({ initial: "" }),
            bonus: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
            // An assist can also contribute a technique's extra damage dice and a share of its
            // qualities. Without these fields the schema silently stripped them on write.
            techniqueName: new fields.StringField({ initial: "" }),
            bonusDice: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
            qualities: new fields.StringField({ initial: "" })
          }), { initial: [] })
        }),
        conditions: new fields.SchemaField({
          grappled: new fields.BooleanField({ required: true, nullable: false, initial: false }),
          knockedDown: new fields.BooleanField({ required: true, nullable: false, initial: false }),
          unconscious: new fields.BooleanField({ required: true, nullable: false, initial: false })
        }),
        activeConditions: new fields.ArrayField(new fields.SchemaField({
          id: new fields.StringField({ initial: "" }),
          key: new fields.StringField({ initial: "custom" }),
          sourceName: new fields.StringField({ initial: "" }),
          rating: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          remainingTicks: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          saveSkill: new fields.StringField({ initial: "" }),
          saveDC: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          breakDamageThreshold: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          metadata: new fields.StringField({ initial: "" })
        }), { initial: [] }),
        // Temporary characteristic boosts from the "Raise Characteristic" reaction. Each lasts a
        // set number of phases and is decremented/removed on Advance Phase.
        temporaryCharacteristics: new fields.ArrayField(new fields.SchemaField({
          characteristic: new fields.StringField({ initial: "" }),
          amount: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          remainingPhases: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 1 })
        }), { initial: [] })
      }),
      belongings: new fields.HTMLField({ initial: "" }),
      techniquesNotes: new fields.HTMLField({ initial: "" }),
      customSkills: new fields.ArrayField(customSkillField(), {
        initial: [
          { name: "", rank: 0, linkedCharacteristic: "combat", value: 0, total: 0 },
          { name: "", rank: 0, linkedCharacteristic: "mental", value: 0, total: 0 },
          { name: "", rank: 0, linkedCharacteristic: "physical", value: 0, total: 0 }
        ]
      })
    };
  }
}
