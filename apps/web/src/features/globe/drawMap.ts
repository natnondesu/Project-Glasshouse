import { geoDistance, geoGraticule, geoPath, type GeoProjection } from 'd3-geo';
import { LEVEL_PPD, type Camera, type Size } from './camera';
import { regionName, type GeoData, type Region } from './geoData';
import { boxTouches, projectionFor, visibleBox } from './projection';

/** Read once from the map's CSS custom properties, so the drawing follows the design tokens. */
export interface MapPalette {
  paper: string;
  sea: string;
  land: string;
  grid: string;
  ink: string;
  ink2: string;
  ink3: string;
  border: string;
  province: string;
  hatch: string;
  font: string;
}

export function readPalette(el: Element): MapPalette {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
  return {
    paper: v('--map-paper', '#fbfcfa'),
    sea: v('--map-sea', '#edf2f5'),
    land: v('--map-land', '#fbfcfa'),
    grid: v('--map-grid', '#d9e3ea'),
    ink: v('--map-ink', '#111720'),
    ink2: v('--map-ink-2', '#3b4552'),
    ink3: v('--map-ink-3', '#5b6672'),
    border: v('--map-border', '#7d8792'),
    province: v('--map-province', '#9aa4ae'),
    hatch: v('--map-hatch', '#3b4552'),
    font: css.fontFamily || 'system-ui, sans-serif',
  };
}

