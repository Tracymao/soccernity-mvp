import { isMediaUploadsEnabled } from './media-uploads.switch';

// backend/b306-media-uploads-switch (B-306; Decision Log #501). The whole default table, in one place.
describe('isMediaUploadsEnabled', () => {
  describe('NODE_ENV=production (Render sets it on staging too): off unless exactly "true"', () => {
    it.each([
      ['true', true],
      [undefined, false],
      ['', false],
      ['false', false],
      ['TRUE', false],
      ['True', false],
      ['1', false],
      ['yes', false],
      [' true', false],
      ['true ', false],
    ])('value %j -> %s', (value, expected) => {
      expect(isMediaUploadsEnabled(value, 'production')).toBe(expected);
    });
  });

  describe('any other NODE_ENV: on unless exactly "false"', () => {
    it.each(['development', 'test', 'staging', '', undefined])('NODE_ENV %j', (nodeEnv) => {
      expect(isMediaUploadsEnabled(undefined, nodeEnv)).toBe(true);
      expect(isMediaUploadsEnabled('', nodeEnv)).toBe(true);
      expect(isMediaUploadsEnabled('true', nodeEnv)).toBe(true);
      expect(isMediaUploadsEnabled('false', nodeEnv)).toBe(false);
      // Only the exact text "false" turns it off; a typo leaves it on.
      expect(isMediaUploadsEnabled('FALSE', nodeEnv)).toBe(true);
      expect(isMediaUploadsEnabled('0', nodeEnv)).toBe(true);
      expect(isMediaUploadsEnabled('no', nodeEnv)).toBe(true);
    });
  });

  it('NODE_ENV is compared exactly: "Production" is not production', () => {
    expect(isMediaUploadsEnabled(undefined, 'Production')).toBe(true);
  });
});
