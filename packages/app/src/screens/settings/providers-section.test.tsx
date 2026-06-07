/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderSnapshotEntry } from "@bytetrue/protocol/agent-types";
import type { MutableDaemonConfig } from "@bytetrue/protocol/messages";

import { ProvidersSection } from "./providers-section";

const {
  theme,
  snapshotState,
  configState,
  sessionState,
  patchConfigMock,
  openProviderSettingsMock,
  confirmDialogMock,
} = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, "1.5": 6, 2: 8, 3: 12, 4: 16, 6: 24 },
    iconSize: { sm: 14, md: 20 },
    fontSize: { xs: 11, sm: 13, base: 15 },
    fontWeight: { normal: "400" },
    borderRadius: { lg: 8 },
    opacity: { 50: 0.5 },
    colors: {
      surface1: "#111",
      surface2: "#222",
      surface3: "#333",
      foreground: "#fff",
      foregroundMuted: "#aaa",
      border: "#555",
      accent: "#0a84ff",
      statusSuccess: "#00ff00",
      statusWarning: "#ff9500",
      statusDanger: "#ff0000",
      palette: { red: { 300: "#ff6b6b" }, white: "#fff" },
    },
  },
  snapshotState: {
    entries: undefined as ProviderSnapshotEntry[] | undefined,
    isLoading: false,
    isRefreshing: false,
  },
  configState: {
    config: null as MutableDaemonConfig | null,
  },
  sessionState: {
    titleGenerationSettings: false,
    metadataGenerationSettings: false,
    providerRemovalSettings: false,
  },
  patchConfigMock: vi.fn(async () => undefined),
  openProviderSettingsMock: vi.fn(),
  confirmDialogMock: vi.fn(async () => true),
}));

vi.mock("react-native", () => ({
  View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
    React.createElement("div", { "data-testid": testID }, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("span", null, children),
  Pressable: ({
    children,
    onPress,
    onHoverIn,
    onHoverOut,
    accessibilityRole,
    accessibilityLabel,
    disabled,
    testID,
  }: {
    children?:
      | React.ReactNode
      | ((state: { pressed: boolean; hovered: boolean }) => React.ReactNode);
    onPress?: (event: React.MouseEvent) => void;
    onHoverIn?: () => void;
    onHoverOut?: () => void;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    disabled?: boolean;
    testID?: string;
  }) =>
    React.createElement(
      "div",
      {
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        "aria-disabled": disabled ? "true" : undefined,
        "data-testid": testID,
        onClick: disabled ? undefined : onPress,
        onMouseEnter: onHoverIn,
        onMouseLeave: onHoverOut,
      },
      typeof children === "function" ? children({ pressed: false, hovered: false }) : children,
    ),
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
    ChevronRight: icon("ChevronRight"),
    Plus: icon("Plus"),
    MoreVertical: icon("MoreVertical"),
    Trash2: icon("Trash2"),
  };
});

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    value,
    onValueChange,
    disabled,
    accessibilityLabel,
    testID,
  }: {
    value: boolean;
    onValueChange?: (next: boolean) => void;
    disabled?: boolean;
    accessibilityLabel?: string;
    testID?: string;
  }) =>
    React.createElement("div", {
      role: "switch",
      "aria-checked": value ? "true" : "false",
      "aria-disabled": disabled ? "true" : undefined,
      "aria-label": accessibilityLabel,
      "data-testid": testID ?? "provider-switch",
      onClick: (event: React.MouseEvent) => {
        event.stopPropagation();
        if (disabled) return;
        onValueChange?.(!value);
      },
    }),
}));

vi.mock("@/components/ui/loading-spinner", () => ({
  LoadingSpinner: () => React.createElement("span", { "data-testid": "loading-spinner" }),
}));

vi.mock("@/components/provider-icons", () => ({
  getProviderIcon: (provider: string) => () =>
    React.createElement("span", { "data-icon": `provider-${provider}` }),
}));

vi.mock("@/stores/provider-settings-store", () => ({
  useProviderSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({ open: openProviderSettingsMock }),
}));

vi.mock("@/components/add-provider-modal", () => ({
  AddProviderModal: () => null,
}));

