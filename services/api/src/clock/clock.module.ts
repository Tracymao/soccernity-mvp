import { Global, Logger, Module } from '@nestjs/common';
import { APP_CLOCK, buildAppClock, isTestClockEnabled, systemClock } from './clock';

// backend/w7-contest (B-091). Global so FeedModule (engagement hooks), ContestModule (entries,
// votes, lifecycle) and any later module can inject the same clock without importing this module
// by hand. e2e specs `.overrideProvider(APP_CLOCK)` to drive time.
//
// backend/test-clock-qa: the provider is built from the environment so a QA run can start the real
// API at a chosen instant (TEST_CLOCK_ISO). With nothing set it is exactly the system clock.
@Global()
@Module({
  providers: [
    {
      provide: APP_CLOCK,
      useFactory: () => {
        const clock = buildAppClock(process.env);
        if (clock !== systemClock && isTestClockEnabled(process.env)) {
          new Logger('ClockModule').warn(
            `TEST CLOCK ACTIVE: the app believes it is ${clock.now().toISOString()}` +
              (process.env.TEST_CLOCK_ADVANCE?.trim() === '1' ? ' (advancing in real time)' : ' (frozen)') +
              '. Never use this outside QA.',
          );
        }
        return clock;
      },
    },
  ],
  exports: [APP_CLOCK],
})
export class ClockModule {}
