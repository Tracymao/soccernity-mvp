import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ListHighlightsParams,
  ListMatchesParams,
  RawHighlight,
  RawHighlightsPage,
  RawLineups,
  RawMatch,
  RawMatchEvent,
  RawMatchesPage,
  RawStandingsGroup,
  RawTeamStatistics,
  SportsDataClient,
  SportsDataNotFoundError,
} from './sports-data-client';
import { SportsDataBudgetService } from './sports-data-budget.service';
import { SportsDataUpstreamError } from './sports-data.errors';

const DEFAULT_BASE_URL = 'https://soccer.highlightly.net';
const REQUEST_TIMEOUT_MS = 10_000;

// The real SportsDataClient implementation — configured ENTIRELY through env vars
// (SPORTS_DATA_API_KEY / SPORTS_DATA_BASE_URL / SPORTS_DATA_RAPIDAPI_HOST), mirroring
// S3StorageService's own "wired but inactive until real credentials exist" discipline
// (src/storage/s3-storage.service.ts). Uses the runtime's own built-in `fetch` (Node >=18, and this
// project's engines floor is >=22.22.0 — see package.json) rather than adding an HTTP client
// dependency; see tsconfig.json's own comment for why "DOM" was added to `lib` purely for fetch's
// TYPE declarations, not any browser behavior.
//
// AUTH HEADER: the docs page (https://highlightly.net/football-api/documentation/) states
// `x-rapidapi-key` as the required auth header for "your Highlightly or RapidAPI API Key" —
// i.e. the SAME header name is used whether the key came from a direct Highlightly account or a
// RapidAPI subscription. `x-rapidapi-host` is documented as required ONLY when actually calling
// through RapidAPI's own gateway host — so it's sent here ONLY when SPORTS_DATA_RAPIDAPI_HOST is
// explicitly set (i.e. SPORTS_DATA_BASE_URL is pointed at RapidAPI's host, not
// soccer.highlightly.net directly). This exact header behavior for the DIRECT highlightly.net host
// specifically was not spelled out in an isolated code example on the docs page — flagged as a real,
// disclosed uncertainty in modules/sports/README.md, to be confirmed the moment a real account
// exists and a live call can be traced.
@Injectable()
export class HighlightlyClient extends SportsDataClient {
  private readonly logger = new Logger(HighlightlyClient.name);
  private readonly isConfigured: boolean;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly rapidApiHost?: string;