vi.mock("@/components/combined-model-selector", () => ({
  CombinedModelSelector: ({
    selectedProvider,
    selectedModel,
    onSelect,
    onSelectTopOption,
    topOptions = [],
    disabled,
  }: {
    selectedProvider: string;
    selectedModel: string;
    onSelect: (provider: string, modelId: string) => void;
    onSelectTopOption?: (optionId: string) => void;
    topOptions?: Array<{ id: string; label: string; testID?: string }>;
    disabled?: boolean;
  }) =>
    React.createElement(
      "div",
      null,
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": "combined-model-selector",
          disabled,
          onClick: () => onSelect("claude", "claude-sonnet-4-6"),
        },
        selectedProvider ? `${selectedProvider}:${selectedModel || "default"}` : "Select model",
      ),
      topOptions.map((option) =>
        React.createElement(
          "button",
          {
            key: option.id,
            type: "button",
            "data-testid": option.testID,
            "aria-disabled": disabled ? "true" : undefined,
            disabled,
            onClick: () => onSelectTopOption?.(option.id),
          },
          option.label,
        ),
      ),
    ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  DropdownMenuTrigger: ({
    children,
    testID,
    accessibilityLabel,
  }: {
    children?: React.ReactNode;
    testID?: string;
    accessibilityLabel?: string;
  }) =>
    React.createElement(
      "button",
      { type: "button", "data-testid": testID, "aria-label": accessibilityLabel },
      children,
    ),
  DropdownMenuContent: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  DropdownMenuItem: ({
    children,
    leading,
    onSelect,
    testID,
    disabled,
  }: {
    children?: React.ReactNode;
    leading?: React.ReactNode;
    onSelect?: () => void;
    testID?: string;
    disabled?: boolean;
  }) =>
    React.createElement(
      "button",
      {
        type: "button",
        "data-testid": testID,
        disabled,
        onClick: (event: React.MouseEvent) => {
          event.stopPropagation();
          onSelect?.();
        },
      },
      leading,
      children,
    ),
}));

vi.mock("@/utils/confirm-dialog", () => ({
  confirmDialog: confirmDialogMock,
}));

