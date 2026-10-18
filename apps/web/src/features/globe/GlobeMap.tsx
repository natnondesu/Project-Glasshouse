import type { GeoPoint } from '@glasshouse/domain';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLangStore, useT } from '../../i18n';
import { IconMinus, IconPause, IconPlay, IconPlus } from '../../ui/icons';
import { usePrefersReducedMotion } from '../../ui/usePrefersReducedMotion';
import { boxOfPoints, fitBox, LEVEL_PPD, levelOf, MAX_PPD, worldCamera, type Camera, type GeoBox, type Size } from './camera';
import { drawMap, readPalette, type MapPalette, type Rect } from './drawMap';
import { loadGeo, regionAt, regionName, type GeoData, type Region } from './geoData';
import { MapCrumbs, type Crumb } from './MapCrumbs';
import { MapMarkers } from './MapMarkers';
import { markerGroups, markersFrom, splitsAt, type Marker, type MapSite, type Places } from './markers';
import { PlaceBanner } from './PlaceBanner';
import { projectionFor, screenOf } from './projection';
import { scaleBar } from './scale';
import { useGlobeCamera } from './useGlobeCamera';
import { useMapInput } from './useMapInput';

export interface GlobeMapProps {
  sites: MapSite[];
  selectedId: string | null;
  onSelect: (siteId: string) => void;
  placing: { id: string; name: string; location: GeoPoint | null } | null;
  /** Saves the pin; answers an error to show, or null when it went through. */
  onPlace: (location: GeoPoint) => string | null;
  onCancelPlace: () => void;
  onPasteInstead: () => void;
  onReady?: () => void;
  /** Sample sites are on the map: the credit line says their spots are illustrative. */
  hasSamples: boolean;
}

/** jsdom and the first frame report no size: a laptop-sized guess until the real one arrives. */
const FALLBACK_SIZE: Size = { width: 720, height: 460 };
/** Close enough to see a site among its streets' worth of space, with the province around it. */
const SITE_PPD = 4000;
const FRAME_PAD_PX = 56;
const ZOOM_MS = 450;
/** Country outlines wider than this (Russia, France with its overseas parts) are no use for framing a few sites. */
const MAX_FRAME_SPAN = 40;
const MIN_FRAME_SPAN = 8;

const spanOf = ([[w, s], [e, n]]: GeoBox): number => Math.max(n - s, e >= w ? e - w : e + 360 - w);

function useSize(ref: React.RefObject<HTMLElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (): void => {
      const r = el.getBoundingClientRect();
      const next = r.width > 0 && r.height > 0 ? { width: Math.round(r.width), height: Math.round(r.height) } : FALLBACK_SIZE;
      setSize((s) => (s && s.width === next.width && s.height === next.height ? s : next));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** The screen's pixel ratio, followed live (a window dragged to another display redraws sharp). */
function useDevicePixelRatio(): number {
  const read = (): number => Math.min(2, window.devicePixelRatio || 1);
  const [dpr, setDpr] = useState(read);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const on = (): void => setDpr(read());
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [dpr]);
  return dpr;
}

/** The map's own controls, in its coordinates: names drawn on the map stay clear of them. */
function overlayBoxes(root: HTMLElement | null): Rect[] {
  if (!root) return [];
  const base = root.getBoundingClientRect();
  return [...root.querySelectorAll<HTMLElement>('.globe-crumbs, .globe-zoom, .globe-spin, .globe-map__foot, .globe-place, .globe-map__empty')].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - base.left - 6, y: r.top - base.top - 6, w: r.width + 12, h: r.height + 12 };
  });
}

function useInView(ref: React.RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? true));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

/**
 * Home's globe: Natural Earth outlines on paper, the placed sites as pins that merge when they crowd, a breadcrumb
 * from the world down to the selected site, and one authored fly-in. Lazy: d3-geo and the outlines load with it.
 * Until the outlines arrive it says so; if they can't, the error goes to the boundary ("Map unavailable").
 */
