import type { PlanContent } from '../model/types';
import { loadA } from '../feeds';
import { NOMINAL_VOLTAGE_V, panelOf, rackCurrentA } from '../sources';
import type { Issue } from './types';

/**
 * Feed wiring checks. Each feed is sized for the rack's full known demand, so an A/B pair still
 * holds if one side fails; a feed into another source carries every rack downstream of it. Warnings only: they never block approval.
 */
export function feedIssues(content: PlanContent): Issue[] {
  return content.feeds.flatMap((feed): Issue[] => {
    const target = content.objects.find((o) => o.id === feed.targetId);
    const source = content.objects.find((o) => o.id === feed.sourceId);
    if (!target || !source || source.type !== 'mcb') return [];
    if (feed.way === undefined) {
      return [
        {
          key: `feed_no_way:${feed.id}`,
          code: 'feed_no_way',
          severity: 'warn',
          message: `${feed.label} of ${target.name} isn't assigned to a way on ${source.name}.`,
          hint: `Open ${source.name}'s ways and pick the breaker this feed is wired to.`,
          targets: [target.id, source.id],
        },
      ];
    }
    const way = panelOf(source).ways[feed.way - 1];
    if (!way) return [];
    // A feed into another source carries everything downstream of it.
    const amps = target.type === 'rack' ? rackCurrentA(target) : loadA(content, target.id);
    if (amps <= way.ratingA) return [];
    return [
      {
        key: `feed_overload:${feed.id}`,
        code: 'feed_overload',
        severity: 'warn',
        message: `${feed.label} of ${target.name} needs ${amps.toFixed(1)} A at ${NOMINAL_VOLTAGE_V} V, but ${source.name} way ${feed.way} is rated ${way.ratingA} A.`,
        hint: 'Use a higher-rated way, split the load across more feeds, or check the demand figures.',
        targets: [target.id, source.id],
      },
    ];
  });
}
