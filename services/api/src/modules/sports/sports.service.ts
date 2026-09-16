import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchData, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ListHighlightsParams,
  RawHighlight,
  RawLineupPlayer,
  RawLineups,
  RawMatch,
  RawMatchEvent,
  RawStandingRow,
  RawTeamRef,
  SportsDataClient,
  SportsDataNotFoundError,
} from '../../sports-data/sports-data-client';
import { SportsDataBudgetExhaustedError } from '../../sports-data/sports-data.errors';
import { SportsRefreshLock } from '../../sports-data/sports-refresh-lock';
import { decodeMatchCursor, encodeMatchCursor } from './cursor.util';
import { deriveMomentum, MomentumChart } from './momentum.util';
import {
  DEFAULT_FINISHED_CACHE_TTL_SECONDS,
  DEFAULT_H2H_CACHE_TTL_SECONDS,
  DEFAULT_HIGHLIGHTS_CACHE_TTL_SECONDS,
  DEFAULT_LIVE_CACHE_TTL_SECONDS,
  DEFAULT_SCHEDULED_CACHE_TTL_SECONDS,
  DEFAULT_STANDINGS_CACHE_TTL_SECONDS,
  MatchPhase,
  SPORTS_DEFAULT_PAGE_SIZE,
  SPORTS_MAX_PAGE_SIZE,
} from './sports.constants';
import { GetStandingsQueryDto } from './dto/get-standings-query.dto';
import { ListFixturesQueryDto } from './dto/list-fixtures-query.dto';
import { ListLiveScoresQueryDto } from './dto/list-live-scores-query.dto';

// ---------- Public response shapes (returned to callers — never the Raw* Highlightly wire shape) ----------

export interface PublicTeamRef {
  id: string;
  name: string;
  logo: string | null;
}

export interface PublicMatchSummary {
  id: string;
  competition: string;
  league: { id: string | null; name: string | null; season: string | null; round: string | null };
  venue: string | null;
  kickoffTime: string;
  status: MatchPhase;
  statusDetail: string | null;
  homeTeam: PublicTeamRef;
  awayTeam: PublicTeamRef;
  homeScore: number | null;
  awayScore: number | null;
  score: string | null;
}

export interface PublicMatchesPage {
  items: PublicMatchSummary[];
  nextCursor: string | null;
}

export interface PublicStatisticItem {
  label: string;
  value: number | string | null;
}

export interface PublicTeamStatistics {
  team: PublicTeamRef;
  statistics: PublicStatisticItem[];
}

// NOTE, stated plainly per this PR's own task brief: Highlightly's own /statistics/{matchId}
// endpoint (confirmed against its documented example response) is TEAM-LEVEL ONLY — there is no
// batched per-match player box-score endpoint. Per-player numbers exist only via
// /players/{id}/statistics, called ONE PLAYER AT A TIME — reconstructing an 11-player box score for
// one match would mean 20+ extra Highlightly calls (every starter + substitute on both sides), which
// is not viable under the confirmed 100-requests/day free-tier budget (or any budget without a
// materially higher paid-plan quota, which is itself unresolved — see README). The Figma redesign
// this PR is wired against (`sprint-4/sports-hub-highlightly-data-redesign`) assumed player box
// scores were available; they are NOT, from this vendor, without an unsustainable API-call fan-out.
// This is a real, disclosed finding — see modules/sports/README.md's Decision Log candidate. No
// synthetic/fabricated player rows are ever returned.
export interface PublicMatchStatistics {
  home: PublicTeamStatistics | null;
  away: PublicTeamStatistics | null;
  updatedAt: string | null;
}

export interface PublicLineupPlayer {
  id: string | null;
  name: string;
  number: number | null;
  position: string | null;
}

export interface PublicTeamLineup {
  team: PublicTeamRef;
  formation: string | null;
  // Preserves Highlightly's own tactical-row grouping (goalkeeper row, defensive row, ...) —
  // confirmed from the docs' own literal example — for a real formation diagram, alongside a
  // flattened `startingXI` for a plain list view.
  rows: PublicLineupPlayer[][];
  startingXI: PublicLineupPlayer[];
  substitutes: PublicLineupPlayer[];
  missingPlayers: PublicLineupPlayer[];
  coach: string | null;
}

export interface PublicSubstitution {
  minute: number;
  side: 'home' | 'away' | null;
  playerOff: string | null;
  playerOn: string | null;
}

