import { newId, type GeoPoint } from '@glasshouse/domain';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCan } from '../../auth/useCan';
import { useT } from '../../i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { FrameTarget } from '../home/homeView';
import type { Scope, SitePlaces } from '../home/scope';
import { SceneBoundary } from '../home/SceneBoundary';
import { useLocationStore } from './locationStore';
import type { MapSite } from './markers';
import { NotPlacedList } from './NotPlacedList';
import { SiteCard } from './SiteCard';
import { notPlaced, placed, type SiteSummary } from './sites';
import './globe.css';
import './site-card.css';

/** The card's margin from the map's top and bottom edges together. */
const CARD_MARGIN_PX = 24;

// d3-geo and the outlines are Home-only and lazy: until they arrive (or if they fail) the card and rooms stand alone.
const GlobeMap = lazy(() => import('./GlobeMap'));

interface GlobeHeroProps {
  sites: SiteSummary[];
  lastRoomId: string | null;
  scope: Scope;
  /** The globe picked a place: a count, a crumb, a pin, a saved location. */
  onScope: (scope: Scope) => void;
  /** The card's close button: the scope steps back up from the site. */
  onCloseCard: () => void;
  /** Sites a search keeps; the others fade. Null when nobody is searching. */
  matches: ReadonlySet<string> | null;
  /** A flight asked from outside the globe (Enter on a site match). */
  frame: { seq: number; target: FrameTarget } | null;
  onPlaces: (places: SitePlaces) => void;
  onMapFailed: () => void;
  /** Home was entered without a view in its address: the map opens on the whole world. */
  openOnWorld?: boolean;
  /** A room picked in the search: its site's card shows it. */
  cardRoom?: { seq: number; siteId: string; roomId: string } | null;
}

/**
 * Home's hero, the full width of the page: a globe of every placed site. Picking a site floats its card over the map's
 * top right; sites without a location wait behind "Not placed yet" at the map's foot.
 */
