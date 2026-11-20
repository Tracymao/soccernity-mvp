// B-246 -- vitest setup (vite.config.ts `test.setupFiles`). The session is
// module-level state (lib/session.ts, lib/silentRefresh.ts), so without a reset
// one test's sign-in would leak into the next test of the same file.
import { afterEach } from "vitest";
import { __resetSessionForTests, __setSessionChannelNameForTests } from "../lib/session";
import { __resetSilentRefreshForTests } from "../lib/silentRefresh";

// BroadcastChannel crosses worker threads, so give every test FILE its own channel.
__setSessionChannelNameForTests(`sn-session-test-${Math.random().toString(36).slice(2)}`);

afterEach(() => {
  __resetSessionForTests();
  __resetSilentRefreshForTests();
});
