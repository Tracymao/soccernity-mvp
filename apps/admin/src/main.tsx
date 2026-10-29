import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyAdminTheme } from "./theme/adminTheme";
import { initAdminSessionChannel } from "./lib/adminSession";
// Self-hosted Montserrat (latin subset), the four weights the Admin Shell design uses.
// Replaces the Google Fonts <link> that used to be in index.html, so the strict
// static-site CSP needs no fonts.googleapis.com / fonts.gstatic.com allowance.
import "@fontsource/montserrat/latin-400.css";
import "@fontsource/montserrat/latin-500.css";
import "@fontsource/montserrat/latin-600.css";
import "@fontsource/montserrat/latin-700.css";
import "./styles/global.css";

// Sets --sn-* CSS custom properties from @soccernity/shared's design
// tokens before first paint. See src/theme/adminTheme.ts.
applyAdminTheme("light");

// Listen for token hand-offs and sign-outs from other tabs as early as possible (B-247).
initAdminSessionChannel();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
