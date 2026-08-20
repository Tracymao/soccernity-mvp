// App root: wires up the router (src/app/router.tsx). Real screens land
// as route children of AppShell, sprint by sprint -- see CLAUDE.md for
// sequencing and the Build Plan Section 6 backlog. Do not hand-build a
// screen here that figma-to-code should be converting from a finished
// Figma design -- add a route + placeholder page instead (see
// src/pages/PlaceholderPage.tsx).
import { RouterProvider } from "react-router";
import { router } from "./app/router";

export default function App() {
  return <RouterProvider router={router} />;
}
