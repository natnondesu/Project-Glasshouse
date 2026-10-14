import { CURRENT_SCHEMA_VERSION } from './model/defaults';
import { err, ok, type Result } from './result';

type RawWorkspace = Record<string, unknown>;

/** MIGRATIONS[n] upgrades schema n to n + 1. Add an entry whenever CURRENT_SCHEMA_VERSION increases. */
const MIGRATIONS: Record<number, (raw: RawWorkspace) => RawWorkspace> = {
  // 2026-10: persistent dimensions. Every revision gets an empty list.
  1: (raw) => ({ ...raw, schemaVersion: 2, projects: mapRevisions(raw.projects, (rev) => ({ ...rev, content: { ...asRecord(rev.content), dimensions: [] } })) }),
  // 2026-10: power feeds from MCB panels to racks.
  2: (raw) => ({ ...raw, schemaVersion: 3, projects: mapRevisions(raw.projects, (rev) => ({ ...rev, content: { ...asRecord(rev.content), feeds: [] } })) }),
  // 2026-10: equipment state (planned / deployed / maintenance), kept per plan outside revisions.
  3: (raw) => ({ ...raw, schemaVersion: 4, projects: mapPlans(raw.projects, (plan) => ({ ...plan, equipmentState: {} })) }),
};

const asRecord = (v: unknown): RawWorkspace => (typeof v === 'object' && v !== null ? (v as RawWorkspace) : {});
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Leaves malformed shapes for the schema to reject with a precise message. */
function mapRevisions(projects: unknown, fn: (rev: RawWorkspace) => RawWorkspace): unknown {
  if (!Array.isArray(projects)) return projects;
  return projects.map((p) => {
    const project = asRecord(p);
    if (!Array.isArray(project.sites)) return p;
    return {
      ...project,
      sites: project.sites.map((s) => {
        const site = asRecord(s);
        if (!Array.isArray(site.rooms)) return s;
        return {
          ...site,
          rooms: site.rooms.map((r) => {
            const room = asRecord(r);
            const plan = asRecord(room.plan);
            if (!Array.isArray(plan.revisions)) return r;
            return { ...room, plan: { ...plan, revisions: asArray(plan.revisions).map((rev) => fn(asRecord(rev))) } };
          }),
        };
      }),
    };
  });
}

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

/** Like mapRevisions, one level up: every room's plan. */
function mapPlans(projects: unknown, fn: (plan: RawWorkspace) => RawWorkspace): unknown {
  if (!Array.isArray(projects)) return projects;
  return projects.map((p) => {
    const project = asRecord(p);
    if (!Array.isArray(project.sites)) return p;
    return {
      ...project,
      sites: project.sites.map((s) => {
        const site = asRecord(s);
        if (!Array.isArray(site.rooms)) return s;
        return { ...site, rooms: site.rooms.map((r) => ({ ...asRecord(r), plan: fn(asRecord(asRecord(r).plan)) })) };
      }),
    };
  });
}
