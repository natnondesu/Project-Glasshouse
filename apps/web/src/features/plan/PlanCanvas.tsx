import type { Issue, PlanContent, RoomObject } from '@glasshouse/domain';
import { useMemo, type DOMAttributes } from 'react';
import type { ViewportApi } from '../../viewport/useViewport';
import { flaggedObjectIds } from './flagged';
import { CalloutLayer } from './drafting';
import { MeasureLayer } from './MeasureLayer';
import type { MeasureState } from './usePlanGestures';
import {
  ClearanceLayer,
  DimensionsLayer,
  FloorPreview,
  FootprintLayer,
  GridLayer,
  HatchDefs,
  ObjectsLayer,
  SelectionLayer,
  type Preview,
} from './layers';

export type SvgHandlers = Pick<
  DOMAttributes<SVGSVGElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onPointerLeave' | 'onContextMenu'
>;

/** Width the glass inspector covers on the right of the canvas. */
const INSPECTOR_CLEARANCE_PX = 380;

interface PlanCanvasProps {
  content: PlanContent;
  issues: Issue[];
  selectedId: string | null;
  viewport: ViewportApi;
  preview: Preview | null;
  measure?: MeasureState;
  cursor: string;
  svgHandlers?: SvgHandlers;
  onFocusObject: (id: string) => void;
}

const withPreview = (objects: RoomObject[], preview: Preview | null): RoomObject[] =>
  preview?.kind === 'object' ? objects.map((o) => (o.id === preview.id ? { ...o, ...preview.patch } : o)) : objects;

export function PlanCanvas({ content, issues, selectedId, viewport, preview, measure, cursor, svgHandlers, onFocusObject }: PlanCanvasProps) {
  const { view } = viewport;
  const flagged = useMemo(() => flaggedObjectIds(issues), [issues]);
  const objects = withPreview(content.objects, preview);
  const selected = objects.find((o) => o.id === selectedId) ?? null;

  return (
    <svg
      ref={viewport.svgRef}
      className="plan-canvas"
      style={{ cursor }}
      tabIndex={0}
      aria-label="Room plan drawing. Tab moves between objects, arrow keys nudge, R rotates 45 degrees."
      {...svgHandlers}
    >
      <HatchDefs />
      <GridLayer survey={content.survey} view={view} />
      <FootprintLayer survey={content.survey} view={view} />
      <ClearanceLayer objects={objects} view={view} />
      <ObjectsLayer objects={objects} view={view} flagged={flagged} selectedId={selectedId} onFocusObject={onFocusObject} />
      {selected ? <SelectionLayer object={selected} view={view} /> : null}
      <DimensionsLayer survey={content.survey} view={view} />
      {preview?.kind === 'rect' ? <FloorPreview preview={preview} view={view} /> : null}
      <CalloutLayer issues={issues} objects={objects} view={view} maxX={viewport.size.width - INSPECTOR_CLEARANCE_PX} />
      {measure ? <MeasureLayer measure={measure} content={content} view={view} /> : null}
    </svg>
  );
}
