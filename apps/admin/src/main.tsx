import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyAdminTheme } from "./theme/adminTheme";
import "./styles/global.css";

// Sets --sn-* CSS custom properties from @soccernity/shared's design
// tokens before first paint. See src/theme/adminTheme.ts.
applyAdminTheme("light");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
