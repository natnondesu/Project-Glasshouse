import { geoPath, type GeoProjection } from 'd3-geo';
import { LEVEL_PPD, type Camera, type GeoBox, type Size } from './camera';
import { pointName, type GeoDetail, type MapAirport, type MapPlace } from './geoData';
import { intersects, placePointLabel, type Rect } from './labels';
import { boxTouches, screenOf } from './projection';

export interface DetailPalette {
  paper: string;
  ink: string;
  ink2: string;
  lake: string;
  water: string;
  river: string;
  font: string;
}

/** Rivers and lakes join the drawing at country zoom; from there on the world view stays clean. */
export const WATER_PPD = LEVEL_PPD.country;
/** Airports get their symbol well before their names, which wait for city zoom. */
const AIRPORT_PPD = 80;
const LABEL_HALO = 3.5;

/** How important a place must be to show (Natural Earth scalerank, lower is bigger): capitals and big cities first. */
export function placeRankLimit(ppd: number): number {
  if (ppd < LEVEL_PPD.country) return -1;
  if (ppd < 20) return 2;
  if (ppd < 50) return 4;
  if (ppd < 120) return 6;
  if (ppd < LEVEL_PPD.province) return 7;
  return 10;
}

/** Lakes as a light water fill with a fine shore, rivers as thin accent-tinted lines that thicken a little closer in. */
export function drawWater(ctx: CanvasRenderingContext2D, projection: GeoProjection, detail: GeoDetail, camera: Camera, view: GeoBox | null, palette: DetailPalette): void {
  if (camera.ppd < WATER_PPD) return;
  const lakes = new Path2D();
  const lakePath = geoPath(projection, lakes as unknown as CanvasRenderingContext2D);
  for (const lake of detail.lakes) if (boxTouches(lake.box, view)) lakePath(lake.feature);
  ctx.fillStyle = palette.lake;
  ctx.fill(lakes);
  ctx.strokeStyle = palette.water;
  ctx.lineWidth = 0.75;
  ctx.stroke(lakes);

  const rivers = new Path2D();
  const riverPath = geoPath(projection, rivers as unknown as CanvasRenderingContext2D);
  for (const river of detail.rivers) if (boxTouches(river.box, view)) riverPath(river.feature);
  ctx.strokeStyle = palette.river;
  ctx.lineWidth = camera.ppd >= LEVEL_PPD.province ? 1.6 : camera.ppd >= 60 ? 1.2 : 0.9;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(rivers);
}

/** The airport symbol, authored for the map: an aircraft seen from above, nose up, in a 24-unit box. */
const AIRCRAFT_PATH = 'M12 2.2c.7 0 1.1.6 1.1 1.3v5.6l7.4 4.3v2.1l-7.4-2.3v4.6l2.2 1.6v1.8L12 20.3l-3.3 .9v-1.8l2.2-1.6v-4.6l-7.4 2.3v-2.1l7.4-4.3V3.5c0-.7.4-1.3 1.1-1.3z';
let aircraft: Path2D | null = null;
const SYMBOL_R = 7;

function drawAirportSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, palette: DetailPalette): void {
  ctx.beginPath();
  ctx.arc(x, y, SYMBOL_R, 0, Math.PI * 2);
  ctx.fillStyle = palette.paper;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.ink2;
  ctx.stroke();
  ctx.save();
  ctx.translate(x - 5.5, y - 5.5);
  ctx.scale(11 / 24, 11 / 24);
  ctx.fillStyle = palette.ink2;
  aircraft ??= new Path2D(AIRCRAFT_PATH);
  ctx.fill(aircraft);
  ctx.restore();
}

