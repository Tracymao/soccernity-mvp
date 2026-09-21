// Illustrative dummy data for the COMPETITION board of LeaderboardPage.tsx.
//
// The Competition data model (Prediction / Commentary entities, entries,
// votes) does not exist in the schema (Decision Log #72/#73), so this board
// stays illustrative -- hardcoded to match the Figma frame's dummy rows, the
// same convention HomePage.tsx's FIXTURES uses. Nothing here is wired to any
// endpoint.
//
// The Overall board is NOT here any more: it reads the real GET /leaderboard
// (Decision Log #292) via api/leaderboard.ts, and the Contest board reads
// GET /contest/current. Only initialsFor (shared by all boards) and the
// Competition rows below remain.
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export { initialsFor };

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
