import { describe, expect, it } from 'vitest';
import { racksOf } from './devices';
import { currentRevision } from './lookup';
import { latestApproved, revisionIssues } from './readiness';
import type { Workspace } from './model/types';
import { createShowcaseProject } from './sampleShowcase';
import { siteLinkIssues, uplinksOf } from './siteLinks';
import { stacksOf } from './stacks';

const AT = '2026-10-17T00:00:00.000Z';

describe('the Riverside showcase sample', () => {
  const built = createShowcaseProject(AT);
  if (!built.ok) throw new Error(built.error.message);
  const project = built.value;
  const ws: Workspace = { schemaVersion: 0 as never, projects: [project], catalog: [], lastBackupAt: null } as unknown as Workspace;
  const [campus, annex] = project.sites;
  const room = (name: string) => campus!.rooms.find((r) => r.name === name)!;
  const server = room('Server Room');
  const content = currentRevision(server.plan).content;
  const devices = racksOf(content).flatMap((r) => r.devices.flatMap((d) => [d, ...(d.kind === 'chassis' ? d.nodes : [])]));

  it('builds, as a sample, across two sites', () => {
    expect(project.isSample).toBe(true);
    expect(campus!.rooms.map((r) => r.name)).toEqual(['Server Room', 'Shaft L1', 'Shaft L2', 'Shaft L3']);
    expect(annex!.rooms.map((r) => r.name)).toEqual(['Comms Room']);
  });

  it('has a server room as big as a real one: stacks, LAGs, VLANs and power', () => {
    expect(devices.length).toBeGreaterThanOrEqual(70);
    expect(content.links.length).toBeGreaterThanOrEqual(80);
    expect(stacksOf(content).map((s) => [s.name, s.members.length])).toEqual([['CORE', 2], ['DIST', 2]]);
    expect(content.vlans.map((v) => v.vid)).toEqual([10, 20, 30, 40, 50, 99]);
    expect(content.feeds.length).toBeGreaterThan(10);
  });

  it('has an approved revision for the Install sheet, and a draft with a blocker, something to acknowledge and a note', () => {
    expect(latestApproved(server.plan)?.number).toBe(1);
    expect(currentRevision(server.plan)).toMatchObject({ number: 2, state: 'draft' });
    const severities = revisionIssues(currentRevision(server.plan)).map((i) => i.severity);
    expect(severities).toContain('block');
    expect(severities).toContain('needs_ack');
    expect(server.plan.notes).toHaveLength(1);
    expect(Object.values(server.plan.equipmentState)).toContain('maintenance');
  });

  it('uplinks every shaft to the DIST stack across rooms: L1 and L2 paired, L3 still waiting for its far end', () => {
    for (const name of ['Shaft L1', 'Shaft L2', 'Shaft L3']) expect(uplinksOf(ws, room(name).id)).toHaveLength(2);
    expect(siteLinkIssues(ws, room('Shaft L1').id)).toEqual([]);
    expect(siteLinkIssues(ws, room('Shaft L2').id)).toEqual([]);
    expect(siteLinkIssues(ws, room('Shaft L3').id).map((i) => i.code)).toEqual(['remote_unpaired', 'remote_unpaired']);
    expect(latestApproved(room('Shaft L1').plan)?.number).toBe(1);
  });

  it('holds only what it shows on purpose: no stray warnings in the server room or the paired shafts', () => {
    const issues = revisionIssues(currentRevision(server.plan));
    expect(issues.filter((i) => i.severity === 'warn').map((i) => i.message)).toEqual([]);
    expect(new Set(issues.map((i) => i.code))).toEqual(new Set(['clearance_obstructed', 'reserved_demand_unknown']));
    for (const name of ['Shaft L1', 'Shaft L2']) expect(revisionIssues(currentRevision(room(name).plan)).map((i) => i.message)).toEqual([]);
  });
});

