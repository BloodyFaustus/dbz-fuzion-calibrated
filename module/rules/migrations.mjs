// World data migration framework.
//
// Most schema evolutions (e.g. a field changing type, like trait `cost` integer -> string in
// 0.1.22) are handled automatically by Foundry's field casting when a document loads, so they
// need NO entry here. Add a migration only when stored data must be actively rewritten.
//
// To add one: register an async function under its target version in MIGRATIONS. It must be
// IDEMPOTENT (safe to run more than once) because a GM can re-run migrations manually.

const SETTING_KEY = "lastMigratedVersion";

export function registerMigrationSetting(systemId) {
  game.settings.register(systemId, SETTING_KEY, {
    name: "DBZ Fuzion last migrated version",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
}

// version string -> async (context) => void.  context = { systemId, currentVersion, fromVersion }.
export const MIGRATIONS = {
  // "0.1.23": async () => { /* future example */ },
};

function sortedVersions(versions) {
  return [...versions].sort((a, b) => (foundry.utils.isNewerVersion(b, a) ? -1 : 1));
}

// Versions that are newer than what the world has run, and not newer than the current build.
export function pendingMigrationVersions(lastVersion, currentVersion, registry = MIGRATIONS) {
  const last = lastVersion || "0.0.0";
  return sortedVersions(Object.keys(registry)).filter(version =>
    foundry.utils.isNewerVersion(version, last)
    && !foundry.utils.isNewerVersion(version, currentVersion)
  );
}

export async function runWorldMigration(systemId, currentVersion, { force = false } = {}) {
  if (!game.user?.isGM) return { ran: false, reason: "not-gm" };
  const last = game.settings.get(systemId, SETTING_KEY) || "";
  const versions = force ? sortedVersions(Object.keys(MIGRATIONS)) : pendingMigrationVersions(last, currentVersion);
  const context = { systemId, currentVersion, fromVersion: last };

  for (const version of versions) {
    try {
      await MIGRATIONS[version](context);
    } catch (err) {
      console.error(`DBZ Fuzion | Migration ${version} failed`, err);
      ui.notifications?.error(`DBZ Fuzion migration ${version} failed; see console.`);
      return { ran: false, error: err.message, version };
    }
  }

  await game.settings.set(systemId, SETTING_KEY, currentVersion);
  if (versions.length) ui.notifications?.info(`DBZ Fuzion migrated world data to v${currentVersion}.`);
  return { ran: true, versions };
}

// Called once on ready for the GM. Stamps a baseline on first run (pre-framework worlds rely on
// field casting for the 0.1.22 schema), then runs any pending migrations on later upgrades.
export async function migrateOnReady(systemId, currentVersion) {
  if (!game.user?.isGM) return { ran: false, reason: "not-gm" };
  const last = game.settings.get(systemId, SETTING_KEY);
  if (!last) {
    await game.settings.set(systemId, SETTING_KEY, currentVersion);
    return { ran: false, baseline: currentVersion };
  }
  if (!foundry.utils.isNewerVersion(currentVersion, last)) return { ran: false, upToDate: true };
  return runWorldMigration(systemId, currentVersion);
}
