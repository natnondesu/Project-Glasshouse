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
  // 2026-10: feeds can end at another power source, so `rackId` became `targetId`.
  4: (raw) => ({
    ...raw,
    schemaVersion: 5,
    projects: mapRevisions(raw.projects, (rev) => {
      const content = asRecord(rev.content);
      const feeds = Array.isArray(content.feeds) ? content.feeds.map((f) => {
        const { rackId, ...rest } = asRecord(f);
        return { ...rest, targetId: rackId };
      }) : content.feeds;
      return { ...rev, content: { ...content, feeds } };
    }),
  }),
  // 2026-10: network links between device ports.
  5: (raw) => ({ ...raw, schemaVersion: 6, projects: mapRevisions(raw.projects, (rev) => ({ ...rev, content: { ...asRecord(rev.content), links: [] } })) }),
  // 2026-10: room VLANs, assigned to ports as access or trunk.
  6: (raw) => ({ ...raw, schemaVersion: 7, projects: mapRevisions(raw.projects, (rev) => ({ ...rev, content: { ...asRecord(rev.content), vlans: [] } })) }),
  // 2026-10: Compute and Storage merged into one Server category.
  7: (raw) => ({
    ...raw,
    schemaVersion: 8,
    catalog: Array.isArray(raw.catalog) ? raw.catalog.map(withServerCategory) : raw.catalog,
    projects: mapRevisions(raw.projects, (rev) => {
      const content = asRecord(rev.content);
      const objects = Array.isArray(content.objects)
        ? content.objects.map((o) => {
            const object = asRecord(o);
            return Array.isArray(object.devices) ? { ...object, devices: object.devices.map(withServerCategory) } : o;
          })
        : content.objects;
      const templatesUsed = Array.isArray(content.templatesUsed) ? content.templatesUsed.map(withServerCategory) : content.templatesUsed;
      return { ...rev, content: { ...content, objects, templatesUsed } };
    }),
  }),
  // 2026-10: review notes became notes on a revision: no resolving, so they stop holding approval.
  // Each note moves to the revision it was added on (its history entry says), and the resolve and
  // reopen lines leave the history.
  8: (raw) => ({
    ...raw,
    schemaVersion: 9,
    projects: mapPlans(raw.projects, (plan) => {
      const history = asArray(plan.history).map(asRecord);
      const revisions = asArray(plan.revisions).map(asRecord);
      const latest = Number(revisions[revisions.length - 1]?.number ?? 1);
      const notes = asArray(plan.notes).map((n) => {
        const { resolved: _resolved, ...note } = asRecord(n);
        const added = history.find((e) => e.code === 'note_added' && e.at === note.createdAt);
        return { ...note, revision: typeof added?.revision === 'number' ? added.revision : latest };
      });
      const kept = history.filter((e) => e.code !== 'note_resolved' && e.code !== 'note_reopened' && e.action !== 'Resolved a review note' && e.action !== 'Reopened a review note');
      return { ...plan, notes, history: kept };
    }),
  }),
};

/** Schema 8 merged Compute and Storage into Server; anything else (including a Chassis, which has no category) is left as it is. */
export function withServerCategory(item: unknown): unknown {
  const record = asRecord(item);
  return record.category === 'compute' || record.category === 'storage' ? { ...record, category: 'server' } : item;
}

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
