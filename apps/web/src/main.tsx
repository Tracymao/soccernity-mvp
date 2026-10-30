import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme } from "./theme/applyTheme";
import { installSilentRefresh } from "./lib/silentRefresh";
import { initSessionChannel } from "./lib/session";
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