export interface PublicLineups {
  home: PublicTeamLineup;
  away: PublicTeamLineup;
  // Derived from the SAME cached `events` document already backing GET .../events — NOT a fresh
  // Highlightly call. Empty if events haven't been fetched for this match yet (e.g. the caller only
  // ever requested lineups, never events/commentary).
  substitutions: PublicSubstitution[];
  updatedAt: string | null;
}

export interface PublicEvent {
  minute: number;
  addedTime: number;
  displayMinute: string;
  type: string;
  side: 'home' | 'away' | null;
  player: string | null;
  assist: string | null;
  detail: string | null;
}

export interface PublicMatchEvents {
  items: PublicEvent[]; // newest-first — see cursor.util.ts's sibling comment / README Decision Log #316
  updatedAt: string | null;
}

export interface PublicMomentum extends MomentumChart {
  updatedAt: string | null;
}

export interface PublicHeadToHeadAggregate {
  played: number;
  homeTeamWins: number;
  awayTeamWins: number;
  draws: number;
  homeTeamGoals: number;
  awayTeamGoals: number;
}

export interface PublicHeadToHead {
  meetings: PublicMatchSummary[];
  aggregate: PublicHeadToHeadAggregate;
  updatedAt: string | null;
}

export interface PublicStandingRow {
  position: number;
  team: PublicTeamRef;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface PublicStandingsGroup {
  name: string | null;
  rows: PublicStandingRow[];
}

export interface PublicStandings {
  leagueId: string;
  season: string;
  groups: PublicStandingsGroup[];
  updatedAt: string | null;
}

export interface PublicHighlight {
  id: string;
  type: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  url: string;
  embedUrl: string | null;
  source: string | null;
  category: string | null;
}

export interface PublicHighlights {
  items: PublicHighlight[];
  updatedAt: string | null;
}

// ---------- internal helpers ----------

function toPublicTeamRef(id: string | null, name: string | null, logo: string | null): PublicTeamRef {
  return { id: id ?? '', name: name ?? 'Unknown', logo };
}

function formatVenue(venue: RawMatch['venue']): string | null {
  if (!venue) return null;
  const parts = [venue.name, venue.city].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(', ') : null;
}

// Highlightly's `state.score.current` is a ready display string, e.g. "3 - 1". Parsed defensively —
// a not-yet-started match may have no score at all.
function parseScore(current: string | null | undefined): { home: number | null; away: number | null } {
  if (!current) return { home: null, away: null };
  const match = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(current);
  if (!match) return { home: null, away: null };
  return { home: Number(match[1]), away: Number(match[2]) };
}

// Maps Highlightly's own free-text `state.description` onto this module's coarse MatchPhase enum —
// see schema.prisma's MatchData.status comment for why only this granularity is needed (every
// Section 4.6 endpoint branches on scheduled/live/finished[/postponed/cancelled], never on the exact
// minute-by-minute phase text, which is preserved verbatim in `statusDetail` for display).
function derivePhase(description: string): MatchPhase {
  const lower = description.toLowerCase();
  if (lower.includes('postpone')) return 'postponed';
  if (lower.includes('cancel')) return 'cancelled';
  if (lower.includes('not started') || lower.includes('scheduled') || lower === 'ns') return 'scheduled';
  if (lower.includes('finish') || lower.includes('full time') || lower === 'ft') return 'finished';
  return 'live'; // "First half", "Half time", "Second half", extra time, penalties, etc.
}

function toPublicLineupPlayer(p: RawLineupPlayer): PublicLineupPlayer {
  return { id: p.id != null ? String(p.id) : null, name: p.name, number: p.number ?? null, position: p.position ?? null };
}

function sideFor(teamRef: RawTeamRef | null | undefined, homeTeamId: string): 'home' | 'away' | null {
  if (!teamRef) return null;
  return String(teamRef.id) === homeTeamId ? 'home' : 'away';
}

function parseEventMinuteLocal(time: string): { minute: number; addedTime: number } {
  const match = /^(\d+)(?:\+(\d+))?$/.exec(time.trim());
  if (!match) return { minute: 0, addedTime: 0 };
  return { minute: Number(match[1]), addedTime: match[2] ? Number(match[2]) : 0 };
}

// Build Plan Section 4.6 (Sports Hub / Highlightly integration). Full design writeup — the
// normalized-vs-JSON schema split, the caching/refresh strategy, the daily-budget handling, and the
// two real confirmed-Highlightly-data-gap findings (no player box scores, no standings "form" field)
// — lives in modules/sports/README.md. This service is the ONLY place that talks to both Prisma and
// SportsDataClient at once; controllers never see a Raw* Highlightly type.
@Injectable()
export class SportsService {
  private readonly logger = new Logger(SportsService.name);

