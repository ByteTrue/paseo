/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { BrowserPane } from "@/components/browser-pane";
import { createWorkspaceBrowser, useBrowserStore } from "@/stores/browser-store";

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 1.5: 6, 2: 8, 3: 12 },
    borderRadius: { md: 6, lg: 8 },
    borderWidth: { 1: 1 },
    fontSize: { xs: 11, sm: 13 },
    fontWeight: { normal: "400", medium: "500" },
    colors: {
      foreground: "#fff",
      foregroundMuted: "#aaa",
      surface0: "#111",
      surface2: "#222",
      surface3: "#333",
      border: "#444",
      borderAccent: "#555",
      destructive: "#ff453a",
    },
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
  useUnistyles: () => ({ theme }),
}));

vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return actual;
});

function renderBrowserPane(browserId: string): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <BrowserPane
        browserId={browserId}
        serverId="test-server"
        workspaceId="workspace-1"
        cwd="/tmp/project"
      />,
    );
  });

  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("BrowserPane web", () => {
  let current: ReturnType<typeof renderBrowserPane> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    document.body.replaceChildren();
    useBrowserStore.setState({ browsersById: {} });
  });

  afterEach(() => {
    current?.unmount();
    current = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders an iframe for http preview URLs", () => {
    const { browserId } = createWorkspaceBrowser({ initialUrl: "http://localhost:3000" });

    current = renderBrowserPane(browserId);

    expect(current.container.textContent).not.toContain("Browser is desktop-only");
    expect(current.container.querySelector("iframe")?.getAttribute("src")).toBe(
      "http://localhost:3000",
    );
  });

  it("rejects unsupported preview URL schemes", () => {
    const { browserId } = createWorkspaceBrowser({ initialUrl: "file:///tmp/index.html" });

    current = renderBrowserPane(browserId);

    expect(current.container.querySelector("iframe")).toBeNull();
    expect(current.container.textContent).toContain("Unsupported preview URL");
    expect(current.container.textContent).toContain("file:");
  });

  it("shows a blocked fallback when iframe loading does not complete", () => {
    const { browserId } = createWorkspaceBrowser({ initialUrl: "https://example.com" });

    current = renderBrowserPane(browserId);

    expect(current.container.textContent).toContain("Loading preview");

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(current.container.textContent).toContain("This page may not allow embedded preview");
    expect(current.container.textContent).toContain("Open in new tab");
  });
});
