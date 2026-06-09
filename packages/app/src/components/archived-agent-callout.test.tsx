/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchivedAgentCallout } from "@/components/archived-agent-callout";

const { clipboardSetStringAsync, hostRuntimeState, theme, toast } = vi.hoisted(() => ({
  clipboardSetStringAsync: vi.fn(async () => undefined),
  hostRuntimeState: {
    client: null as null | { refreshAgent: ReturnType<typeof vi.fn> },
    isConnected: true,
  },
  theme: {
    spacing: { 2: 8, 3: 12, 4: 16, 6: 24 },
    borderWidth: { 1: 1 },
    borderRadius: { "2xl": 16 },
    fontSize: { xs: 11, sm: 13, base: 15 },
    colors: {
      foreground: "#fff",
      foregroundMuted: "#aaa",
      surface1: "#111",
      borderAccent: "#555",
    },
  },
  toast: {
    copied: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("react-native", () => ({
  View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
    React.createElement("div", { "data-testid": testID }, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("span", null, children),
}));

vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

vi.mock("expo-clipboard", () => ({
  setStringAsync: clipboardSetStringAsync,
}));

vi.mock("@/constants/layout", () => ({
  FOOTER_HEIGHT: 64,
  MAX_CONTENT_WIDTH: 840,
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => hostRuntimeState.client,
  useHostRuntimeIsConnected: () => hostRuntimeState.isConnected,
}));

vi.mock("@/hooks/use-keyboard-shift-style", () => ({
  useKeyboardShiftStyle: () => ({ style: null }),
}));

vi.mock("@/contexts/toast-context", () => ({
  useToast: () => toast,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onPress,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    onPress?: () => void;
  }) =>
    React.createElement(
      "button",
      { disabled: Boolean(disabled), onClick: onPress, type: "button" },
      children,
    ),
}));

describe("ArchivedAgentCallout", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    clipboardSetStringAsync.mockClear();
    toast.copied.mockClear();
    toast.error.mockClear();
    hostRuntimeState.client = { refreshAgent: vi.fn() };
    hostRuntimeState.isConnected = true;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows and copies the Codex unarchive command when refresh fails on an archived Codex session", async () => {
    const sessionId = "019eaa14-f36c-75b2-81e2-919eb67e3501";
    hostRuntimeState.client?.refreshAgent.mockRejectedValue(
      new Error(
        `Failed to resume Codex thread ${sessionId}: session ${sessionId} is archived. Run \`codex unarchive ${sessionId}\` to unarchive it first.`,
      ),
    );

    render(
      <ArchivedAgentCallout
        serverId="server-1"
        agentId="agent-1"
        cwd="/Users/byte/workspace/forks/paseo"
      />,
    );

    fireEvent.click(screen.getByText("Unarchive"));

    const message = "Codex still has this session archived. Run the command below, then try again.";
    const command = `cd '/Users/byte/workspace/forks/paseo' && codex unarchive ${sessionId}`;

    expect(await screen.findByText(message)).not.toBeNull();
    expect(screen.getByText(command)).not.toBeNull();
    expect(toast.error).toHaveBeenCalledWith(message);

    fireEvent.click(screen.getByText("Copy command"));

    await waitFor(() => expect(clipboardSetStringAsync).toHaveBeenCalledWith(command));
    expect(toast.copied).toHaveBeenCalledWith("command");
  });
});
