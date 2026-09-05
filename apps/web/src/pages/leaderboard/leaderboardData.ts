// Illustrative dummy data for LeaderboardPage.tsx.
//
// Backend state, confirmed live before writing this (services/api/src/
// modules/leaderboard/README.md): "Build target: Sprint 6... Not yet
// implemented." There is no GET /leaderboard endpoint anywhere, and the
// only related schema model, `LeaderboardEntry` (userId, points, rank,
// period), has zero live reads or writes. The Contest/Competition data
// model (entities, entries, votes, rounds) does not exist in the schema
// at all — Decision Log #70-73 confirms this is still founder-blocked on
// the *data model* even though the design/screen-building blocker was
// cleared (Decision Log #128-130).
//
// Every ranking, name, handle, club and points value below is hardcoded
// to match the Figma frame's own dummy content (5171:6633's table rows) —
// the same "dummy data ahead of the still-open backend blocker"
// convention used by every Leaderboard/Contest Figma session and by
// HomePage.tsx's own FIXTURES/TALENT_CLIPS constants. None of it is wired
// to any endpoint.
export interface LeaderboardRow {
  rank: number;
  name: string;
  handle: string;
  club: string;
  weeklyChange: number | null; // null renders as "—" (no change)
  points: number;
  isYou?: boolean;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export { initialsFor };

// Matches Figma frame 5171:6633's "Overall · Global · All-time" table
// verbatim (10 rows + the pinned "your rank" row from the annotation
// zone's State Study A, folded in here as row 7 rather than a separate
// pinned bar — a deliberate simplification for this first conversion
// pass, disclosed in LeaderboardPage.tsx's own header comment).
export const OVERALL_ROWS: LeaderboardRow[] = [
  { rank: 1, name: "Emeka John", handle: "@mekaa", club: "Ikoyi Rovers FC", weeklyChange: 2, points: 4860 },
  { rank: 2, name: "Chukwu James", handle: "@chukwuj", club: "Surulere United", weeklyChange: null, points: 4512 },
  { rank: 3, name: "Abdul Yusuf", handle: "@ayusuf", club: "Port Harcourt Blues", weeklyChange: 1, points: 4205 },
  { rank: 4, name: "Ngozi Okafor", handle: "@ngozio", club: "Ajegunle Stars FC", weeklyChange: -2, points: 3974 },
  { rank: 5, name: "Tunde Bakare", handle: "@tundeb", club: "Surulere United", weeklyChange: 4, points: 3640 },
  { rank: 6, name: "Sarah Bello", handle: "@sarahb", club: "Yaba Athletic", weeklyChange: null, points: 3318 },
  { rank: 7, name: "Adeniyi Christiana", handle: "@adeniyic", club: "Port Harcourt Blues", weeklyChange: 3, points: 3102, isYou: true },
  { rank: 8, name: "Ifeanyi Nwosu", handle: "@ifeanyin", club: "Ajegunle Stars FC", weeklyChange: -1, points: 2975 },
  { rank: 9, name: "Blessing Ade", handle: "@blessinga", club: "Yaba Athletic", weeklyChange: 6, points: 2740 },
  { rank: 10, name: "Musa Ibrahim", handle: "@musai", club: "Ikoyi Rovers FC", weeklyChange: -3, points: 2588 },
];

export const TOTAL_RANKED_PLAYERS = 12480;

// Contest tab — a single illustrative "weekly winners so far" state.
// NOTE: the real Contest mechanic has four distinct phases (Vacant ->
// weekly-fill x3 -> Live Level-1 Final -> Crowned monthly winners,
// Decision Log #70) built as separate Figma frames. Reproducing all four
// states is a materially larger scope than this first conversion pass —
// deliberately not attempted here, flagged in LeaderboardPage.tsx's own
// comment and in this PR's Decision Log entry. One representative state
// is shown instead.
export const CONTEST_ROWS: LeaderboardRow[] = [
  { rank: 1, name: "Emeka John", handle: "@mekaa", club: "Ikoyi Rovers FC", weeklyChange: null, points: 512 },
  { rank: 2, name: "Chukwu James", handle: "@chukwuj", club: "Surulere United", weeklyChange: null, points: 498 },
  { rank: 3, name: "Ngozi Okafor", handle: "@ngozio", club: "Ajegunle Stars FC", weeklyChange: null, points: 470 },
];

export type CompetitionType = "prediction" | "commentary";

export interface CompetitionRow {
  rank: number;
  name: string;
  handle: string;
  club: string;
  metric: string; // "94% accuracy" or "312 votes" -- competition-supplied label
  score: number;
}

// Generic RANK/PLAYER/CLUB/<metric>/SCORE shell, per Decision Log #72 --
// the middle metric column is competition-supplied (Accuracy vs Votes),
// never hardcoded to one competition type.
export const COMPETITION_ROWS: Record<CompetitionType, CompetitionRow[]> = {
  prediction: [
    { rank: 1, name: "Abdul Yusuf", handle: "@ayusuf", club: "Port Harcourt Blues", metric: "94% accuracy", score: 940 },
    { rank: 2, name: "Sarah Bello", handle: "@sarahb", club: "Yaba Athletic", metric: "89% accuracy", score: 890 },
    { rank: 3, name: "Musa Ibrahim", handle: "@musai", club: "Ikoyi Rovers FC", metric: "85% accuracy", score: 850 },
  ],
  commentary: [
    { rank: 1, name: "Blessing Ade", handle: "@blessinga", club: "Yaba Athletic", metric: "312 votes", score: 312 },
    { rank: 2, name: "Tunde Bakare", handle: "@tundeb", club: "Surulere United", metric: "277 votes", score: 277 },
    { rank: 3, name: "Ifeanyi Nwosu", handle: "@ifeanyin", club: "Ajegunle Stars FC", metric: "203 votes", score: 203 },
  ],
};
