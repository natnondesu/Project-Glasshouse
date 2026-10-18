import { centerOf, placementPolygon, type Dimension, type Issue, type PlanContent, type RoomObject } from '@glasshouse/domain';
import { useMemo, type DOMAttributes } from 'react';
import type { ViewportApi } from '../../viewport/useViewport';
import { toScreen } from '../../viewport/math';
import { flaggedObjectIds, warnedObjectIds, zoneWarnedObjectIds } from './flagged';
import '../search/search.css';
import { CalloutLayer, GapLayer } from './drafting';
import { DimensionLayer } from './DimensionLayer';
import { ALL_LAYERS, type PlanLayers } from './ViewMenu';
import { FeedLayer } from './feeds';
import { polygonPath } from './svgPath';
import { MeasureLayer } from './MeasureLayer';
import { useT } from '../../i18n';
import type { MeasureState } from './usePlanGestures';
import {
  ClearanceLayer,
  DimensionsLayer,
  EnvironmentLayer,
  FloorPreview,
  FootprintLayer,
  GridLayer,
  HatchDefs,
  ObjectsLayer,
  SelectionLayer,
  WallPreview,
  type Preview,
} from './layers';

export type SvgHandlers = Pick<
  DOMAttributes<SVGSVGElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onPointerLeave' | 'onContextMenu' | 'onMouseDown'
>;

/** Width the glass inspector covers on the right of the canvas. */
const INSPECTOR_CLEARANCE_PX = 380;
const RAIL_CLEARANCE_PX = 70;
const PULSE_PAD_PX = 12;

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
  /** Off while measuring or dimensioning: those tools show their own distances. */
  showGaps?: boolean;
  /** The Dimension tool's line while its offset is being placed. */
  draftDimension?: Dimension | null;
  /** Drawing layers the viewer has switched off. */
  layers?: PlanLayers;
  /** Ring that marks a search result for a moment. */
  pulse?: { id: string; n: number } | null;
}

const NONE: ReadonlySet<string> = new Set();

const withPreview = (objects: RoomObject[], preview: Preview | null): RoomObject[] =>
  preview?.kind === 'object' ? objects.map((o) => (o.id === preview.id ? { ...o, ...preview.patch } : o)) : objects;

export function PlanCanvas({ content, issues, selectedId, viewport, preview, measure, cursor, svgHandlers, onFocusObject, inspectorOpen = true, ghost = null, showGaps = true, draftDimension = null, layers = ALL_LAYERS, pulse = null }: PlanCanvasProps) {
  const pulsed = pulse ? content.objects.find((o) => o.id === pulse.id) : undefined;
  const m = useT();
  const calloutClearance = inspectorOpen ? INSPECTOR_CLEARANCE_PX : RAIL_CLEARANCE_PX;
  const { view } = viewport;
  const flagged = useMemo(() => flaggedObjectIds(issues), [issues]);
  const warned = useMemo(() => warnedObjectIds(issues), [issues]);
  const zoneWarned = useMemo(() => zoneWarnedObjectIds(issues), [issues]);
  const objects = withPreview(content.objects, preview);
  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const moving = preview?.kind === 'object' ? (objects.find((o) => o.id === preview.id) ?? null) : null;
  const active = ghost ?? moving ?? selected;
  const liveContent = useMemo(() => {
    const dims = content.dimensions.map((d) => (preview?.kind === 'dimension' && preview.id === d.id ? { ...d, offset: preview.offset } : d));
    // A hidden dimensions layer still shows the one being drawn, so the tool stays usable.
    const shown = layers.dimensions ? dims : [];
    return { ...content, objects, dimensions: draftDimension ? [...shown, draftDimension] : shown };
  }, [content, objects, preview, draftDimension, layers.dimensions]);

  return (
    <svg
      ref={viewport.svgRef}
      className="plan-canvas"
      style={{ cursor }}
      tabIndex={0}
      aria-label={m.plan.drawing}
      {...svgHandlers}
    >
      <HatchDefs />
      <GridLayer survey={content.survey} view={view} />
      <FootprintLayer survey={content.survey} view={view} />
      {layers.clearance ? <ClearanceLayer objects={objects} view={view} /> : null}
      {layers.clearance ? <EnvironmentLayer objects={objects} view={view} selectedId={selectedId} warned={zoneWarned} /> : null}
      {layers.feeds ? <FeedLayer content={liveContent} view={view} /> : null}
      <ObjectsLayer objects={objects} view={view} flagged={flagged} warned={warned} selectedId={selectedId} onFocusObject={onFocusObject} />
      {selected ? <SelectionLayer object={selected} view={view} /> : null}
      {layers.dimensions ? <DimensionsLayer survey={content.survey} view={view} /> : null}
      {preview?.kind === 'rect' ? <FloorPreview preview={preview} view={view} /> : null}
      {preview?.kind === 'wall' ? <WallPreview object={preview.object} view={view} /> : null}
      <DimensionLayer content={liveContent} view={view} selectedId={selectedId} onFocusDimension={onFocusObject} />
      {ghost ? (
        <g className="ghost" aria-hidden="true">
          {layers.clearance ? <ClearanceLayer objects={[ghost]} view={view} /> : null}
          {layers.clearance ? <EnvironmentLayer objects={[ghost]} view={view} selectedId={ghost.id} warned={NONE} /> : null}
          <path className="ghost__body" d={polygonPath(placementPolygon(ghost), view)} />
        </g>
      ) : null}
      {active && showGaps ? <GapLayer object={active} content={liveContent} view={view} /> : null}
      {pulsed && pulse ? (
        <circle
          key={pulse.n}
          className="search-pulse"
          cx={toScreen(view, centerOf(pulsed))[0]}
          cy={toScreen(view, centerOf(pulsed))[1]}
          r={(Math.hypot(pulsed.w, pulsed.d) / 2) * view.scale + PULSE_PAD_PX}
        />
      ) : null}
      <CalloutLayer issues={issues} objects={objects} view={view} maxX={viewport.size.width - calloutClearance} />
      {measure ? <MeasureLayer measure={measure} content={content} view={view} /> : null}
    </svg>
  );
}
