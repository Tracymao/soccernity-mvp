// Root layout: header chrome + routed page content.
//
// This is the single place F2-F6 don't need to touch to get the header/nav
// "for free" -- add a route in src/app/router.tsx as a child of the root
// route and it renders inside <main> here automatically.
import { Outlet } from "react-router-dom";
import Header from "./Header";
import "./AppShell.css";

export default function AppShell() {
  return (
    <div className="sn-app-shell">
      <Header />
      <main className="sn-app-shell__content">
        <Outlet />
      </main>
    </div>
  );
}
