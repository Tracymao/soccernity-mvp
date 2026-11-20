import { ConfigService } from '@nestjs/config';
import { DEFAULT_POINTS_CAPS, PointsConfig } from './points-config.service';

function config(env: Record<string, string | undefined>): PointsConfig {
  return new PointsConfig(new ConfigService(env as never));
}

describe('PointsConfig: the daily caps are configuration, not constants (spec 9b)', () => {
  it('defaults to 40 points given and 20 received (in quarter units)', () => {
    expect(config({}).caps).toEqual({ givenQuarters: 160, receivedQuarters: 80 });
    expect(DEFAULT_POINTS_CAPS).toEqual({ givenQuarters: 160, receivedQuarters: 80 });
  });

  it('reads both caps from POINTS_DAILY_CAP_GIVEN / POINTS_DAILY_CAP_RECEIVED, in whole points', () => {
    expect(config({ POINTS_DAILY_CAP_GIVEN: '50', POINTS_DAILY_CAP_RECEIVED: '10' }).caps).toEqual({
      givenQuarters: 200,
      receivedQuarters: 40,
    });
  });

  it.each(['', '  ', 'abc', '0', '-5', '2.5', '1e3', 'NaN'])(
    'a bad value (%j) falls back to the default instead of switching the cap off',
    (bad) => {
      expect(config({ POINTS_DAILY_CAP_GIVEN: bad, POINTS_DAILY_CAP_RECEIVED: bad }).caps).toEqual(DEFAULT_POINTS_CAPS);
    },
  );

  it('one valid and one bad value are handled independently', () => {
    expect(config({ POINTS_DAILY_CAP_GIVEN: '60', POINTS_DAILY_CAP_RECEIVED: 'x' }).caps).toEqual({
      givenQuarters: 240,
      receivedQuarters: 80,
    });
  });
});
