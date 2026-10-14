import { ViewMenu, type PlanLayers } from './ViewMenu';
import type { ViewportApi } from '../../viewport/useViewport';
import { IconMinus, IconPlus } from '../../ui/icons';
import { useT } from '../../i18n';

const ZOOM_STEP = 1.25;

export function ZoomControls({ viewport, legend, onLegend, layers, onLayers }: { viewport: ViewportApi; legend: boolean; onLegend: (open: boolean) => void; layers: PlanLayers; onLayers: (next: PlanLayers) => void }) {
  const m = useT();
  return (
    <div className="zoom glass" role="group" aria-label={m.plan.zoom}>
      <button type="button" className="tool" aria-label={m.plan.zoomOut} onClick={() => viewport.zoomBy(1 / ZOOM_STEP)}>
        <IconMinus />
      </button>
      <span className="zoom__value mono" data-testid="zoom-value">
        {m.plan.pxPerM(Math.round(viewport.view.scale))}
      </span>
      <button type="button" className="tool" aria-label={m.plan.zoomIn} onClick={() => viewport.zoomBy(ZOOM_STEP)}>
        <IconPlus />
      </button>
      <button type="button" className="zoom__fit" onClick={viewport.fitToContent}>
        {m.plan.fit}
      </button>
      <button type="button" className="zoom__fit" aria-pressed={legend} onClick={() => onLegend(!legend)}>
        {m.plan.legend}
      </button>
      <ViewMenu layers={layers} onChange={onLayers} />
    </div>
  );
}
