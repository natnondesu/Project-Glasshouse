import { newId, type GeoPoint } from '@glasshouse/domain';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCan } from '../../auth/useCan';
import { useT } from '../../i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { SceneBoundary } from '../home/SceneBoundary';
import { useLocationStore } from './locationStore';
import type { MapSite } from './markers';
import { NotPlacedList } from './NotPlacedList';
import { SiteCard } from './SiteCard';
import { initialSiteId, notPlaced, placed, type SiteSummary } from './sites';
import './globe.css';

// d3-geo and the outlines are Home-only and lazy: until they arrive (or if they fail) the card and rooms stand alone.
const GlobeMap = lazy(() => import('./GlobeMap'));

/**
 * Home's hero: the selected site's card beside a globe of every placed site. It opens framed on where the sites are,
 * with the last room's site selected; sites without a location wait in "Not placed yet" under the map.
 */
export function GlobeHero({ sites, lastRoomId }: { sites: SiteSummary[]; lastRoomId: string | null }) {
  const m = useT();
  const can = useCan();
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const navigate = useNavigate();
  const [siteId, setSiteId] = useState(() => initialSiteId(sites, lastRoomId));
  const [roomBySite, setRoomBySite] = useState<Record<string, string>>({});
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placingId = useLocationStore((s) => s.placing);
  const editLocation = useLocationStore((s) => s.edit);
  const startPlacing = useLocationStore((s) => s.place);
  const finish = useLocationStore((s) => s.done);

  // Leaving Home ends "Place" mode; a Location dialog opened elsewhere is not Home's to close.
  useEffect(() => () => useLocationStore.setState({ placing: null }), []);

  const site = sites.find((s) => s.site.id === siteId) ?? sites[0]!;
  const roomId = roomBySite[site.site.id] ?? (site.rooms.find((r) => r.room.id === lastRoomId) ?? site.rooms[0])?.room.id ?? null;
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
    setSiteId(id);
    if (mapReady && !mapFailed) startPlacing(id);
    else editLocation(id);
  };
  const savePlace = (location: GeoPoint): string | null => {
    if (!placing) return null;
    const problem = dispatch({ type: 'site/locate', siteId: placing.site.id, location });
    if (problem) return problem.message;
    setSiteId(placing.site.id);
    finish();
    return null;
  };
  const newRoom = (): void => {
    const id = newId();
    const problem = dispatch({ type: 'room/create', siteId: site.site.id, id, floorAreaId: newId(), name: m.tree.newRoom });
    setError(problem?.message ?? null);
    if (!problem) void navigate(`/rooms/${id}/plan`);
  };

  return (
    <section className="globe-hero glass">
      <SiteCard
        summary={site}
        roomId={roomId}
        lastRoomId={lastRoomId}
        onRoom={(id) => setRoomBySite((prev) => ({ ...prev, [site.site.id]: id }))}
        canEdit={can.edit}
        onLocate={() => editLocation(site.site.id)}
        onPlace={() => place(site.site.id)}
        onNewRoom={newRoom}
      />
      <div className="globe-hero__map">
        <div className="globe-hero__paper">
          <SceneBoundary title={m.globe.unavailable} message={m.globe.failed} reload={m.home.reload} what="the site map" onError={() => setMapFailed(true)}>
            <Suspense fallback={<p className="home-hero__fallback">{m.globe.loading}</p>}>
              <GlobeMap
                sites={mapSites}
                selectedId={site.site.id}
                onSelect={setSiteId}
                placing={placing ? { id: placing.site.id, name: placing.site.name, location: placing.location } : null}
                onPlace={savePlace}
                onCancelPlace={finish}
                onPasteInstead={() => placing && editLocation(placing.site.id)}
                onReady={onReady}
                hasSamples={mapSites.some((s) => s.sample)}
              />
            </Suspense>
          </SceneBoundary>
        </div>
        <NotPlacedList sites={waiting} selectedId={site.site.id} canEdit={can.edit} onSelect={setSiteId} onPlace={place} />
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
