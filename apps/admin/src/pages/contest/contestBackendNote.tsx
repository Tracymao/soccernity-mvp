// Shared disclosure for every Contest admin screen.
//
// The backend state, verified against services/api/src/modules/contest/
// (sprint-2/contest-data-model-backend, Decision Log #218/#219):
//
//  - REAL, AdminJwtAuthGuard-protected write endpoints exist:
//      POST /admin/contest/cycles
//      POST /admin/contest/cycles/:id/rounds/:week/results
//      POST /admin/contest/cycles/:id/final/open
//      POST /admin/contest/cycles/:id/crown
//  - There is NO admin READ endpoint (GET /contest/current and
//    GET /contest/cycles/:id are JwtAuthGuard — user token, unusable here).
//  - The backend models a ContestCycle with weekly ContestRounds. The
//    Figma screens model a "task" (Task Name / Hashtag / Description /
//    Target Entry Count) — there is NO "task" entity anywhere.
//
// So none of the 9 Figma Contest screens maps to a real endpoint, and the
// 4 real endpoints have no screen. A working Contest admin console needs a
// GET /admin/contest/* read endpoint + Figma screens for the real
// cycle/round/judge/final/crown workflow — a coordinated backend + design
// + code pass. Flagged as a Decision Log candidate in this PR.
import { StubBanner } from "../../components/stub/AdminStub";

export function ContestBackendNote() {
  return (
    <StubBanner>
      The Figma “task” model (Task Name / Hashtag / Description / Target Entry Count) has no
      backend entity — the backend uses <code>ContestCycle</code> / <code>ContestRound</code>
      (`sprint-2/contest-data-model-backend`), and it has no admin read endpoint. The 4 real
      admin write endpoints (`POST /admin/contest/*`) have no screen. Nothing here is wired.
    </StubBanner>
  );
}
