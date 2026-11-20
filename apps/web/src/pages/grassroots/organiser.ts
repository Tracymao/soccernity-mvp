// Shared helper for the Grassroots create/manage pages -- reads the
// caller's own User.isTeamOrganiser flag (backend/team-organiser-flag,
// set the moment POST /teams succeeds -- see services/api's
// GrassrootsService.createTeam). This flag governs whether create/manage
// UI is SHOWN, not whether an action is ALLOWED -- every Grassroots write
// endpoint still enforces its own real per-team/per-fixture organiser
// check server-side (Decision Log #255) regardless of what this returns.
// Browsing (team list, fixture list, results) never consults this at all.
//
// Failure degrades to `false` rather than throwing -- a profile-fetch
// hiccup should never block the surrounding page's own team/fixture load,
// and hiding create/manage affordances on a transient failure is the safe
// direction (the server remains the real gate either way).
import { getUser } from "../../api/users";

export async function fetchIsTeamOrganiser(accessToken: string, userId: string): Promise<boolean> {
  try {
    const profile = await getUser(accessToken, userId);
    return profile.isTeamOrganiser;
  } catch {
    return false;
  }
}
