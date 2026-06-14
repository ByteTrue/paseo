import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp/paseo") },
  net: { fetch: vi.fn() },
  shell: { openPath: vi.fn() },
}));

import { resolveMacDmgInstallerDownloadUrl } from "./mac-dmg-update-installer";

describe("resolveMacDmgInstallerDownloadUrl", () => {
  it("resolves the DMG asset from the mac update manifest", () => {
    expect(
      resolveMacDmgInstallerDownloadUrl({
        version: "0.1.94",
        files: [{ url: "Paseo-0.1.94-arm64.zip" }, { url: "Paseo-0.1.94-arm64.dmg" }],
      }),
    ).toBe("https://github.com/ByteTrue/paseo/releases/download/v0.1.94/Paseo-0.1.94-arm64.dmg");
  });

  it("keeps absolute DMG URLs unchanged", () => {
    expect(
      resolveMacDmgInstallerDownloadUrl({
        version: "0.1.94",
        files: [{ url: "https://example.com/Paseo-0.1.94-arm64.dmg" }],
      }),
    ).toBe("https://example.com/Paseo-0.1.94-arm64.dmg");
  });

  it("fails when the manifest has no DMG asset", () => {
    expect(() =>
      resolveMacDmgInstallerDownloadUrl({
        version: "0.1.94",
        files: [{ url: "Paseo-0.1.94-arm64.zip" }],
      }),
    ).toThrow("The macOS DMG installer was not listed in the update manifest.");
  });
});
