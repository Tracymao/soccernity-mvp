// Page loader (Decision Log #581): code-only.
// The one root route, above both AppShell and AuthChrome, so the top progress
// bar is mounted once for every route and keeps its state across them.
import { Outlet } from "react-router";
import RouteProgressBar from "../components/loading/RouteProgressBar";

export default function RootLayout() {
  return (
    <>
      <RouteProgressBar />
      <Outlet />
    </>
  );
}