export default function GlobeMap(props: GlobeMapProps) {
  const m = useT();
  const [geo, setGeo] = useState<GeoData | Error | null>(null);
  useEffect(() => {
    let live = true;
    loadGeo().then(
      (data) => live && setGeo(data),
      (error: unknown) => live && setGeo(error instanceof Error ? error : new Error(String(error))),
    );
    return () => {
      live = false;
    };
  }, []);
  if (geo instanceof Error) throw geo;
  if (!geo) return <p className="home-hero__fallback">{m.globe.loading}</p>;
  return <Globe {...props} geo={geo} />;
}

function Globe({ sites, selectedId, onSelect, placing, onPlace, onCancelPlace, onPasteInstead, onReady, hasSamples, geo }: GlobeMapProps & { geo: GeoData }) {
  const m = useT();
  const lang = useLangStore((s) => s.lang);
  const reduced = usePrefersReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useSize(root);
  const inView = useInView(root);
  const [hover, setHover] = useState(false);
  const [userMoved, setUserMoved] = useState(false);
  const [pin, setPin] = useState<GeoPoint | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [chooser, setChooser] = useState<Extract<Marker, { kind: 'cluster' }> | null>(null);
  const [paused, setPaused] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const dpr = useDevicePixelRatio();

  useEffect(() => onReady?.(), [onReady]);

  const places = useMemo(() => new Map(sites.map((s) => [s.id, { country: regionAt(geo.countries, s.location.lon, s.location.lat), province: regionAt(geo.provinces, s.location.lon, s.location.lat) }])), [sites, geo]);

  const initial = useCallback(
    (sz: Size): Camera => {
      if (sites.length === 0) return worldCamera(sz);
      const own = boxOfPoints(sites.map((s) => s.location));
      const countryBoxes = [...places.values()].flatMap((p) => (p.country && spanOf(p.country.box) <= MAX_FRAME_SPAN ? [p.country.box] : []));
      const corners = [own, ...countryBoxes].flatMap(([[w, s], [e, n]]) => [{ lon: w, lat: s }, { lon: e, lat: n }]);
      let box = boxOfPoints(corners);
      if (spanOf(box) < MIN_FRAME_SPAN) {
        const [[w, s], [e, n]] = box;
        const pad = (MIN_FRAME_SPAN - spanOf(box)) / 2;
        box = [[w - pad, s - pad], [e + pad, n + pad]];
      }
      return fitBox(box, sz, { padding: FRAME_PAD_PX, maxPpd: LEVEL_PPD.province });
    },
    [sites, places],
  );

  // The world view turns slowly until someone drags or zooms it, points at it, places a site, or scrolls it away.
  const { camera, flyTo, jumpTo, stop, flying } = useGlobeCamera(size, initial, { reduced, spin: !userMoved && !hover && !focusWithin && !paused && inView && !placing });
  const cameraState = useRef<Camera | null>(null);
  cameraState.current = camera;

  const projection = useMemo(() => (camera && size ? projectionFor(camera, size) : null), [camera, size]);
  const placeNames = useMemo<Places>(
    () => ({
      country: (id) => places.get(id)?.country?.code ?? null,
      countryName: (code) => {
        const region = geo.countries.find((c) => c.code === code);
        return region ? regionName(region, lang) : code;
      },
      province: (id) => {
        const region = places.get(id)?.province;
        return region ? regionName(region, lang) : null;
      },
    }),
    [places, geo, lang],
  );
  const project = useMemo(() => {
    if (!projection || !camera || !size) return null;
    return (lon: number, lat: number): [number, number] | null => {
      const at = screenOf(projection, camera, lon, lat);
      return at && at[0] > -20 && at[1] > -20 && at[0] < size.width + 20 && at[1] < size.height + 20 ? at : null;
    };
  }, [projection, camera, size]);
  // Which sites share a marker changes with the zoom, not with every frame of a pan or a turn: kept per zoom step.
  const zoomStep = camera ? Math.round(Math.log2(camera.ppd) * 8) : 0;
  const level = camera ? levelOf(camera.ppd) : 'world';
  const visible = project ? sites.filter((s) => project(s.location.lon, s.location.lat)).map((s) => s.id).join(',') : '';
  const groups = useMemo(() => (project ? markerGroups(sites, level, project, placeNames) : []),
    // `project` is read once per zoom step on purpose.
    [sites, level, zoomStep, visible, placeNames]);
  const markers = useMemo(() => (project ? markersFrom(groups, sites, level, project, placeNames) : []), [groups, sites, level, project, placeNames]);

  const selected = sites.find((s) => s.id === selectedId) ?? null;
  const selectedPlaces = selected ? places.get(selected.id) : undefined;

  // Paint only when something changed: the camera, the size, the selection or the language.
  const palette = useRef<MapPalette | null>(null);
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el || !camera || !size) return;
    const w = Math.round(size.width * dpr);
    const h = Math.round(size.height * dpr);
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    palette.current ??= readPalette(root.current ?? el);
    const avoid: Rect[] = [...markers.map((mk) => ({ x: mk.x - 24, y: mk.y - 24, w: 48 + 180, h: 48 })), ...overlayBoxes(root.current)];
    drawMap({ ctx, size, dpr, camera, geo, palette: palette.current, highlight: { country: selectedPlaces?.country ?? null, province: selectedPlaces?.province ?? null }, lang, avoid });
  }, [camera, size, geo, selectedPlaces, lang, markers, dpr, placing, paused]);

  // A site picked elsewhere, or given a new location (the dialog, Place mode), comes into view if it isn't.
  const selectedKey = selected ? `${selected.id}@${selected.location.lat},${selected.location.lon}` : selectedId;
  const lastSelected = useRef(selectedKey);
  useEffect(() => {
    if (lastSelected.current === selectedKey) return;
    lastSelected.current = selectedKey;
    if (!selected || !projection || !camera || !size) return;
    const at = screenOf(projection, camera, selected.location.lon, selected.location.lat);
    const visible = at && at[0] > 0 && at[1] > 0 && at[0] < size.width && at[1] < size.height;
    if (!visible) flyTo({ lon: selected.location.lon, lat: selected.location.lat, ppd: Math.max(camera.ppd, LEVEL_PPD.country * 2) });
  }, [selectedKey, selected, projection, camera, size, flyTo]);

  // Entering "Place" mode: a site being moved is shown where it is now; otherwise the view stays where the user is.
  const placingId = placing?.id ?? null;
  useEffect(() => {
    setPin(null);
    setPlaceError(null);
    if (!placingId) return;
    // Place mode takes focus to the map: the keys move it and Enter drops the pin.
    root.current?.querySelector<HTMLElement>('.globe-map__view')?.focus({ preventScroll: true });
    const from = placing?.location;
    if (from && cameraState.current) flyTo({ lon: from.lon, lat: from.lat, ppd: Math.max(cameraState.current.ppd, LEVEL_PPD.province * 2) });
    // Only when the site being placed changes.
  }, [placingId]);

  // Escape leaves the chooser, then Place mode, from anywhere on the page (a dialog handles its own Escape first).
  useEffect(() => {
    if (!placingId && !chooser) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open], .confirm-backdrop')) return;
      e.preventDefault();
      if (chooser) setChooser(null);
      else onCancelPlace();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placingId, chooser, onCancelPlace]);

  useEffect(() => {
    if (chooser) root.current?.querySelector<HTMLElement>('.globe-chooser button')?.focus();
  }, [chooser]);

  const closeEnough = camera ? camera.ppd >= LEVEL_PPD.province : false;

  const input = useMapInput({
    root,
    camera,
    size,
    projection,
    jumpTo,
    flyTo,
    stop,
    flying,
    onUserMove: () => setUserMoved(true),
    onTap: (point) => {
      if (!placing || !camera) return;
      if (camera.ppd < LEVEL_PPD.province) flyTo({ lon: point.lon, lat: point.lat, ppd: Math.max(LEVEL_PPD.province * 2, camera.ppd * 2.5) });
      else setPin(point);
    },
    onEnter: () => {
      if (placing && camera && closeEnough) setPin({ lat: camera.lat, lon: camera.lon });
    },
    zoomMs: ZOOM_MS,
  });

  if (!camera || !size) return <div ref={root} className="globe-map" />;
  const lv = levelOf(camera.ppd);

  const goSite = (site: MapSite): void => {
    setChooser(null);
    onSelect(site.id);
    flyTo({ lon: site.location.lon, lat: site.location.lat, ppd: Math.max(camera.ppd, SITE_PPD) });
  };
  const goCluster = (marker: Extract<Marker, { kind: 'cluster' }>): void => {
    const box = boxOfPoints(marker.sites.map((s) => s.location));
    const country = lv === 'world' ? places.get(marker.sites[0]!.id)?.country : null;
    if (country && spanOf(country.box) <= MAX_FRAME_SPAN) {
      const target = fitBox(country.box, size, { padding: FRAME_PAD_PX, maxPpd: LEVEL_PPD.province });
      flyTo({ ...target, ppd: Math.max(target.ppd, camera.ppd * 2) });
      return;
    }
    const fitted = fitBox(box, size, { padding: 96, maxPpd: MAX_PPD });
    const target = { ...fitted, ppd: Math.min(MAX_PPD, Math.max(fitted.ppd, camera.ppd * 2)) };
    // Sites that no zoom can pull apart (the same building, a campus 50 m wide) are listed instead.
    if (camera.ppd >= MAX_PPD * 0.99 || !splitsAt(marker.sites, target.ppd)) {
      setChooser(marker);
      return;
    }
    flyTo(target);
  };
  const fit = (region: Region): void => flyTo(fitBox(region.box, size, { padding: FRAME_PAD_PX }));

  // The breadcrumb follows the selected site while it is on screen, else the middle of the view.
  const selectedAt = selected && projection ? screenOf(projection, camera, selected.location.lon, selected.location.lat) : null;
  const selectedOnScreen = selectedAt !== null && selectedAt[0] >= 0 && selectedAt[1] >= 0 && selectedAt[0] <= size.width && selectedAt[1] <= size.height;
  const focus = selectedOnScreen && selected ? selected.location : { lon: camera.lon, lat: camera.lat };
  const country = selectedOnScreen ? (selectedPlaces?.country ?? null) : regionAt(geo.countries, focus.lon, focus.lat);
  const province = selectedOnScreen ? (selectedPlaces?.province ?? null) : lv === 'world' || lv === 'country' ? null : regionAt(geo.provinces, focus.lon, focus.lat);
  const crumbs: Crumb[] = [
    {
      key: 'world',
      label: m.globe.world,
      go: () => {
        setUserMoved(false);
        flyTo(worldCamera(size, { lat: Math.max(-30, Math.min(30, focus.lat)), lon: focus.lon }));
      },
    },
  ];
  if (country && (lv !== 'world' || selectedOnScreen)) crumbs.push({ key: 'country', label: regionName(country, lang), go: () => fit(country) });
  if (province && (lv === 'province' || lv === 'site' || selectedOnScreen)) crumbs.push({ key: 'province', label: regionName(province, lang), go: () => fit(province) });
  if (selected && selectedOnScreen) crumbs.push({ key: 'site', label: selected.name, go: () => goSite(selected) });
  const order: Crumb['key'][] = ['world', 'country', 'province', 'site'];
  const reach = order.indexOf(lv);
  const current = [...crumbs].reverse().find((c) => order.indexOf(c.key) <= reach)?.key ?? 'world';

  const scale = lv === 'world' ? null : scaleBar(camera.ppd);
  const pinAt = pin && projection ? screenOf(projection, camera, pin.lon, pin.lat) : null;

  return (
    <div
      ref={root}
      className={`globe-map${placing ? ' is-placing' : ''}${flying ? ' is-flying' : ''}`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
      }}
    >
      <div
        className="globe-map__view"
        role="application"
        aria-roledescription={m.globe.map}
        aria-label={m.globe.viewLabel}
        tabIndex={0}
        onPointerDown={input.onPointerDown}
        onPointerMove={input.onPointerMove}
        onPointerUp={input.onPointerUp}
        onPointerCancel={input.onPointerCancel}
        onKeyDown={input.onViewKeyDown}
      >
        <canvas ref={canvas} className="globe-map__canvas" aria-hidden="true" />
        {placing && closeEnough ? <span className="globe-map__crosshair" aria-hidden="true" /> : null}
      </div>
      <MapMarkers markers={markers} selectedId={selectedId} width={size.width} onSite={goSite} onCluster={goCluster} />
      {pinAt ? <span className="globe-pin" style={{ transform: `translate(${pinAt[0]}px, ${pinAt[1]}px)` }} aria-hidden="true" /> : null}
      {chooser ? (
        <div className="globe-chooser popover-surface" role="group" aria-label={m.globe.pickSite} style={{ transform: `translate(${Math.min(chooser.x, size.width - 220)}px, ${chooser.y + 24}px)` }}>
          <p>{m.globe.pickSite}</p>
          {chooser.sites.map((s) => (
            <button key={s.id} type="button" className="btn btn--sm btn--quiet" onClick={() => goSite(s)}>
              {s.name}
            </button>
          ))}
        </div>
      ) : null}
      <MapCrumbs crumbs={crumbs} current={current} />
      {lv === 'world' && !reduced ? (
        <button
          type="button"
          className="globe-spin popover-surface"
          aria-pressed={paused}
          aria-label={paused ? m.globe.playSpin : m.globe.pauseSpin}
          onClick={() => {
            setPaused(!paused);
            if (paused) setUserMoved(false);
          }}
        >
          {paused ? <IconPlay /> : <IconPause />}
        </button>
      ) : null}
      <div className="globe-zoom popover-surface">
        <button type="button" className="globe-zoom__btn" aria-label={m.globe.zoomIn} onClick={() => input.zoom(2)} disabled={camera.ppd >= MAX_PPD}>
          <IconPlus />
        </button>
        <button type="button" className="globe-zoom__btn" aria-label={m.globe.zoomOut} onClick={() => input.zoom(0.5)} disabled={lv === 'world' && camera.ppd <= worldCamera(size).ppd * 1.001}>
          <IconMinus />
        </button>
      </div>
      {sites.length === 0 && !placing ? <p className="globe-map__empty">{m.globe.nothingPlaced}</p> : null}
      <div className="globe-map__foot">
        {scale ? (
          <span className="globe-scale" role="img" aria-label={m.globe.scale(scale.label)}>
            <span className="globe-scale__bar" style={{ width: `${scale.px}px` }} />
            <span className="mono">{scale.label}</span>
          </span>
        ) : null}
        <p className="globe-map__credit">
          {m.globe.attribution}
          {hasSamples ? ` · ${m.globe.sampleSpots}` : ''}
        </p>
      </div>
      {input.wheelHint ? (
        <p className="globe-map__wheel-hint" role="status">
          {m.globe.wheelHint(input.modifierKey)}
        </p>
      ) : null}
      {placing ? (
        <PlaceBanner
          name={placing.name}
          closeEnough={closeEnough}
          pin={pin}
          error={placeError}
          onSave={() => {
            if (!pin) return;
            const problem = onPlace(pin);
            setPlaceError(problem);
          }}
          onCancel={onCancelPlace}
          onPaste={onPasteInstead}
        />
      ) : null}
    </div>
  );
}