vi.mock("@/hooks/use-providers-snapshot", () => ({
  useProvidersSnapshot: () => ({
    entries: snapshotState.entries,
    isLoading: snapshotState.isLoading,
    isFetching: false,
    isRefreshing: snapshotState.isRefreshing,
    error: null,
    supportsSnapshot: true,
    refresh: vi.fn(async () => {}),
    refetchIfStale: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-daemon-config", () => ({
  useDaemonConfig: () => ({
    config: configState.config,
    isLoading: false,
    patchConfig: patchConfigMock,
  }),
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeIsConnected: () => true,
}));

vi.mock("@/stores/session-store", () => ({
  useSessionStore: (selector: (state: unknown) => unknown) => {
    const features: Record<string, boolean> = {};
    if (sessionState.metadataGenerationSettings) {
      features.metadataGenerationSettings = true;
      features.titleGenerationSettings = true;
    } else if (sessionState.titleGenerationSettings) {
      features.titleGenerationSettings = true;
    }
    if (sessionState.providerRemovalSettings) {
      features.providerRemovalSettings = true;
    }
    return selector({
      sessions: {
        "server-1": {
          serverInfo: {
            features,
          },
        },
      },
    });
  },
}));

const claudeEntry: ProviderSnapshotEntry = {
  provider: "claude",
  status: "ready",
  enabled: true,
  label: "Claude",
  description: "Claude Code",
  defaultModeId: null,
  modes: [],
  models: [
    { provider: "claude", id: "claude-opus-4-7", label: "Claude Opus 4.7" },
    { provider: "claude", id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { provider: "claude", id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
};

const disabledCodexEntry: ProviderSnapshotEntry = {
  provider: "codex",
  status: "unavailable",
  enabled: false,
  label: "Codex",
  description: "OpenAI Codex",
  defaultModeId: null,
  modes: [],
};

const customClaudeEntry = {
  provider: "zai-claude",
  status: "ready",
  enabled: true,
  label: "ZAI Claude",
  description: "Custom Claude-compatible provider",
  defaultModeId: null,
  canRemove: true,
  modes: [],
} as ProviderSnapshotEntry;

function makeConfig(
  providers: MutableDaemonConfig["providers"] = {},
  metadataGeneration: MutableDaemonConfig["metadataGeneration"] = { providers: [] },
): MutableDaemonConfig {
  return {
    mcp: { injectIntoAgents: false },
    providers,
    metadataGeneration,
    autoArchiveAfterMerge: false,
    appendSystemPrompt: "",
  };
}

function descendants(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>("*"));
}

function indexOfMatches(nodes: HTMLElement[], selector: string): number {
  return nodes.findIndex((node) => node.matches(selector));
}

function indexOfText(nodes: HTMLElement[], text: string): number {
  return nodes.findIndex((node) => node.textContent?.trim() === text);
}

describe("ProvidersSection", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    snapshotState.entries = undefined;
    snapshotState.isLoading = false;
    snapshotState.isRefreshing = false;
    configState.config = null;
    patchConfigMock.mockReset();
    patchConfigMock.mockResolvedValue(undefined);
    openProviderSettingsMock.mockReset();
    sessionState.titleGenerationSettings = false;
    confirmDialogMock.mockReset();
    confirmDialogMock.mockResolvedValue(true);
    sessionState.metadataGenerationSettings = false;
    sessionState.providerRemovalSettings = false;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
  });

  function render(): void {
    act(() => {
      root?.render(<ProvidersSection serverId="server-1" />);
    });
  }

  function findRow(accessibilityLabel: string): HTMLElement {
    const row = container?.querySelector<HTMLElement>(
      `[role="button"][aria-label="${accessibilityLabel}"]`,
    );
    if (!row) throw new Error(`Expected row with aria-label "${accessibilityLabel}"`);
    return row;
  }

  it("renders the disabled provider with its server-provided label in snapshot order", () => {
    snapshotState.entries = [claudeEntry, disabledCodexEntry];
    configState.config = makeConfig({ codex: { enabled: false } });

    render();

    const rows = Array.from(
      container?.querySelectorAll<HTMLElement>('[role="button"][aria-label$="provider details"]') ??
        [],
    );
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Claude provider details",
      "Codex provider details",
    ]);

    const codexRow = findRow("Codex provider details");
    const codexNodes = descendants(codexRow);
    expect(indexOfText(codexNodes, "Codex")).toBeGreaterThanOrEqual(0);
    expect(indexOfText(codexNodes, "codex")).toBe(-1);
    expect(indexOfText(codexNodes, "Disabled")).toBeGreaterThanOrEqual(0);
  });

  it("composes the row as chevron, icon, label, status, model count, then switch", () => {
    snapshotState.entries = [claudeEntry];
    configState.config = makeConfig();

    render();

    const row = findRow("Claude provider details");
    const nodes = descendants(row);
    const chevron = indexOfMatches(nodes, '[data-icon="ChevronRight"]');
    const icon = indexOfMatches(nodes, '[data-icon="provider-claude"]');
    const label = indexOfText(nodes, "Claude");
    const status = indexOfText(nodes, "Available");
    const modelCount = indexOfText(nodes, "3 models");
    const switchEl = indexOfMatches(nodes, '[role="switch"]');

    expect(chevron).toBeGreaterThanOrEqual(0);
    expect(icon).toBeGreaterThan(chevron);
    expect(label).toBeGreaterThan(icon);
    expect(status).toBeGreaterThan(label);
    expect(modelCount).toBeGreaterThan(status);
    expect(switchEl).toBeGreaterThan(modelCount);
  });

  it("opens the diagnostic sheet when the outer row is pressed for a disabled provider", () => {
    snapshotState.entries = [disabledCodexEntry];
    configState.config = makeConfig({ codex: { enabled: false } });

    render();

    expect(openProviderSettingsMock).not.toHaveBeenCalled();

    const row = findRow("Codex provider details");
    act(() => {
      row.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(openProviderSettingsMock).toHaveBeenCalledTimes(1);
    expect(openProviderSettingsMock).toHaveBeenCalledWith({
      serverId: "server-1",
      provider: "codex",
    });
  });

  it("toggles the provider enabled flag through patchConfig when the switch is pressed", async () => {
    snapshotState.entries = [claudeEntry];
    configState.config = makeConfig();

    render();

    const row = findRow("Claude provider details");
    const switchEl = row.querySelector<HTMLElement>('[role="switch"]');
    expect(switchEl).not.toBeNull();
    expect(switchEl?.getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      switchEl?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(patchConfigMock).toHaveBeenCalledTimes(1);
    expect(patchConfigMock).toHaveBeenCalledWith({
      providers: { claude: { enabled: false } },
    });
  });

  it("removes a custom provider after confirmation", async () => {
    sessionState.providerRemovalSettings = true;
    snapshotState.entries = [claudeEntry, customClaudeEntry];
    configState.config = makeConfig();

    render();

    expect(container?.querySelector('[data-testid="remove-provider-claude"]')).toBeNull();
    const removeItem = container?.querySelector<HTMLElement>(
      '[data-testid="remove-provider-zai-claude"]',
    );
    expect(removeItem).not.toBeNull();

    await act(async () => {
      removeItem?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(confirmDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Remove provider?",
        confirmLabel: "Remove",
        destructive: true,
      }),
    );
    expect(patchConfigMock).toHaveBeenCalledWith({
      removeProviders: ["zai-claude"],
    });
  });

  it("hides metadata generation settings when the host does not support them", () => {
    sessionState.metadataGenerationSettings = false;
    sessionState.titleGenerationSettings = false;
    snapshotState.entries = [claudeEntry];
    configState.config = makeConfig();

    render();

    expect(container?.querySelector('[data-testid="metadata-generation-card"]')).toBeNull();
  });

  it("shows metadata generation card when host supports titleGenerationSettings", () => {
    sessionState.metadataGenerationSettings = false;
    sessionState.titleGenerationSettings = true;
    snapshotState.entries = [claudeEntry];
    configState.config = makeConfig();

    render();

    expect(container?.querySelector('[data-testid="metadata-generation-card"]')).not.toBeNull();
  });

  it("shows metadata generation card when host supports metadataGenerationSettings", () => {
    sessionState.metadataGenerationSettings = true;
    snapshotState.entries = [claudeEntry];
    configState.config = makeConfig();

    render();

    expect(container?.querySelector('[data-testid="metadata-generation-card"]')).not.toBeNull();
  });

  it("selecting Off patches agentTitle enabled:false through daemon config", async () => {
    sessionState.metadataGenerationSettings = true;
    snapshotState.entries = [claudeEntry];
    configState.config = makeConfig();

    render();

    const offBtn = container?.querySelector<HTMLElement>(
      '[data-testid="metadata-agentTitle-off-option"]',
    );
    expect(offBtn).not.toBeNull();

    await act(async () => {
      offBtn?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(patchConfigMock).toHaveBeenCalledWith({
      metadataGeneration: { agentTitle: { enabled: false } },
    });
  });

  it("resets a configured metadata target to automatic", async () => {
    sessionState.metadataGenerationSettings = true;
    snapshotState.entries = [claudeEntry];
    configState.config = makeConfig(
      {},
      {
        providers: [],
        commitMessage: {
          enabled: true,
          provider: "claude",
          model: "claude-sonnet-4-6",
        },
      },
    );

    render();

    const automaticBtn = container?.querySelector<HTMLElement>(
      '[data-testid="metadata-commitMessage-automatic-option"]',
    );
    expect(automaticBtn).not.toBeNull();

    await act(async () => {
      automaticBtn?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(patchConfigMock).toHaveBeenCalledWith({
      metadataGeneration: { commitMessage: { enabled: true } },
    });
  });

  it("keeps metadata target pending state scoped to the edited row", async () => {
    sessionState.metadataGenerationSettings = true;
    snapshotState.entries = [claudeEntry];
    configState.config = makeConfig();
    let resolvePatch: (() => void) | null = null;
    patchConfigMock.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          resolvePatch = () => resolve(undefined);
        }),
    );

    render();

    const agentTitleOffBtn = container?.querySelector<HTMLElement>(
      '[data-testid="metadata-agentTitle-off-option"]',
    );
    expect(agentTitleOffBtn).not.toBeNull();

    await act(async () => {
      agentTitleOffBtn?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const pendingAgentTitleOffBtn = container?.querySelector<HTMLElement>(
      '[data-testid="metadata-agentTitle-off-option"]',
    );
    const branchNameOffBtn = container?.querySelector<HTMLElement>(
      '[data-testid="metadata-branchName-off-option"]',
    );
    expect(pendingAgentTitleOffBtn?.getAttribute("aria-disabled")).toBe("true");
    expect(branchNameOffBtn?.getAttribute("aria-disabled")).toBeNull();

    await act(async () => {
      resolvePatch?.();
      await Promise.resolve();
    });
  });

  it("selects a model for commitMessage via CombinedModelSelector", async () => {
    sessionState.metadataGenerationSettings = true;
    snapshotState.entries = [claudeEntry];
    configState.config = makeConfig();

    render();

    const selectors = container?.querySelectorAll<HTMLElement>(
      '[data-testid="combined-model-selector"]',
    );
    // The first selector corresponds to agentTitle, second to branchName, etc.
    // commitMessage is the 3rd target (index 2)
    const commitSelector = selectors?.[2];
    expect(commitSelector).not.toBeNull();

    await act(async () => {
      commitSelector?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(patchConfigMock).toHaveBeenCalledWith({
      metadataGeneration: {
        commitMessage: {
          enabled: true,
          provider: "claude",
          model: "claude-sonnet-4-6",
        },
      },
    });
  });
});
