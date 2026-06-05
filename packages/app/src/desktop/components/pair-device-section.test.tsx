/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PairDeviceSection } from "@/desktop/components/pair-device-section";

const { theme, getDaemonPairingOffer, hostRuntimeState, sessionStoreState } = vi.hoisted(() => ({
  theme: {
    spacing: { 2: 8, 3: 12, 4: 16, 6: 24 },
    borderRadius: { md: 6, lg: 8 },
    fontSize: { xs: 11 },
    iconSize: { sm: 14 },
    colors: {
      accent: "#0a84ff",
      foreground: "#fff",
      foregroundMuted: "#aaa",
      surface0: "#000",
      border: "#444",
    },
  },
  getDaemonPairingOffer: vi.fn(),
  hostRuntimeState: {
    client: null as null | { getDaemonPairingOffer: ReturnType<typeof vi.fn> },
  },
  sessionStoreState: {
    supportsDaemonStatusRpc: true,
  },
}));

vi.mock("react-native", () => ({
  View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
    React.createElement("div", { "data-testid": testID }, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("span", null, children),
  TextInput: ({ value, testID }: { value?: string; testID?: string }) =>
    React.createElement("input", { readOnly: true, value: value ?? "", "data-testid": testID }),
  Image: ({ source }: { source?: { uri?: string } }) =>
    React.createElement("img", { alt: "pairing qr", src: source?.uri ?? "" }),
  ActivityIndicator: () => React.createElement("span", { "data-testid": "activity-indicator" }),
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
    Check: icon("Check"),
    Copy: icon("Copy"),
    RotateCw: icon("RotateCw"),
  };
});

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(async () => undefined),
}));

vi.mock("qrcode", () => ({
  toDataURL: vi.fn(async () => "data:image/png;base64,qr"),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) =>
    React.createElement("button", { type: "button", onClick: onPress }, children),
}));

vi.mock("@/styles/settings", () => ({
  settingsStyles: {
    card: {},
    section: {},
  },
}));

vi.mock("@/desktop/daemon/desktop-daemon", () => ({
  getDesktopDaemonPairing: vi.fn(),
  shouldUseDesktopDaemon: () => false,
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => hostRuntimeState.client,
}));

vi.mock("@/stores/session-store", () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({
      sessions: {
        "server-1": {
          serverInfo: {
            features: {
              daemonStatusRpc: sessionStoreState.supportsDaemonStatusRpc,
            },
          },
        },
      },
    }),
}));

describe("PairDeviceSection", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    getDaemonPairingOffer.mockReset();
    getDaemonPairingOffer.mockResolvedValue({
      relayEnabled: true,
      url: "https://paseo.zijieapi.de5.net/#offer=web-offer",
    });
    hostRuntimeState.client = { getDaemonPairingOffer };
    sessionStoreState.supportsDaemonStatusRpc = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    queryClient.clear();
  });

  function renderSection() {
    return render(
      <QueryClientProvider client={queryClient}>
        <PairDeviceSection serverId="server-1" />
      </QueryClientProvider>,
    );
  }

  it("loads the pairing offer through the connected daemon client on browser web", async () => {
    renderSection();

    await waitFor(() => expect(getDaemonPairingOffer).toHaveBeenCalledTimes(1));
    const input = await screen.findByDisplayValue(
      "https://paseo.zijieapi.de5.net/#offer=web-offer",
    );

    expect(input).not.toBeNull();
  });

  it("asks users to update old hosts instead of using the desktop-only path", () => {
    sessionStoreState.supportsDaemonStatusRpc = false;

    act(() => {
      renderSection();
    });

    expect(screen.getByText("Update the host to pair a device from web.")).not.toBeNull();
    expect(getDaemonPairingOffer).not.toHaveBeenCalled();
  });
});
