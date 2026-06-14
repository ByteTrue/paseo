import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type PressableStateCallbackType,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { AgentProvider } from "@bytetrue/protocol/agent-types";
import type { MutableDaemonConfig, MutableDaemonConfigPatch } from "@bytetrue/protocol/messages";
import {
  CombinedModelSelector,
  type CombinedModelSelectorTopOption,
} from "@/components/combined-model-selector";
import { getProviderIcon } from "@/components/provider-icons";
import { ProviderCatalogList } from "@/components/provider-catalog-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Switch } from "@/components/ui/switch";
import {
  buildAcpProviderConfigPatch,
  type AcpProviderCatalogItem,
} from "@/hooks/use-acp-provider-catalog";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import {
  buildSelectableProviderSelectorProviders,
  resolveSelectedModelLabel,
} from "@/provider-selection/provider-selection";
import { useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useProviderSettingsStore } from "@/stores/provider-settings-store";
import { useSessionStore } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";
import { buildProviderDefinitions } from "@/utils/provider-definitions";
import { ChevronRight, MoreVertical, Trash2 } from "lucide-react-native";
import { confirmDialog } from "@/utils/confirm-dialog";

type ProviderDefinition = ReturnType<typeof buildProviderDefinitions>[number];
type ProviderEntry = NonNullable<ReturnType<typeof useProvidersSnapshot>["entries"]>[number];

const METADATA_TOP_OPTION_AUTOMATIC = "automatic";
const METADATA_TOP_OPTION_OFF = "off";

interface AgentTitleGenerationConfig {
  enabled?: boolean;
  provider?: string;
  model?: string;
  thinkingOptionId?: string;
  [key: string]: unknown;
}

type StatusTone = "success" | "warning" | "danger" | "muted" | "loading";

interface ProviderStatus {
  tone: StatusTone;
  label: string;
  modelCount: number | null;
}

function getProviderStatus(status: string, enabled: boolean, modelCount: number): ProviderStatus {
  if (!enabled) return { tone: "muted", label: "Disabled", modelCount: null };
  if (status === "loading") return { tone: "loading", label: "Loading", modelCount: null };
  if (status === "error") return { tone: "danger", label: "Error", modelCount: null };
  if (status === "ready") {
    return {
      tone: "success",
      label: "Available",
      modelCount: modelCount > 0 ? modelCount : null,
    };
  }
  return { tone: "warning", label: "Not installed", modelCount: null };
}

function providerMenuButtonStyle({
  hovered,
  pressed,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    styles.providerMenuButton,
    Boolean(hovered) && styles.providerMenuButtonHovered,
    pressed && styles.providerMenuButtonPressed,
  ];
}

interface ProviderRowProps {
  def: ProviderDefinition;
  entry: ProviderEntry;
  enabled: boolean;
  isToggling: boolean;
  isFirst: boolean;
  canRemove: boolean;
  onPress: (providerId: string) => void;
  onToggleEnabled: (providerId: string, enabled: boolean) => void;
  onRemove: (providerId: string, label: string) => void;
}

