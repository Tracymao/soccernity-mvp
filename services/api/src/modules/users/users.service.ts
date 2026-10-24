import { DobEncryptionService } from '../../crypto/dob-encryption.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  blockedPairWhere,
  hasBlockBetween,
  notBlockedWith,
  relationFromRows,
  YOU_BLOCKED_THIS_USER_CODE,
  YOU_BLOCKED_THIS_USER_MESSAGE,
} from '../block/block.util';
import { screenSensitiveContent } from '../sensitive-content/sensitive-content.util';
import { normaliseProfileCountry, SENSITIVE_PROFILE_REPHRASE_CODE } from './profile-country.constants';
import { decodeFeedSequenceCursor, encodeFeedSequenceCursor } from '../feed/cursor.util';
import { FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE, FeedQueryDto } from '../feed/dto/feed-query.dto';
import { ENGAGEMENT_POINTS } from '../points/points.constants';
import { awardPoints } from '../points/points.util';
import { calculateAge } from '../auth/registration/age.util';
import { deriveOnboardingState, GuardianConsentState, OnboardingNextStep } from '../auth/onboarding-state.util';
import { UpdateUserDto } from './dto/update-user.dto';
import { PUBLIC_NAME_SELECT, resolvePublicName, toPublicUser } from './public-name.util';
import { UsernamePolicyService } from './username-policy.service';
import { USERNAME_REQUIRED_CODE } from './username-rules.constants';

// Fields returned for the authenticated user's OWN profile. Notably:
//
// - passwordHash is never in this list, so there is no code path where it
//   is even pulled out of Postgres by this service, let alone serialized
//   into a response — this is a Prisma `select`, not a post-hoc `delete
//   result.passwordHash`, which would be one refactor away from a leak.
// - isMinor / verificationStatus ARE included, because this is a fresh
//   `findUnique`/`update` against Postgres on every single call — never
//   assembled from the JWT (which per token.types.ts carries only
//   { sub, role } and structurally cannot supply these fields anyway).
//   This satisfies the non-negotiable in CLAUDE.md and Build Plan
//   Section 5.7: safety-sensitive fields must come from a fresh DB read,
//   not a cached/trusted claim.
const OWN_PROFILE_SELECT = {
  id: true,
  email: true,
  phone: true,
  displayName: true,
  // The owner's own username + the resolved name others see for them.
  username: true,
  dateOfBirth: true,
  isMinor: true,
  isUnder16: true,
  role: true,
  verificationStatus: true,
  createdAt: true,
  clubAffiliationId: true,
  // backend/team-organiser-flag — genuine addition beyond Section 3's
  // literal User field list, flagged as a Decision Log candidate (see
  // schema.prisma's own comment on this field and grassroots/README.md).
  // Set once, inside GrassrootsService.createTeam's transaction, the
  // moment POST /teams succeeds; never settable any other way. Exposed
  // here (not a new endpoint) so apps/web can read it off the same
  // GET /users/:id call it already makes for its own profile.
  isTeamOrganiser: true,
  // safeguarding/guardian-contact-public-visibility: only ever forwarded
  // (as guardianContact) for a current minor -- see guardianContactFor.
  guardian: { select: { email: true, consentStatus: true } },
  // Decision Log #74 -- the one club this user represents (Leaderboard
  // By-club scope). Read-only here; written only by setRepresentedClub.
  representedClub: { select: { id: true, name: true } },
  // backend/w5-profile-block (B-038, B-035): the owner's own profile content.
  // avatarKey is selected only so the owner mapping can drop it; it is an
  // internal storage detail and never leaves this service.
  bio: true,
  preferredClub: true,
  profileCountry: true,
  avatarUrl: true,
  avatarKey: true,
  avatarStatus: true,
  // B-196: the cover photo, same rules as the avatar (coverKey is internal).
  coverUrl: true,
  coverKey: true,
  coverStatus: true,
} as const;

export type GuardianContact = { label: 'Guardian contact'; email: string };

// What a viewer's own avatar looks like to the OWNER: the stored status is
// shown so the owner knows why nobody else can see it yet.
export type OwnAvatar = { url: string; status: 'pending' | 'approved' | 'rejected' };

