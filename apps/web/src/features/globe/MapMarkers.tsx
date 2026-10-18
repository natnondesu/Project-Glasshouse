import { useT } from '../../i18n';
import type { Marker, MapSite } from './markers';

interface MapMarkersProps {
  markers: Marker[];
  selectedId: string | null;
  width: number;
  onSite: (site: MapSite) => void;
  onCluster: (marker: Extract<Marker, { kind: 'cluster' }>) => void;
}

/** Room for a name to the right of a pin before it flips to the left. */
const LABEL_ROOM_PX = 190;

/**
 * The pins and counts over the drawing: real buttons in reading order, so Tab reaches every site. Selected is a ring
 * and a bold name, never colour alone; "pressed" means the selected site is here, for a pin or a count alike.
 */
export function MapMarkers({ markers, selectedId, width, onSite, onCluster }: MapMarkersProps) {
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
            return (
              <li key={marker.key} className={`globe-marker globe-marker--site${selected ? ' is-selected' : ''}${flip ? ' is-flipped' : ''}`} style={style}>
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
          return (
            <li key={marker.key} className={`globe-marker globe-marker--cluster${selected ? ' is-selected' : ''}${flip ? ' is-flipped' : ''}`} style={style}>
              <button type="button" className="globe-marker__count mono" aria-pressed={selected} aria-label={m.globe.cluster(marker.place, marker.sites.length)} onClick={() => onCluster(marker)}>
                {marker.sites.length}
              </button>
              {marker.place ? (
                <span className="globe-marker__label" aria-hidden="true">
                  <span className="globe-marker__name">{marker.place}</span>
                  <span className="globe-marker__sub mono">{m.globe.sitesHere(marker.sites.length)}</span>
                </span>
              ) : null}
            </li>
          );
        })}
    </ul>
  );
}
