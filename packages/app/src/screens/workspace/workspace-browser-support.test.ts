import { describe, expect, it } from "vitest";
import { shouldShowWorkspaceBrowserTabs } from "@/screens/workspace/workspace-browser-support";

describe("shouldShowWorkspaceBrowserTabs", () => {
  it("shows browser tabs for Electron and Web runtimes", () => {
    expect(shouldShowWorkspaceBrowserTabs({ isElectron: true, isWeb: false })).toBe(true);
    expect(shouldShowWorkspaceBrowserTabs({ isElectron: false, isWeb: true })).toBe(true);
  });

  it("hides browser tabs for native mobile runtimes", () => {
    expect(shouldShowWorkspaceBrowserTabs({ isElectron: false, isWeb: false })).toBe(false);
  });
});
