// Illustrative dummy data for BanterPage.tsx -- the side-rail content
// ONLY. The room list itself is now REAL (sprint-3/banter-messaging-to-
// code, api/banter.ts) -- BanterModule is merged in services/api
// (sprint-3/banter-rooms-backend; Decision Log #275/#276), so the
// BanterRoomSummary/ROOMS constants that used to live here are gone.
//
// TRENDS / FIXTURES / SUGGESTED remain hardcoded: there is still no
// news, fixtures (Decision Log #6) or people-suggestion endpoint
// anywhere in Build Plan Section 4 -- the same "dummy data ahead of a
// still-open backend blocker" convention CommunityPage.tsx's own
// SAMPLE_TRENDS/SAMPLE_SUGGESTIONS/SAMPLE_NEWS constants use, matching
// the Figma frames' own dummy content ("Bants homepage - All feed"
// 2256:6802 and "Bants - search result" 2448:2179).
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