export type PublicProfile = {
  id: string;
  // username if set, else displayName -- the real displayName is not sent.
  publicName: string;
  guardianContact: GuardianContact | null;
  // backend/w5-profile-block (B-082; Decision Log #371, #403 item 17).
  // bio: free text the user wrote, visible to every viewer including for a minor
  // (#371). null when not filled in.
  bio: string | null;
  // The optional PROFILE country (ISO alpha-2), present ONLY if the user filled
  // it in -- never the declared or derived safeguarding country, so a minor's
  // country is visible only if the minor entered it. null otherwise (the client
  // shows no country line at all).
  country: string | null;
  // Only an 'approved' avatar is ever served to another user. Nothing sets
  // 'approved' until the automatic image check (B-036) exists, so today this is
  // always null for every viewer except in the owner's own profile.
  avatarUrl: string | null;
  // B-196: same rule for the cover photo -- only an 'approved' cover is served
  // to another viewer, so today this is null for everyone but the owner's view.
  coverUrl: string | null;
  // Per-viewer state the page needs on first paint (the #153 / #224 precedent):
  // does the viewer already follow this user, and has the viewer blocked them.
  // viewerHasBlocked is safe to return: a user who is blocked by the target
  // never gets this far (they receive the not-found response instead).
  isFollowing: boolean;
  viewerHasBlocked: boolean;
};

// safeguarding/guardian-contact-public-visibility (legal-copy Part C row
// 32): a minor's guardian's email is shown on their profile to ANY viewer,
// because a minor cannot send/receive ordinary DMs and this is the only
// route for anyone to reach them. Applies to every current minor (<18),
// not only under-16s. It stops showing at 18: `isMinor` is the stored flag
// (flipped by the daily age-reclassification sweep), and the DOB is also
// checked here so the contact disappears on the birthday itself rather
// than up to ~24h later. Guardian rows are kept after 18 (consent history)
// so the row's existence alone must never drive visibility.
function guardianContactFor(
  isMinor: boolean,
  guardian: { email: string } | null,
  dateOfBirth: Date | null,
): GuardianContact | null {
  if (!isMinor || !guardian) return null;
  if (dateOfBirth && calculateAge(dateOfBirth) >= 18) return null;
  return { label: 'Guardian contact', email: guardian.email };
}

export type OwnProfile = {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  username: string | null;
  // What OTHER users see for this account (username, else displayName).
  publicName: string;
  dateOfBirth: Date | null;
  isMinor: boolean;
  role: string;
  verificationStatus: string;
  createdAt: Date;
  clubAffiliationId: string | null;
  isTeamOrganiser: boolean;
  isUnder16: boolean;
  // Present ONLY for a current minor (isMinor, under 18 by DOB), `null`
  // otherwise -- see guardianContactFor. `email` is the GUARDIAN's
  // address, never the minor's own; `label` makes that unambiguous. The
  // same shape is shown to any viewer via getPublicProfile.
  guardianContact: GuardianContact | null;
  representedClub: { id: string; name: string } | null;
  // backend/w5-profile-block: the owner's own profile content. preferredClub is
  // free text held for the owner only (not exposed on the other-user profile).
  bio: string | null;
  preferredClub: string | null;
  profileCountry: string | null;
  avatar: OwnAvatar | null;
  // B-196: the owner's cover photo with its review status (same shape as avatar).
  cover: OwnAvatar | null;
  // B-027 / B-030: same onboarding state the login response carries (see
  // AuthUserSummary), so a page load with an existing session routes the same
  // way a fresh login does -- including a restricted-pending minor, who must
  // land on the Restricted Pending page on EVERY visit, not only on login.
  profileComplete: boolean;
  guardianConsentStatus: GuardianConsentState;
  nextStep: OnboardingNextStep;
};

type OwnProfileRow = Omit<
  OwnProfile,
  'guardianContact' | 'dateOfBirth' | 'publicName' | 'profileComplete' | 'guardianConsentStatus' | 'nextStep' | 'avatar' | 'cover'
> & {
  dateOfBirth: string | null; // ciphertext
  guardian: { email: string; consentStatus: string } | null;
  avatarUrl: string | null;
  avatarKey: string | null;
  avatarStatus: string | null;
  coverUrl: string | null;
  coverKey: string | null;
  coverStatus: string | null;
};

export interface RepresentedClubResult {
  representedClub: { id: string; name: string } | null;
}

function toOwnProfile(
  {
    guardian,
    dateOfBirth,
    avatarUrl,
    avatarKey: _avatarKey,
    avatarStatus,
    coverUrl,
    coverKey: _coverKey,
    coverStatus,
    ...rest
  }: OwnProfileRow,
  dob: DobEncryptionService,
): OwnProfile {
  void _avatarKey; // internal storage key, never returned
  void _coverKey; // internal storage key, never returned
  const plainDob = dob.decryptNullable(dateOfBirth);
  return {
    ...rest,
    avatar: avatarUrl && avatarStatus ? { url: avatarUrl, status: avatarStatus as OwnAvatar['status'] } : null,
    cover: coverUrl && coverStatus ? { url: coverUrl, status: coverStatus as OwnAvatar['status'] } : null,
    ...deriveOnboardingState({
      isMinor: rest.isMinor,
      guardianConsentStatus: guardian?.consentStatus,
      verificationStatus: rest.verificationStatus,
      username: rest.username,
    }),
    publicName: resolvePublicName(rest),
    dateOfBirth: plainDob,
    guardianContact: guardianContactFor(rest.isMinor, guardian, plainDob),
  };
}

