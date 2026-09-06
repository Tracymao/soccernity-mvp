// App root for the Admin & Operations Console (Log Book Section 6.6).
//
// This pillar is already fully designed in Figma (29 screens, all
// instancing the shared "Admin Shell" component). Work here is
// figma-to-code conversion, sprint by sprint — see CLAUDE.md "Where
// things stand right now" for which sections are converted.
//
// Do not hand-build a section screen here — add it as a route element in
// src/app/routes.tsx.
import { RouterProvider } from "react-router-dom";
import { AdminAuthProvider } from "./auth/AdminAuthContext";
import { router } from "./app/routes";

export default function App() {
  return (
    <AdminAuthProvider>
      <RouterProvider router={router} />
    </AdminAuthProvider>
  );
}
