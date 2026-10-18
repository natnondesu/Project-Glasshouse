import { useT } from '../../i18n';
import { LABEL_ROOM_PX } from './labels';
import type { Marker, MapSite } from './markers';

interface MapMarkersProps {
  markers: Marker[];
  selectedId: string | null;
  width: number;
  /** Sites a search keeps: the others fade, and counts say how many of theirs match. Null when nobody is searching. */
  matches: ReadonlySet<string> | null;
  /** The selected pin's soft expanding ring; off under reduced motion, where the ring and bold name carry it alone. */
  pulse: boolean;
  onSite: (site: MapSite) => void;
  onCluster: (marker: Extract<Marker, { kind: 'cluster' }>) => void;
}

/**
 * The pins and counts over the drawing: real buttons in reading order, so Tab reaches every site. Selected is a ring
 * and a bold name, never colour alone; "pressed" means the selected site is here, for a pin or a count alike.
 */
export function MapMarkers({ markers, selectedId, width, matches, pulse, onSite, onCluster }: MapMarkersProps) {
  const m = useT();
  if (markers.length === 0) return null;
  return (
    <ul className="globe-markers" aria-label={m.globe.sitesHere(markers.reduce((n, mk) => n + (mk.kind === 'site' ? 1 : mk.sites.length), 0))}>
      {[...markers]
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((marker) => {
          const flip = marker.x > width - LABEL_ROOM_PX;
          const style = { transform: `translate(${marker.x}px, ${marker.y}px)` };
          if (marker.kind === 'site') {
            const { site } = marker;
            const selected = site.id === selectedId;
            const dim = matches !== null && !matches.has(site.id);
            return (
              <li key={marker.key} className={`globe-marker globe-marker--site${selected ? ' is-selected' : ''}${flip ? ' is-flipped' : ''}${dim ? ' is-dim' : ''}`} style={style}>
                {selected && pulse ? <span className="globe-marker__pulse" aria-hidden="true" /> : null}
                <button type="button" className="globe-marker__pin" data-site-id={site.id} aria-pressed={selected} aria-label={m.globe.siteMarker(site.name, site.project, site.rooms)} onClick={() => onSite(site)}>
                  <span className="globe-marker__dot" />
                </button>
                <span className="globe-marker__label" aria-hidden="true">
                  <span className="globe-marker__name">{site.name}</span>
                  <span className="globe-marker__sub mono">{m.globe.rooms(site.rooms)}</span>
                </span>
              </li>
            );
          }
          const selected = marker.sites.some((s) => s.id === selectedId);
          const matching = matches === null ? marker.sites.length : marker.sites.filter((s) => matches.has(s.id)).length;
          // A count with no match fades and keeps its total; one with matches shows how many match.
          const dim = matches !== null && matching === 0;
          return (
            <li key={marker.key} className={`globe-marker globe-marker--cluster${selected ? ' is-selected' : ''}${flip ? ' is-flipped' : ''}${dim ? ' is-dim' : ''}`} style={style}>
              <button
                type="button"
                className="globe-marker__count mono"
                aria-pressed={selected}
                aria-label={matches === null ? m.globe.cluster(marker.place, marker.sites.length) : m.globe.clusterMatching(marker.place, matching, marker.sites.length)}
                onClick={() => onCluster(marker)}
              >
                {dim ? marker.sites.length : matching}
              </button>
              {marker.place ? (
                <span className="globe-marker__label" aria-hidden="true">
                  <span className="globe-marker__name">{marker.place}</span>
                  <span className="globe-marker__sub mono">{matches === null ? m.globe.sitesHere(marker.sites.length) : m.globe.matchingOf(matching, marker.sites.length)}</span>
                </span>
              ) : null}
            </li>
          );
        })}
    </ul>
  );
}
