import { PortManager } from '../ports/PortManager';
import { StateLegend } from './EquipmentStateControl';
import { SearchBox } from '../search/SearchBox';
import type { SearchHit } from '../search/search';
import { PanelCollapseTab, PanelRail } from '../../ui/PanelRail';
import { usePersistentState } from '../../ui/usePersistentState';
import {
  equipmentStateOf,
  revisionIssues,
  currentRevision,
  findNode,
  findRackDevice,
  findReserved,
  formatURange,
  getRack,
  lowestFreeBottomU,
  newId,
  racksOf,
  type PlanContent,
  type Rack,
  type RoomLocation,
  type Template,
} from '@glasshouse/domain';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { usePlanCommit, useSearchParamState } from '../../store/hooks';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { ChecksStrip } from '../plan/ChecksStrip';
import { flaggedObjectIds } from '../plan/flagged';
import { CatalogPalette } from './CatalogPalette';
import { EquipmentInspector } from './EquipmentInspector';
import { PowerBar } from './PowerBar';
import { rackHitAt, RackElevation } from './RackElevation';
import { useDeviceDrag } from './deviceDrag';
import './elevation.css';

const MESSAGE_MS = 4000;

function owningRack(content: PlanContent, id: string | null): Rack | null {
  if (!id) return null;
  return getRack(content, id) ?? findRackDevice(content, id)?.rack ?? findNode(content, id)?.rack ?? findReserved(content, id)?.rack ?? null;
}

function entityNames(content: PlanContent): { id: string; name: string }[] {
  return racksOf(content).flatMap((rack) => [
    { id: rack.id, name: rack.name },
    ...rack.devices.flatMap((d) => [{ id: d.id, name: d.name }, ...(d.kind === 'chassis' ? d.nodes.map((n) => ({ id: n.id, name: n.name })) : [])]),
    ...rack.reserved.map((r) => ({ id: r.id, name: `${r.label} ${formatURange(r)}` })),
  ]);
}

const PULSE_MS = 1700;

/** Centres an SVG block in the rack scroll area. Firefox ignores scrollIntoView on SVG children, so scroll the area itself. */
function revealInRacks(el: Element): void {
  const area = el.closest('.elev__racks');
  if (!area) return;
  const a = area.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  area.scrollBy?.({ top: r.top + r.height / 2 - (a.top + a.height / 2), left: r.left + r.width / 2 - (a.left + a.width / 2), behavior: 'smooth' });
}

