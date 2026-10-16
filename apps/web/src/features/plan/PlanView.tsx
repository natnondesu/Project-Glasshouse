import { centerOf, currentRevision, revisionIssues, type RoomLocation } from '@glasshouse/domain';
import { Link } from 'react-router';
import { SearchBox } from '../search/SearchBox';
import type { SearchHit } from '../search/search';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { usePlanCommit, useSearchParamState } from '../../store/hooks';
import { FIT_INSETS, useViewport } from '../../viewport/useViewport';
import { PanelCollapseTab, PanelRail } from '../../ui/PanelRail';
import { ChecksStrip } from './ChecksStrip';
import { Inspector } from './Inspector';
import { PlanCanvas } from './PlanCanvas';
import { Toolbar } from './Toolbar';
import type { Tool } from './tools';
import { usePlanGestures } from './usePlanGestures';
import { usePlanCopyPaste } from './usePlanCopyPaste';
import { ZoomControls } from './ZoomControls';
import { PlanLegend } from './drafting';
import { hitTest } from './hitTest';
import { PanelManager } from './PanelManager';
import { ALL_LAYERS, type PlanLayers } from './ViewMenu';
import { usePersistentState } from '../../ui/usePersistentState';
import { useInspectorOpen } from '../../ui/useInspectorOpen';
import './plan.css';
import { useT } from '../../i18n';

/** Room the fit leaves on the right for the inspector, or for its collapsed rail. */
const INSET_WITH_INSPECTOR = FIT_INSETS.right;
const INSET_WITHOUT_INSPECTOR = 76;
/** Space kept between the room and the checks strip below it. */
const CHECKS_GAP_PX = 48;
const PULSE_MS = 1700;
const MESSAGE_MS = 4500;

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
  const [legend, setLegend] = usePersistentState('glasshouse:plan-legend-open', false);
  const [layers, setLayers] = usePersistentState<PlanLayers>('glasshouse:plan-layers', ALL_LAYERS);
  const [managedPanel, setManagedPanel] = useState<string | null>(null);
  const managed = content.objects.find((o) => o.id === managedPanel && o.type === 'mcb') ?? null;
  useEffect(() => {
    if (readOnly && tool !== 'select' && tool !== 'pan' && tool !== 'measure') setTool('select');
  }, [readOnly, tool]);
  const selected = content.objects.find((o) => o.id === selectedParam) ?? null;
  const selectedDimension = content.dimensions.find((d) => d.id === selectedParam) ?? null;

  const issues = useMemo(() => revisionIssues(revision), [revision]);
  const m = useT();
  const [inspectorOpen, setInspectorOpen] = useInspectorOpen();
  // Fit around the checks strip as it really is (one line when all is well), not a worst-case band.
  const [checksH, setChecksH] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>('.plan-view .checks');
    if (el) setChecksH(Math.min(FIT_INSETS.bottom, el.getBoundingClientRect().height + CHECKS_GAP_PX));
  }, []);
  const viewport = useViewport({ w: content.survey.width, d: content.survey.length }, inspectorOpen ? INSET_WITH_INSPECTOR : INSET_WITHOUT_INSPECTOR, checksH);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);
  usePlanCopyPaste({ content, roomId: location.room.id, selectedId: selected?.id ?? null, readOnly, commit, onPasted: select, say: setMessage });
  const gestures = usePlanGestures({ content, tool, setTool, selectedId: selected?.id ?? selectedDimension?.id ?? null, select, viewport, commit, readOnly });

  return (
    <div className={`plan-view${inspectorOpen ? '' : ' is-inspector-closed'}`}>
      <section
        className="plan-view__canvas"
        aria-label={m.plan.canvas}
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
        {/* One row: search gives way before it can collide with the zoom bar, in any language. */}
        <div className="plan-view__topbar">
        <SearchBox
          className="plan-view__search"
          content={content}
          roomName={location.room.name}
        plan={location.room.plan}
          onPick={(hit: SearchHit) => {
            // Anything inside a rack highlights the rack on the plan; the elevation link goes to the device.
            const target = content.objects.find((o) => o.id === hit.objectId);
            select(hit.objectId);
            if (target) viewport.centerOn(centerOf(target));
            setPulse({ id: hit.objectId, n: Date.now() });
          }}
          action={(hit) =>
            hit.elementId ? (
              <Link to={`/rooms/${location.room.id}/elevation?sel=${hit.elementId}`} aria-label={m.plan.openInElevation(hit.name)} onMouseDown={(e) => e.stopPropagation()}>
                {m.plan.elevation}
              </Link>
            ) : null
          }
        />
        <ZoomControls viewport={viewport} legend={legend} onLegend={setLegend} layers={layers} onLayers={setLayers} />
        </div>
        {legend ? <PlanLegend view={viewport.view} clearance={layers.clearance !== false} onClose={() => setLegend(false)} /> : null}
        {managed ? (
          <PanelManager panel={managed} content={content} commit={commit} onClose={() => setManagedPanel(null)} readOnly={readOnly} />
        ) : null}
        {message ?? gestures.message ? (
          <p role="status" className="plan-view__message">
            {message ?? gestures.message}
          </p>
        ) : null}
      </section>
      <ChecksStrip issues={issues} objects={content.objects} onSelect={select} openNotes={location.room.plan.notes.filter((n) => !n.resolved).length} />
      {inspectorOpen ? (
        <>
          <PanelCollapseTab label={m.panels.inspector} side="right" className="plan-view__tab" onCollapse={() => setInspectorOpen(false)} />
          <Inspector content={content} selected={selected} dimension={selectedDimension} commit={commit} onDeleted={() => select(null)} readOnly={readOnly} onManagePanel={setManagedPanel} />
        </>
      ) : (
        <PanelRail label={m.panels.inspector} side="right" className="plan-view__rail" onExpand={() => setInspectorOpen(true)} />
      )}
    </div>
  );
}
