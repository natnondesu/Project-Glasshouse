import type { Issue, PlanContent } from '@glasshouse/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { fit } from '../../viewport/math';
import { FeedLayer } from '../plan/feeds';
import { ClearanceLayer, DimensionsLayer, FootprintLayer, HatchDefs, ObjectsLayer } from '../plan/layers';
import '../plan/plan.css';

const ASPECT = 230 / 440;
const FALLBACK_W = 440;
/** Room for the overall dimensions drawn outside the walls. */
const PAD_PX = 44;
const noop = (): void => undefined;

/** The width the drawing actually has, so it is drawn at that size and its labels never shrink below 11px. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(FALLBACK_W);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0);
      if (next > 0) setW(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** The room's plan as on the Install sheet, small: walls, racks, clearances, feeds, and anything blocking in red. */
export function RoomThumbnail({ content, issues, roomName }: { content: PlanContent; issues: Issue[]; roomName: string }) {
  const m = useT();
  const [box, width] = useWidth<HTMLDivElement>();
  const size = { width, height: Math.round(width * ASPECT) };
  const view = fit({ w: content.survey.width, d: content.survey.length }, size, PAD_PX);
  const flagged = useMemo(() => new Set(issues.filter((i) => i.severity === 'block').flatMap((i) => i.targets)), [issues]);
  return (
    <div ref={box}>
      <svg className="sheet-plan plan-canvas home-thumb" width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={m.sheet.planOf(roomName)}>
        <HatchDefs />
        <FootprintLayer survey={content.survey} view={view} />
        <ClearanceLayer objects={content.objects} view={view} />
        <ObjectsLayer objects={content.objects} view={view} flagged={flagged} selectedId={null} onFocusObject={noop} isStatic />
        <DimensionsLayer survey={content.survey} view={view} />
        <FeedLayer content={content} view={view} />
      </svg>
    </div>
  );
}
