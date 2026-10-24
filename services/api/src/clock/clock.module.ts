import { Global, Module } from '@nestjs/common';
import { APP_CLOCK, systemClock } from './clock';

// backend/w7-contest (B-091). Global so FeedModule (engagement hooks), ContestModule (entries,
// votes, lifecycle) and any later module can inject the same clock without importing this module
// by hand. e2e specs `.overrideProvider(APP_CLOCK)` to drive time.
@Global()
@Module({
  providers: [{ provide: APP_CLOCK, useValue: systemClock }],
  exports: [APP_CLOCK],
})
export class ClockModule {}