// The ONLY place request-body fields become a Prisma `data` object for
// this update. An explicit allowlist, not `{ ...dto }` — even if
// UpdateUserDto or the global ValidationPipe were ever loosened upstream,
// this function structurally cannot forward isMinor, role,
// verificationStatus, or any other field to Prisma, because it never
// reads them off `dto` in the first place.
function toUpdateData(dto: UpdateUserDto): {
  displayName?: string;
  phone?: string;
  bio?: string | null;
  preferredClub?: string | null;
  profileCountry?: string | null;
} {
  const data: {
    displayName?: string;
    phone?: string;
    bio?: string | null;
    preferredClub?: string | null;
    profileCountry?: string | null;
  } = {};
  if (dto.displayName !== undefined) data.displayName = dto.displayName;
  if (dto.phone !== undefined) data.phone = dto.phone;
  // backend/w5-profile-block (B-038): free-text profile content. Trimmed; null or
  // whitespace-only CLEARS the field (unlike the username, these may be removed).
  // The sensitive-content screen runs in updateOwnProfile BEFORE this is used.
  if (dto.bio !== undefined) data.bio = dto.bio === null || dto.bio.trim() === '' ? null : dto.bio.trim();
  if (dto.preferredClub !== undefined) {
    data.preferredClub = dto.preferredClub === null || dto.preferredClub.trim() === '' ? null : dto.preferredClub.trim();
  }
  // The optional profile country (#403 item 17): validated against the ISO list,
  // stored upper-case, null/blank clears. NEVER touches declaredCountry /
  // derivedCountry (the safeguarding country).
  if (dto.profileCountry !== undefined) data.profileCountry = normaliseProfileCountry(dto.profileCountry);
  // `username` is deliberately NOT forwarded from here: it needs the rules,
  // revoked-handle and cooldown checks and an optimistic lock, so
  // UsersService.updateOwnProfile handles it explicitly (B-031/B-032).
  return data;
}

// Minimal shape for a follower/followee entry on GET /users/:id/followers
// and GET /users/:id/following. Same {id, displayName}-only discipline
// FeedService's POST_AUTHOR_SELECT already established for "what any
// other user sees about someone else" -- deliberately re-declared here
// rather than imported, per this PR's own brief: POST_AUTHOR_SELECT is a
// private, unexported const in feed.service.ts, not reasonably
// importable across modules, so it's duplicated field-for-field instead
// of reaching for a broader User select. No isMinor, email, phone,
// dateOfBirth, verificationStatus, or passwordHash ever leaves Postgres
// via this select.
const FOLLOW_USER_SELECT = {
  id: true,
  ...PUBLIC_NAME_SELECT,
} as const;

// What a client receives: { id, publicName } (see public-name.util.ts).
export type FollowUser = { id: string; publicName: string };

export interface FollowPage {
  items: FollowUser[];
  nextCursor: string | null;
}

// sprint-2/account-deactivation-backend (Decision Log #221). getFollowers/
// getFollowing filter their LIST ENTRIES to active accounts too, not just
// the target :id (assertFollowGraphVisible handles the target): a
// follower/followee who has since deactivated should not surface by
// displayName in someone else's follower/following list. Same principle
// as ACTIVE_AUTHOR_POST_FILTER in feed.service.ts and the accountStatus
// clause added to clubs.service.ts's VISIBLE_CLUB_MEMBER_FILTER.
// Reactivation (a plain accountStatus flip) makes the entry reappear with
// no backfill. There is no follower/following COUNT field anywhere in
// schema.prisma, so unlike a comment/member count there is nothing here
// that can visibly "drift" from the filtered list.
const ACTIVE_FOLLOW_ENTRY_FILTER = { accountStatus: 'active' } as const;