export function GlobeHero({ sites, lastRoomId, scope, onScope, onCloseCard, matches, frame, onPlaces, onMapFailed, openOnWorld = false, cardRoom = null }: GlobeHeroProps) {
  const m = useT();
  const can = useCan();
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const navigate = useNavigate();
  const [roomBySite, setRoomBySite] = useState<Record<string, string>>({});
  // A room picked in the search wins over the card's own choice, in the same render (no flash of another room's 3D).
  const [seenPick, setSeenPick] = useState(0);
  if (cardRoom && cardRoom.seq !== seenPick) {
    setSeenPick(cardRoom.seq);
    setRoomBySite((prev) => ({ ...prev, [cardRoom.siteId]: cardRoom.roomId }));
  }
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placingId = useLocationStore((s) => s.placing);
  const editLocation = useLocationStore((s) => s.edit);
  const startPlacing = useLocationStore((s) => s.place);
  const finish = useLocationStore((s) => s.done);
  const pickSite = useCallback((id: string) => onScope({ kind: 'site', id }), [onScope]);
  // The map's height decides how much of the card's 3D fits; the card's height tells the map where not to write.
  const paper = useRef<HTMLDivElement>(null);
  const [paperHeight, setPaperHeight] = useState<number | undefined>(undefined);
  const [cardHeight, setCardHeight] = useState(0);
  useEffect(() => {
    const el = paper.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setPaperHeight(el.clientHeight || undefined);
      setCardHeight(el.querySelector('.site-card')?.getBoundingClientRect().height ?? 0);
    });
    ro.observe(el);
    const watchCard = new MutationObserver(() => {
      const card = el.querySelector('.site-card');
      if (card) ro.observe(card);
      setCardHeight(card?.getBoundingClientRect().height ?? 0);
    });
    watchCard.observe(el, { childList: true });
    return () => {
      ro.disconnect();
      watchCard.disconnect();
    };
  }, []);

  // Leaving Home ends "Place" mode; a Location dialog opened elsewhere is not Home's to close. StrictMode runs the
  // cleanup and the effect again at once on mount, so the clearing waits a tick and checks Home is really gone.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) useLocationStore.setState({ placing: null });
      });
    };
  }, []);

  // A location saved in the dialog (or on the map) picks that site, so the map brings it into view.
  const saved = useLocationStore((s) => s.saved);
  useEffect(() => {
    if (saved && sites.some((s) => s.site.id === saved.siteId)) pickSite(saved.siteId);
    // Only a new save; the sites list changing is not a reason to jump.
  }, [saved]);

  // Leaving Place mode hands focus back to what started it; if that has gone (the not-placed row after a save), to
  // the site's new pin, else the card's heading. Not when the Location dialog took over.
  const opener = useRef<HTMLElement | null>(null);
  const wasPlacing = useRef<string | null>(placingId);
  useEffect(() => {
    const left = wasPlacing.current;
    wasPlacing.current = placingId;
    if (!left || placingId) return;
    const back = opener.current;
    opener.current = null;
    requestAnimationFrame(() => {
      if (useLocationStore.getState().editing) return;
      if (back?.isConnected) back.focus();
      else (document.querySelector<HTMLElement>(`[data-site-id="${CSS.escape(left)}"]`) ?? document.getElementById('home-site-name'))?.focus();
    });
  }, [placingId]);

  const site = scope.kind === 'site' ? (sites.find((s) => s.site.id === scope.id) ?? null) : null;

  // Escape closes the card (not while a dialog, the chooser or Place mode has Escape), and focus goes to its pin.
  const siteId = site?.site.id ?? null;
  useEffect(() => {
    if (!siteId) return;
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target;
      const typing = t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
      if (e.key !== 'Escape' || e.defaultPrevented || typing || useLocationStore.getState().placing || document.querySelector('dialog[open], .confirm-backdrop, .globe-chooser, .globe-notplaced.is-open')) return;
      e.preventDefault();
      onCloseCard();
      requestAnimationFrame(() => (document.querySelector<HTMLElement>(`[data-site-id="${CSS.escape(siteId)}"]`) ?? document.querySelector<HTMLElement>('.globe-crumbs button[aria-current]'))?.focus());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [siteId, onCloseCard]);
  const roomId = site ? (roomBySite[site.site.id] ?? (site.rooms.find((r) => r.room.id === lastRoomId) ?? site.rooms[0])?.room.id ?? null) : null;
  const mapSites = useMemo<MapSite[]>(() => placed(sites).map((s) => ({ id: s.site.id, name: s.site.name, project: s.project.name, rooms: s.rooms.length, location: s.location, sample: s.isSample })), [sites]);
  const waiting = notPlaced(sites);
  const placing = sites.find((s) => s.site.id === placingId) ?? null;
  const onReady = useCallback(() => setMapReady(true), []);
  // "Place on the map" chosen elsewhere, but the map can't load here: the Location dialog is the other way in.
  useEffect(() => {
    if (mapFailed && placingId) editLocation(placingId);
  }, [mapFailed, placingId, editLocation]);

  // Without the map (still loading, or failed) "Place" opens the Location dialog instead.
  const place = (id: string): void => {
    pickSite(id);
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (mapReady && !mapFailed) startPlacing(id);
    else editLocation(id);
  };
  const savePlace = (location: GeoPoint): string | null => {
    if (!placing) return null;
    const problem = dispatch({ type: 'site/locate', siteId: placing.site.id, location });
    if (problem) return problem.message;
    pickSite(placing.site.id);
    useLocationStore.getState().markSaved(placing.site.id);
    finish();
    return null;
  };
  const newRoom = (): void => {
    if (!site) return;
    const id = newId();
    const problem = dispatch({ type: 'room/create', siteId: site.site.id, id, floorAreaId: newId(), name: m.tree.newRoom });
    setError(problem?.message ?? null);
    if (!problem) void navigate(`/rooms/${id}/plan`);
  };

  return (
    <section className="globe-hero glass" aria-label={m.globe.map}>
      <div className={`globe-hero__paper${site && !placing ? ' has-card' : ''}`} ref={paper}>
        <SceneBoundary
          title={m.globe.unavailable}
          message={m.globe.failed}
          reload={m.home.reload}
          what="the site map"
          onError={() => {
            setMapFailed(true);
            onMapFailed();
          }}
        >
          <Suspense fallback={<p className="home-hero__fallback">{m.globe.loading}</p>}>
            <GlobeMap
              sites={mapSites}
              scope={scope}
              onScope={onScope}
              matches={matches}
              frame={frame}
              onPlaces={onPlaces}
              placing={placing ? { id: placing.site.id, name: placing.site.name, location: placing.location } : null}
              onPlace={savePlace}
              onCancelPlace={finish}
              onPasteInstead={() => placing && editLocation(placing.site.id)}
              onReady={onReady}
              hasSamples={mapSites.some((s) => s.sample)}
              cardHeight={site ? cardHeight : 0}
              openOnWorld={openOnWorld}
            />
          </Suspense>
        </SceneBoundary>
        {site && !placing ? (
          <SiteCard
            key={site.site.id}
            summary={site}
            roomId={roomId}
            lastRoomId={lastRoomId}
            onRoom={(id) => setRoomBySite((prev) => ({ ...prev, [site.site.id]: id }))}
            canEdit={can.edit}
            onLocate={() => editLocation(site.site.id)}
            onPlace={() => place(site.site.id)}
            onNewRoom={newRoom}
            onClose={onCloseCard}
            fitHeight={paperHeight === undefined ? undefined : paperHeight - CARD_MARGIN_PX}
          />
        ) : null}
        <NotPlacedList sites={waiting} selectedId={site?.site.id ?? null} canEdit={can.edit} onSelect={pickSite} onPlace={place} hidden={placing !== null} />
      </div>
      {error ? (
        <p role="alert" className="field__error globe-hero__error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
