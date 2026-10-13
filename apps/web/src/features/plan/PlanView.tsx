import { checkPlan, currentRevision, type RoomLocation } from '@glasshouse/domain';
import { useMemo, useState } from 'react';
import { usePlanCommit, useSearchParamState } from '../../store/hooks';
import { useViewport } from '../../viewport/useViewport';
import { ChecksStrip } from './ChecksStrip';
import { Inspector } from './Inspector';
import { PlanCanvas } from './PlanCanvas';
import { Toolbar } from './Toolbar';
import type { Tool } from './tools';
import { usePlanGestures } from './usePlanGestures';
import { ZoomControls } from './ZoomControls';
import './plan.css';

export function PlanView({ location }: { location: RoomLocation }) {
  const content = currentRevision(location.room.plan).content;
  const commit = usePlanCommit(location.room.id);
  const [selectedParam, select] = useSearchParamState('sel');
  const [tool, setTool] = useState<Tool>('select');
  const selected = content.objects.find((o) => o.id === selectedParam) ?? null;

  const issues = useMemo(() => checkPlan(content), [content]);
  const viewport = useViewport({ w: content.survey.width, d: content.survey.length });
  const gestures = usePlanGestures({ content, tool, setTool, selectedId: selected?.id ?? null, select, viewport, commit });

  return (
    <div className="plan-view">
      <section className="plan-view__canvas" aria-label="Room plan" onKeyDown={gestures.onKeyDown} onKeyUp={gestures.onKeyUp}>
        <Toolbar tool={tool} onTool={setTool} />
        <PlanCanvas
          content={content}
          issues={issues}
          selectedId={selected?.id ?? null}
          viewport={viewport}
          preview={gestures.preview}
          measure={gestures.measure}
          cursor={gestures.cursor}
          svgHandlers={gestures.svgHandlers}
          onFocusObject={select}
        />
        <ZoomControls viewport={viewport} />
        {gestures.message ? (
          <p role="status" className="plan-view__message">
            {gestures.message}
          </p>
        ) : null}
      </section>
      <ChecksStrip issues={issues} objects={content.objects} onSelect={select} />
      <Inspector content={content} selected={selected} commit={commit} onDeleted={() => select(null)} />
    </div>
  );
}