export function ElevationView({ location, readOnly = false, viewingPast = false }: { location: RoomLocation; readOnly?: boolean; viewingPast?: boolean }) {
  const [inspectorOpen, setInspectorOpen] = usePersistentState('glasshouse:inspector-open', true);
  const [catalogOpen, setCatalogOpen] = usePersistentState('glasshouse:elevation-catalog-open', true);
  const revision = currentRevision(location.room.plan);
  const content = revision.content;
  const roomId = location.room.id;
  const commit = usePlanCommit(roomId);
  const catalog = useWorkspaceStore((s) => s.workspace.catalog);
  const [selectedId, select] = useSearchParamState('sel');
  const stateOf = (id: string) => equipmentStateOf(location.room.plan, id);
  const navigate = useNavigate();
  const [pulse, setPulse] = useState<string | null>(null);
  useEffect(() => {
    if (!pulse) return;
    // Bring the hit into view inside the scrolling rack area, then let the flash fade.
    const el = document.querySelector(`[data-elev-id="${CSS.escape(pulse)}"]`);
    if (el) revealInRacks(el);
    const t = setTimeout(() => setPulse(null), PULSE_MS);
    return () => clearTimeout(t);
  }, [pulse]);
  const [message, setMessage] = useState<string | null>(null);
  const [portsFor, setPortsFor] = useState<string | null>(null);
  const racks = racksOf(content);
  const issues = useMemo(() => revisionIssues(revision), [revision]);
  const flagged = useMemo(() => flaggedObjectIds(issues), [issues]);
  const names = useMemo(() => entityNames(content), [content]);
  const activeRack = owningRack(content, selectedId) ?? racks[0] ?? null;

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const place = (template: Template, rack: Rack, atU?: number): void => {
    if (readOnly) return;
    if (template.mounting === 'slot') {
      setMessage('Nodes go into a Chassis. Select one and use its slot map.');
      return;
    }
    const bottomU = atU === undefined ? lowestFreeBottomU(rack, template.heightU) : Math.max(1, Math.min(atU, rack.capacityU - template.heightU + 1));
    if (bottomU === null) {
      setMessage(`${rack.name} has no free ${template.heightU}U space.`);
      return;
    }
    const id = newId();
    const problem = commit({ type: 'device/place', id, rackId: rack.id, bottomU, template });
    setMessage(problem);
    if (problem === null) select(id);
  };

  const drag = useDeviceDrag({
    content,
    disabled: readOnly,
    hitTest: rackHitAt,
    scrollArea: () => document.querySelector<HTMLElement>('.elev__racks'),
    onDrop: (p) => {
      // The domain re-checks; a refused drop explains itself in the toast.
      const problem = commit({ type: 'device/move', id: p.deviceId, rackId: p.rackId, bottomU: p.bottomU });
      setMessage(problem);
      if (problem === null) select(p.deviceId);
    },
  });

  if (racks.length === 0) {
    return (
      <section className="elev-empty glass">
        <h2>This room has no racks yet</h2>
        <p>Place a rack on the Plan first, then come back to fill it.</p>
        <Link className="btn btn--ink" to={`/rooms/${roomId}/plan`}>
          Go to the plan
        </Link>
      </section>
    );
  }

  return (
    <div className={`elev${inspectorOpen ? '' : ' is-inspector-closed'}`}>
      <aside className="elev__side" aria-label="Catalog and checks">
        <SearchBox
          className="search--inline"
          content={content}
          roomName={location.room.name}
        plan={location.room.plan}
          onPick={(hit: SearchHit) => {
            const target = content.objects.find((o) => o.id === hit.objectId);
            if (!hit.elementId && target?.type !== 'rack') {
              void navigate(`/rooms/${roomId}/plan?sel=${hit.objectId}`);
              return;
            }
            select(hit.elementId ?? hit.objectId);
            setPulse(hit.elementId ?? null);
          }}
          action={(hit) => {
            const target = content.objects.find((o) => o.id === hit.objectId);
            return !hit.elementId && target?.type !== 'rack' ? (
              <Link to={`/rooms/${roomId}/plan?sel=${hit.objectId}`} aria-label={`Show ${hit.name} on plan`} onMouseDown={(e) => e.stopPropagation()}>
                Plan
              </Link>
            ) : null;
          }}
        />
        <div className={`glass elev__palette${catalogOpen ? '' : ' is-collapsed'}`}>
          <CatalogPalette catalog={catalog} activeRack={activeRack} onAdd={(t) => activeRack && place(t, activeRack)} disabled={readOnly} collapsed={!catalogOpen} onToggle={() => setCatalogOpen(!catalogOpen)} />
        </div>
        <ChecksStrip className="checks--static checks--narrow" issues={issues} objects={names} onSelect={select} />
      </aside>
      <div className="elev__power">
        <PowerBar content={content} />
        <StateLegend />
      </div>
      <section className="elev__racks" aria-label="Rack elevations">
        {racks.map((rack) => (
          <RackElevation
            key={rack.id}
            rack={rack}
            active={rack.id === activeRack?.id}
            selectedId={selectedId}
            flagged={flagged}
            onSelect={select}
            onActivate={() => select(rack.id)}
            pulseId={pulse}
            stateOf={stateOf}
            dragPreview={drag.preview}
            onDeviceDragStart={readOnly ? undefined : drag.start}
            onDropTemplate={(templateId, u) => {
              const template = catalog.find((t) => t.id === templateId);
              if (template) place(template, rack, u);
            }}
          />
        ))}
      </section>
      {inspectorOpen ? (
        <>
          <PanelCollapseTab label="Inspector" side="right" className="elev__tab" onCollapse={() => setInspectorOpen(false)} />
          <EquipmentInspector content={content} roomId={roomId} selectedId={selectedId} activeRack={activeRack} catalog={catalog} commit={commit} onSelect={select} readOnly={readOnly} plan={location.room.plan} stateLocked={viewingPast} onManagePorts={setPortsFor} />
        </>
      ) : (
        <PanelRail label="Inspector" side="right" className="elev__rail" onExpand={() => setInspectorOpen(true)} />
      )}
      {portsFor && (findRackDevice(content, portsFor) || findNode(content, portsFor)) ? (
        <PortManager key={portsFor} content={content} deviceId={portsFor} commit={commit} readOnly={readOnly} onClose={() => setPortsFor(null)} />
      ) : null}
      {message ? (
        <p role="status" className="elev__message">
          {message}
        </p>
      ) : null}
    </div>
  );
}
