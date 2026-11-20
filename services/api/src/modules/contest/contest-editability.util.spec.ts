import { computeEditability } from './contest-editability.util';
import { buildContestSchedule } from './contest-schedule.util';

describe('computeEditability (spec section 4a)', () => {
  const s = buildContestSchedule(2026, 6); // BST: week 1 opens 07:00Z on 1 June
  const at = (iso: string) => new Date(iso);

  it('before launch everything is editable (there is no date field to edit)', () => {
    const e = computeEditability(s, at('2026-05-20T12:00:00Z'));
    expect(e).toMatchObject({
      beforeLaunch: true,
      title: true,
      description: true,
      minimumTally: true,
      placementPoints: true,
      followersExcludedWeek4: true,
      exposureTolerancePercent: true,
      exposureViewerDailyCap: true,
    });
    expect(e.taskByWeek).toEqual({ 1: true, 2: true, 3: true, 4: true });
    expect(e.watchLimitByWeek).toEqual({ 1: true, 2: true, 3: true });
  });

  it('the instant week 1 opens, the launch locks the title, minimum tally, placement points and week 1 limit', () => {
    const justBefore = computeEditability(s, new Date(s.weeks[0].opensAt.getTime() - 1));
    expect(justBefore.minimumTally).toBe(true);
    const e = computeEditability(s, s.weeks[0].opensAt);
    expect(e).toMatchObject({ beforeLaunch: false, title: false, minimumTally: false, placementPoints: false });
    expect(e.watchLimitByWeek[1]).toBe(false);
    expect(e.taskByWeek[1]).toBe(false);
  });

  it('after launch the description and the task text of weeks that have not started stay editable', () => {
    const e = computeEditability(s, at('2026-06-03T12:00:00Z')); // week 1 running
    expect(e.description).toBe(true);
    expect(e.taskByWeek).toEqual({ 1: false, 2: true, 3: true, 4: true });
    expect(e.watchLimitByWeek).toEqual({ 1: false, 2: true, 3: true });
  });

  it('the watch limit and task of a week lock when THAT week opens, one by one', () => {
    expect(computeEditability(s, new Date(s.weeks[1].opensAt.getTime() - 1)).taskByWeek[2]).toBe(true);
    expect(computeEditability(s, s.weeks[1].opensAt).taskByWeek[2]).toBe(false);
    expect(computeEditability(s, s.weeks[1].opensAt).watchLimitByWeek[2]).toBe(false);
    expect(computeEditability(s, s.weeks[1].opensAt).taskByWeek[3]).toBe(true);
  });

  it('the week-4 settings stay editable through weeks 1-3 and lock when week 4 starts (Decision Log #402)', () => {
    const during = computeEditability(s, at('2026-06-20T12:00:00Z'));
    expect(during).toMatchObject({
      followersExcludedWeek4: true,
      exposureTolerancePercent: true,
      exposureViewerDailyCap: true,
    });
    const locked = computeEditability(s, s.final.opensAt);
    expect(locked).toMatchObject({
      followersExcludedWeek4: false,
      exposureTolerancePercent: false,
      exposureViewerDailyCap: false,
    });
    expect(locked.taskByWeek[4]).toBe(false);
  });

  it('nothing is editable once the month is over', () => {
    const e = computeEditability(s, s.final.monthEndAt);
    expect(e).toMatchObject({ description: false, followersExcludedWeek4: false });
    expect(Object.values(e.taskByWeek).every((v) => v === false)).toBe(true);
    expect(Object.values(e.watchLimitByWeek).every((v) => v === false)).toBe(true);
  });
});
