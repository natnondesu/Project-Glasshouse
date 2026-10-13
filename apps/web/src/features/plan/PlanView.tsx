import { checkPlan, currentRevision, type RoomLocation } from '@glasshouse/domain';
import { useMemo } from 'react';
import { useViewport } from '../../viewport/useViewport';
import { PlanCanvas } from './PlanCanvas';
import { ZoomControls } from './ZoomControls';
import './plan.css';

export function PlanView({ location }: { location: RoomLocation }) {
  const content = currentRevision(location.room.plan).content;
  const issues = useMemo(() => checkPlan(content), [content]);
  const viewport = useViewport({ w: content.survey.width, d: content.survey.length });
  return (
    <div className="plan-view">
      <section className="plan-view__canvas" aria-label="Room plan">
        <PlanCanvas content={content} issues={issues} selectedId={null} viewport={viewport} preview={null} cursor="default" onFocusObject={() => {}} />
        <ZoomControls viewport={viewport} />
      </section>
    </div>
  );
}