  constructor(
    config: ConfigService,
    private readonly budget: SportsDataBudgetService,
  ) {
    super();

    const apiKey = config.get<string>('SPORTS_DATA_API_KEY')?.trim();
    this.baseUrl = (config.get<string>('SPORTS_DATA_BASE_URL')?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.rapidApiHost = config.get<string>('SPORTS_DATA_RAPIDAPI_HOST')?.trim() || undefined;

    // Same "placeholder still in place" detection this codebase already uses for
    // EMAIL_PROVIDER_API_KEY/S3_BUCKET/SENTRY_DSN — see .env.example's own comment on
    // SPORTS_DATA_API_KEY. No real Highlightly account exists yet.
    this.isConfigured = Boolean(apiKey) && apiKey !== 'replace-me-once-vendor-is-selected' && apiKey !== 'replace-me';
    if (!this.isConfigured) {
      this.logger.warn(
        '[sports-data] SPORTS_DATA_API_KEY not set to a real value — wired but inactive. ' +
          'Sports Hub endpoints will serve cached data only (or a clear 503 with none) until a real Highlightly account is configured.',
      );
      return;
    }
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    if (!this.isConfigured || !this.apiKey) {
      throw new SportsDataUpstreamError('Sports data provider is not configured (SPORTS_DATA_API_KEY unset)');
    }

    await this.budget.reserveRequest();

    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = { 'x-rapidapi-key': this.apiKey };
    if (this.rapidApiHost) {
      headers['x-rapidapi-host'] = this.rapidApiHost;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url.toString(), { method: 'GET', headers, signal: controller.signal });
    } catch (err) {
      throw new SportsDataUpstreamError(
        `Network failure calling Highlightly (${path}): ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 404) {
      throw new SportsDataNotFoundError(`Highlightly returned 404 for ${path}`);
    }
    if (!response.ok) {
      throw new SportsDataUpstreamError(`Highlightly returned ${response.status} for ${path}`);
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new SportsDataUpstreamError(
        `Highlightly returned malformed JSON for ${path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // GET /matches — {data: RawMatch[], pagination: {totalCount, offset, limit}}, confirmed against
  // the docs' own literal example response.
  async getMatches(params: ListMatchesParams): Promise<RawMatchesPage> {
    const body = await this.request<{ data?: RawMatch[]; pagination?: { totalCount?: number } }>('/matches', {
      date: params.date,
      leagueId: params.leagueId,
      limit: params.limit,
      offset: params.offset,
    });
    return { items: body.data ?? [], totalCount: body.pagination?.totalCount };
  }

  // GET /matches/{id} — the docs' own example wraps this single-match response in a top-level array
  // even though it's a single-resource lookup; handled defensively (accept either shape) per this
  // file's own header comment.
  async getMatchById(externalRef: string): Promise<RawMatch> {
    const body = await this.request<RawMatch | RawMatch[]>(`/matches/${encodeURIComponent(externalRef)}`);
    const match = Array.isArray(body) ? body[0] : body;
    if (!match) {
      throw new SportsDataNotFoundError(`Highlightly returned no match for id ${externalRef}`);
    }
    return match;
  }

  // GET /statistics/{matchId} — a bare top-level array, confirmed against the docs' own example.
  async getMatchStatistics(externalRef: string): Promise<RawTeamStatistics[]> {
    return this.request<RawTeamStatistics[]>(`/statistics/${encodeURIComponent(externalRef)}`);
  }

  // GET /lineups/{matchId} — a bare {homeTeam, awayTeam} object, confirmed against the docs' own
  // example.
  async getMatchLineups(externalRef: string): Promise<RawLineups> {
    return this.request<RawLineups>(`/lineups/${encodeURIComponent(externalRef)}`);
  }

  // GET /events/{matchId} — a bare top-level array, confirmed against the docs' own example. (The
  // docs' own path is /events/{id}; `matchId` here is this client's consistent naming for every
  // per-match method.)
  async getMatchEvents(externalRef: string): Promise<RawMatchEvent[]> {
    return this.request<RawMatchEvent[]>(`/events/${encodeURIComponent(externalRef)}`);
  }

  // GET /head-2-head?teamIdOne=&teamIdTwo= — a bare top-level array of RawMatch, confirmed against
  // the docs' own example (the last-10-meetings history).
  async getHeadToHead(homeTeamId: string, awayTeamId: string): Promise<RawMatch[]> {
    return this.request<RawMatch[]>('/head-2-head', { teamIdOne: homeTeamId, teamIdTwo: awayTeamId });
  }

  // GET /standings?leagueId=&season= — {groups: [{name, standings: RawStandingRow[]}], league}.
  // NOTE (see this module's README, and RawStandingRow's own comment): the documented standings row
  // has no recent-form field — this client returns exactly what Highlightly returns, with no
  // synthesized/fake `form` value ever added.
  async getStandings(leagueId: string, season: string): Promise<RawStandingsGroup[]> {
    const body = await this.request<{ groups?: RawStandingsGroup[] }>('/standings', { leagueId, season });
    return body.groups ?? [];
  }

  // GET /highlights?matchId=&limit=&offset= — {data: RawHighlight[], pagination: {totalCount}},
  // confirmed against the docs' own example (same wrapper shape as /matches).
  async getHighlights(params: ListHighlightsParams): Promise<RawHighlightsPage> {
    const body = await this.request<{ data?: RawHighlight[]; pagination?: { totalCount?: number } }>('/highlights', {
      matchId: params.matchId,
      limit: params.limit,
      offset: params.offset,
    });
    return { items: body.data ?? [], totalCount: body.pagination?.totalCount };
  }
}
