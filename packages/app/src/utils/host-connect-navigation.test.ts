import { describe, expect, it } from "vitest";
import { shouldNavigateAfterHostConnect } from "./host-connect-navigation";

describe("shouldNavigateAfterHostConnect", () => {
  it("keeps the current route for background reconnects", () => {
    expect(shouldNavigateAfterHostConnect("background-reconnect")).toBe(false);
  });

  it("allows navigation for explicit connect entry points", () => {
    expect(shouldNavigateAfterHostConnect("explicit-host-added")).toBe(true);
  });

  it("allows startup navigation", () => {
    expect(shouldNavigateAfterHostConnect("startup-index")).toBe(true);
    expect(shouldNavigateAfterHostConnect("startup-recovery")).toBe(true);
  });
});
