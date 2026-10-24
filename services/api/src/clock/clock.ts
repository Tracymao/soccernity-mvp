// backend/w7-contest (B-091). A tiny injectable clock.
//
// The Contest is driven entirely by the Europe/London calendar (docs/contest-spec.md section 5),
// so every rule that depends on "now" -- entry windows, the vote lock, the reveal gate, the
// engagement counting windows -- must be testable at an exact second. Services read time through
// this token instead of `new Date()`, and the e2e suites override it with a mutable fake so a
// whole contest month can be driven against real Postgres without waiting.
//
// Consumers inject it with @Optional(): a unit test that builds the service by hand, or a module
// that does not import ClockModule, silently falls back to the system clock (systemClock).

export interface Clock {
  now(): Date;
}

export const APP_CLOCK = 'APP_CLOCK';

export const systemClock: Clock = {
  now: () => new Date(),
};
