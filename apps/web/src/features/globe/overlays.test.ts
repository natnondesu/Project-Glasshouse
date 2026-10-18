import { describe, expect, it } from 'vitest';
import { overlayBoxes } from './overlays';

const at = (el: HTMLElement, x: number, y: number, w: number, h: number): void => {
  el.getBoundingClientRect = () => ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) });
};

describe('what the map keeps its names clear of', () => {
  it('takes the map’s controls and what floats over it, from the hero, padded and in the map’s coordinates', () => {
    document.body.innerHTML = `<div class="globe-hero__paper"><div class="globe-map"><nav class="globe-crumbs"></nav><button class="globe-matches"></button></div><section class="site-card globe-sitecard"></section><div class="globe-notplaced"></div><p class="unrelated"></p></div>`;
    const map = document.querySelector<HTMLElement>('.globe-map')!;
    at(map, 100, 50, 800, 500);
    at(document.querySelector('.globe-crumbs')!, 112, 62, 300, 40);
    at(document.querySelector('.globe-matches')!, 112, 110, 140, 34);
    at(document.querySelector('.globe-sitecard')!, 476, 62, 360, 420);
    at(document.querySelector('.globe-notplaced')!, 700, 500, 180, 36);
    at(document.querySelector('.unrelated')!, 0, 0, 10, 10);
    expect(overlayBoxes(map)).toEqual([
      { x: 6, y: 6, w: 312, h: 52 },
      { x: 6, y: 54, w: 152, h: 46 },
      { x: 370, y: 6, w: 372, h: 432 },
      { x: 594, y: 444, w: 192, h: 48 },
    ]);
  });

  it('takes each marker’s pin and name as drawn', () => {
    document.body.innerHTML = `<div class="globe-hero__paper"><div class="globe-map"><ul><li class="globe-marker"><button></button><span class="globe-marker__label"></span></li></ul></div></div>`;
    const map = document.querySelector<HTMLElement>('.globe-map')!;
    at(map, 0, 0, 800, 500);
    at(document.querySelector('.globe-marker button')!, 188, 188, 24, 24);
    at(document.querySelector('.globe-marker__label')!, 220, 186, 104, 30);
    expect(overlayBoxes(map, { markers: true })).toEqual([{ x: 184, y: 182, w: 144, h: 38 }]);
  });
});
