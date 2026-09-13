import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  decodeFixtureCursor,
  decodeTeamCursor,
  encodeFixtureCursor,
  encodeTeamCursor,
} from './cursor.util';
import { CreateFixtureDto } from './dto/create-fixture.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { ListFixturesQueryDto } from './dto/list-fixtures-query.dto';
import { ListTeamsQueryDto } from './dto/list-teams-query.dto';
import { LogResultDto } from './dto/log-result.dto';
import { UpdateFixtureStatusDto } from './dto/update-fixture-status.dto';
import {
  FixtureStatus,
  GRASSROOTS_DEFAULT_PAGE_SIZE,
  GRASSROOTS_MAX_PAGE_SIZE,
} from './grassroots.constants';

// ---------- Response shapes (all via Prisma `select`, never a post-hoc strip) ----------

// GET /teams and GET /teams/:id. Deliberately does NOT include the
// organiser's nested `User` — no email, phone, displayName, isMinor. Only
// `createdById` (the opaque id) is exposed, so a client can tell whether
// the current user is the organiser without leaking any organiser PII.
// Same discipline as feed's POST_AUTHOR_SELECT.
const TEAM_SELECT = {
  id: true,
  name: true,
  city: true,
  leagueType: true,
  createdById: true,
  verified: true,
} as const;

export type GrassrootsTeamView = Prisma.GrassrootsTeamGetPayload<{ select: typeof TEAM_SELECT }>;

// Minimal team shape embedded inside a fixture — enough to render a
// fixture row without a second request, nothing more.
const FIXTURE_TEAM_SELECT = {
  id: true,
  name: true,
  city: true,
  verified: true,
} as const;

const RESULT_SELECT = {
  id: true,
  scoreA: true,
  scoreB: true,
  enteredById: true,
  enteredAt: true,
} as const;

const FIXTURE_SELECT = {
  id: true,
  teamAId: true,
  teamBId: true,
  // Free-text away-opponent name (Decision Log #256). `string | null` — the
  // API never renders the "Opponent TBC" fallback; that stays a frontend
  // concern. Deliberately NOT on FIXTURE_AUTHZ_SELECT (not permission-relevant).
  opponentName: true,
  scheduledAt: true,
  venue: true,
  status: true,
  teamA: { select: FIXTURE_TEAM_SELECT },
  teamB: { select: FIXTURE_TEAM_SELECT },
  result: { select: RESULT_SELECT },
} as const;

export type FixtureView = Prisma.FixtureGetPayload<{ select: typeof FIXTURE_SELECT }>;

export interface TeamPage {
  items: GrassrootsTeamView[];
  nextCursor: string | null;
}

export interface FixturePage {
  items: FixtureView[];
  nextCursor: string | null;
}

// The permission-relevant fields of a fixture — who created each side, so
// GrassrootsService can decide whether the caller may act on it.
const FIXTURE_AUTHZ_SELECT = {
  id: true,
  status: true,
  teamBId: true,
  teamA: { select: { createdById: true } },
  teamB: { select: { createdById: true } },
  result: { select: { id: true } },
} as const;

type FixtureAuthzRow = Prisma.FixtureGetPayload<{ select: typeof FIXTURE_AUTHZ_SELECT }>;

// The two legal forward transitions PATCH /fixtures/:id/status permits.
// POST /fixtures/:id/result performs the third path (scheduled|live ->
// full_time) via a different route. Everything not in this map is a 409.
const LEGAL_STATUS_TRANSITIONS: Record<string, FixtureStatus[]> = {
  scheduled: ['live'],
  live: ['full_time'],
  full_time: [],
};

