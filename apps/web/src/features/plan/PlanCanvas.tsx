import type { Issue, PlanContent, RoomObject } from '@glasshouse/domain';
import { useMemo, type DOMAttributes } from 'react';
import type { ViewportApi } from '../../viewport/useViewport';
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
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onContextMenu'
>;

interface PlanCanvasProps {
  content: PlanContent;
  issues: Issue[];
  selectedId: string | null;
  viewport: ViewportApi;
  preview: Preview | null;
  cursor: string;
  svgHandlers?: SvgHandlers;
  onFocusObject: (id: string) => void;
}

const withPreview = (objects: RoomObject[], preview: Preview | null): RoomObject[] =>
  preview?.kind === 'object' ? objects.map((o) => (o.id === preview.id ? { ...o, ...preview.patch } : o)) : objects;

export function PlanCanvas({ content, issues, selectedId, viewport, preview, cursor, svgHandlers, onFocusObject }: PlanCanvasProps) {
  const { view } = viewport;
  const flagged = useMemo(() => new Set(issues.filter((i) => i.severity === 'block').flatMap((i) => i.targets)), [issues]);
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
    </svg>
  );
}
