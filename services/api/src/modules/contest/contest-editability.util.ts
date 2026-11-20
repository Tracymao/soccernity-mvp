import { ContestSchedule } from './contest-schedule.util';
import { AdminContestEditability } from './contest.types';

// backend/w7-contest (B-091, docs/contest-spec.md section 4a, Decision Log #399 E4, #402). Which
// parts of a contest an admin may still change, as a pure function of the schedule and the clock.
//
//   Before launch (before week 1 opens at 08:00 on day 1)  everything is editable except the dates.
//   Once week 1 starts, LOCKED: the title (it is not on the spec's "still editable" list), the
//     minimum tally, the placement points, and the watch limit of any week that has started.
//   Still editable after launch: the description, and the task text of weeks that have not started.
//   Week-4 settings (the followers switch, the tolerance, the per-viewer cap) belong to week 4 only
//     (#402), so they stay editable until week 4 starts (08:00 on day 22).
//   Dates are never editable: there is no field for them.
//   Nothing is editable once the month is over.
//
// "A week has started" = its opening instant (08:00) has passed. A week that opens in an hour is
// still editable now.
export function computeEditability(schedule: ContestSchedule, now: Date): AdminContestEditability {
  const t = now.getTime();
  const over = t >= schedule.final.monthEndAt.getTime();
  const beforeLaunch = t < schedule.weeks[0].opensAt.getTime();
  const week4Started = t >= schedule.final.opensAt.getTime();

  const taskByWeek: Record<number, boolean> = {};
  const watchLimitByWeek: Record<number, boolean> = {};
  for (const w of schedule.weeks) {
    const notStarted = t < w.opensAt.getTime();
    taskByWeek[w.weekNumber] = !over && notStarted;
    watchLimitByWeek[w.weekNumber] = !over && notStarted;
  }
  taskByWeek[4] = !over && !week4Started;

  return {
    beforeLaunch,
    title: beforeLaunch,
    description: !over,
    minimumTally: beforeLaunch,
    placementPoints: beforeLaunch,
    followersExcludedWeek4: !over && !week4Started,
    exposureTolerancePercent: !over && !week4Started,
    exposureViewerDailyCap: !over && !week4Started,
    taskByWeek,
    watchLimitByWeek,
  };
}