export interface SuggestedUsersResult {
  items: FollowUser[];
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dobEncryption: DobEncryptionService,
    private readonly usernamePolicy: UsernamePolicyService,
  ) {}

  async getOwnProfile(userId: string): Promise<OwnProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: OWN_PROFILE_SELECT,
    });
    if (!user) {
      // A valid 15-minute access token for a since-deleted account is a
      // real (if rare) case, not a hypothetical — the token itself
      // can't know the account is gone.
      throw new NotFoundException('User not found');
    }
    return toOwnProfile(user, this.dobEncryption);
  }

  // GET /users/:id/public-profile -- the profile card any authenticated
  // viewer may read. Deliberately tiny: id, displayName and (for a current
  // minor) the labelled guardian contact; nothing else about the user.
  // Visibility mirrors assertFollowGraphVisible: a non-active account and
  // a restricted-pending minor (consent not confirmed) are a 404, never a
  // 200/403 that confirms they exist. Fresh Postgres read every call.
  //
  // backend/w5-profile-block (B-082 backend leg, B-039; #371, #396, #403 item
  // 17, #404 item 8, #406 item 12). Adds bio, the OPTIONAL profile country, the
  // avatar (approved only) and the viewer's own follow/block state.
  //   - Block: if the TARGET has blocked the VIEWER, the answer is the SAME 404
  //     'User not found' a non-existent profile gets -- same class, same body,
  //     same status -- so nothing reveals the block. The block read runs for
  //     every call (in parallel with the user read), so the not-found paths do
  //     the same work. The viewer's OWN block of the target does not hide the
  //     profile (they must be able to reach it to unblock); it is reported as
  //     viewerHasBlocked.
  //   - Block applies on top of the age rules: the restricted-pending / non-active
  //     404s below are decided first, exactly as before (#404 item 11).
  //   - Country: profileCountry only. The safeguarding country is never selected.
  //   - Preferred club is NOT exposed (not in the #371 list; OPEN).
  async getPublicProfile(userId: string, viewerId: string): Promise<PublicProfile> {
    const isSelf = userId === viewerId;
    const [user, blockRows, followRow] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          ...PUBLIC_NAME_SELECT,
          dateOfBirth: true,
          isMinor: true,
          accountStatus: true,
          guardian: { select: { email: true, consentStatus: true } },
          bio: true,
          profileCountry: true,
          avatarUrl: true,
          avatarStatus: true,
          coverUrl: true,
          coverStatus: true,
        },
      }),
      isSelf
        ? Promise.resolve([] as Array<{ blockerId: string; blockedId: string }>)
        : this.prisma.block.findMany({
            where: blockedPairWhere(viewerId, userId),
            select: { blockerId: true, blockedId: true },
          }),
      isSelf
        ? Promise.resolve(null)
        : this.prisma.follow.findUnique({
            where: { followerId_followeeId: { followerId: viewerId, followeeId: userId } },
            select: { id: true },
          }),
    ]);
    if (!user || user.accountStatus !== 'active') {
      throw new NotFoundException('User not found');
    }
    if (user.isMinor && user.guardian?.consentStatus !== 'confirmed') {
      throw new NotFoundException('User not found');
    }
    const relation = relationFromRows(blockRows, viewerId, userId);
    if (relation === 'other_blocked_viewer') {
      throw new NotFoundException('User not found');
    }
    return {
      ...toPublicUser(user),
      guardianContact: guardianContactFor(
        user.isMinor,
        user.guardian,
        this.dobEncryption.decryptNullable(user.dateOfBirth),
      ),
      bio: user.bio,
      country: user.profileCountry,
      avatarUrl: user.avatarStatus === 'approved' ? user.avatarUrl : null,
      coverUrl: user.coverStatus === 'approved' ? user.coverUrl : null,
      isFollowing: followRow !== null,
      viewerHasBlocked: relation === 'viewer_blocked_other',
    };
  }

  // PATCH /users/:id. displayName and phone are plain writes. A USERNAME change
  // goes through the username rules (B-031/B-032, Decision Log #369):
  //   - it can never be cleared by the user (`null` -> 400 username_required): no
  //     account exists without one once it has chosen, and the only way back to
  //     "no username" is an admin revoke (B-033);
  //   - sending the handle the account already has is a no-op, so it never
  //     starts the change cooldown;
  //   - otherwise UsernamePolicyService must allow it (format-level rules, club
  //     names, the revoked-handle bar and 30-day hold, the change cooldown).
  // The write is an optimistic lock on the username + its change timestamp read
  // for the checks, so two concurrent changes cannot both pass the cooldown.
  async updateOwnProfile(userId: string, dto: UpdateUserDto): Promise<OwnProfile> {
    if (dto.username === null) {
      throw new BadRequestException({
        message: "A username can't be removed. You can change it to another one.",
        code: USERNAME_REQUIRED_CODE,
      });
    }

    // B-038 (Decision Log #394 A3, #366): the pre-publication sensitive-content
    // screen runs over the free text being SAVED (bio, preferred club). A flagged
    // value is refused with a 422 and NOTHING is written (including the other
    // fields of the same request); the client shows an inline 'please rephrase'
    // state on the named field. Only the field NAMES and categories are returned,
    // never the text. Unlike Grassroots there is no 'share anyway' confirmation
    // and no auto-logged Report: the decision wording is 'please rephrase', and
    // whether an override or a moderation report exists is OPEN
    // (docs/backend-w5-report.md).
    const flags = screenSensitiveContent({ bio: dto.bio, preferredClub: dto.preferredClub });
    if (flags.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'Unprocessable Entity',
        code: SENSITIVE_PROFILE_REPHRASE_CODE,
        message: 'Please rephrase this. It looks like it may mention something sensitive about someone.',
        flaggedFields: flags,
      });
    }

    const data: Prisma.UserUpdateManyMutationInput = toUpdateData(dto);
    let lock: { username: string | null; usernameChangedAt: Date | null } | null = null;

    if (dto.username !== undefined) {
      const current = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, usernameChangedAt: true, displayName: true, email: true, dateOfBirth: true },
      });
      if (!current) {
        throw new NotFoundException('User not found');
      }
      const candidate = dto.username.toLowerCase();
      if (candidate !== current.username) {
        await this.usernamePolicy.assertAssignable({
          userId,
          candidate,
          current: current.username,
          usernameChangedAt: current.usernameChangedAt,
          owner: {
            displayName: current.displayName,
            email: current.email,
            dateOfBirth: this.dobEncryption.decryptNullable(current.dateOfBirth),
          },
        });
        data.username = candidate;
        // Only a change FROM a value starts the cooldown (see schema comment).
        if (current.username !== null) data.usernameChangedAt = new Date();
        lock = { username: current.username, usernameChangedAt: current.usernameChangedAt };
      }
    }

    try {
      if (lock) {
        const result = await this.prisma.user.updateMany({ where: { id: userId, ...lock }, data });
        if (result.count === 0) {
          throw new ConflictException('Your profile changed while this was being saved. Please try again.');
        }
        return await this.getOwnProfile(userId);
      }
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data,
        select: OWN_PROFILE_SELECT,
      });
      return toOwnProfile(updated, this.dobEncryption);
    } catch (err) {
      // The only unique column this update can write is username. Racing
      // claims on the same name lose here with a clean 409, never a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('That username is already taken');
      }
      throw err;
    }
  }

  // Shared existence check for the four follow endpoints below, mirroring
  // FeedService.assertPostExists's exact shape/intent: "does :id
  // reference a real User" is the first move for follow/unfollow/
  // followers/following, and a well-formed but non-existent id must 404,
  // never a raw FK violation surfaced as 400/500.
  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  // B-039 (Decision Log #396, #404 item 11): follow = a social action, so a block
  // in either direction stops it, and a block never reveals itself.
  //   - the followee has blocked the follower -> the SAME 404 'User not found' a
  //     non-existent user gets (the existence read and the block read run
  //     together for every call, so the two paths do the same work);
  //   - the follower has blocked the followee -> 403 with a code only the blocker
  //     can ever receive ("Unblock them to do that").
  private async assertUserExistsAndNotBlocked(callerId: string, otherId: string): Promise<void> {
    const [user, blockRows] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: otherId }, select: { id: true } }),
      this.prisma.block.findMany({
        where: blockedPairWhere(callerId, otherId),
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const relation = relationFromRows(blockRows, callerId, otherId);
    if (relation === 'other_blocked_viewer') {
      throw new NotFoundException('User not found');
    }
    if (relation === 'viewer_blocked_other') {
      throw new ForbiddenException({ message: YOU_BLOCKED_THIS_USER_MESSAGE, code: YOU_BLOCKED_THIS_USER_CODE });
    }
  }

  // Existence + safeguarding visibility check for getFollowers/getFollowing
  // ONLY -- revisits Decision Log #31 (users/README.md point 2, "followers/
  // following public-scope reasoning"), does not override it. #31 reasoned
  // entirely from product parity with mainstream social apps and checked
  // only whether Section 8.3 step 5's *enumerated* restricted-pending list
  // named followers/following specifically (it doesn't) -- it never
  // cross-checked against Section 8.3's broader principle that a minor's
  // profile shouldn't be visible outside the guardian relationship before
  // consent is recorded. This closes that gap: a restricted-pending
  // minor's social graph (:id as the TARGET, not the caller) is hidden
  // entirely, regardless of who's asking -- see users/README.md's
  // "followers/following restricted-pending gap" section for the full
  // options considered and why this is the conservative default.
  //
  // Deliberately NOT GuardianConsentGuard -- that guard reads
  // request.user (the CALLER) to decide what the caller may do; this
  // check is the opposite direction, reading whether the :id in the URL
  // (the TARGET, who may not be the caller at all) is a restricted-
  // pending minor whose social graph shouldn't be exposed. Mirrors
  // GuardianConsentGuard's own isMinor -> Guardian.consentStatus read
  // pattern and Section 5.7's fresh-read-from-Postgres discipline, but a
  // guard can't express "check the route param's owner," only "check the
  // authenticated caller," so this is a service-level check instead.
  //
  // A restricted-pending target is treated identically to a non-existent
  // one (NotFoundException, not a distinct 403) -- the target's social
  // graph edges don't exist from the caller's point of view, matching
  // this codebase's established "hide via 404, never a silent 200/403
  // that confirms a restricted account exists" convention (e.g.
  // GuardianConsentController's own "no Guardian row" 404).
  //
  // B-039: when a `viewerId` is given and the TARGET has blocked the viewer, the
  // target's graph is the same 404 as a non-existent user (their profile is "not
  // found" to the viewer, #404 item 8). The viewer's own block of the target does
  // not hide it (they can still reach the profile to unblock).
  private async assertFollowGraphVisible(userId: string, viewerId?: string): Promise<void> {
    const [user, blockedViewer] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isMinor: true, accountStatus: true },
      }),
      viewerId && viewerId !== userId
        ? this.prisma.block.findFirst({
            where: { blockerId: userId, blockedId: viewerId },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (blockedViewer) {
      throw new NotFoundException('User not found');
    }
    // sprint-2/account-deactivation-backend (Decision Log #221): a
    // deactivated (or pending_deletion) TARGET's social graph is hidden
    // entirely, same 404-not-403 treatment as a restricted-pending minor
    // below and a non-existent user above — a deactivated account's
    // profile is not browsable while it's in that state. Checked before
    // the minor branch because it applies regardless of age.
    if (user.accountStatus !== 'active') {
      throw new NotFoundException('User not found');
    }
    if (!user.isMinor) {
      return;
    }

    // Guardian.minorUserId is @unique (prisma/schema.prisma) -- at most
    // one Guardian row per minor.
    const guardian = await this.prisma.guardian.findUnique({
      where: { minorUserId: userId },
      select: { consentStatus: true },
    });
    if (guardian?.consentStatus === 'confirmed') {
      return;
    }

    throw new NotFoundException('User not found');
  }

  // PATCH /users/:id/represented-club (Decision Log #74). A non-null clubId
  // must be one of the caller's own club memberships (ClubPage.members) —
  // checked here, not in the DTO, because it needs a database read. Any
  // other club id (not joined, or non-existent) is a 400, not a 404: the
  // caller named a club as an input they can't use. null is valid and
  // unrepresents the club. Same shape as BanterService.updateRoomStatus:
  // validate, write, return the resulting view.
  async setRepresentedClub(userId: string, clubId: string | null): Promise<RepresentedClubResult> {
    if (clubId !== null) {
      const membership = await this.prisma.clubPage.findFirst({
        where: { id: clubId, members: { some: { id: userId } } },
        select: { id: true },
      });
      if (!membership) {
        throw new BadRequestException('You can only represent a club you have joined');
      }
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { representedClubId: clubId },
      select: { representedClub: { select: { id: true, name: true } } },
    });
    return { representedClub: updated.representedClub };
  }

  // POST /users/:id/follow. followerId is the caller (from the verified
  // JWT), followeeId is :id. Self-follow is a business rule, not an auth
  // check -- rejected with 400 here, the same "cross-field/business
  // rules belong in the service layer" precedent FeedService.createPost
  // established for its clubPageId/banterRoomId mutual-exclusivity check.
  //
  // Idempotency mirrors FeedService.likePost exactly: Follow.@@unique
  // ([followerId, followeeId]) backs a P2002-on-duplicate-create being
  // caught and treated as success, not a 500. The Follow row's creation
  // and the recipient's Notification row are written inside the same
  // interactive transaction (see users/README.md's payloadRefId
  // convention) -- if the Follow create throws P2002, the Notification
  // create never runs, so a repeat follow can never produce a duplicate
  // Notification. type: 'follow' (matching Notification.type's
  // documented enum in schema.prisma exactly), payloadRefId: the
  // follower's own userId, so the recipient's client can resolve "who
  // followed me" from the notification alone.
  async followUser(followerId: string, followeeId: string): Promise<{ following: true }> {
    if (followerId === followeeId) {
      throw new BadRequestException('You cannot follow yourself');
    }
    await this.assertUserExistsAndNotBlocked(followerId, followeeId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.follow.create({ data: { followerId, followeeId } });
        // B-197: no new Notification where the pair has a Block (the follow itself is
        // refused earlier for a blocked pair; this keeps the rule in one place).
        if (!(await hasBlockBetween(tx, followerId, followeeId))) {
          await tx.notification.create({
            data: { userId: followeeId, type: 'follow', payloadRefId: followerId },
          });
        }
        // Baseline-engagement point for the FOLLOWER (the action-taker) —
        // sprint-2/contest-data-model-backend, Decision Log #219. Only
        // reached on a genuine first follow (a duplicate throws P2002 on
        // tx.follow.create above and rolls this back); the ledger's own
        // @@unique([source, refId, userId]) backstops re-follow.
        await awardPoints(tx, {
          userId: followerId,
          source: 'engagement_follow',
          refId: followeeId,
          points: ENGAGEMENT_POINTS.FOLLOW_MADE,
        });
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
      // Already following -- idempotent success, no duplicate Follow row
      // and (because the create never got this far) no duplicate
      // Notification either.
    }

    return { following: true };
  }

  // DELETE /users/:id/follow. Symmetric idempotency to unlikePost: no
  // Follow row for this (followerId, followeeId) pair is a no-op
  // success, not a 404 -- "you don't follow this user" and "you
  // successfully ensured you don't follow this user" are the same
  // observable end state. Self-unfollow is rejected the same way
  // self-follow is (400) -- stated once in this PR's brief for both
  // verbs together, and there is genuinely no Follow row a self-follow
  // rejection could ever have allowed to exist, so this is a consistency
  // choice, not a behavior change from the P2025-idempotent path it would
  // otherwise fall into.
  //
  // No Notification on unfollow, on purpose -- removing an action isn't
  // performing one; only followUser (and likePost/addComment in
  // FeedService) create Notification rows.
  async unfollowUser(followerId: string, followeeId: string): Promise<{ following: false }> {
    if (followerId === followeeId) {
      throw new BadRequestException('You cannot unfollow yourself');
    }
    await this.assertUserExists(followeeId);

    try {
      await this.prisma.follow.delete({ where: { followerId_followeeId: { followerId, followeeId } } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
        throw err;
      }
      // Wasn't following -- idempotent success.
    }

    return { following: false };
  }

  // GET /users/:id/followers -- users who follow :id (Follow rows where
  // followeeId = :id, each entry is the follower). NOT self-scoped -- see
  // users/README.md's "followers/following public-scope reasoning" for
  // the full argument; short version: this is standard public social
  // graph data on every platform this product is modeled after, and
  // nothing in Section 8.3 step 5's *enumerated* restricted-pending list
  // or Section 5.7 restricts it by name.
  //
  // sprint-2/followers-scope-fix: that public-scope conclusion (Decision
  // Log #31) is revisited, not overridden, for one specific case -- a
  // restricted-pending minor as the TARGET (:id), regardless of who's
  // asking. See assertFollowGraphVisible and users/README.md's
  // "followers/following restricted-pending gap" section (supersedes
  // Decision Log #31, pending founder review).
  //
  // Same keyset-cursor pagination pattern as FeedService (cursor.util.ts
  // reused as-is, no second pagination scheme invented), ordered
  // most-recently-followed-first (createdAt desc, sequence desc
  // tiebreaker on Follow's own row -- NOT the embedded user's id).
  //
  // fix/follow-pagination-tiebreaker: the tiebreaker used to be Follow.id
  // (a random UUID with no relation to insertion order -- the same class
  // of bug fix/feed-pagination-tiebreaker fixed for Post/Comment/
  // SavedPost). Follow.sequence (see its own comment in schema.prisma) is
  // a genuinely monotonic counter, so ties now resolve in true
  // most-recently-followed-first order. This reuses FeedSequenceCursor/
  // encodeFeedSequenceCursor/decodeFeedSequenceCursor from
  // feed/cursor.util.ts (the same pair feed.service.ts's own three
  // sequence-tiebroken call sites use) rather than the plain FeedCursor/
  // encodeFeedCursor/decodeFeedCursor pair this method used to import --
  // that pair's envelope shape ({ createdAt, id: string }) has no room
  // for a numeric sequence, so a second cursor shape would have to be
  // invented if FeedSequenceCursor weren't already generic enough; it is.
  // :id not referencing a real User -> 404.
  async getFollowers(userId: string, query: FeedQueryDto, viewerId?: string): Promise<FollowPage> {
    await this.assertFollowGraphVisible(userId, viewerId);

    const limit = Math.min(query.limit ?? FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE);

    // B-039: list entries who are blocked in either direction with the VIEWER
    // are hidden from the viewer (rosters, #402 item 4).
    const where: Prisma.FollowWhereInput = {
      followeeId: userId,
      follower: { is: viewerId ? { ...ACTIVE_FOLLOW_ENTRY_FILTER, ...notBlockedWith(viewerId) } : ACTIVE_FOLLOW_ENTRY_FILTER },
      ...(query.cursor ? this.buildFollowCursorFilter(query.cursor) : {}),
    };

    const rows = await this.prisma.follow.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { sequence: 'desc' }],
      take: limit + 1,
      select: { sequence: true, createdAt: true, follower: { select: FOLLOW_USER_SELECT } },
    });

    return this.toFollowPage(rows, limit, (row) => row.follower);
  }

  // GET /users/:id/following -- users :id follows (Follow rows where
  // followerId = :id, each entry is the followee). Same scope/pagination
  // reasoning as getFollowers above, mirrored exactly.
  async getFollowing(userId: string, query: FeedQueryDto, viewerId?: string): Promise<FollowPage> {
    await this.assertFollowGraphVisible(userId, viewerId);

    const limit = Math.min(query.limit ?? FEED_DEFAULT_PAGE_SIZE, FEED_MAX_PAGE_SIZE);

    const where: Prisma.FollowWhereInput = {
      followerId: userId,
      followee: { is: viewerId ? { ...ACTIVE_FOLLOW_ENTRY_FILTER, ...notBlockedWith(viewerId) } : ACTIVE_FOLLOW_ENTRY_FILTER },
      ...(query.cursor ? this.buildFollowCursorFilter(query.cursor) : {}),
    };

    const rows = await this.prisma.follow.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { sequence: 'desc' }],
      take: limit + 1,
      select: { sequence: true, createdAt: true, followee: { select: FOLLOW_USER_SELECT } },
    });

    return this.toFollowPage(rows, limit, (row) => row.followee);
  }

  // GET /users/suggested?limit= -- the Search & Trending "Suggested"
  // follow panel (Build Plan Section 4.7, Decision Log #139;
  // sprint-6/suggested-people-backend). JwtAuthGuard-required (unlike
  // GET /search / GET /trending, both genuinely public) -- this
  // endpoint's whole job is "who is the CALLER not already following,"
  // which has no meaning without knowing who the caller is.
  //
  // Ranking is a v1 HEURISTIC, not a real recommendation algorithm --
  // ordered by createdAt desc (most-recently-joined), tiebroken by id
  // desc for a stable order across ties. schema.prisma's User model has
  // NO lastActiveAt / lastLoginAt / updatedAt field anywhere (confirmed
  // by grep before writing this -- the only DateTime columns on User are
  // dateOfBirth, createdAt, and pendingDeletionAt), so
  // "most-recently-active" is not a signal this codebase can cheaply
  // compute today; createdAt is the only free timestamp available.
  // Revisit this ordering once a real activity signal exists (e.g. a
  // dedicated lastActiveAt column, or deriving it from the most recent
  // Post/Like/Comment row -- both are real future work, not done here).
  //
  // Exclusion rules mirror search.service.ts's own
  // VISIBLE_SEARCH_USER_FILTER exactly, re-declared inline below per this
  // codebase's established "small duplicate over cross-module import"
  // convention (search/README.md's "Exclusion rules" section documents
  // the same pattern): accountStatus 'active' only (a deactivated,
  // pending_deletion, suspended, or anonymized ('deleted') account is
  // never suggested -- narrower than the post-author filter elsewhere,
  // same reasoning as search's own), and a restricted-pending minor
  // (isMinor with no CONFIRMED guardian consent) is excluded, the same
  // "hide via absence, never a distinct signal" treatment
  // assertFollowGraphVisible and clubs.service.ts's
  // VISIBLE_CLUB_MEMBER_FILTER already give this exact case. The caller
  // themselves and every user they already follow are excluded too.
  //
  // User-to-user Block (B-039, backend/w5-profile-block) is excluded in both
  // directions via notBlockedWith below. That module's own
  // split still applies here: this is a DISCOVERY-time filter ("should
  // this person ever be suggested"), not an ACTION-time check ("am I
  // specifically allowed to message/follow this person") -- the latter
  // is messaging.service.ts's own assertRecipientMessageable, which this
  // method does not duplicate.
  async getSuggestedUsers(callerId: string, limit: number): Promise<SuggestedUsersResult> {
    const rows = await this.prisma.user.findMany({
      where: {
        id: { not: callerId },
        accountStatus: 'active',
        OR: [{ isMinor: false }, { guardian: { consentStatus: 'confirmed' } }],
        followedBy: { none: { followerId: callerId } },
        // B-039: nobody the caller has blocked, or who has blocked the caller.
        ...notBlockedWith(callerId),
      },
      select: FOLLOW_USER_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return { items: rows.map(toPublicUser) };
  }

  // Shared pagination-shaping helper for getFollowers/getFollowing --
  // both fetch limit+1 Follow rows (each embedding either `follower` or
  // `followee`, the only difference between the two callers) and need
  // the identical "trim the lookahead row, build nextCursor from the
  // last kept row's (createdAt, sequence)" logic FeedService.getFeed/
  // getComments/getSavedPosts each repeat inline for their own single
  // caller. With two callers sharing the exact same shape here, factoring
  // it once is worth the small indirection.
  private toFollowPage<T extends { sequence: number; createdAt: Date }>(
    rows: T[],
    limit: number,
    pickUser: (row: T) => { id: string; username: string | null; displayName: string },
  ): FollowPage {
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const last = sliced[sliced.length - 1];
    const nextCursor =
      hasMore && last ? encodeFeedSequenceCursor({ createdAt: last.createdAt, sequence: last.sequence }) : null;

    return { items: sliced.map((row) => toPublicUser(pickUser(row))), nextCursor };
  }

  private buildFollowCursorFilter(rawCursor: string): Prisma.FollowWhereInput {
    const cursor = decodeFeedSequenceCursor(rawCursor);
    return {
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, sequence: { lt: cursor.sequence } },
      ],
    };
  }
}
