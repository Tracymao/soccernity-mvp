import { useEffect, useState } from "react";

// The header's avatar opens two different real overlays by design
// (Decision Log #162): the account dropdown on desktop, the full
// Navigation Drawer on mobile. This hook decides which.
//
// It reads window.innerWidth directly (with a resize listener) rather
// than window.matchMedia -- jsdom (the test environment, see
// vite.config.ts) does not implement matchMedia, and innerWidth is
// writable there, which keeps the mobile/desktop overlay switch
// straightforwardly testable. The 820px breakpoint matches the point at
// which CommunityPage.css already collapses to a single column.
export const MOBILE_MAX_WIDTH = 820;

function readIsMobile(): boolean {
  return typeof window !== "undefined" && window.innerWidth <= MOBILE_MAX_WIDTH;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(readIsMobile);

  useEffect(() => {
    const onResize = () => setIsMobile(readIsMobile());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isMobile;
}
