export const DBZF_SPECIES = {
  earthling: { label: "Earthling", traits: "+25% EXP and High Tension unlock." },
  saiyan: { label: "Saiyan", traits: "Zenkai EXP, Saiyan Rage, and Oozaru unlocks." },
  halfSaiyan: { label: "Half-Saiyan", traits: "Hybrid Saiyan support with custom flags." },
  namekian: { label: "Namekian", traits: "Per-phase regeneration and Giant Namekian unlock." },
  frostDemon: { label: "Frost Demon", traits: "Vacuum compatibility and Reduction Form unlocks." },
  android: { label: "Android", traits: "Limited or infinite energy model support." },
  bioAndroid: { label: "Bio-Android", traits: "Genetic source trait support." },
  corePerson: { label: "Core Person / Kai / Makai", traits: "Divinity, Kai, or Makai variant support." },
  djinn: { label: "Djinn", traits: "Mystic Nature, sealed abilities, Prisoner of Fate." },
  majin: { label: "Majin", traits: "Demon Realm, Prisoner of Fate, Boo-lineage regeneration support." },
  alien: { label: "Alien / Custom Species", traits: "Generic custom species for bespoke traits." }
};

export function getSpeciesChoices() {
  return Object.entries(DBZF_SPECIES).map(([key, data]) => ({ key, label: data.label }));
}
