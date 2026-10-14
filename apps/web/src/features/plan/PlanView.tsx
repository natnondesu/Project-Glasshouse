import { centerOf, currentRevision, revisionIssues, type RoomLocation } from '@glasshouse/domain';
import { Link } from 'react-router';
import { SearchBox } from '../search/SearchBox';
import type { SearchHit } from '../search/search';
import { useEffect, useMemo, useState } from 'react';
import { usePlanCommit, useSearchParamState } from '../../store/hooks';
import { FIT_INSETS, useViewport } from '../../viewport/useViewport';
import { PanelCollapseTab, PanelRail } from '../../ui/PanelRail';
import { ChecksStrip } from './ChecksStrip';
import { Inspector } from './Inspector';
import { PlanCanvas } from './PlanCanvas';
import { Toolbar } from './Toolbar';
import type { Tool } from './tools';
import { usePlanGestures } from './usePlanGestures';
import { ZoomControls } from './ZoomControls';
import { PlanLegend } from './drafting';
import { hitTest } from './hitTest';
import { PanelManager } from './PanelManager';
import { ALL_LAYERS, type PlanLayers } from './ViewMenu';
import { usePersistentState } from '../../ui/usePersistentState';
import './plan.css';

/** Room the fit leaves on the right for the inspector, or for its collapsed rail. */
const INSET_WITH_INSPECTOR = FIT_INSETS.right;
const INSET_WITHOUT_INSPECTOR = 76;
const PULSE_MS = 1700;

export function PlanView({ location, readOnly = false }: { location: RoomLocation; readOnly?: boolean }) {
  const revision = currentRevision(location.room.plan);
  const content = revision.content;
  const commit = usePlanCommit(location.room.id);
  const [selectedParam, select] = useSearchParamState('sel');
  const [pulse, setPulse] = useState<{ id: string; n: number } | null>(null);
  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(null), PULSE_MS);
    return () => clearTimeout(t);
  }, [pulse]);
  const [tool, setTool] = useState<Tool>('select');
  const [legend, setLegend] = usePersistentState('glasshouse:plan-legend', true);
  const [layers, setLayers] = usePersistentState<PlanLayers>('glasshouse:plan-layers', ALL_LAYERS);
  const [managedPanel, setManagedPanel] = useState<string | null>(null);
  const managed = content.objects.find((o) => o.id === managedPanel && o.type === 'mcb') ?? null;
  useEffect(() => {
    if (readOnly && tool !== 'select' && tool !== 'pan' && tool !== 'measure') setTool('select');
  }, [readOnly, tool]);
  const selected = content.objects.find((o) => o.id === selectedParam) ?? null;
  const selectedDimension = content.dimensions.find((d) => d.id === selectedParam) ?? null;

  const issues = useMemo(() => revisionIssues(revision), [revision]);
  const [inspectorOpen, setInspectorOpen] = usePersistentState('glasshouse:inspector-open', true);
  const viewport = useViewport({ w: content.survey.width, d: content.survey.length }, inspectorOpen ? INSET_WITH_INSPECTOR : INSET_WITHOUT_INSPECTOR);
  const gestures = usePlanGestures({ content, tool, setTool, selectedId: selected?.id ?? selectedDimension?.id ?? null, select, viewport, commit, readOnly });

  return (
    <div className={`plan-view${inspectorOpen ? '' : ' is-inspector-closed'}`}>
      <section
        className="plan-view__canvas"
        aria-label="Room plan"
        onKeyDown={gestures.onKeyDown}
        onKeyUp={gestures.onKeyUp}
        onDoubleClick={(e) => {
          // Double-clicking an MCB panel opens its ways.
          const hit = hitTest(content.objects, viewport.clientToWorld(e.clientX, e.clientY));
          if (hit?.type === 'mcb') setManagedPanel(hit.id);
        }}
      >
        <Toolbar tool={tool} onTool={setTool} readOnly={readOnly} />
        <PlanCanvas
          content={content}
          issues={issues}
          selectedId={selected?.id ?? selectedDimension?.id ?? null}
          viewport={viewport}
          preview={gestures.preview}
          ghost={gestures.ghost}
          draftDimension={gestures.draftDimension}
          showGaps={tool !== 'measure' && tool !== 'dimension'}
          layers={{ ...ALL_LAYERS, ...layers }}
          pulse={pulse}
          measure={gestures.measure}
          cursor={gestures.cursor}
          svgHandlers={gestures.svgHandlers}
          onFocusObject={select}
          inspectorOpen={inspectorOpen}
        />
        <SearchBox
          className="plan-view__search"
          content={content}
          roomName={location.room.name}
          onPick={(hit: SearchHit) => {
            // Anything inside a rack highlights the rack on the plan; the elevation link goes to the device.
            const target = content.objects.find((o) => o.id === hit.objectId);
            select(hit.objectId);
            if (target) viewport.centerOn(centerOf(target));
            setPulse({ id: hit.objectId, n: Date.now() });
          }}
          action={(hit) =>
            hit.elementId ? (
              <Link to={`/rooms/${location.room.id}/elevation?sel=${hit.elementId}`} aria-label={`Open ${hit.name} in elevation`} onMouseDown={(e) => e.stopPropagation()}>
                Elevation
              </Link>
            ) : null
          }
        />
        <ZoomControls viewport={viewport} legend={legend} onLegend={setLegend} layers={layers} onLayers={setLayers} />
        {legend ? <PlanLegend view={viewport.view} clearance={layers.clearance !== false} /> : null}
        {managed ? (
          <fieldset className="inspector__lock" disabled={readOnly}>
            <PanelManager panel={managed} content={content} commit={commit} onClose={() => setManagedPanel(null)} />
          </fieldset>
        ) : null}
        {gestures.message ? (
          <p role="status" className="plan-view__message">
            {gestures.message}
          </p>
        ) : null}
      </section>
      <ChecksStrip issues={issues} objects={content.objects} onSelect={select} />
      {inspectorOpen ? (
        <>
          <PanelCollapseTab label="Inspector" side="right" className="plan-view__tab" onCollapse={() => setInspectorOpen(false)} />
          <Inspector content={content} selected={selected} dimension={selectedDimension} commit={commit} onDeleted={() => select(null)} readOnly={readOnly} onManagePanel={setManagedPanel} />
        </>
      ) : (
        <PanelRail label="Inspector" side="right" className="plan-view__rail" onExpand={() => setInspectorOpen(true)} />
      )}
    </div>
  );
}
