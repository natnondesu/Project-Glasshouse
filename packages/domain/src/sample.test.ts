import { describe, expect, it } from 'vitest';
import { bomRows, bomRowsFor } from './bom';
import { checkPlan } from './checks';
import { apply as applyWorkspaceCommand } from './commands/workspace';
import { createWorkspace } from './factories';
import { currentRevision, findRoom } from './lookup';
import { approvalBlockers, latestApproved } from './readiness';
import { createSampleProject, withSample } from './sample';
import { feedRoute } from './feeds';
import { footprintOf } from './footprint';
import { pointInPolygon } from './geometry/polygon';
import type { Chassis, Rack, Workspace } from './model/types';

const AT = '2026-10-14T00:00:00.000Z';

function sampleWorkspace(): Workspace {
  const ws = withSample(createWorkspace(), AT);
  if (!ws.ok) throw new Error(ws.error.message);
  return ws.value;
}

describe('Sample Project', () => {
  it('is one labelled Site with an Approved server room and a draft MDF', () => {
    const ws = sampleWorkspace();
    const [project] = ws.projects;
    expect(project).toMatchObject({ isSample: true });
    expect(project!.sites).toHaveLength(1);
    const [server, mdf] = project!.sites[0]!.rooms;
    expect(server!.name).toBe('Server room A');
    expect(currentRevision(server!.plan).state).toBe('approved');
    expect(currentRevision(server!.plan).content.survey.floorAreas).toHaveLength(1);
    expect(mdf!.name).toBe('MDF-1');
    expect(currentRevision(mdf!.plan).state).toBe('draft');
  });

  it('gives the MDF an L-shaped floor, a column, mixed racks, a populated chassis, one blocker and one open note', () => {
    const ws = sampleWorkspace();
    const mdf = ws.projects[0]!.sites[0]!.rooms[1]!;
    const content = currentRevision(mdf.plan).content;
    expect(content.survey.floorAreas).toHaveLength(2);
    expect(content.survey.cutOuts).toHaveLength(1);
    const racks = content.objects.filter((o): o is Rack => o.type === 'rack');
    expect(racks.filter((r) => r.owner === 'oxygenai')).toHaveLength(2);
    const customer = racks.filter((r) => r.owner === 'customer');
    expect(customer).toHaveLength(1);
    expect(customer[0]!.reserved).toHaveLength(1);
    expect(content.objects.some((o) => o.type === 'existing_rack')).toBe(true);
    const chassis = racks.flatMap((r) => r.devices).filter((d): d is Chassis => d.kind === 'chassis');
    expect(chassis[0]!.nodes).toHaveLength(5);
    const blocking = checkPlan(content).filter((i) => i.severity === 'block');
    expect(blocking.map((i) => i.code)).toEqual(['clearance_obstructed']);
    expect(mdf.plan.notes.filter((n) => !n.resolved)).toHaveLength(1);
    expect(content.templatesUsed.every((t) => t.illustrative)).toBe(true);
  });

  it('loads again with fresh ids, and a loaded server room has no approval blockers', () => {
    const ws = sampleWorkspace();
    const again = applyWorkspaceCommand(ws, { type: 'sample/load', at: AT });
    if (!again.ok) throw new Error(again.error.message);
    const [a, b] = again.value.projects;
    expect(b!.isSample).toBe(true);
    expect(b!.id).not.toBe(a!.id);
    expect(b!.sites[0]!.rooms[0]!.id).not.toBe(a!.sites[0]!.rooms[0]!.id);
    const plan = a!.sites[0]!.rooms[0]!.plan;
    expect(approvalBlockers({ ...plan, revisions: plan.revisions.map((r) => ({ ...r, state: 'in_review' as const })) })).toEqual([]);
  });

  it('builds from the seed templates even if the catalog was emptied', () => {
    const project = createSampleProject(AT);
    expect(project.ok).toBe(true);
  });
});

describe('latestApproved and bomRowsFor', () => {
  it('keeps printing the Approved revision after a new draft starts', () => {
    const ws = sampleWorkspace();
    const roomId = ws.projects[0]!.sites[0]!.rooms[0]!.id;
    const next = applyWorkspaceCommand(ws, { type: 'review', roomId, command: { type: 'review/new-draft', at: AT } });
    if (!next.ok) throw new Error(next.error.message);
    const loc = findRoom(next.value, roomId)!;
    expect(currentRevision(loc.room.plan)).toMatchObject({ number: 2, state: 'draft' });
    const approved = latestApproved(loc.room.plan)!;
    expect(approved).toMatchObject({ number: 1, state: 'approved' });
    expect(bomRowsFor(loc, approved)).toEqual(bomRows(loc));
    expect(latestApproved(ws.projects[0]!.sites[0]!.rooms[1]!.plan)).toBeNull();
  });
});

describe('Sample Project power feeds', () => {
  it('feeds the racks from wall panels, with routes that stay inside the room', () => {
    const ws = sampleWorkspace();
    for (const room of ws.projects[0]!.sites[0]!.rooms) {
      const content = currentRevision(room.plan).content;
      expect(content.feeds.length).toBeGreaterThan(0);
      const fp = footprintOf(content.survey);
      for (const feed of content.feeds) {
        const route = feedRoute(content, feed)!;
        for (const p of route.slice(1, -1)) expect(fp.some((poly) => pointInPolygon(p, poly))).toBe(true);
      }
    }
    const server = currentRevision(ws.projects[0]!.sites[0]!.rooms[0]!.plan).content;
    const rk01 = server.objects.find((o) => o.name === 'RK-01')!;
    expect(server.feeds.filter((f) => f.rackId === rk01.id).map((f) => f.label)).toEqual(['Feed A', 'Feed B']);
  });
});
