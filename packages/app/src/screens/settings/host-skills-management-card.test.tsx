/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostSkillsManagementCard } from "./host-skills-management-card";

const { theme, clientState, sessionState } = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 },
    iconSize: { md: 20 },
    fontSize: { xs: 11, sm: 13, base: 15 },
    fontWeight: { normal: "400" as const },
    borderRadius: { md: 6, lg: 8 },
    colors: {
      surface1: "#111",
      foreground: "#fff",
      foregroundMuted: "#aaa",
      border: "#444",
      destructive: "#f66",
    },
  },
  clientState: {
    current: null as null | {
      getDaemonSkillsStatus: ReturnType<typeof vi.fn>;
      installDaemonSkills: ReturnType<typeof vi.fn>;
      updateDaemonSkills: ReturnType<typeof vi.fn>;
      uninstallDaemonSkills: ReturnType<typeof vi.fn>;
    },
  },
  sessionState: {
    hostSkillsManagement: false,
  },
}));

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
    React.createElement("div", { "data-testid": testID }, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("span", null, children),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function" ? (factory as (t: typeof theme) => unknown)(theme) : factory,
  },
  useUnistyles: () => ({ theme }),
}));

vi.mock("lucide-react-native", () => {
  const icon = (name: string) => {
    const Icon = () => React.createElement("span", { "data-icon": name });
    Icon.displayName = name;
    return Icon;
  };
  return {
    Blocks: icon("Blocks"),
    Check: icon("Check"),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) =>
    React.createElement(
      "button",
      { type: "button", disabled, onClick: disabled ? undefined : onPress },
      children,
    ),
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => clientState.current,
}));

vi.mock("@/stores/session-store", () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({
      sessions: {
        "server-1": {
          serverInfo: {
            features: { hostSkillsManagement: sessionState.hostSkillsManagement },
          },
        },
      },
    }),
}));

vi.mock("@/utils/confirm-dialog", () => ({
  confirmDialog: vi.fn(async () => true),
}));

describe("HostSkillsManagementCard", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    clientState.current = {
      getDaemonSkillsStatus: vi.fn(async () => ({
        requestId: "req-status",
        status: { state: "up-to-date", ops: [] },
        error: null,
      })),
      installDaemonSkills: vi.fn(),
      updateDaemonSkills: vi.fn(),
      uninstallDaemonSkills: vi.fn(),
    };
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    queryClient.clear();
    clientState.current = null;
    sessionState.hostSkillsManagement = false;
  });

  it("shows the upgrade hint when the connected host does not support skills management", async () => {
    sessionState.hostSkillsManagement = false;

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <HostSkillsManagementCard serverId="server-1" />
        </QueryClientProvider>,
      );
    });

    expect(container.textContent).toContain(
      "Update the host to manage orchestration skills from web.",
    );
  });

  it("shows Installed when the host supports skills management and status is up-to-date", async () => {
    sessionState.hostSkillsManagement = true;

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <HostSkillsManagementCard serverId="server-1" />
        </QueryClientProvider>,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Installed");
    expect(container.textContent).toContain("Orchestration skills");
  });
});
