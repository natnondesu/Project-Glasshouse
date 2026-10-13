import { CURRENT_SCHEMA_VERSION } from './model/defaults';
import { err, ok, type Result } from './result';

type RawWorkspace = Record<string, unknown>;

/** MIGRATIONS[n] upgrades schema n to n + 1. Add an entry whenever CURRENT_SCHEMA_VERSION increases. */
const MIGRATIONS: Record<number, (raw: RawWorkspace) => RawWorkspace> = {};

export function migrate(raw: unknown): Result<unknown> {
  if (typeof raw !== 'object' || raw === null) return err('invalid_value', 'Saved data is not a Glasshouse workspace.');
  let current = raw as RawWorkspace;
  const stored = current.schemaVersion;
  if (typeof stored !== 'number') return err('invalid_value', 'Saved data is missing a schema version.');
  let version: number = stored;
  if (version > CURRENT_SCHEMA_VERSION) {
    return err('invalid_value', `This data was saved by a newer Glasshouse (schema ${version}). Update the app to open it.`);
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return err('invalid_value', `There is no upgrade path from schema ${version}.`);
    current = step(current);
    version = current.schemaVersion as number;
  }
  return ok(current);
}
