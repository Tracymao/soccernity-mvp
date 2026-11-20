import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { DEFAULT_GEOLITE2_DB_PATH, GeoIpService, normalizeIp } from './geoip.service';

const mockOpen = jest.fn();
jest.mock('maxmind', () => ({
  open: (...args: unknown[]) => mockOpen(...args),
  // The real validate() accepts IPv4/IPv6 literals; a minimal stand-in is enough here.
  validate: (ip: string) => /^[0-9a-fA-F:.]+$/.test(ip) && (ip.includes('.') || ip.includes(':')),
}));

function build(env: Record<string, string | undefined> = {}) {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new GeoIpService(config);
}

function readerReturning(record: unknown) {
  return { get: jest.fn().mockReturnValue(record) };
}

describe('GeoIpService (B-024)', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    mockOpen.mockReset();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('resolves the country code from the local database', async () => {
    mockOpen.mockResolvedValue(readerReturning({ country: { iso_code: 'US' } }));
    const svc = build();
    await svc.onModuleInit();
    await expect(svc.lookupCountry('8.8.8.8')).resolves.toEqual({
      resolved: true,
      countryCode: 'US',
      method: 'geolite2_local',
    });
  });

  it('upper-cases the code and strips an IPv4-mapped IPv6 prefix before the lookup', async () => {
    const reader = readerReturning({ country: { iso_code: 'ng' } });
    mockOpen.mockResolvedValue(reader);
    const svc = build();
    await svc.onModuleInit();
    const r = await svc.lookupCountry('::ffff:41.58.0.1');
    expect(reader.get).toHaveBeenCalledWith('41.58.0.1');
    expect(r).toMatchObject({ resolved: true, countryCode: 'NG' });
  });

  it('does not fall back to registered_country (where an ISP registered the block is not where the user is)', async () => {
    mockOpen.mockResolvedValue(readerReturning({ registered_country: { iso_code: 'US' } }));
    const svc = build();
    await svc.onModuleInit();
    await expect(svc.lookupCountry('8.8.8.8')).resolves.toMatchObject({ resolved: false, reason: 'not_found' });
  });

  it.each([
    ['no record (private / unknown address)', null],
    ['a record with no country', {}],
    ['a malformed code', { country: { iso_code: 'USA' } }],
  ])('an address with %s is unresolved, not an error', async (_l, record) => {
    mockOpen.mockResolvedValue(readerReturning(record));
    const svc = build();
    await svc.onModuleInit();
    await expect(svc.lookupCountry('10.0.0.1')).resolves.toMatchObject({
      resolved: false,
      method: 'unresolved',
      reason: 'not_found',
    });
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['blank', '  '],
  ])('%s IP -> unresolved (no_ip) without touching the database', async (_l, ip) => {
    mockOpen.mockResolvedValue(readerReturning({ country: { iso_code: 'US' } }));
    const svc = build();
    await svc.onModuleInit();
    await expect(svc.lookupCountry(ip as string | null | undefined)).resolves.toMatchObject({
      resolved: false,
      reason: 'no_ip',
    });
  });

  it('a non-IP string -> unresolved (invalid_ip)', async () => {
    mockOpen.mockResolvedValue(readerReturning({ country: { iso_code: 'US' } }));
    const svc = build();
    await svc.onModuleInit();
    await expect(svc.lookupCountry('not-an-ip')).resolves.toMatchObject({ resolved: false, reason: 'invalid_ip' });
  });

  describe('fail-safe when the database is missing', () => {
    it('boots (does not throw), warns, and every lookup is unresolved', async () => {
      mockOpen.mockRejectedValue(new Error('ENOENT: no such file'));
      const svc = build();
      await expect(svc.onModuleInit()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
      await expect(svc.lookupCountry('8.8.8.8')).resolves.toEqual({
        resolved: false,
        method: 'unresolved',
        reason: 'database_unavailable',
      });
    });

    it('retries opening a database that appears later, but not more than once a minute', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-16T10:00:00Z'));
      try {
        mockOpen.mockRejectedValueOnce(new Error('ENOENT'));
        const svc = build();
        await svc.onModuleInit(); // boot attempt fails
        expect(mockOpen).toHaveBeenCalledTimes(1);

        // Within the minute: no new open attempt.
        await svc.lookupCountry('8.8.8.8');
        expect(mockOpen).toHaveBeenCalledTimes(1);

        // After the minute the file has appeared; the lookup recovers.
        jest.setSystemTime(new Date('2026-10-16T10:01:30Z'));
        mockOpen.mockResolvedValueOnce(readerReturning({ country: { iso_code: 'GB' } }));
        await expect(svc.lookupCountry('8.8.8.8')).resolves.toMatchObject({ resolved: true, countryCode: 'GB' });
        expect(mockOpen).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it('never throws when the reader throws mid-lookup, and logs without the IP', async () => {
    const ip = '203.0.113.50';
    mockOpen.mockResolvedValue({
      get: () => {
        throw new Error('corrupt database');
      },
    });
    const svc = build();
    await svc.onModuleInit();
    await expect(svc.lookupCountry(ip)).resolves.toMatchObject({ resolved: false, reason: 'lookup_error' });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(ip);
  });

  it('the result never carries the IP', async () => {
    const ip = '203.0.113.51';
    mockOpen.mockResolvedValue(readerReturning({ country: { iso_code: 'US' } }));
    const svc = build();
    await svc.onModuleInit();
    expect(JSON.stringify(await svc.lookupCountry(ip))).not.toContain(ip);
  });

  it('opens GEOLITE2_DB_PATH when set, else the default location, with update-watching on', async () => {
    mockOpen.mockResolvedValue(readerReturning(null));
    const custom = build({ GEOLITE2_DB_PATH: '/data/GeoLite2-Country.mmdb' });
    await custom.onModuleInit();
    expect(mockOpen).toHaveBeenLastCalledWith(
      path.resolve('/data/GeoLite2-Country.mmdb'),
      expect.objectContaining({ watchForUpdatesNonPersistent: true }),
    );

    await build().onModuleInit();
    expect(mockOpen).toHaveBeenLastCalledWith(DEFAULT_GEOLITE2_DB_PATH, expect.anything());
    expect(DEFAULT_GEOLITE2_DB_PATH.replace(/\\/g, '/')).toMatch(/services\/api\/geoip\/GeoLite2-Country\.mmdb$/);
  });

  describe('normalizeIp', () => {
    it.each([
      ['::ffff:1.2.3.4', '1.2.3.4'],
      ['::FFFF:1.2.3.4', '1.2.3.4'],
      ['  8.8.8.8 ', '8.8.8.8'],
      ['2001:db8::1', '2001:db8::1'],
      ['', null],
      [undefined, null],
    ])('%p -> %p', (input, expected) => {
      expect(normalizeIp(input as string | undefined)).toBe(expected);
    });
  });
});