function drawPlaceDot(ctx: CanvasRenderingContext2D, place: MapPlace, x: number, y: number, palette: DetailPalette): void {
  ctx.beginPath();
  if (place.capital) {
    // A capital is a ringed dot, the drafting convention, so it reads apart from towns without colour.
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = palette.paper;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = palette.ink;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = palette.ink;
    ctx.fill();
    return;
  }
  ctx.arc(x, y, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = palette.ink2;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = palette.paper;
  ctx.stroke();
}

function writeLabel(ctx: CanvasRenderingContext2D, text: string, rect: Rect, palette: DetailPalette, color: string): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = palette.paper;
  ctx.lineWidth = LABEL_HALO;
  ctx.fillStyle = color;
  ctx.strokeText(text, rect.x + 3, rect.y + rect.h / 2);
  ctx.fillText(text, rect.x + 3, rect.y + rect.h / 2);
}

interface PointsInput {
  ctx: CanvasRenderingContext2D;
  projection: GeoProjection;
  camera: Camera;
  size: Size;
  detail: GeoDetail;
  palette: DetailPalette;
  lang: 'en' | 'th';
  /** Pins, their names, the map's controls and the site card. */
  avoid: readonly Rect[];
  /** Names already on the map; each new one is added. */
  placed: Rect[];
}

const onCanvas = (at: [number, number] | null, size: Size): at is [number, number] => at !== null && at[0] >= 0 && at[1] >= 0 && at[0] <= size.width && at[1] <= size.height;

/** Cities and towns, the most important first; a town whose name has no room is left out, dot and all. Capitals keep their dot. */
export function drawPlaces({ ctx, projection, camera, size, detail, palette, lang, avoid, placed }: PointsInput): string[] {
  const limit = placeRankLimit(camera.ppd);
  const written: string[] = [];
  if (limit < 0) return written;
  for (const place of detail.places) {
    if (place.rank > limit && !(place.capital && limit >= 2)) continue;
    const at = screenOf(projection, camera, place.lon, place.lat);
    if (!onCanvas(at, size)) continue;
    const name = pointName(place, lang);
    const big = place.capital || place.rank <= 2;
    ctx.font = `${big ? 650 : 500} ${big ? 13 : 12}px ${palette.font}`;
    const rect = placePointLabel({ x: at[0], y: at[1], width: ctx.measureText(name).width + 6, height: big ? 18 : 16, gap: 6 }, placed, avoid, size);
    if (!rect) {
      if (place.capital) drawPlaceDot(ctx, place, at[0], at[1], palette);
      continue;
    }
    placed.push(rect);
    written.push(name);
    drawPlaceDot(ctx, place, at[0], at[1], palette);
    writeLabel(ctx, name, rect, palette, big ? palette.ink : palette.ink2);
  }
  return written;
}

/** Airports: a symbol from province zoom (the busiest first), named at city zoom where the name has room. */
export function drawAirports({ ctx, projection, camera, size, detail, palette, lang, avoid, placed }: PointsInput): void {
  if (camera.ppd < AIRPORT_PPD) return;
  const named = camera.ppd >= LEVEL_PPD.province;
  const shown: MapAirport[] = detail.airports.filter((a) => named || a.rank <= 4);
  for (const airport of shown) {
    const at = screenOf(projection, camera, airport.lon, airport.lat);
    if (!onCanvas(at, size)) continue;
    const symbol: Rect = { x: at[0] - SYMBOL_R - 1, y: at[1] - SYMBOL_R - 1, w: 2 * SYMBOL_R + 2, h: 2 * SYMBOL_R + 2 };
    if (avoid.some((r) => intersects(r, symbol)) || placed.some((r) => intersects(r, symbol))) continue;
    drawAirportSymbol(ctx, at[0], at[1], palette);
    placed.push(symbol);
    if (!named) continue;
    const name = pointName(airport, lang);
    ctx.font = `500 11px ${palette.font}`;
    const rect = placePointLabel({ x: at[0], y: at[1], width: ctx.measureText(name).width + 6, height: 15, gap: SYMBOL_R + 3 }, placed, avoid, size);
    if (!rect) continue;
    placed.push(rect);
    writeLabel(ctx, name, rect, palette, palette.ink2);
  }
}
