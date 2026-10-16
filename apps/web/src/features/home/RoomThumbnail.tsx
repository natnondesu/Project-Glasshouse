import type { Issue, PlanContent } from '@glasshouse/domain';
import { useMemo } from 'react';
import { useT } from '../../i18n';
import { fit } from '../../viewport/math';
import { FeedLayer } from '../plan/feeds';
import { ClearanceLayer, DimensionsLayer, FootprintLayer, HatchDefs, ObjectsLayer } from '../plan/layers';
import '../plan/plan.css';

/** Drawn at about the size it shows, so plan labels stay at their real size instead of shrinking with the card. */
const SIZE = { width: 440, height: 230 };
/** Room for the overall dimensions drawn outside the walls. */
const PAD_PX = 44;
const noop = (): void => undefined;

/** The room's plan as on the Install sheet, small: walls, racks, clearances, feeds, and anything blocking in red. */
export function RoomThumbnail({ content, issues, roomName }: { content: PlanContent; issues: Issue[]; roomName: string }) {
  const m = useT();
  const view = fit({ w: content.survey.width, d: content.survey.length }, SIZE, PAD_PX);
  const flagged = useMemo(() => new Set(issues.filter((i) => i.severity === 'block').flatMap((i) => i.targets)), [issues]);
  return (
    <svg className="sheet-plan plan-canvas home-thumb" viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} role="img" aria-label={m.sheet.planOf(roomName)}>
      <HatchDefs />
      <FootprintLayer survey={content.survey} view={view} />
      <ClearanceLayer objects={content.objects} view={view} />
      <ObjectsLayer objects={content.objects} view={view} flagged={flagged} selectedId={null} onFocusObject={noop} isStatic />
      <DimensionsLayer survey={content.survey} view={view} />
      <FeedLayer content={content} view={view} />
    </svg>
  );
}
