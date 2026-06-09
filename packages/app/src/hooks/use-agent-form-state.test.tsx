/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import type { ProviderSnapshotEntry } from "@bytetrue/protocol/agent-types";
import type { HostProfile } from "@/types/host-connection";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormPreferences } from "./use-form-preferences";

interface PreferenceState {
  preferences: FormPreferences;
  isLoading: boolean;
}

const mockState = vi.hoisted(() => ({
  hosts: [] as HostProfile[],
  preferencesByServer: new Map<string | null, PreferenceState>(),
  providerEntries: undefined as ProviderSnapshotEntry[] | undefined,
  updatePreferences: vi.fn(async () => undefined),
  refreshSnapshot: vi.fn(async () => undefined),
  refetchSnapshotIfStale: vi.fn(),
  useFormPreferencesCalls: [] as Array<string | null>,
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHosts: () => mockState.hosts,
}));

vi.mock("./use-providers-snapshot", () => ({
  useProvidersSnapshot: () => ({
    entries: mockState.providerEntries,
    isLoading: false,
    isFetching: false,
    isRefreshing: false,
    error: null,
    supportsSnapshot: true,
    refresh: mockState.refreshSnapshot,
    refetchIfStale: mockState.refetchSnapshotIfStale,
  }),
}));

vi.mock("./use-form-preferences", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./use-form-preferences")>();
  return {
    ...actual,
    useFormPreferences: (serverId?: string | null) => {
      const key = serverId ?? null;
      mockState.useFormPreferencesCalls.push(key);
      const state = mockState.preferencesByServer.get(key) ?? {
        preferences: {},
        isLoading: false,
      };
      return {
        preferences: state.preferences,
        isLoading: state.isLoading,
        updatePreferences: mockState.updatePreferences,
      };
    },
  };
});

import { useAgentFormState } from "./use-agent-form-state";

function makeHost(serverId: string): HostProfile {
  return {
    serverId,
    label: serverId,
    lifecycle: {},
    connections: [],
    preferredConnectionId: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

const codexEntry: ProviderSnapshotEntry = {
  provider: "codex",
  status: "ready",
  enabled: true,
  label: "Codex",
  defaultModeId: "auto",
  modes: [
    { id: "auto", label: "Auto" },
    { id: "full-access", label: "Full Access" },
  ],
  models: [
    {
      provider: "codex",
      id: "gpt-5.4",
      label: "GPT 5.4",
      thinkingOptions: [
        { id: "low", label: "Low" },
        { id: "high", label: "High" },
      ],
      defaultThinkingOptionId: "low",
    },
  ],
};

const daemonPreferences: FormPreferences = {
  provider: "codex",
  providerPreferences: {
    codex: {
      model: "gpt-5.4",
      mode: "full-access",
      thinkingByModel: { "gpt-5.4": "high" },
    },
  },
};

describe("useAgentFormState", () => {
  beforeEach(() => {
    mockState.hosts = [makeHost("host-1")];
    mockState.providerEntries = [codexEntry];
    mockState.preferencesByServer = new Map([
      [null, { preferences: {}, isLoading: false }],
      ["host-1", { preferences: {}, isLoading: true }],
    ]);
    mockState.updatePreferences.mockClear();
    mockState.refreshSnapshot.mockClear();
    mockState.refetchSnapshotIfStale.mockClear();
    mockState.useFormPreferencesCalls = [];
  });

  it("rehydrates daemon-backed preferences after auto-selecting a server", async () => {
    const onlineServerIds = ["host-1"];
    const { result, rerender } = renderHook(() =>
      useAgentFormState({
        initialServerId: null,
        isVisible: true,
        isCreateFlow: true,
        onlineServerIds,
      }),
    );

    await waitFor(() => expect(result.current.selectedServerId).toBe("host-1"));
    expect(result.current.selectedProvider).toBeNull();

    mockState.preferencesByServer.set("host-1", {
      preferences: daemonPreferences,
      isLoading: false,
    });
    rerender();

    await waitFor(() => expect(result.current.selectedProvider).toBe("codex"));
    expect(result.current.selectedModel).toBe("gpt-5.4");
    expect(result.current.selectedMode).toBe("full-access");
    expect(result.current.selectedThinkingOptionId).toBe("high");
    expect(mockState.useFormPreferencesCalls).toContain(null);
    expect(mockState.useFormPreferencesCalls).toContain("host-1");
  });
});
