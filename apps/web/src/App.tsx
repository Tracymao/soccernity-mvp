// App root: wires up the router (src/app/router.tsx). Real screens land
// as route children of AppShell (or AuthChrome, for the core auth
// routes -- Decision Log #172), sprint by sprint -- see CLAUDE.md for
// sequencing and the Build Plan Section 6 backlog. Do not hand-build a
// screen here that figma-to-code should be converting from a finished
// Figma design -- add a route + placeholder page instead (see
// src/pages/PlaceholderPage.tsx).
import { RouterProvider } from "react-router";
import { router } from "./app/router";
import { AuthProvider } from "./lib/AuthContext";

// B-246: AuthProvider restores the session (one POST /auth/refresh through the
// httpOnly cookie) before the router renders, so a signed-in person never sees
// the signed-out chrome or a login prompt flash up on a reload.
export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
