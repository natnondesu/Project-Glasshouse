import { currentRevision, revisionIssues, type RoomLocation } from '@glasshouse/domain';
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
import { usePersistentState } from '../../ui/usePersistentState';
import './plan.css';

/** Room the fit leaves on the right for the inspector, or for its collapsed rail. */
const INSET_WITH_INSPECTOR = FIT_INSETS.right;
const INSET_WITHOUT_INSPECTOR = 76;

export function PlanView({ location, readOnly = false }: { location: RoomLocation; readOnly?: boolean }) {
  const revision = currentRevision(location.room.plan);
  const content = revision.content;
  const commit = usePlanCommit(location.room.id);
  const [selectedParam, select] = useSearchParamState('sel');
  const [tool, setTool] = useState<Tool>('select');
  const [legend, setLegend] = usePersistentState('glasshouse:plan-legend', true);
  useEffect(() => {
    if (readOnly && tool !== 'select' && tool !== 'pan' && tool !== 'measure') setTool('select');
  }, [readOnly, tool]);
  const selected = content.objects.find((o) => o.id === selectedParam) ?? null;

  const issues = useMemo(() => revisionIssues(revision), [revision]);
  const [inspectorOpen, setInspectorOpen] = usePersistentState('glasshouse:inspector-open', true);
  const viewport = useViewport({ w: content.survey.width, d: content.survey.length }, inspectorOpen ? INSET_WITH_INSPECTOR : INSET_WITHOUT_INSPECTOR);
  const gestures = usePlanGestures({ content, tool, setTool, selectedId: selected?.id ?? null, select, viewport, commit, readOnly });

  return (
    <div className={`plan-view${inspectorOpen ? '' : ' is-inspector-closed'}`}>
      <section className="plan-view__canvas" aria-label="Room plan" onKeyDown={gestures.onKeyDown} onKeyUp={gestures.onKeyUp}>
        <Toolbar tool={tool} onTool={setTool} readOnly={readOnly} />
        <PlanCanvas
          content={content}
          issues={issues}
          selectedId={selected?.id ?? null}
          viewport={viewport}
          preview={gestures.preview}
          ghost={gestures.ghost}
          measure={gestures.measure}
          cursor={gestures.cursor}
          svgHandlers={gestures.svgHandlers}
          onFocusObject={select}
          inspectorOpen={inspectorOpen}
        />
        <ZoomControls viewport={viewport} legend={legend} onLegend={setLegend} />
        {legend ? <PlanLegend view={viewport.view} /> : null}
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
          <Inspector content={content} selected={selected} commit={commit} onDeleted={() => select(null)} readOnly={readOnly} />
        </>
      ) : (
        <PanelRail label="Inspector" side="right" className="plan-view__rail" onExpand={() => setInspectorOpen(true)} />
      )}
    </div>
  );
}
