import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { CountryResponse, open, Reader, validate } from 'maxmind';

// B-024 (Decision Log #368). Country is derived from the request IP using a
// LOCAL MaxMind GeoLite2-Country database: no third party ever sees the IP.
//
// THE IP IS TRANSIENT. It enters lookupCountry() as a parameter, is used for
// one in-memory lookup and is dropped. This class never stores, caches or
// logs an IP (log lines carry only the failure reason), and its result type
// has no field that could carry one.
//
// FAIL-SAFE: every failure mode (no database file, unreadable file, no usable
// IP, private/unknown address, library error) resolves to
// `{ resolved: false }` and NEVER throws. Callers treat an unresolved lookup as
// "apply the stronger control" (see card-verification-policy.util.ts), so a
// missing database can only ever make the platform stricter, never looser.
//
// REFRESH: maxmind's own `watchForUpdatesNonPersistent` reloads the reader
// when the .mmdb file on disk changes, so replacing the file (a scheduled
// download, a redeploy) takes effect without a restart. If the file was absent
// at boot, a later lookup retries opening it, at most once a minute.

export const GEOIP_METHOD_RESOLVED = 'geolite2_local';
export const GEOIP_METHOD_UNRESOLVED = 'unresolved';

export type CountryLookupFailureReason =
  | 'no_ip'
  | 'invalid_ip'
  | 'database_unavailable'
  | 'not_found'
  | 'lookup_error';

export type CountryLookupResult =
  | { resolved: true; countryCode: string; method: typeof GEOIP_METHOD_RESOLVED }
  | { resolved: false; method: typeof GEOIP_METHOD_UNRESOLVED; reason: CountryLookupFailureReason };

// Default location: services/api/geoip/GeoLite2-Country.mmdb, resolved from
// __dirname (same depth from src/geoip and dist/geoip) so it does not depend
// on process.cwd() -- the same lesson CLAUDE.md records for the root .env.
export const DEFAULT_GEOLITE2_DB_PATH = path.resolve(__dirname, '..', '..', 'geoip', 'GeoLite2-Country.mmdb');

const REOPEN_RETRY_INTERVAL_MS = 60_000;

@Injectable()
export class GeoIpService implements OnModuleInit {
  private readonly logger = new Logger(GeoIpService.name);
  private reader: Reader<CountryResponse> | null = null;
  private opening: Promise<void> | null = null;
  private lastOpenAttemptAt = 0;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureReader(true);
    if (!this.reader) {
      this.logger.warn(
        'GeoLite2 country database not loaded -- every registration will be treated as an UNRESOLVED country ' +
          '(the stronger safeguarding control applies). See docs/deployment.md for how to provide the database.',
      );
    }
  }

  get databasePath(): string {
    const configured = this.config.get<string>('GEOLITE2_DB_PATH')?.trim();
    return configured ? path.resolve(configured) : DEFAULT_GEOLITE2_DB_PATH;
  }

  // Never throws. `ip` is used for this call only and is not retained.
  async lookupCountry(ip: string | undefined | null): Promise<CountryLookupResult> {
    const candidate = normalizeIp(ip);
    if (!candidate) return unresolved('no_ip');
    if (!validate(candidate)) return unresolved('invalid_ip');

    try {
      await this.ensureReader(false);
      if (!this.reader) return unresolved('database_unavailable');

      const record = this.reader.get(candidate);
      // `country` is where the address is located. `registered_country` is
      // where the ISP registered it and is deliberately NOT used as a fallback.
      const code = record?.country?.iso_code?.trim().toUpperCase();
      if (!code || !/^[A-Z]{2}$/.test(code)) return unresolved('not_found');
      return { resolved: true, countryCode: code, method: GEOIP_METHOD_RESOLVED };
    } catch (err) {
      // The message of a maxmind error never contains the address; the IP is
      // still deliberately not interpolated here.
      this.logger.warn(`GeoLite2 lookup failed: ${(err as Error).message}`);
      return unresolved('lookup_error');
    }
  }

  private async ensureReader(force: boolean): Promise<void> {
    if (this.reader) return;
    if (this.opening) return this.opening;
    const now = Date.now();
    if (!force && now - this.lastOpenAttemptAt < REOPEN_RETRY_INTERVAL_MS) return;
    this.lastOpenAttemptAt = now;

    this.opening = (async () => {
      try {
        this.reader = await open<CountryResponse>(this.databasePath, {
          watchForUpdatesNonPersistent: true,
          watchForUpdatesHook: () => this.logger.log('GeoLite2 database file changed on disk; reloaded.'),
        });
        this.logger.log('GeoLite2 country database loaded.');
      } catch (err) {
        this.reader = null;
        if (force) {
          // Log at boot only; the per-minute retry stays quiet.
          this.logger.warn(`Could not open the GeoLite2 database: ${(err as Error).message}`);
        }
      } finally {
        this.opening = null;
      }
    })();
    return this.opening;
  }
}

function unresolved(reason: CountryLookupFailureReason): CountryLookupResult {
  return { resolved: false, method: GEOIP_METHOD_UNRESOLVED, reason };
}

// Express reports IPv4 clients on a dual-stack socket as "::ffff:1.2.3.4".
export function normalizeIp(ip: string | undefined | null): string | null {
  const raw = ip?.trim();
  if (!raw) return null;
  return raw.toLowerCase().startsWith('::ffff:') ? raw.slice(7) : raw;
}