export interface DrawInput {
  ctx: CanvasRenderingContext2D;
  size: Size;
  dpr: number;
  camera: Camera;
  geo: GeoData;
  palette: MapPalette;
  /** The selected site's country (hatched on the world and country views) and province (hatched closer in). */
  highlight: { country: Region | null; province: Region | null };
  lang: 'en' | 'th';
  /** Screen boxes labels must stay clear of (the markers and their names). */
  avoid: Rect[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One graticule step so lines sit at least ~50 px apart: 15° on the world view down to a hundredth of a degree. */
const DEG = 180 / Math.PI;
const STEPS = [30, 15, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];
const gridStep = (ppd: number): number => [...STEPS].reverse().find((s) => s * ppd >= 50) ?? STEPS[0]!;

let hatchTile: { key: string; pattern: CanvasPattern | null } | null = null;

function hatch(ctx: CanvasRenderingContext2D, dpr: number, color: string): CanvasPattern | string {
  const key = `${dpr}:${color}`;
  if (hatchTile?.key !== key) {
    const s = Math.round(8 * dpr);
    const tile = document.createElement('canvas');
    tile.width = s;
    tile.height = s;
    const t = tile.getContext('2d');
    let pattern: CanvasPattern | null = null;
    if (t) {
      t.strokeStyle = color;
      t.globalAlpha = 0.38;
      t.lineWidth = Math.max(1, 0.9 * dpr);
      t.beginPath();
      t.moveTo(-1, s + 1);
      t.lineTo(s + 1, -1);
      t.stroke();
      pattern = ctx.createPattern(tile, 'repeat');
      pattern?.setTransform?.(new DOMMatrix().scale(1 / dpr));
    }
    hatchTile = { key, pattern };
  }
  return hatchTile.pattern ?? color;
}

const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function drawLabels(ctx: CanvasRenderingContext2D, projection: GeoProjection, regions: Region[], input: DrawInput, style: { size: number; weight: number; caps: boolean; color: string }, placed: Rect[]): void {
  const path = geoPath(projection);
  ctx.font = `${style.weight} ${style.size}px ${input.palette.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const selected = new Set([input.highlight.country, input.highlight.province].filter(Boolean));
  for (const region of regions) {
    const [[x0, y0], [x1, y1]] = path.bounds(region.feature);
    const name = regionName(region, input.lang);
    const text = style.caps ? name.toLocaleUpperCase(input.lang) : name;
    const w = ctx.measureText(text).width + (style.caps ? text.length * 1.2 : 0);
    if (!Number.isFinite(x0) || x1 - x0 < w + 12 || y1 - y0 < style.size + 6) continue;
    const at = projection(region.centroid);
    if (!at) continue;
    const rect = { x: at[0] - w / 2 - 4, y: at[1] - style.size / 2 - 3, w: w + 8, h: style.size + 6 };
    if (rect.x < 4 || rect.y < 4 || rect.x + rect.w > input.size.width - 4 || rect.y + rect.h > input.size.height - 4) continue;
    if (placed.some((p) => intersects(p, rect)) || input.avoid.some((p) => intersects(p, rect))) continue;
    placed.push(rect);
    ctx.strokeStyle = input.palette.paper;
    ctx.lineWidth = 3.5;
    ctx.fillStyle = selected.has(region) ? input.palette.ink : style.color;
    if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = style.caps ? '1.2px' : '0px';
    ctx.strokeText(text, at[0], at[1]);
    ctx.fillText(text, at[0], at[1]);
  }
  if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = '0px';
}

/** Paper and ink: a cool sea, paper land, ink borders, dashed provinces, the selected region hatched. */
export function drawMap(input: DrawInput): void {
  const { ctx, size, dpr, camera, geo, palette } = input;
  const projection = projectionFor(camera, size);
  const path = geoPath(projection, ctx);
  const view = visibleBox(camera, size);
  // On the world view nothing is cut by the frame, so leave out what is round the back of the globe instead.
  const front = (r: Region): boolean => view !== null || geoDistance([camera.lon, camera.lat], r.centroid) * DEG - r.radius < 92;
  const countries = geo.countries.filter((r) => boxTouches(r.box, view) && front(r));
  const showProvinces = camera.ppd >= 18;
  const provinces = showProvinces ? geo.provinces.filter((r) => boxTouches(r.box, view)) : [];
  const closeIn = camera.ppd >= LEVEL_PPD.province * 0.6;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, size.width, size.height);

  ctx.beginPath();
  path({ type: 'Sphere' });
  ctx.fillStyle = palette.sea;
  ctx.fill();

  // Each outline set is projected once into a Path2D, then filled and stroked from it.
  const land = new Path2D();
  const landPath = geoPath(projection, land as unknown as CanvasRenderingContext2D);
  for (const r of countries) landPath(r.feature);
  ctx.fillStyle = palette.land;
  ctx.fill(land);

  // The graticule runs over land and sea alike, like the plan's construction grid; it is the scale's backdrop.
  const step = gridStep(camera.ppd);
  const graticule = geoGraticule().step([step, step]).precision(Math.min(2.5, step / 2));
  if (view) graticule.extent([[Math.floor(view[0][0] / step) * step, Math.max(-90, Math.floor(view[0][1] / step) * step)], [Math.ceil(view[1][0] / step) * step, Math.min(90, Math.ceil(view[1][1] / step) * step)]]);
  ctx.beginPath();
  path(graticule());
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.stroke();


  // Hatched while the region is a shape on screen; once it fills the view (a site up close) only its outline stays.
  const hatched = camera.ppd >= LEVEL_PPD.site ? null : closeIn ? (input.highlight.province ?? input.highlight.country) : input.highlight.country;
  const outlined = camera.ppd >= LEVEL_PPD.site ? input.highlight.province : hatched;
  if (hatched) {
    ctx.beginPath();
    path(hatched.feature);
    ctx.fillStyle = hatch(ctx, dpr, palette.hatch);
    ctx.fill();
  }

  if (provinces.length > 0) {
    const lines = new Path2D();
    const linePath = geoPath(projection, lines as unknown as CanvasRenderingContext2D);
    for (const r of provinces) linePath(r.feature);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = palette.province;
    ctx.lineWidth = 1;
    ctx.stroke(lines);
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = palette.border;
  ctx.lineWidth = camera.ppd < LEVEL_PPD.country ? 0.7 : 1.1;
  ctx.stroke(land);

  if (outlined) {
    ctx.beginPath();
    path(outlined.feature);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.75;
    ctx.stroke();
  }

  ctx.beginPath();
  path({ type: 'Sphere' });
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const placed: Rect[] = [];
  if (camera.ppd >= LEVEL_PPD.province * 0.32 && provinces.length > 0) drawLabels(ctx, projection, provinces, input, { size: 12, weight: 500, caps: false, color: palette.ink2 }, placed);
  if (camera.ppd >= LEVEL_PPD.country) drawLabels(ctx, projection, countries, input, { size: 11, weight: 600, caps: true, color: palette.ink3 }, placed);
}

export { gridStep };
