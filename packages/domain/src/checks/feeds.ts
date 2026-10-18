import type { PlanContent, PowerFeed, RoomObject } from '../model/types';
import { loadA } from '../feeds';
import { isInUse, NOMINAL_VOLTAGE_V, panelOf, rackCurrentA, wayPhase } from '../sources';
import type { Issue } from './types';

/**
 * Feed wiring checks. Each feed is sized for the rack's full known demand, so an A/B pair still
 * holds if one side fails; a feed into another source carries every rack downstream of it. Wiring to a panel that is not in use blocks approval; the rest are warnings.
 * A panel not in use is wired to nothing that counts, so its feeds get no way or rating checks.
 */
export function feedIssues(content: PlanContent): Issue[] {
  return [...content.feeds.flatMap((feed) => wayIssues(content, feed)), ...mainIssues(content)];
}

const amperesOf = (content: PlanContent, feed: PowerFeed): number => {
  const target = content.objects.find((o) => o.id === feed.targetId);
  // A feed into another source carries everything downstream of it.
  return !target ? 0 : target.type === 'rack' ? rackCurrentA(target) : loadA(content, target.id);
};

/** The busiest phase of a three-phase panel (or the whole of a single-phase one): where the main breaker is tested. */
function busiestPhase(content: PlanContent, panel: RoomObject): { phase: string; amps: number } {
  const config = panelOf(panel);
  const byPhase = new Map<string, number>();
  for (const feed of content.feeds.filter((f) => f.sourceId === panel.id)) {
    // A feed with no way can't be placed on a phase of a three-phase panel.
    if (config.phase === 'three' && feed.way === undefined) continue;
    const phase = config.phase === 'three' ? wayPhase(config, feed.way!) : '';
    byPhase.set(phase, (byPhase.get(phase) ?? 0) + amperesOf(content, feed));
  }
  return [...byPhase.entries()].map(([phase, amps]) => ({ phase, amps })).sort((a, b) => b.amps - a.amps || (a.phase < b.phase ? -1 : 1))[0] ?? { phase: '', amps: 0 };
}

function mainIssues(content: PlanContent): Issue[] {
  return content.objects.flatMap((panel): Issue[] => {
    const rating = panel.type === 'mcb' ? panel.panel?.mainRatingA : undefined;
    if (rating === undefined || !isInUse(panel)) return [];
    const { phase, amps } = busiestPhase(content, panel);
    if (amps <= rating) return [];
    return [
      {
        key: `panel_main_overload:${panel.id}`,
        code: 'panel_main_overload',
        severity: 'warn',
        message: `${panel.name}'s main breaker is rated ${rating} A, but ${phase ? `phase ${phase}` : 'the panel'} carries ${amps.toFixed(1)} A.`,
        params: { source: panel.name, rating, phase, amps: amps.toFixed(1) },
        hint: 'Use a higher-rated main breaker, move feeds to another panel, or check the demand figures.',
        targets: [panel.id],
      },
    ];
  });
}

function wayIssues(content: PlanContent, feed: PowerFeed): Issue[] {
  const target = content.objects.find((o) => o.id === feed.targetId);
  const source = content.objects.find((o) => o.id === feed.sourceId);
  if (!target || !source || source.type !== 'mcb') return [];
  if (!isInUse(source)) {
    return [
      {
        key: `feed_inactive_panel:${feed.id}`,
        code: 'feed_inactive_panel',
        severity: 'block',
        message: `${feed.label} of ${target.name} is wired to ${source.name}, which is marked not in use.`,
        params: { feed: feed.label, target: target.name, source: source.name },
        hint: `Move the feed to a panel in use, or mark ${source.name} in use.`,
        targets: [target.id, source.id],
      },
    ];
  }
  if (feed.way === undefined) {
    return [
      {
        key: `feed_no_way:${feed.id}`,
        code: 'feed_no_way',
        severity: 'warn',
        message: `${feed.label} of ${target.name} isn't assigned to a way on ${source.name}.`,
        params: { feed: feed.label, target: target.name, source: source.name },
        hint: `Open ${source.name}'s ways and pick the breaker this feed is wired to.`,
        targets: [target.id, source.id],
      },
    ];
  }
  const way = panelOf(source).ways[feed.way - 1];
  if (!way) return [];
  const amps = amperesOf(content, feed);
  if (amps <= way.ratingA) return [];
  return [
    {
      key: `feed_overload:${feed.id}`,
      code: 'feed_overload',
      severity: 'warn',
      message: `${feed.label} of ${target.name} needs ${amps.toFixed(1)} A at ${NOMINAL_VOLTAGE_V} V, but ${source.name} way ${feed.way} is rated ${way.ratingA} A.`,
      params: { feed: feed.label, target: target.name, amps: amps.toFixed(1), volts: NOMINAL_VOLTAGE_V, source: source.name, way: feed.way, rating: way.ratingA },
      hint: 'Use a higher-rated way, split the load across more feeds, or check the demand figures.',
      targets: [target.id, source.id],
    },
  ];
}
