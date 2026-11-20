import { IsInt, Min } from 'class-validator';

// POST /fixtures/:id/result (Build Plan Section 4.5). Result Section 3
// fields a caller supplies: scoreA, scoreB. `enteredById` is taken from
// the access token. `fixtureId` comes from the URL. `enteredAt` is
// @default(now()).
//
// Result is the final score only — no half-time, goalscorers, cards or
// events (Section 3 has no such fields; not added speculatively). Won /
// Drew / Lost is derived client-side from scoreA/scoreB, not stored.
//
// "First submission is final": once a Result row exists for a fixture,
// POST /fixtures/:id/result returns 409 and never overwrites it. There is
// no amend/dispute path in MVP — the Figma warns before the irreversible
// save rather than offering a post-hoc edit. Correction/dispute is a
// parked founder candidate — see grassroots/README.md and Decision Log
// #255.
export class LogResultDto {
  @IsInt()
  @Min(0)
  scoreA!: number;

  @IsInt()
  @Min(0)
  scoreB!: number;
}
