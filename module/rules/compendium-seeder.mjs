import { DBZF_STARTER_CONTENT } from "./starter-content.mjs";
import { DBZF_RULEBOOK_ENTRIES } from "./rulebook-content.mjs";

const ITEM_PACKS = {
  species: "dbz-fuzion-calibrated.species",
  qualities: "dbz-fuzion-calibrated.qualities",
  transformations: "dbz-fuzion-calibrated.transformations",
  sampleItems: "dbz-fuzion-calibrated.sample-items"
};

const ACTOR_PACKS = {
  sampleActors: "dbz-fuzion-calibrated.sample-actors"
};

const JOURNAL_PACKS = {
  rulebook: "dbz-fuzion-calibrated.core-rulebook"
};

async function unlockPack(pack) {
  const wasLocked = pack.locked;
  if (wasLocked && typeof pack.configure === "function") await pack.configure({ locked: false });
  else if (wasLocked) pack.locked = false;
  return wasLocked;
}

async function getPackNameSet(pack) {
  const index = await pack.getIndex({ fields: ["name", "type"] });
  return new Set(index.map(entry => `${entry.type ?? ""}:${entry.name}`));
}

async function seedPack({ packId, sourceDocs, documentClass, clearExisting = true }) {
  const pack = game.packs.get(packId);
  if (!pack) return { pack: packId, created: 0, skipped: 0, deleted: 0, error: "Pack missing" };

  await unlockPack(pack);
  let deleted = 0;
  if (clearExisting) {
    const documents = await pack.getDocuments();
    const ids = documents.map(document => document.id);
    if (ids.length) {
      await documentClass.deleteDocuments(ids, { pack: pack.collection });
      deleted = ids.length;
    }
  }

  const existing = clearExisting ? new Set() : await getPackNameSet(pack);
  const createData = sourceDocs
    .filter(doc => !existing.has(`${doc.type ?? ""}:${doc.name}`))
    .map(doc => foundry.utils.deepClone(doc));

  if (createData.length) await documentClass.createDocuments(createData, { pack: pack.collection });
  return {
    pack: packId,
    created: createData.length,
    skipped: sourceDocs.length - createData.length,
    deleted
  };
}

export async function unlockSystemCompendia() {
  const packIds = [...Object.values(ITEM_PACKS), ...Object.values(ACTOR_PACKS), ...Object.values(JOURNAL_PACKS)];
  for (const packId of packIds) {
    const pack = game.packs.get(packId);
    if (pack) await unlockPack(pack);
  }
}

export async function seedRulebookCompendium(options = {}) {
  return seedPack({
    packId: JOURNAL_PACKS.rulebook,
    sourceDocs: DBZF_RULEBOOK_ENTRIES,
    documentClass: JournalEntry,
    clearExisting: options.clearExisting !== false
  });
}

export async function seedStarterCompendia(options = {}) {
  const clearExisting = options.clearExisting !== false;
  const results = [];

  for (const [contentKey, packId] of Object.entries(ITEM_PACKS)) {
    results.push(await seedPack({
      packId,
      sourceDocs: DBZF_STARTER_CONTENT[contentKey] ?? [],
      documentClass: Item,
      clearExisting
    }));
  }

  for (const [contentKey, packId] of Object.entries(ACTOR_PACKS)) {
    results.push(await seedPack({
      packId,
      sourceDocs: DBZF_STARTER_CONTENT[contentKey] ?? [],
      documentClass: Actor,
      clearExisting
    }));
  }

  results.push(await seedRulebookCompendium({ clearExisting }));

  const summary = results.reduce((total, result) => {
    total.created += result.created ?? 0;
    total.skipped += result.skipped ?? 0;
    total.deleted += result.deleted ?? 0;
    if (result.error) total.errors.push(result);
    return total;
  }, { created: 0, skipped: 0, deleted: 0, errors: [] });

  return { results, summary };
}