@Injectable()
export class GrassrootsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Teams ----------

  // POST /teams. createdById is the caller, taken from the access token —
  // never the body. Guards (JwtAuthGuard + GuardianConsentGuard) are on
  // the controller: a team page is a public-facing record, so creating one
  // is a "posting"-class action under Section 5.7's broad reading
  // (Decision Log #21).
  async createTeam(userId: string, dto: CreateTeamDto): Promise<GrassrootsTeamView> {
    return this.prisma.grassrootsTeam.create({
      data: {
        name: dto.name,
        city: dto.city,
        leagueType: dto.leagueType,
        createdById: userId,
        // `verified` stays at its @default(false). No endpoint sets it in
        // MVP — it's an operations/trust decision, not self-service.
      },
      select: TEAM_SELECT,
    });
  }

  // GET /teams/:id. 404 for a non-existent id, never a null 200 — matching
  // FeedService.getPostById / ClubsService.getClubById. No organiser PII.
  async getTeamById(teamId: string): Promise<GrassrootsTeamView> {
    const team = await this.prisma.grassrootsTeam.findUnique({
      where: { id: teamId },
      select: TEAM_SELECT,
    });
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    return team;
  }

  // GET /teams?city=. Keyset pagination alphabetically by name, id
  // tiebreaker — GrassrootsTeam has no timestamp column (same as ClubPage
  // — see cursor.util.ts). `city` is an optional exact-match equality
  // filter ANDed alongside the cursor filter.
  async listTeams(query: ListTeamsQueryDto): Promise<TeamPage> {
    const limit = Math.min(query.limit ?? GRASSROOTS_DEFAULT_PAGE_SIZE, GRASSROOTS_MAX_PAGE_SIZE);

    const filters: Prisma.GrassrootsTeamWhereInput[] = [];
    if (query.city) filters.push({ city: query.city });
    if (query.cursor) {
      const cursor = decodeTeamCursor(query.cursor);
      filters.push({
        OR: [{ name: { gt: cursor.name } }, { name: cursor.name, id: { gt: cursor.id } }],
      });
    }
    const where: Prisma.GrassrootsTeamWhereInput = filters.length > 0 ? { AND: filters } : {};

    const rows = await this.prisma.grassrootsTeam.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: TEAM_SELECT,
    });

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursor =
      hasMore && last ? encodeTeamCursor({ name: last.name, id: last.id }) : null;

    return { items: trimmed, nextCursor };
  }

  // Shared existence check — mirrors ClubsService.assertClubExists /
  // FeedService.assertPostExists. Public so future callers (and the
  // GET /teams/:id/fixtures path) can reuse it without the heavier
  // getTeamById select.
  async assertTeamExists(teamId: string): Promise<void> {
    const team = await this.prisma.grassrootsTeam.findUnique({
      where: { id: teamId },
      select: { id: true },
    });
    if (!team) {
      throw new NotFoundException('Team not found');
    }
  }

  // ---------- Fixtures ----------

  // POST /fixtures. Permission model (Decision Log #255): the caller must
  // be the `createdById` of teamA — the team registering the fixture.
  // "Either team's creator may create a fixture" was considered and NOT
  // chosen (a fixture is created by the organiser scheduling it, from
  // their own team's context).
  //
  // Ordering, matching FeedService.deleteComment: resource existence
  // (404) is settled before authorization (403). So both teams are
  // asserted to exist first, THEN the teamA-creator check runs.
  async createFixture(userId: string, dto: CreateFixtureDto): Promise<FixtureView> {
    await this.assertTeamExists(dto.teamAId);
    if (dto.teamBId !== undefined) {
      await this.assertTeamExists(dto.teamBId);
    }

    // A team cannot play itself. Checked after existence so a bad id still
    // 404s rather than 400.
    if (dto.teamBId !== undefined && dto.teamBId === dto.teamAId) {
      throw new BadRequestException('A fixture cannot have the same team on both sides');
    }

    // teamBId XOR opponentName (or neither) — the cross-field rule for the
    // away side (Decision Log #256). An empty/whitespace-only opponentName
    // is treated as absent (never stored as "").
    const opponentName = dto.opponentName?.trim() || undefined;
    if (dto.teamBId !== undefined && opponentName !== undefined) {
      throw new BadRequestException(
        'Provide either a registered opponent team or an opponent name, not both.',
      );
    }

    const teamA = await this.prisma.grassrootsTeam.findUniqueOrThrow({
      where: { id: dto.teamAId },
      select: { createdById: true },
    });
    if (teamA.createdById !== userId) {
      throw new ForbiddenException('You may only create fixtures for a team you registered');
    }

    // teamB's createdById, needed only to pick the fixture_scheduled
    // Notification recipient below — stays null when the away side is a
    // free-text opponentName (no registered team, so no one to notify).
    let teamBCreatedById: string | null = null;
    if (dto.teamBId !== undefined) {
      const teamB = await this.prisma.grassrootsTeam.findUniqueOrThrow({
        where: { id: dto.teamBId },
        select: { createdById: true },
      });
      teamBCreatedById = teamB.createdById;
    }

    return this.prisma.$transaction(async (tx) => {
      const fixture = await tx.fixture.create({
        data: {
          teamAId: dto.teamAId,
          teamBId: dto.teamBId ?? null,
          // null (not "") when absent or whitespace-only.
          opponentName: opponentName ?? null,
          scheduledAt: new Date(dto.scheduledAt),
          venue: dto.venue ?? null,
          // status stays at its @default('scheduled').
        },
        select: FIXTURE_SELECT,
      });

      // fixture_scheduled Notification (Decision Log #87's audit) --
      // recipient is teamB's organiser, only when teamB is a real
      // registered team (a free-text opponentName has no user to
      // notify). Guarded against self-notification: the schema does not
      // stop one person from being createdById of BOTH teamA and teamB
      // (two different teams they registered themselves), in which case
      // teamAId !== teamBId is true but the recipient would still be the
      // actor -- skipped in that case.
      if (teamBCreatedById !== null && teamBCreatedById !== userId) {
        await tx.notification.create({
          data: {
            userId: teamBCreatedById,
            type: 'fixture_scheduled',
            payloadRefId: fixture.id,
          },
        });
      }

      return fixture;
    });
  }

  // GET /fixtures/:id. 404 for a non-existent id. Includes status, both
  // teams (minimal shape), and the result if present.
  async getFixtureById(fixtureId: string): Promise<FixtureView> {
    const fixture = await this.prisma.fixture.findUnique({
      where: { id: fixtureId },
      select: FIXTURE_SELECT,
    });
    if (!fixture) {
      throw new NotFoundException('Fixture not found');
    }
    return fixture;
  }

  // GET /teams/:id/fixtures. Every fixture the team is in (as teamA OR
  // teamB), keyset-paginated newest-scheduled-first. 404 if the team
  // itself is missing.
  async listTeamFixtures(teamId: string, query: ListFixturesQueryDto): Promise<FixturePage> {
    await this.assertTeamExists(teamId);

    const limit = Math.min(query.limit ?? GRASSROOTS_DEFAULT_PAGE_SIZE, GRASSROOTS_MAX_PAGE_SIZE);

    const filters: Prisma.FixtureWhereInput[] = [
      { OR: [{ teamAId: teamId }, { teamBId: teamId }] },
    ];
    if (query.cursor) {
      const cursor = decodeFixtureCursor(query.cursor);
      // Descending (newest-first) keyset: "before this (scheduledAt, id)".
      filters.push({
        OR: [
          { scheduledAt: { lt: cursor.scheduledAt } },
          { scheduledAt: cursor.scheduledAt, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = await this.prisma.fixture.findMany({
      where: { AND: filters },
      orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: FIXTURE_SELECT,
    });

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursor =
      hasMore && last ? encodeFixtureCursor({ scheduledAt: last.scheduledAt, id: last.id }) : null;

    return { items: trimmed, nextCursor };
  }

  // POST /fixtures/:id/result. Permission model (Decision Log #255): the
  // caller must be the creator of EITHER team in the fixture (unlike
  // POST /fixtures, which is teamA-only).
  //
  // "First submission is final" race fix, enforced at the API layer:
  //   - Pre-checks (outside the transaction): 404 fixture, 403 not a
  //     manager, 409 wrong status. Ordered existence -> authz -> state so
  //     the status of the fixture is never leaked to a non-manager.
  //   - Inside a single interactive $transaction: re-read the fixture; if
  //     a Result row already exists -> 409 (never overwrite); create the
  //     Result with enteredById = caller; move the fixture to full_time.
  //   - Result.fixtureId is @unique, so a genuine concurrent race (both
  //     requests pass the pre-check, both enter their transaction) has one
  //     winner and one P2002 on tx.result.create — caught and re-thrown as
  //     the SAME 409, never a raw 500. Same belt-and-braces pattern as
  //     FeedService.likePost's P2002 handling.
  async logResult(userId: string, fixtureId: string, dto: LogResultDto): Promise<FixtureView> {
    const fixture = await this.loadFixtureForAuthz(fixtureId);
    this.assertFixtureManager(fixture, userId);

    // Order matters: "a result already exists" is checked BEFORE the
    // status check, so the "first write is final" case reports the
    // informative message rather than "wrong status" (a fixture with a
    // result is always already full_time). The status check still fires
    // for the other path to full_time — a PATCH live -> full_time with no
    // score entered, after which logResult must not be usable.
    if (fixture.result) {
      // Fast path — a result already exists. The transaction below is the
      // authoritative check; this just avoids opening one needlessly.
      throw new ConflictException(
        "A result has already been recorded for this fixture and can't be changed",
      );
    }
    if (fixture.status !== 'scheduled' && fixture.status !== 'live') {
      throw new ConflictException(
        `A result can only be recorded while a fixture is "scheduled" or "live" (this fixture is "${fixture.status}")`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const fresh = await tx.fixture.findUniqueOrThrow({
          where: { id: fixtureId },
          select: { status: true, result: { select: { id: true } } },
        });
        if (fresh.result) {
          throw new ConflictException(
            "A result has already been recorded for this fixture and can't be changed",
          );
        }
        if (fresh.status !== 'scheduled' && fresh.status !== 'live') {
          throw new ConflictException(
            `A result can only be recorded while a fixture is "scheduled" or "live" (this fixture is "${fresh.status}")`,
          );
        }

        await tx.result.create({
          data: {
            fixtureId,
            scoreA: dto.scoreA,
            scoreB: dto.scoreB,
            enteredById: userId,
          },
        });
        await tx.fixture.update({ where: { id: fixtureId }, data: { status: 'full_time' } });

        // result_logged Notification (Decision Log #87's audit) --
        // recipient is the OTHER team's organiser, never the submitter.
        // `fixture` here is FIXTURE_AUTHZ_SELECT's shape, loaded before
        // this transaction by loadFixtureForAuthz. Skipped when there's
        // no registered teamB (free-text opponent -- no one to notify)
        // or when the same person manages both teams (self-notification,
        // since "the other side" would still resolve to the actor).
        const otherManagerId =
          userId === fixture.teamA.createdById
            ? fixture.teamB?.createdById ?? null
            : fixture.teamA.createdById;
        if (otherManagerId !== null && otherManagerId !== userId) {
          await tx.notification.create({
            data: { userId: otherManagerId, type: 'result_logged', payloadRefId: fixtureId },
          });
        }

        return tx.fixture.findUniqueOrThrow({ where: { id: fixtureId }, select: FIXTURE_SELECT });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // The true concurrent race: another request created the Result row
        // between this request's pre-check and its own tx.result.create.
        throw new ConflictException(
          "A result has already been recorded for this fixture and can't be changed",
        );
      }
      throw err;
    }
  }

  // PATCH /fixtures/:id/status — the dedicated status-transition endpoint
  // (Decision Log #254). Permission model: same as logResult — either
  // team's creator. Body target is `live` | `full_time` (DTO-validated);
  // this enforces the legal machine:
  //   scheduled -> live       ("Start match")
  //   live      -> full_time  ("End match" with no score entered)
  // Everything else (full_time -> *, scheduled -> full_time via this
  // route, a no-op same-status PATCH, any backwards move) -> 409 naming
  // the current and requested status.
  async updateFixtureStatus(
    userId: string,
    fixtureId: string,
    dto: UpdateFixtureStatusDto,
  ): Promise<FixtureView> {
    const fixture = await this.loadFixtureForAuthz(fixtureId);
    this.assertFixtureManager(fixture, userId);

    const allowed = LEGAL_STATUS_TRANSITIONS[fixture.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(
        `A fixture cannot move from "${fixture.status}" to "${dto.status}"`,
      );
    }

    await this.prisma.fixture.update({ where: { id: fixtureId }, data: { status: dto.status } });
    return this.prisma.fixture.findUniqueOrThrow({ where: { id: fixtureId }, select: FIXTURE_SELECT });
  }

  // ---------- shared helpers ----------

  private async loadFixtureForAuthz(fixtureId: string): Promise<FixtureAuthzRow> {
    const fixture = await this.prisma.fixture.findUnique({
      where: { id: fixtureId },
      select: FIXTURE_AUTHZ_SELECT,
    });
    if (!fixture) {
      throw new NotFoundException('Fixture not found');
    }
    return fixture;
  }

  // The caller must be the createdById of teamA, OR (when teamB is set)
  // the createdById of teamB. Neither -> 403, the same "authenticated but
  // not authorized for this resource" convention
  // FeedService.deleteComment / UsersController.assertSelf established.
  private assertFixtureManager(fixture: FixtureAuthzRow, userId: string): void {
    const isTeamAManager = fixture.teamA.createdById === userId;
    const isTeamBManager = fixture.teamBId !== null && fixture.teamB?.createdById === userId;
    if (!isTeamAManager && !isTeamBManager) {
      throw new ForbiddenException(
        'You may only manage fixtures for a team you registered',
      );
    }
  }
}
