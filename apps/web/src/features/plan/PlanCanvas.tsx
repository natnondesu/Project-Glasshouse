import { placementPolygon, type Issue, type PlanContent, type RoomObject } from '@glasshouse/domain';
import { useMemo, type DOMAttributes } from 'react';
import type { ViewportApi } from '../../viewport/useViewport';
import { flaggedObjectIds } from './flagged';
import { CalloutLayer, GapLayer } from './drafting';
import { polygonPath } from './svgPath';
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
const RAIL_CLEARANCE_PX = 70;

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
  inspectorOpen?: boolean;
  /** The object a placement tool would drop at the cursor. */
  ghost?: RoomObject | null;
}

const withPreview = (objects: RoomObject[], preview: Preview | null): RoomObject[] =>
  preview?.kind === 'object' ? objects.map((o) => (o.id === preview.id ? { ...o, ...preview.patch } : o)) : objects;

export function PlanCanvas({ content, issues, selectedId, viewport, preview, measure, cursor, svgHandlers, onFocusObject, inspectorOpen = true, ghost = null }: PlanCanvasProps) {
  const calloutClearance = inspectorOpen ? INSPECTOR_CLEARANCE_PX : RAIL_CLEARANCE_PX;
  const { view } = viewport;
  const flagged = useMemo(() => flaggedObjectIds(issues), [issues]);
  const objects = withPreview(content.objects, preview);
  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const moving = preview?.kind === 'object' ? (objects.find((o) => o.id === preview.id) ?? null) : null;
  const active = ghost ?? moving ?? selected;
  const liveContent = useMemo(() => ({ ...content, objects }), [content, objects]);

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
      {ghost ? (
        <g className="ghost" aria-hidden="true">
          <ClearanceLayer objects={[ghost]} view={view} />
          <path className="ghost__body" d={polygonPath(placementPolygon(ghost), view)} />
        </g>
      ) : null}
      {active && !measure?.a ? <GapLayer object={active} content={liveContent} view={view} /> : null}
      <CalloutLayer issues={issues} objects={objects} view={view} maxX={viewport.size.width - calloutClearance} />
      {measure ? <MeasureLayer measure={measure} content={content} view={view} /> : null}
    </svg>
  );
}
