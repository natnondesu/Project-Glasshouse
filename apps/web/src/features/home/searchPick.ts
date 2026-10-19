import type { SiteSummary } from '../globe/sites';
import { useHomeView } from './homeView';
import { WORLD } from './scope';
import type { SearchOption, SearchResults } from './searchResults';

export interface PickContext {
  /** Takes the reader to the rooms under the globe. */
  showRooms: () => void;
}

function goSite(site: SiteSummary): void {
  const view = useHomeView.getState();
  view.setScope({ kind: 'site', id: site.site.id });
  if (site.location) view.flyTo({ kind: 'site', id: site.site.id });
}

/** Scopes to the sites and fits the placed ones. */
function goSites(ids: string[], results: SearchResults): void {
  const view = useHomeView.getState();
  const unique = [...new Set(ids)];
  view.setScope({ kind: 'sites', ids: unique });
  // Every site a pick can widen to is one the search keeps, so the placed ones are among its map matches.
  const onMap = unique.filter((id) => results.onMap.includes(id));
  if (onMap.length > 0) view.flyTo({ kind: 'points', ids: onMap });
}

/**
 * What a pick in the search dropdown does. A site, a room or a project shows on the globe (a room in its site's card);
 * "Show all" widens to everything the group found; the map option fits the matches. Opening a room is the row's Open.
 */
export function pickOption(option: SearchOption, results: SearchResults, ctx: PickContext): void {
  const view = useHomeView.getState();
  switch (option.kind) {
    case 'site':
      goSite(option.site);
      return;
    case 'room': {
      const { room } = option;
      view.setScope({ kind: 'site', id: room.site.id });
      view.showRoom(room.site.id, room.room.id);
      if (room.site.location) view.flyTo({ kind: 'site', id: room.site.id });
      return;
    }
    case 'project':
      goSites(option.project.siteIds, results);
      return;
    case 'more':
      if (option.group === 'sites') goSites(results.sites.all.map((s) => s.site.id), results);
      else if (option.group === 'projects') goSites(results.projects.all.flatMap((p) => p.siteIds), results);
      else {
        view.setScope(WORLD);
        view.setFilter('all');
        ctx.showRooms();
      }
      return;
    case 'map':
      view.flyTo({ kind: 'points', ids: option.ids });
      return;
  }
}
