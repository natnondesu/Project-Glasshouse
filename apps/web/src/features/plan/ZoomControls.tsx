import type { ViewportApi } from '../../viewport/useViewport';
import { IconMinus, IconPlus } from '../../ui/icons';

const ZOOM_STEP = 1.25;

export function ZoomControls({ viewport, legend, onLegend }: { viewport: ViewportApi; legend: boolean; onLegend: (open: boolean) => void }) {
  return (
    <div className="zoom glass" role="group" aria-label="Zoom">
      <button type="button" className="tool" aria-label="Zoom out" onClick={() => viewport.zoomBy(1 / ZOOM_STEP)}>
        <IconMinus />
      </button>
      <span className="zoom__value mono" data-testid="zoom-value">
        {Math.round(viewport.view.scale)} px/m
      </span>
      <button type="button" className="tool" aria-label="Zoom in" onClick={() => viewport.zoomBy(ZOOM_STEP)}>
        <IconPlus />
      </button>
      <button type="button" className="zoom__fit" onClick={viewport.fitToContent}>
        Fit room
      </button>
      <button type="button" className="zoom__fit" aria-pressed={legend} onClick={() => onLegend(!legend)}>
        Legend
      </button>
    </div>
  );
}