  private readonly liveTtl: number;
  private readonly scheduledTtl: number;
  private readonly finishedTtl: number;
  private readonly standingsTtl: number;
  private readonly h2hTtl: number;
  private readonly highlightsTtl: number;
  private readonly maxRefreshPages: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: SportsDataClient,
    private readonly refreshLock: SportsRefreshLock,
    config: ConfigService,
  ) {
    this.liveTtl = config.get<number>('SPORTS_LIVE_CACHE_TTL_SECONDS') ?? DEFAULT_LIVE_CACHE_TTL_SECONDS;
    this.scheduledTtl = config.get<number>('SPORTS_SCHEDULED_CACHE_TTL_SECONDS') ?? DEFAULT_SCHEDULED_CACHE_TTL_SECONDS;
    this.finishedTtl = config.get<number>('SPORTS_FINISHED_CACHE_TTL_SECONDS') ?? DEFAULT_FINISHED_CACHE_TTL_SECONDS;
    this.standingsTtl = config.get<number>('SPORTS_STANDINGS_CACHE_TTL_SECONDS') ?? DEFAULT_STANDINGS_CACHE_TTL_SECONDS;
    this.h2hTtl = config.get<number>('SPORTS_H2H_CACHE_TTL_SECONDS') ?? DEFAULT_H2H_CACHE_TTL_SECONDS;
    this.highlightsTtl = config.get<number>('SPORTS_HIGHLIGHTS_CACHE_TTL_SECONDS') ?? DEFAULT_HIGHLIGHTS_CACHE_TTL_SECONDS;
    // Bounds how many /matches pages (each page = one real Highlightly request) a single date
    // refresh will fetch, even if Highlightly reports more pages exist (`pagination.totalCount`
    // exceeding one page's own `limit`). A deliberate, disclosed cap against the daily budget — a
    // single day's fixtures across 950+ leagues could in principle exceed one page (up to 100 rows,
    // the endpoint's own documented max `limit`), but spending unboundedly many requests refreshing
    // ONE date would defeat the entire point of the per-date refresh-lock design. See README.
    this.maxRefreshPages = config.get<number>('SPORTS_DATA_MAX_REFRESH_PAGES') ?? 1;
  }

  private ttlForPhase(phase: MatchPhase | null): number {
    switch (phase) {
      case 'live':
        return this.liveTtl;
      case 'finished':
      case 'postponed':
      case 'cancelled':
        return this.finishedTtl;
      case 'scheduled':
      default:
        return this.scheduledTtl;
    }
  }

