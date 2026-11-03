import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme } from "./theme/applyTheme";
import { installSilentRefresh } from "./lib/silentRefresh";
import { initSessionChannel } from "./lib/session";
// Self-hosted fonts (@fontsource, latin subset): no request to Google Fonts or any font CDN, so the
// site needs no extra font-src origin. Inter and Montserrat are the two families the Figma web frames
// use and the CSS names. Load exactly the weights the CSS uses -- src/fonts.test.ts fails if a CSS rule
// uses a family/weight with no import here.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/montserrat/latin-400.css";
import "@fontsource/montserrat/latin-500.css";
import "@fontsource/montserrat/latin-600.css";
import "@fontsource/montserrat/latin-700.css";
import "@fontsource/montserrat/latin-800.css";
import "./styles/global.css";

// Sets --sn-* CSS custom properties from packages/shared's design tokens
// before first paint. See src/theme/applyTheme.ts.
applyTheme("light");

// B-246: the session is in memory only (the refresh token is the httpOnly cookie).
// Start listening on the cross-tab channel before anything can be missed.
initSessionChannel();

// B-017: transparent refresh of an expired access token for every API client
// (now through the httpOnly refresh cookie, B-246).
installSilentRefresh();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
