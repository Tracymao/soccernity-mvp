// B-247 -- vitest setup (vite.config.ts `test.setupFiles`). The admin session is
// module-level state (lib/adminSession.ts, lib/adminRefresh.ts), so without a reset
// one test's sign-in would leak into the next test of the same file.
import { afterEach } from "vitest";
import { __resetAdminRefreshForTests } from "../lib/adminRefresh";
import { __resetAdminSessionForTests, __setAdminSessionChannelNameForTests } from "../lib/adminSession";

// BroadcastChannel crosses worker threads, so give every test FILE its own channel.
__setAdminSessionChannelNameForTests(`sn-admin-session-test-${Math.random().toString(36).slice(2)}`);

afterEach(() => {
  __resetAdminSessionForTests();
  __resetAdminRefreshForTests();
});
