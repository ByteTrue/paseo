import { describe, expect, it } from "vitest";

import {
  getServerInfoDisplayName,
  resolveHostDisplayNameFromServerInfo,
} from "./session-server-info";

describe("session server_info display name helpers", () => {
  it("trims displayName for session state", () => {
    expect(getServerInfoDisplayName({ displayName: "  Studio Mac  " })).toBe("Studio Mac");
    expect(getServerInfoDisplayName({ displayName: "   " })).toBeNull();
  });

  it("does not use hostname as a daemon displayName fallback", () => {
    expect(
      resolveHostDisplayNameFromServerInfo({
        hostname: "studio-mac.local",
        displayName: null,
        features: { daemonDisplayName: true },
      }),
    ).toBeNull();
  });

  it("does not sync displayName from daemons without the feature flag", () => {
    expect(
      resolveHostDisplayNameFromServerInfo({
        hostname: "studio-mac.local",
        displayName: "Studio Mac",
        features: {},
      }),
    ).toBeNull();
  });

  it("returns daemon displayName only when supported and non-empty", () => {
    expect(
      resolveHostDisplayNameFromServerInfo({
        displayName: "  Studio Mac  ",
        features: { daemonDisplayName: true },
      }),
    ).toBe("Studio Mac");
  });
});
