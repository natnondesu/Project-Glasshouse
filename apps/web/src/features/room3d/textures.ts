import type { Category } from '@glasshouse/domain';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/** Pixels per rack unit on device-front textures: enough for crisp ports and LEDs up close. */
const PX_PER_U = 48;
const FRONT_W = 512;
const MONO = '600 22px "Geist Mono", "IBM Plex Sans Thai", ui-monospace, monospace';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function texture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function led(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(x, y, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function driveBays(ctx: CanvasRenderingContext2D, x0: number, h: number, rows: number, cols: number): void {
  const w = FRONT_W - x0 - 70;
  const bw = w / cols;
  const bh = (h - 16) / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = x0 + c * bw + 3;
      const y = 8 + r * bh + 3;
      ctx.fillStyle = '#3c4652';
      ctx.fillRect(x, y, bw - 6, bh - 6);
      ctx.strokeStyle = '#55606c';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, bw - 6, bh - 6);
      led(ctx, x + bw - 14, y + 8, (r + c) % 5 === 0 ? '#f2b154' : '#4cd17a');
    }
  }
}

function ports(ctx: CanvasRenderingContext2D, x0: number, h: number): void {
  const cols = 24;
  const rows = Math.max(1, Math.min(2, Math.floor(h / 24)));
  const pw = (FRONT_W - x0 - 80) / cols;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = x0 + c * pw + 2;
      const y = h / 2 - (rows * 18) / 2 + r * 18 + 2;
      ctx.fillStyle = '#0d1116';
      ctx.fillRect(x, y, pw - 4, 13);
      ctx.fillStyle = c % 3 === 0 ? '#4cd17a' : '#2a3540';
      ctx.fillRect(x + 1, y + 1, 3, 2);
    }
  }
}

function vents(ctx: CanvasRenderingContext2D, x0: number, h: number): void {
  ctx.strokeStyle = '#141a20';
  ctx.lineWidth = 3;
  for (let x = x0; x < FRONT_W - 90; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x, h - 10);
    ctx.stroke();
  }
}

const frontCache = new Map<string, CanvasTexture>();

/**
 * A device front drawn from its category: drive bays for servers, ports for network,
 * vents for power. Cached per look, so a rack of identical servers shares one texture.
 */
export function deviceFrontTexture(opts: { category: Category; heightU: number; accent: string; unknown: boolean; name: string; maintenance?: boolean }): CanvasTexture {
  const key = `${opts.category}|${opts.heightU}|${opts.accent}|${opts.unknown}|${opts.name}|${opts.maintenance ? 'm' : ''}`;
  const hit = frontCache.get(key);
  if (hit) return hit;
  const h = Math.max(1, opts.heightU) * PX_PER_U;
  const [c, ctx] = canvas(FRONT_W, h);
  ctx.fillStyle = '#262e37';
  ctx.fillRect(0, 0, FRONT_W, h);
  ctx.fillStyle = opts.unknown ? '#c2382f' : opts.maintenance ? '#e08a00' : opts.accent;
  ctx.fillRect(0, 0, opts.maintenance ? 18 : 10, h);
  ctx.fillStyle = '#e8edf1';
  ctx.font = MONO;
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.name, 22, Math.min(h / 2, 26));
  const x0 = 150;
  if (opts.category === 'network') ports(ctx, x0, h);
  else if (opts.category === 'power') vents(ctx, x0, h);
  else if (opts.category === 'server') driveBays(ctx, x0, h, Math.max(1, Math.min(3, opts.heightU)), opts.heightU > 1 ? 4 : 8);
  else if (opts.category === 'misc') ports(ctx, x0, h);
  // Passive gear (patch panels, cable management) has no status light.
  if (opts.category !== 'misc') led(ctx, FRONT_W - 40, Math.min(h / 2, 24), opts.unknown ? '#ff6b5e' : opts.maintenance ? '#ffb020' : '#4cd17a');
  ctx.strokeStyle = '#11161b';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, FRONT_W - 4, h - 4);
  const t = texture(c);
  frontCache.set(key, t);
  return t;
}

const railCache = new Map<number, CanvasTexture>();

/** U numbers for the front rails, bottom-up like a real rack. */
export function railTexture(capacityU: number): CanvasTexture {
  const hit = railCache.get(capacityU);
  if (hit) return hit;
  const pxPerU = 32;
  const [c, ctx] = canvas(48, capacityU * pxPerU);
  ctx.fillStyle = '#1b2128';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#9aa6b2';
  ctx.font = '500 16px "Geist Mono", "IBM Plex Sans Thai", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let u = 1; u <= capacityU; u += 1) {
    const y = c.height - (u - 0.5) * pxPerU;
    if (u === 1 || u % 5 === 0) ctx.fillText(String(u), 24, y);
    ctx.fillRect(4, y + pxPerU / 2 - 1, 8, 1);
  }
  const t = texture(c);
  railCache.set(capacityU, t);
  return t;
}

const LABEL_H_PX = 112;
const LABEL_MIN_W_PX = 240;
const LABEL_PAD_PX = 28;
const TITLE_FONT = '700 44px "Geist Mono", "IBM Plex Sans Thai", ui-monospace, monospace';
const SUB_FONT = '600 30px "Geist Mono", "IBM Plex Sans Thai", ui-monospace, monospace';

/**
 * A label for a sprite above a rack: name, then a quieter second line.
 * The canvas grows to fit the text, and `aspect` lets the sprite keep it undistorted.
 */
export function labelTexture(title: string, sub: string, accent: string): { map: CanvasTexture; aspect: number } {
  const [probe, measure] = canvas(1, 1);
  void probe;
  measure.font = TITLE_FONT;
  const titleW = measure.measureText(title).width;
  measure.font = SUB_FONT;
  const subW = measure.measureText(sub).width;
  const w = Math.ceil(Math.max(LABEL_MIN_W_PX, titleW, subW) + LABEL_PAD_PX * 2);
  const [c, ctx] = canvas(w, LABEL_H_PX);
  ctx.fillStyle = 'rgba(251, 252, 250, 0.94)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, LABEL_H_PX - 8, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#111720';
  ctx.font = TITLE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, w / 2, 42);
  ctx.fillStyle = '#26303b';
  ctx.font = SUB_FONT;
  ctx.fillText(sub, w / 2, 84);
  return { map: texture(c), aspect: w / LABEL_H_PX };
}

/** Diagonal hatch for Reserved ranges, matching the 2D elevation. */
export function reservedTexture(): CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  ctx.fillStyle = 'rgba(122, 135, 148, 0.25)';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(58, 69, 84, 0.7)';
  ctx.lineWidth = 3;
  for (let i = -64; i < 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 64);
    ctx.lineTo(i + 64, 0);
    ctx.stroke();
  }
  const t = texture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  return t;
}

/** One metre of floor with 0.5 m grid lines; the floor's UVs are in metres, so it tiles at true scale. */
export function floorGridTexture(base: string): CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(42, 106, 158, 0.16)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(42, 106, 158, 0.08)';
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.stroke();
  const t = texture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  return t;
}
