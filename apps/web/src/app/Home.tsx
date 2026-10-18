import { liveCounts, newId } from '@glasshouse/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '../auth/authStore';
import { useCan } from '../auth/useCan';
import { GlobeHero } from '../features/globe/GlobeHero';
import { siteSummaries } from '../features/globe/sites';
import { homeNumbers } from '../features/home/homeNumbers';
import { filterCounts, filterRooms, scopedRooms } from '../features/home/homeRooms';
import { narrowSites, queryWords, topMatch } from '../features/home/homeSearch';
import { useHomeView, useHomeViewUrl } from '../features/home/homeView';
import { lastRoomId } from '../features/home/lastRoom';
import { NumbersStrip } from '../features/home/NumbersStrip';
import { pickUp } from '../features/home/pickUp';
import { RoomsSection } from '../features/home/RoomsSection';
import { resolveScope, scopeLabel, validScope, WORLD, type Scope, type SitePlaces } from '../features/home/scope';
import { WorkspaceBar } from '../features/home/WorkspaceBar';
import '../features/home/home.css';
import '../features/home/home-bar.css';
import { useLangStore, useT } from '../i18n';
import { useWorkspaceStore } from '../store/workspaceStore';
import { SERVER_MODE } from '../sync/serverMode';
import { useRoomEditsStore } from '../sync/roomEdits';
import { useDocumentTitle } from '../ui/useDocumentTitle';

/**
 * Home: the workspace bar, the globe of every site, and under it the numbers and the rooms of whatever the globe has
 * in scope, narrowed by the title block's search and the room chips. All three follow one view kept in the address.
 */
export function Home() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const navigate = useNavigate();
  const m = useT();
  const lang = useLangStore((s) => s.lang);
  const can = useCan();
  const me = useAuthStore((s) => s.user?.id ?? null);
  const edits = useRoomEditsStore((s) => s.byRoom);
  useDocumentTitle(null);
  useHomeViewUrl();
  const q = useHomeView((s) => s.q);
  const filter = useHomeView((s) => s.filter);
  const enterSeq = useHomeView((s) => s.enterSeq);
  const frame = useHomeView((s) => s.frame);
  const viewScope = useHomeView((s) => s.scope);
  const setScope = useHomeView((s) => s.setScope);
  const setFilter = useHomeView((s) => s.setFilter);
  const setQ = useHomeView((s) => s.setQ);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<SitePlaces | null>(null);
  const [lastId] = useState(lastRoomId);
  const roomsHeading = useRef<HTMLHeadingElement>(null);

  const sites = useMemo(() => siteSummaries(workspace), [workspace]);
  const scope = useMemo(() => validScope(viewScope, sites), [viewScope, sites]);
  const words = useMemo(() => queryWords(q), [q]);
  const inScope = useMemo(() => resolveScope(scope, sites, places), [scope, sites, places]);
  const narrowed = useMemo(() => (inScope ? narrowSites(inScope, words) : null), [inScope, words]);
  const rooms = useMemo(() => (narrowed ? scopedRooms(narrowed) : []), [narrowed]);
  const matches = useMemo(() => (words.length > 0 ? new Set(narrowSites(sites, words).map((s) => s.site.id)) : null), [sites, words]);
  const pick = useMemo(() => pickUp(sites, lastId, SERVER_MODE ? edits : null, me), [sites, lastId, edits, me]);

  const onPlaces = useCallback((p: SitePlaces) => setPlaces(p), []);
  // Without the map nobody can say which sites a region holds: the scope opens out to everything.
  const onMapFailed = useCallback(() => {
    if (useHomeView.getState().scope.kind === 'region') useHomeView.getState().setScope(WORLD);
  }, []);

  // Enter in the search: the top room match opens; a site match is picked and flown to.
  const handledEnter = useRef(enterSeq);
  useEffect(() => {
    if (enterSeq === handledEnter.current) return;
    handledEnter.current = enterSeq;
    const top = topMatch(inScope ?? [], words) ?? topMatch(sites, words);
    if (!top) return;
    if (top.kind === 'room') {
      void navigate(`/rooms/${top.room.room.id}/plan`);
      return;
    }
    setScope({ kind: 'site', id: top.site.site.id });
    if (top.site.location) useHomeView.getState().flyTo({ kind: 'site', id: top.site.site.id });
  }, [enterSeq, inScope, sites, words, navigate, setScope]);

  if (sites.length === 0 && liveCounts(workspace).projects === 0) {
    return (
      <section className="home glass">
        <h1>{m.shell.homeTitle(false)}</h1>
        <p>{m.shell.homeBody(false)}</p>
      </section>
    );
  }

  const label = scopeLabel(scope, sites, places, m, lang);
  const scopeSite = scope.kind === 'site' ? (sites.find((s) => s.site.id === scope.id) ?? null) : null;
  const addRoom = (siteId: string): void => {
    const id = newId();
    const problem = dispatch({ type: 'room/create', siteId, id, floorAreaId: newId(), name: m.tree.newRoom });
    setError(problem?.message ?? null);
    if (!problem) void navigate(`/rooms/${id}/plan`);
  };
  // Closing the card steps up to the site's province, else its country, else everything.
  const closeCard = (): void => {
    const place = scopeSite ? places?.get(scopeSite.site.id) : undefined;
    const up: Scope = place?.province?.code ? { kind: 'region', level: 'province', code: place.province.code } : place?.country?.code ? { kind: 'region', level: 'country', code: place.country.code } : WORLD;
    setScope(up);
  };
  const showAttention = (): void => {
    setFilter('attention');
    roomsHeading.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    roomsHeading.current?.focus({ preventScroll: true });
  };

  return (
    <div className="home-page">
      <WorkspaceBar projects={liveCounts(workspace).projects} sites={sites.length} rooms={sites.reduce((n, s) => n + s.rooms.length, 0)} pick={pick} />
      {sites.length > 0 ? (
        <GlobeHero sites={sites} lastRoomId={lastId} scope={scope} onScope={setScope} onCloseCard={closeCard} matches={matches} frame={frame} onPlaces={onPlaces} onMapFailed={onMapFailed} />
      ) : null}
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
      {sites.length > 0 ? (
        <>
          <NumbersStrip label={label} isSite={scope.kind === 'site'} isWorld={scope.kind === 'world'} query={q} numbers={narrowed ? homeNumbers(narrowed) : null} onAttention={showAttention} />
          <RoomsSection
            ref={roomsHeading}
            scopeLabel={scope.kind === 'world' ? null : label}
            query={q}
            filter={filter}
            counts={filterCounts(rooms)}
            rooms={filterRooms(rooms, filter)}
            inScope={inScope ? scopedRooms(inScope).length : null}
            lastRoomId={lastId}
            newRoomSite={scopeSite && can.edit ? { name: scopeSite.site.name, add: () => addRoom(scopeSite.site.id) } : null}
            onFilter={setFilter}
            onShowAll={() => setScope(WORLD)}
            onClear={() => {
              setQ('');
              setFilter('all');
            }}
          />
        </>
      ) : null}
    </div>
  );
}