  // The shared cache-freshness + stampede-guard gate — see sports-refresh-lock.ts's own header
  // comment for the full mechanism. `isFresh` decides whether `refresh()` is even attempted; if the
  // lock isn't acquired (another request already refreshed, or is refreshing, within the TTL
  // window), this is a no-op and the caller reads whatever's already in Postgres. Any failure inside
  // `refresh()` (network error, budget exhausted, upstream 5xx) is caught and logged here — never
  // rethrown — so a transient Highlightly problem degrades to "serve the existing cached row",
  // never a hard failure, as long as SOME cached row already exists. The one place that decision
  // differs is bootstrapping a never-before-seen match id (see getMatchById below), which has no
  // existing row to fall back on and therefore does let a genuine failure propagate.
  private async refreshIfStale(
    lockKey: string,
    ttlSeconds: number,
    isFresh: boolean,
    refresh: () => Promise<void>,
  ): Promise<void> {
    if (isFresh) return;
    const acquired = await this.refreshLock.tryAcquire(lockKey, ttlSeconds);
    if (!acquired) return;
    try {
      await refresh();
    } catch (err) {
      this.logger.warn(`Sports-data refresh failed for ${lockKey}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async upsertMatch(raw: RawMatch): Promise<MatchData> {
    const externalRef = String(raw.id);
    const phase = derivePhase(raw.state.description);
    const { home, away } = parseScore(raw.state.score?.current);
    const scoreDisplay = raw.state.score?.current ?? null;

    const data: Prisma.MatchDataUpsertArgs['create'] = {
      externalRef,
      competition: raw.league?.name ?? 'Unknown competition',
      teams: [raw.homeTeam.name, raw.awayTeam.name],
      score: scoreDisplay,
      status: phase,
      statusDetail: raw.state.description,
      kickoffTime: new Date(raw.date),
      leagueId: raw.league ? String(raw.league.id) : null,
      leagueName: raw.league?.name ?? null,
      season: raw.league?.season != null ? String(raw.league.season) : null,
      round: raw.round ?? null,
      venue: formatVenue(raw.venue),
      homeTeamId: String(raw.homeTeam.id),
      homeTeamName: raw.homeTeam.name,
      homeTeamLogo: raw.homeTeam.logo ?? null,
      awayTeamId: String(raw.awayTeam.id),
      awayTeamName: raw.awayTeam.name,
      awayTeamLogo: raw.awayTeam.logo ?? null,
      homeScore: home,
      awayScore: away,
    };

    return this.prisma.matchData.upsert({ where: { externalRef }, update: data, create: data });
  }

  private toPublicMatchSummary(row: MatchData): PublicMatchSummary {
    return {
      id: row.externalRef,
      competition: row.competition,
      league: { id: row.leagueId, name: row.leagueName, season: row.season, round: row.round },
      venue: row.venue,
      kickoffTime: row.kickoffTime.toISOString(),
      status: row.status as MatchPhase,
      statusDetail: row.statusDetail,
      homeTeam: toPublicTeamRef(row.homeTeamId, row.homeTeamName, row.homeTeamLogo),
      awayTeam: toPublicTeamRef(row.awayTeamId, row.awayTeamName, row.awayTeamLogo),
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      score: row.score,
    };
  }

  // Refreshes every match kicking off on `date` (UTC calendar day) from ONE Highlightly /matches
  // call (bounded to `maxRefreshPages` pages — see constructor comment), gated by a single
  // per-(date[, leagueId]) lock — NOT one lock per match. This is the central rate-limit-conscious
  // design decision this module makes: one refresh covers every match that date across every
  // league Highlightly returns, and GET /sports/live-scores reads the SAME cached rows (filtered to
  // status='live') rather than triggering any refresh of its own — see listLiveScores below.
  private async refreshMatchesForDate(date: string, leagueId: string | undefined, isToday: boolean): Promise<void> {
    const lockKey = `sports:refresh:matches:${date}${leagueId ? `:${leagueId}` : ''}`;
    const ttl = isToday ? this.liveTtl : this.scheduledTtl;

    await this.refreshIfStale(lockKey, ttl, false, async () => {
      let offset = 0;
      for (let page = 0; page < this.maxRefreshPages; page += 1) {
        const result = await this.client.getMatches({ date, leagueId, limit: 100, offset });
        await Promise.all(result.items.map((raw) => this.upsertMatch(raw)));
        const fetchedSoFar = offset + result.items.length;
        if (!result.totalCount || fetchedSoFar >= result.totalCount || result.items.length === 0) break;
        offset = fetchedSoFar;
      }
    });
  }

  // GET /sports/fixtures?date=&league=&cursor=&limit=
  async listFixtures(query: ListFixturesQueryDto): Promise<PublicMatchesPage> {
    const today = new Date().toISOString().slice(0, 10);
    await this.refreshMatchesForDate(query.date, query.league, query.date === today);
    return this.readMatchesPage({
      kickoffTimeGte: new Date(`${query.date}T00:00:00.000Z`),
      kickoffTimeLt: new Date(new Date(`${query.date}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000),
      leagueId: query.league,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  // GET /sports/live-scores?league=&cursor=&limit= — deliberately triggers the SAME today-refresh as
  // listFixtures (same lock key, so if a caller already refreshed today's fixtures moments ago this
  // is a no-op), then reads status='live' rows only. There is no separate "live-scores" upstream
  // call — see this file's own header comment.
  async listLiveScores(query: ListLiveScoresQueryDto): Promise<PublicMatchesPage> {
    const today = new Date().toISOString().slice(0, 10);
    await this.refreshMatchesForDate(today, query.league, true);
    return this.readMatchesPage({ status: 'live', leagueId: query.league, cursor: query.cursor, limit: query.limit });
  }

  private async readMatchesPage(params: {
    kickoffTimeGte?: Date;
    kickoffTimeLt?: Date;
    status?: MatchPhase;
    leagueId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<PublicMatchesPage> {
    const limit = Math.min(params.limit ?? SPORTS_DEFAULT_PAGE_SIZE, SPORTS_MAX_PAGE_SIZE);

    const conditions: Prisma.MatchDataWhereInput[] = [];
    if (params.kickoffTimeGte) conditions.push({ kickoffTime: { gte: params.kickoffTimeGte } });
    if (params.kickoffTimeLt) conditions.push({ kickoffTime: { lt: params.kickoffTimeLt } });
    if (params.status) conditions.push({ status: params.status });
    if (params.leagueId) conditions.push({ leagueId: params.leagueId });
    if (params.cursor) {
      const cursor = decodeMatchCursor(params.cursor);
      conditions.push({
        OR: [{ kickoffTime: { gt: cursor.kickoffTime } }, { kickoffTime: cursor.kickoffTime, id: { gt: cursor.id } }],
      });
    }

    const rows = await this.prisma.matchData.findMany({
      where: conditions.length > 0 ? { AND: conditions } : undefined,
      orderBy: [{ kickoffTime: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map((row) => this.toPublicMatchSummary(row));
    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && last ? encodeMatchCursor({ kickoffTime: last.kickoffTime, id: last.id }) : null;

    return { items, nextCursor };
  }

  // GET /sports/matches/:id — the one endpoint that can bootstrap a match Postgres has never seen
  // before (e.g. an id from a date this service never refreshed). Unlike every other method in this
  // service, a genuine upstream failure here IS allowed to propagate as a 503 (via the caller —
  // see sports-matches.controller.ts) when there's no existing row to fall back on, since there is
  // nothing to degrade to.
  async getMatchById(externalRef: string): Promise<PublicMatchSummary> {
    let row = await this.prisma.matchData.findUnique({ where: { externalRef } });
    const isFresh = row != null && Date.now() - row.updatedAt.getTime() < this.ttlForPhase(row.status as MatchPhase) * 1000;

    if (!isFresh) {
      const lockKey = `sports:refresh:match:${externalRef}:summary`;
      const acquired = await this.refreshLock.tryAcquire(lockKey, row ? this.ttlForPhase(row.status as MatchPhase) : this.liveTtl);
      if (acquired) {
        try {
          const raw = await this.client.getMatchById(externalRef);
          row = await this.upsertMatch(raw);
        } catch (err) {
          if (err instanceof SportsDataNotFoundError) {
            if (!row) throw new NotFoundException('Match not found');
          } else if (!row) {
            // No cached fallback and the upstream call itself failed (network/5xx/budget) — genuinely
            // nothing to serve. Let this propagate; the controller/global filter turns it into a 5xx.
            throw err;
          } else {
            this.logger.warn(
              `Sports-data refresh failed for match ${externalRef}, serving stale cache: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    }

    if (!row) throw new NotFoundException('Match not found');
    return this.toPublicMatchSummary(row);
  }

  private async getMatchRowOrThrow(externalRef: string): Promise<MatchData> {
    const row = await this.prisma.matchData.findUnique({ where: { externalRef } });
    if (!row) throw new NotFoundException('Match not found');
    return row;
  }

  // GET /sports/matches/:id/stats
  async getMatchStatistics(externalRef: string): Promise<PublicMatchStatistics> {
    let row = await this.getMatchRowOrThrow(externalRef);
    const phase = row.status as MatchPhase;
    const isFresh = row.statisticsUpdatedAt != null && Date.now() - row.statisticsUpdatedAt.getTime() < this.ttlForPhase(phase) * 1000;

    await this.refreshIfStale(`sports:refresh:match:${externalRef}:stats`, this.ttlForPhase(phase), isFresh, async () => {
      const raw = await this.client.getMatchStatistics(externalRef);
      row = await this.prisma.matchData.update({
        where: { externalRef },
        data: { statistics: raw as unknown as Prisma.InputJsonValue, statisticsUpdatedAt: new Date() },
      });
    });

    const cached = (row.statistics as unknown as Array<{ team: RawTeamRef; statistics: { displayName: string; value: number | string | null }[] }>) ?? [];
    const toTeamStats = (t: (typeof cached)[number] | undefined): PublicTeamStatistics | null =>
      t ? { team: toPublicTeamRef(String(t.team.id), t.team.name, t.team.logo ?? null), statistics: t.statistics.map((s) => ({ label: s.displayName, value: s.value })) } : null;

    const home = cached.find((t) => String(t.team.id) === row.homeTeamId) ?? cached[0];
    const away = cached.find((t) => String(t.team.id) === row.awayTeamId) ?? cached[1];

    return { home: toTeamStats(home), away: toTeamStats(away), updatedAt: row.statisticsUpdatedAt?.toISOString() ?? null };
  }

  // GET /sports/matches/:id/lineups — also derives `substitutions` from the already-cached `events`
  // column (see PublicLineups's own comment); does NOT itself fetch events.
  async getMatchLineups(externalRef: string): Promise<PublicLineups> {
    let row = await this.getMatchRowOrThrow(externalRef);
    const phase = row.status as MatchPhase;
    const isFresh = row.lineupsUpdatedAt != null && Date.now() - row.lineupsUpdatedAt.getTime() < this.ttlForPhase(phase) * 1000;

    await this.refreshIfStale(`sports:refresh:match:${externalRef}:lineups`, this.ttlForPhase(phase), isFresh, async () => {
      const raw = await this.client.getMatchLineups(externalRef);
      row = await this.prisma.matchData.update({
        where: { externalRef },
        data: { lineups: raw as unknown as Prisma.InputJsonValue, lineupsUpdatedAt: new Date() },
      });
    });

    const lineups = row.lineups as unknown as RawLineups | null;
    const toTeamLineup = (side: 'home' | 'away'): PublicTeamLineup => {
      const raw = lineups ? lineups[`${side}Team`] : null;
      const teamRef = toPublicTeamRef(
        side === 'home' ? row.homeTeamId : row.awayTeamId,
        side === 'home' ? row.homeTeamName : row.awayTeamName,
        side === 'home' ? row.homeTeamLogo : row.awayTeamLogo,
      );
      const rows = raw?.initialLineup ?? [];
      return {
        team: teamRef,
        formation: raw?.formation ?? null,
        rows: rows.map((r) => r.map(toPublicLineupPlayer)),
        startingXI: rows.flat().map(toPublicLineupPlayer),
        substitutes: (raw?.substitutes ?? []).map(toPublicLineupPlayer),
        missingPlayers: (raw?.missingPlayers ?? []).map(toPublicLineupPlayer),
        coach: raw?.coach ?? null,
      };
    };

    const cachedEvents = (row.events as unknown as RawMatchEvent[] | null) ?? [];
    const substitutions: PublicSubstitution[] = cachedEvents
      .filter((e) => e.type === 'Substitution')
      .map((e) => ({
        minute: parseEventMinuteLocal(e.time).minute,
        side: sideFor(e.team, row.homeTeamId ?? ''),
        playerOff: e.substituted ?? null,
        playerOn: e.player ?? null,
      }))
      .sort((a, b) => a.minute - b.minute);

    return { home: toTeamLineup('home'), away: toTeamLineup('away'), substitutions, updatedAt: row.lineupsUpdatedAt?.toISOString() ?? null };
  }

  // GET /sports/matches/:id/events — Decision Log candidate (see README), the "Live Commentary"
  // data source. Returned NEWEST-FIRST per the Figma design's own Decision Log #316.
  async getMatchEvents(externalRef: string): Promise<PublicMatchEvents> {
    let row = await this.getMatchRowOrThrow(externalRef);
    const phase = row.status as MatchPhase;
    const isFresh = row.eventsUpdatedAt != null && Date.now() - row.eventsUpdatedAt.getTime() < this.ttlForPhase(phase) * 1000;

    await this.refreshIfStale(`sports:refresh:match:${externalRef}:events`, this.ttlForPhase(phase), isFresh, async () => {
      const raw = await this.client.getMatchEvents(externalRef);
      row = await this.prisma.matchData.update({
        where: { externalRef },
        data: { events: raw as unknown as Prisma.InputJsonValue, eventsUpdatedAt: new Date() },
      });
    });

    const raw = (row.events as unknown as RawMatchEvent[] | null) ?? [];
    const items: PublicEvent[] = raw.map((e) => {
      const { minute, addedTime } = parseEventMinuteLocal(e.time);
      return {
        minute,
        addedTime,
        displayMinute: addedTime > 0 ? `${minute}+${addedTime}'` : `${minute}'`,
        type: e.type,
        side: sideFor(e.team, row.homeTeamId ?? ''),
        player: e.player ?? null,
        assist: e.assist ?? null,
        detail: e.substituted ? `Replaced ${e.substituted}` : null,
      };
    });

    // Synthetic KICK OFF / HALF TIME / FULL TIME period markers, per the Figma design's own §2.1
    // ("KICK OFF / HALF TIME / FULL TIME period markers") — derived from the match's own
    // status/phase, never a separate upstream call.
    const markers: PublicEvent[] = [{ minute: 0, addedTime: 0, displayMinute: "0'", type: 'Kick Off', side: null, player: null, assist: null, detail: null }];
    if (items.some((e) => e.minute >= 45) || phase === 'finished') {
      markers.push({ minute: 45, addedTime: 0, displayMinute: "45'", type: 'Half Time', side: null, player: null, assist: null, detail: null });
    }
    if (phase === 'finished') {
      markers.push({ minute: 90, addedTime: 0, displayMinute: "90'", type: 'Full Time', side: null, player: null, assist: null, detail: null });
    }

    const combined = [...items, ...markers].sort((a, b) => b.minute - a.minute || b.addedTime - a.addedTime);

    return { items: combined, updatedAt: row.eventsUpdatedAt?.toISOString() ?? null };
  }

  // GET /sports/matches/:id/momentum — Decision Log candidate (see README). Pure computation over
  // the SAME cached `events` document as getMatchEvents (ensures events are fresh via the identical
  // lock/TTL, never a separate momentum-specific Highlightly call — none exists to call).
  async getMatchMomentum(externalRef: string): Promise<PublicMomentum> {
    let row = await this.getMatchRowOrThrow(externalRef);
    const phase = row.status as MatchPhase;
    const isFresh = row.eventsUpdatedAt != null && Date.now() - row.eventsUpdatedAt.getTime() < this.ttlForPhase(phase) * 1000;

    await this.refreshIfStale(`sports:refresh:match:${externalRef}:events`, this.ttlForPhase(phase), isFresh, async () => {
      const raw = await this.client.getMatchEvents(externalRef);
      row = await this.prisma.matchData.update({
        where: { externalRef },
        data: { events: raw as unknown as Prisma.InputJsonValue, eventsUpdatedAt: new Date() },
      });
    });

    const raw = (row.events as unknown as RawMatchEvent[] | null) ?? [];
    const chart = deriveMomentum(raw, row.homeTeamId ?? '', phase === 'live');
    return { ...chart, updatedAt: row.eventsUpdatedAt?.toISOString() ?? null };
  }

  // GET /sports/matches/:id/h2h
  async getHeadToHead(externalRef: string): Promise<PublicHeadToHead> {
    let row = await this.getMatchRowOrThrow(externalRef);
    const isFresh = row.h2hUpdatedAt != null && Date.now() - row.h2hUpdatedAt.getTime() < this.h2hTtl * 1000;
    const homeTeamId = row.homeTeamId;
    const awayTeamId = row.awayTeamId;

    if (homeTeamId && awayTeamId) {
      await this.refreshIfStale(`sports:refresh:match:${externalRef}:h2h`, this.h2hTtl, isFresh, async () => {
        const raw = await this.client.getHeadToHead(homeTeamId, awayTeamId);
        row = await this.prisma.matchData.update({
          where: { externalRef },
          data: { h2h: raw as unknown as Prisma.InputJsonValue, h2hUpdatedAt: new Date() },
        });
      });
    }

    const meetings = (row.h2h as unknown as RawMatch[] | null) ?? [];
    const aggregate: PublicHeadToHeadAggregate = { played: 0, homeTeamWins: 0, awayTeamWins: 0, draws: 0, homeTeamGoals: 0, awayTeamGoals: 0 };

    for (const m of meetings) {
      const { home, away } = parseScore(m.state.score?.current);
      if (home == null || away == null) continue;
      const meetingHomeIsCurrentHome = String(m.homeTeam.id) === homeTeamId;
      const thisHomeTeamGoals = meetingHomeIsCurrentHome ? home : away;
      const thisAwayTeamGoals = meetingHomeIsCurrentHome ? away : home;
      aggregate.played += 1;
      aggregate.homeTeamGoals += thisHomeTeamGoals;
      aggregate.awayTeamGoals += thisAwayTeamGoals;
      if (thisHomeTeamGoals > thisAwayTeamGoals) aggregate.homeTeamWins += 1;
      else if (thisAwayTeamGoals > thisHomeTeamGoals) aggregate.awayTeamWins += 1;
      else aggregate.draws += 1;
    }

    return {
      meetings: meetings.map((m) => this.rawMatchToSummary(m)),
      aggregate,
      updatedAt: row.h2hUpdatedAt?.toISOString() ?? null,
    };
  }

  private rawMatchToSummary(raw: RawMatch): PublicMatchSummary {
    const phase = derivePhase(raw.state.description);
    const { home, away } = parseScore(raw.state.score?.current);
    return {
      id: String(raw.id),
      competition: raw.league?.name ?? 'Unknown competition',
      league: {
        id: raw.league ? String(raw.league.id) : null,
        name: raw.league?.name ?? null,
        season: raw.league?.season != null ? String(raw.league.season) : null,
        round: raw.round ?? null,
      },
      venue: formatVenue(raw.venue),
      kickoffTime: new Date(raw.date).toISOString(),
      status: phase,
      statusDetail: raw.state.description,
      homeTeam: toPublicTeamRef(String(raw.homeTeam.id), raw.homeTeam.name, raw.homeTeam.logo ?? null),
      awayTeam: toPublicTeamRef(String(raw.awayTeam.id), raw.awayTeam.name, raw.awayTeam.logo ?? null),
      homeScore: home,
      awayScore: away,
      score: raw.state.score?.current ?? null,
    };
  }

  // GET /sports/standings?league=&season= — `season` defaults to whatever's already cached for this
  // league (a real, existing Standing row), falling back only to a computed current-year guess if
  // NOTHING has ever been cached for this league at all. This is a disclosed judgment call, not an
  // invented default masquerading as a real one — see GetStandingsQueryDto's own comment and README.
  private async resolveSeason(leagueId: string, requested: string | undefined): Promise<string> {
    if (requested) return requested;
    const latest = await this.prisma.standing.findFirst({ where: { leagueId }, orderBy: { updatedAt: 'desc' } });
    if (latest) return latest.season;
    return String(new Date().getUTCFullYear());
  }

  async getStandings(query: GetStandingsQueryDto): Promise<PublicStandings> {
    const season = await this.resolveSeason(query.league, query.season);
    let row = await this.prisma.standing.findUnique({ where: { leagueId_season: { leagueId: query.league, season } } });
    const isFresh = row != null && Date.now() - row.updatedAt.getTime() < this.standingsTtl * 1000;

    await this.refreshIfStale(`sports:refresh:standings:${query.league}:${season}`, this.standingsTtl, isFresh, async () => {
      const groups = await this.client.getStandings(query.league, season);
      row = await this.prisma.standing.upsert({
        where: { leagueId_season: { leagueId: query.league, season } },
        update: { table: groups as unknown as Prisma.InputJsonValue },
        create: { leagueId: query.league, season, table: groups as unknown as Prisma.InputJsonValue },
      });
    });

    const groups = (row?.table as unknown as { name?: string | null; standings: RawStandingRow[] }[] | undefined) ?? [];
    return {
      leagueId: query.league,
      season,
      groups: groups.map((g) => ({
        name: g.name ?? null,
        rows: g.standings.map((r) => ({
          position: r.position,
          team: toPublicTeamRef(String(r.team.id), r.team.name, r.team.logo ?? null),
          points: r.points,
          played: r.total.games,
          won: r.total.wins,
          drawn: r.total.draws,
          lost: r.total.loses,
          goalsFor: r.total.scoredGoals,
          goalsAgainst: r.total.receivedGoals,
          goalDifference: r.total.scoredGoals - r.total.receivedGoals,
        })),
      })),
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  // GET /sports/highlights/:matchId — no pagination (see cursor.util.ts's own comment: a single
  // match's highlight-clip count is naturally small, unlike a day's worth of fixtures).
  async getHighlights(matchId: string): Promise<PublicHighlights> {
    let row = await this.getMatchRowOrThrow(matchId);
    const isFresh = row.highlightsUpdatedAt != null && Date.now() - row.highlightsUpdatedAt.getTime() < this.highlightsTtl * 1000;

    await this.refreshIfStale(`sports:refresh:match:${matchId}:highlights`, this.highlightsTtl, isFresh, async () => {
      const params: ListHighlightsParams = { matchId, limit: 40 };
      const page = await this.client.getHighlights(params);
      row = await this.prisma.matchData.update({
        where: { externalRef: matchId },
        data: { highlights: page.items as unknown as Prisma.InputJsonValue, highlightsUpdatedAt: new Date() },
      });
    });

    const items = (row.highlights as unknown as RawHighlight[] | null) ?? [];
    return {
      items: items.map((h) => ({
        id: String(h.id),
        type: h.type,
        title: h.title,
        description: h.description ?? null,
        thumbnailUrl: h.imgUrl ?? null,
        url: h.url,
        embedUrl: h.embedUrl ?? null,
        source: h.source ?? null,
        category: h.category ?? null,
      })),
      updatedAt: row.highlightsUpdatedAt?.toISOString() ?? null,
    };
  }
}

// Re-export so callers catching budget exhaustion don't need to import from sports-data/ directly.
export { SportsDataBudgetExhaustedError };