function ProviderRow({
  def,
  entry,
  enabled,
  isToggling,
  isFirst,
  canRemove,
  onPress,
  onToggleEnabled,
  onRemove,
}: ProviderRowProps) {
  const { theme } = useUnistyles();
  const ProviderIcon = getProviderIcon(def.id);
  const providerError =
    enabled &&
    entry.status === "error" &&
    typeof entry.error === "string" &&
    entry.error.trim().length > 0
      ? entry.error.trim()
      : null;
  const modelCount = entry.models?.length ?? 0;
  const providerStatus = getProviderStatus(entry.status, enabled, modelCount);
  const removeLeading = useMemo(
    () => <Trash2 size={14} color={theme.colors.foregroundMuted} />,
    [theme.colors.foregroundMuted],
  );

  const handlePress = useCallback(() => {
    onPress(def.id);
  }, [def.id, onPress]);
  const handleToggleValueChange = useCallback(
    (value: boolean) => {
      onToggleEnabled(def.id, value);
    },
    [def.id, onToggleEnabled],
  );
  const handleRemove = useCallback(() => {
    onRemove(def.id, def.label);
  }, [def.id, def.label, onRemove]);
  const stopMenuPressInPropagation = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
  }, []);
  const rowStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      settingsStyles.row,
      !isFirst && settingsStyles.rowBorder,
      styles.row,
      hovered && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [isFirst],
  );

  return (
    <Pressable
      style={rowStyle}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${def.label} provider details`}
    >
      {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
        <>
          <View style={styles.rowContent}>
            <ChevronRight
              size={theme.iconSize.sm}
              color={hovered ? theme.colors.foreground : theme.colors.foregroundMuted}
            />
            <ProviderIcon size={theme.iconSize.md} color={theme.colors.foreground} />
            <View style={styles.textColumn}>
              <View style={styles.titleRow}>
                <Text style={settingsStyles.rowTitle} numberOfLines={1}>
                  {def.label}
                </Text>
                <Text style={styles.separator}>·</Text>
                <StatusIndicator status={providerStatus} />
              </View>
              {providerError ? (
                <Text style={styles.errorText} numberOfLines={3}>
                  {providerError}
                </Text>
              ) : null}
            </View>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggleValueChange}
            disabled={isToggling}
            accessibilityLabel={`Enable ${def.label}`}
          />
          {canRemove ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                hitSlop={8}
                onPressIn={stopMenuPressInPropagation}
                style={providerMenuButtonStyle}
                accessibilityLabel={`${def.label} provider menu`}
                testID={`provider-menu-${def.id}`}
              >
                <MoreVertical size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" width={180}>
                <DropdownMenuItem
                  destructive
                  disabled={isToggling}
                  leading={removeLeading}
                  onSelect={handleRemove}
                  testID={`remove-provider-${def.id}`}
                >
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

function getDotColor(tone: StatusTone, theme: ReturnType<typeof useUnistyles>["theme"]): string {
  switch (tone) {
    case "success":
      return theme.colors.statusSuccess;
    case "warning":
      return theme.colors.statusWarning;
    case "danger":
      return theme.colors.statusDanger;
    default:
      return theme.colors.foregroundMuted;
  }
}

function StatusIndicator({ status }: { status: ProviderStatus }) {
  const { theme } = useUnistyles();
  const dotStyle = useMemo(
    () => [styles.statusDot, { backgroundColor: getDotColor(status.tone, theme) }],
    [status.tone, theme],
  );

  return (
    <View style={styles.statusRow}>
      {status.tone === "loading" ? (
        <LoadingSpinner size={10} color={theme.colors.foregroundMuted} />
      ) : (
        <View style={dotStyle} />
      )}
      <Text style={styles.statusLabel}>{status.label}</Text>
      {status.modelCount !== null ? (
        <>
          <Text style={styles.separator}>·</Text>
          <Text style={styles.statusLabel}>
            {status.modelCount === 1 ? "1 model" : `${status.modelCount} models`}
          </Text>
        </>
      ) : null}
    </View>
  );
}

type MetadataTargetKey = "agentTitle" | "branchName" | "commitMessage" | "pullRequest";

const METADATA_TARGET_LABELS: Record<MetadataTargetKey, string> = {
  agentTitle: "Agent titles",
  branchName: "Branch names",
  commitMessage: "Commit messages",
  pullRequest: "Pull requests",
};

interface MetadataGenerationSectionProps {
  serverId: string;
  entries: ProviderEntry[] | undefined;
  isLoading: boolean;
  config: MutableDaemonConfig | null;
  patchConfig: (patch: MutableDaemonConfigPatch) => Promise<MutableDaemonConfig | undefined>;
  supportsSettings: boolean;
}

function MetadataTargetRow({
  targetKey,
  serverId,
  entries,
  isLoading,
  config,
  patchConfig,
  isPending,
  setTargetPending,
}: {
  targetKey: MetadataTargetKey;
  serverId: string;
  entries: ProviderEntry[] | undefined;
  isLoading: boolean;
  config: MutableDaemonConfig | null;
  patchConfig: (patch: MutableDaemonConfigPatch) => Promise<MutableDaemonConfig | undefined>;
  isPending: boolean;
  setTargetPending: (targetKey: MetadataTargetKey, pending: boolean) => void;
}) {
  const providers = useMemo(() => buildSelectableProviderSelectorProviders(entries), [entries]);
  const rawConfig = config?.metadataGeneration?.[targetKey] as
    | AgentTitleGenerationConfig
    | undefined;
  const selectedProvider = rawConfig?.provider ?? "";
  const selectedModel = rawConfig?.model ?? "";
  const isDisabled = rawConfig?.enabled === false;
  const selectedLabel = useMemo(() => {
    if (isDisabled) return "Off";
    if (!selectedProvider) return "Automatic";
    return resolveSelectedModelLabel({ providers, selectedProvider, selectedModel, isLoading });
  }, [isDisabled, selectedProvider, selectedModel, providers, isLoading]);
  const topOptions = useMemo<readonly CombinedModelSelectorTopOption[]>(
    () => [
      {
        id: METADATA_TOP_OPTION_AUTOMATIC,
        label: "Automatic",
        description: "Use the host default fallback chain",
        testID: `metadata-${targetKey}-automatic-option`,
      },
      {
        id: METADATA_TOP_OPTION_OFF,
        label: "Off",
        description: "Disable generation for this metadata",
        testID: `metadata-${targetKey}-off-option`,
      },
    ],
    [targetKey],
  );
  const selectedTopOptionId = useMemo(() => {
    if (isDisabled) {
      return METADATA_TOP_OPTION_OFF;
    }
    if (selectedProvider) {
      return undefined;
    }
    return METADATA_TOP_OPTION_AUTOMATIC;
  }, [isDisabled, selectedProvider]);

  const patchTarget = useCallback(
    async (patch: AgentTitleGenerationConfig) => {
      setTargetPending(targetKey, true);
      try {
        await patchConfig({ metadataGeneration: { [targetKey]: patch } });
      } catch (error) {
        Alert.alert(
          `Unable to update ${METADATA_TARGET_LABELS[targetKey]} settings`,
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setTargetPending(targetKey, false);
      }
    },
    [patchConfig, setTargetPending, targetKey],
  );

  const handleSelectTopOption = useCallback(
    (optionId: string) => {
      if (optionId === METADATA_TOP_OPTION_AUTOMATIC) {
        void patchTarget({ enabled: true });
        return;
      }

      if (optionId === METADATA_TOP_OPTION_OFF) {
        void patchTarget({ enabled: false });
      }
    },
    [patchTarget],
  );

  const handleSelectModel = useCallback(
    (provider: AgentProvider, modelId: string) => {
      void patchTarget({ enabled: true, provider, ...(modelId ? { model: modelId } : {}) });
    },
    [patchTarget],
  );

  return (
    <View style={METADATA_ROW_STYLE}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{METADATA_TARGET_LABELS[targetKey]}</Text>
        <Text style={settingsStyles.rowHint} numberOfLines={1}>
          {selectedLabel}
        </Text>
      </View>
      <View style={styles.titleModelActions}>
        <CombinedModelSelector
          serverId={serverId}
          providers={providers}
          selectedProvider={selectedProvider}
          selectedModel={selectedModel}
          onSelect={handleSelectModel}
          isLoading={isLoading}
          disabled={isPending}
          topOptions={topOptions}
          selectedTopOptionId={selectedTopOptionId}
          onSelectTopOption={handleSelectTopOption}
          desktopPlacement="bottom-start"
        />
      </View>
    </View>
  );
}

function MetadataGenerationSection({
  serverId,
  entries,
  isLoading,
  config,
  patchConfig,
  supportsSettings,
}: MetadataGenerationSectionProps) {
  const [pendingTargets, setPendingTargets] = useState<ReadonlySet<MetadataTargetKey>>(
    () => new Set(),
  );
  const setTargetPending = useCallback((targetKey: MetadataTargetKey, pending: boolean) => {
    setPendingTargets((current) => {
      const next = new Set(current);
      if (pending) {
        next.add(targetKey);
        return next;
      }
      next.delete(targetKey);
      return next;
    });
  }, []);

  if (!supportsSettings) {
    return null;
  }

  return (
    <SettingsSection
      title="Metadata generation"
      testID="metadata-generation-card"
      style={styles.sectionSpacing}
    >
      <View style={settingsStyles.card}>
        {(["agentTitle", "branchName", "commitMessage", "pullRequest"] as const).map(
          (key, index) => (
            <View key={key} style={index > 0 ? settingsStyles.rowBorder : undefined}>
              <MetadataTargetRow
                targetKey={key}
                serverId={serverId}
                entries={entries}
                isLoading={isLoading}
                config={config}
                patchConfig={patchConfig}
                isPending={pendingTargets.has(key)}
                setTargetPending={setTargetPending}
              />
            </View>
          ),
        )}
      </View>
    </SettingsSection>
  );
}

export interface ProvidersSectionProps {
  serverId: string;
}

export function ProvidersSection({ serverId }: ProvidersSectionProps) {
  const isConnected = useHostRuntimeIsConnected(serverId);
  const { entries, isLoading, refresh } = useProvidersSnapshot(serverId);
  const { config, patchConfig } = useDaemonConfig(serverId);
  const supportsMetadataGenerationSettings = useSessionStore((state) => {
    const features = state.sessions[serverId]?.serverInfo?.features as
      | Record<string, unknown>
      | undefined;
    return (
      features?.metadataGenerationSettings === true || features?.titleGenerationSettings === true
    );
  });
  const supportsProviderRemovalSettings = useSessionStore((state) => {
    const features = state.sessions[serverId]?.serverInfo?.features as
      | Record<string, unknown>
      | undefined;
    return features?.providerRemovalSettings === true;
  });
  const openProviderSettings = useProviderSettingsStore((state) => state.open);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  const [installingProviderId, setInstallingProviderId] = useState<string | null>(null);

  const providerDefinitions = useMemo(() => buildProviderDefinitions(entries), [entries]);
  const hasServer = serverId.length > 0;

  const handleOpenProviderSettings = useCallback(
    (providerId: string) => {
      openProviderSettings({ serverId, provider: providerId });
    },
    [openProviderSettings, serverId],
  );

  const handleToggleEnabled = useCallback(
    async (providerId: string, enabled: boolean) => {
      setPendingProviderId(providerId);
      try {
        await patchConfig({ providers: { [providerId]: { enabled } } });
        if (enabled) {
          await refresh([providerId]);
        }
      } catch (error) {
        Alert.alert(
          "Unable to update provider",
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setPendingProviderId((current) => (current === providerId ? null : current));
      }
    },
    [patchConfig, refresh],
  );
  const handleRemoveProvider = useCallback(
    async (providerId: string, label: string) => {
      const confirmed = await confirmDialog({
        title: "Remove provider?",
        message: `Remove "${label}" from this host? You can add it again later.`,
        confirmLabel: "Remove",
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      setPendingProviderId(providerId);
      try {
        await patchConfig({ removeProviders: [providerId] });
      } catch (error) {
        Alert.alert(
          "Unable to remove provider",
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setPendingProviderId((current) => (current === providerId ? null : current));
      }
    },
    [patchConfig],
  );

  const handleInstall = useCallback(
    async (entry: AcpProviderCatalogItem) => {
      if (installingProviderId) return;
      setInstallingProviderId(entry.id);
      try {
        await patchConfig(buildAcpProviderConfigPatch(entry));
        await refresh([entry.id]);
      } catch (error) {
        Alert.alert(
          "Unable to add provider",
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setInstallingProviderId((current) => (current === entry.id ? null : current));
      }
    },
    [installingProviderId, patchConfig, refresh],
  );

  return (
    <>
      {hasServer && isConnected ? (
        <MetadataGenerationSection
          serverId={serverId}
          entries={entries}
          isLoading={isLoading}
          config={config}
          patchConfig={patchConfig}
          supportsSettings={supportsMetadataGenerationSettings}
        />
      ) : null}

      <SettingsSection
        title="Providers"
        testID="host-page-providers-card"
        style={styles.sectionSpacing}
      >
        {!hasServer || !isConnected ? (
          <View style={EMPTY_CARD_STYLE}>
            <Text style={styles.emptyText}>Connect to this host to see providers</Text>
          </View>
        ) : null}
        {hasServer && isConnected && isLoading ? (
          <View style={EMPTY_CARD_STYLE}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : null}
        {hasServer && isConnected && !isLoading && providerDefinitions.length > 0 ? (
          <View style={settingsStyles.card}>
            {providerDefinitions.map((def, index) => {
              const entry = entries?.find((candidate) => candidate.provider === def.id);
              if (!entry) return null;
              return (
                <ProviderRow
                  key={def.id}
                  def={def}
                  entry={entry}
                  enabled={entry.enabled ?? true}
                  isToggling={pendingProviderId === def.id}
                  isFirst={index === 0}
                  onPress={handleOpenProviderSettings}
                  onToggleEnabled={handleToggleEnabled}
                  canRemove={supportsProviderRemovalSettings && entry.canRemove === true}
                  onRemove={handleRemoveProvider}
                />
              );
            })}
          </View>
        ) : null}
      </SettingsSection>

      {hasServer && isConnected ? (
        <SettingsSection
          title="Add provider"
          testID="host-page-add-provider-card"
          style={styles.addProviderSection}
        >
          <ProviderCatalogList
            serverId={serverId}
            installingProviderId={installingProviderId}
            onInstall={handleInstall}
          />
        </SettingsSection>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  sectionSpacing: {
    marginBottom: theme.spacing[4],
  },
  addProviderSection: {
    marginTop: theme.spacing[4],
  },
  emptyCard: {
    padding: theme.spacing[4],
    alignItems: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  row: {
    gap: theme.spacing[3],
    minHeight: 56,
  },
  rowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface3,
  },
  rowContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  providerMenuButton: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  providerMenuButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  providerMenuButtonPressed: {
    backgroundColor: theme.colors.surface3,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  separator: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  generatedTitleRow: {
    minHeight: 64,
  },
  titleModelActions: {
    alignItems: "flex-end",
    gap: theme.spacing[2],
  },
  automaticButton: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
  automaticButtonText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));

const EMPTY_CARD_STYLE = [settingsStyles.card, styles.emptyCard];
const METADATA_ROW_STYLE = [settingsStyles.row, styles.generatedTitleRow];
