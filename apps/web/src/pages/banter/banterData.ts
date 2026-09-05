// Illustrative dummy data for BanterPage.tsx.
//
// Backend state, confirmed live before writing this: services/api/src/
// modules/banter/README.md is a placeholder only ("Build target:
// Sprint 3... Not yet implemented"). The `BanterRoom` model exists in
// prisma/schema.prisma (name, scopeType, createdBy, memberCount, posts)
// but has zero live reads or writes anywhere -- no controller, no
// service. Everything below is hardcoded to match the Figma frames'
// own dummy content ("Bants homepage - All feed" 2256:6802 and
// "Bants - search result" 2448:2179), the same "dummy data ahead of the
// still-open backend blocker" convention CommunityPage.tsx's own
// SAMPLE_TRENDS/SAMPLE_SUGGESTIONS/SAMPLE_NEWS constants use.
export interface BanterRoomSummary {
  id: string;
  name: string;
  scope: string; // club | league | country | topic, matches BanterRoom.scopeType's shape
  memberCount: number;
}

export const ROOMS: BanterRoomSummary[] = [
  { id: "room-1", name: "Chelsea vs Arsenal — Matchday Chat", scope: "Club rivalry", memberCount: 5230 },
  { id: "room-2", name: "Manchester United Faithful", scope: "Club", memberCount: 4110 },
  { id: "room-3", name: "NPFL Weekly Roundup", scope: "League", memberCount: 2870 },
  { id: "room-4", name: "Europa League Nights", scope: "Competition", memberCount: 1990 },
  { id: "room-5", name: "Grassroots Sunday League Talk", scope: "Topic", memberCount: 1420 },
  { id: "room-6", name: "Transfer Window Watch", scope: "Topic", memberCount: 3305 },
  { id: "room-7", name: "Lagos Derby Day", scope: "Club rivalry", memberCount: 980 },
];

export const TRENDS = [
  { topic: "Ronaldo", meta: "2,500 posts" },
  { topic: "Manchester United", meta: "2,325 posts" },
  { topic: "Alex Ferguson", meta: "1,856 posts" },
  { topic: "#ChelseaVsArsenal", meta: "1,213 posts" },
  { topic: "Emirates Stadium", meta: "1,104 posts" },
  { topic: "#NPFL", meta: "998 posts" },
  { topic: "#Europa", meta: "898 posts" },
];

export interface FixtureRow {
  home: string;
  away: string;
  kickoff: string;
}

export const FIXTURES: FixtureRow[] = [
  { home: "Chelsea", away: "Liverpool", kickoff: "16:00" },
  { home: "Chelsea", away: "Liverpool", kickoff: "16:00" },
  { home: "Chelsea", away: "Liverpool", kickoff: "Today" },
  { home: "Chelsea", away: "Liverpool", kickoff: "Today" },
  { home: "Chelsea", away: "Liverpool", kickoff: "Today" },
  { home: "Chelsea", away: "Liverpool", kickoff: "Today" },
  { home: "Chelsea", away: "Liverpool", kickoff: "Today" },
];

export const SUGGESTED = [
  { name: "Emeka John", handle: "@mekusa" },
  { name: "Abdul Yusuf", handle: "@naijamessi" },
  { name: "Chukwu James", handle: "@nicekidzz" },
];
