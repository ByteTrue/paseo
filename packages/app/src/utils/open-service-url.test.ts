import { beforeEach, describe, expect, it, vi } from "vitest";
import { openServiceUrl } from "@/utils/open-service-url";
import { openExternalUrl } from "@/utils/open-external-url";

const { runtime } = vi.hoisted(() => ({
  runtime: {
    isElectron: false,
  },
}));

vi.mock("@/desktop/host", () => ({
  getDesktopHost: () => null,
  isElectronRuntime: () => runtime.isElectron,
}));

vi.mock("@/hooks/use-settings", () => ({
  loadAppSettingsFromStorage: vi.fn(async () => ({ serviceUrlBehavior: "ask" })),
  persistAppSettings: vi.fn(async () => undefined),
}));

vi.mock("@/utils/open-external-url", () => ({
  openExternalUrl: vi.fn(async () => undefined),
}));

describe("openServiceUrl", () => {
  beforeEach(() => {
    runtime.isElectron = false;
    vi.mocked(openExternalUrl).mockClear();
  });

  it("uses the in-app callback on Web when one is provided", async () => {
    const openInApp = vi.fn();

    await openServiceUrl("http://dev--project.localhost:6767", { openInApp });

    expect(openInApp).toHaveBeenCalledWith("http://dev--project.localhost:6767");
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it("opens externally on Web when no in-app callback is provided", async () => {
    await openServiceUrl("http://dev--project.localhost:6767");

    expect(openExternalUrl).toHaveBeenCalledWith("http://dev--project.localhost:6767");
  });
});
