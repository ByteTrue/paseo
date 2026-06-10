import React, { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Text, View } from "react-native";
import { Check, Blocks } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { confirmDialog } from "@/utils/confirm-dialog";

const QUERY_KEY_PREFIX = "host-skills-status";

function hostSkillsQueryKey(serverId: string) {
  return [QUERY_KEY_PREFIX, serverId] as const;
}

export function HostSkillsManagementCard({ serverId }: { serverId: string }) {
  const { theme } = useUnistyles();
  const client = useHostRuntimeClient(serverId);
  const queryClient = useQueryClient();
  const skillsSupported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.hostSkillsManagement === true,
  );

  const statusQuery = useQuery({
    queryKey: hostSkillsQueryKey(serverId),
    enabled: Boolean(client && skillsSupported),
    retry: false,
    queryFn: async () => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      const result = await client.getDaemonSkillsStatus();
      if (result.error) {
        throw new Error(result.error);
      }
      if (!result.status) {
        throw new Error("Host did not return a skills status.");
      }
      return result.status;
    },
  });

  const setStatus = useCallback(
    (next: Awaited<ReturnType<NonNullable<typeof client>["getDaemonSkillsStatus"]>>["status"]) => {
      if (!next) {
        return;
      }
      queryClient.setQueryData(hostSkillsQueryKey(serverId), next);
    },
    [queryClient, serverId],
  );

  const handleMutationError = useCallback(
    (action: "install" | "update" | "uninstall", error: Error) => {
      console.error(`[HostSkillsManagementCard] Failed to ${action} skills`, error);
      let message = "Unable to uninstall orchestration skills.";
      if (action === "install") {
        message = "Unable to install orchestration skills.";
      } else if (action === "update") {
        message = "Unable to update orchestration skills.";
      }
      Alert.alert("Error", message);
    },
    [],
  );

  const installMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("Host is not connected");
      const result = await client.installDaemonSkills();
      if (result.error) throw new Error(result.error);
      return result.status;
    },
    onSuccess: setStatus,
    onError: (error) => handleMutationError("install", error),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("Host is not connected");
      const result = await client.updateDaemonSkills();
      if (result.error) throw new Error(result.error);
      return result.status;
    },
    onSuccess: setStatus,
    onError: (error) => handleMutationError("update", error),
  });

  const uninstallMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("Host is not connected");
      const result = await client.uninstallDaemonSkills();
      if (result.error) throw new Error(result.error);
      return result.status;
    },
    onSuccess: setStatus,
    onError: (error) => handleMutationError("uninstall", error),
  });

  const isWorking =
    installMutation.isPending || updateMutation.isPending || uninstallMutation.isPending;

  const refresh = useCallback(() => {
    void statusQuery.refetch();
  }, [statusQuery]);

  const handleInstall = useCallback(() => {
    void installMutation.mutateAsync().catch(() => undefined);
  }, [installMutation]);

  const handleUpdate = useCallback(() => {
    void updateMutation.mutateAsync().catch(() => undefined);
  }, [updateMutation]);

  const handleUninstall = useCallback(async () => {
    const confirmed = await confirmDialog({
      title: "Uninstall Paseo skills?",
      message: "Removes all Paseo orchestration skills from ~/.agents, ~/.claude, ~/.codex.",
      confirmLabel: "Uninstall",
      destructive: true,
    });
    if (!confirmed) return;
    await uninstallMutation.mutateAsync().catch(() => undefined);
  }, [uninstallMutation]);

  if (!skillsSupported) {
    return (
      <View style={settingsStyles.card} testID="host-page-skills-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>Orchestration skills</Text>
            <Text style={settingsStyles.rowHint}>
              Update the host to manage orchestration skills from web.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  let statusHint = "Teach your agents to orchestrate through Paseo";
  if (statusQuery.isLoading) {
    statusHint = "Loading status...";
  } else if (statusQuery.error) {
    statusHint = "Unable to load orchestration skills status.";
  } else if (statusQuery.data?.state === "drift") {
    statusHint = "Update available";
  }

  return (
    <View style={settingsStyles.card} testID="host-page-skills-card">
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <View style={styles.rowTitleRow}>
            <Blocks size={theme.iconSize.md} color={theme.colors.foreground} />
            <Text style={settingsStyles.rowTitle}>Orchestration skills</Text>
          </View>
          <Text style={settingsStyles.rowHint}>{statusHint}</Text>
          {statusQuery.error ? (
            <Text style={styles.errorText}>{statusQuery.error.message}</Text>
          ) : null}
        </View>
        <HostSkillsActions
          state={statusQuery.data?.state ?? null}
          isLoading={statusQuery.isLoading}
          isWorking={isWorking}
          onRefresh={refresh}
          onInstall={handleInstall}
          onUpdate={handleUpdate}
          onUninstall={handleUninstall}
        />
      </View>
    </View>
  );
}

function HostSkillsActions(props: {
  state: "not-installed" | "up-to-date" | "drift" | null;
  isLoading: boolean;
  isWorking: boolean;
  onRefresh: () => void;
  onInstall: () => void;
  onUpdate: () => void;
  onUninstall: () => void;
}) {
  const { theme } = useUnistyles();
  const { state, isLoading, isWorking, onRefresh, onInstall, onUpdate, onUninstall } = props;

  if (isLoading || state === null) {
    return (
      <Button variant="outline" size="sm" onPress={onRefresh} disabled={isWorking}>
        Refresh
      </Button>
    );
  }

  if (state === "up-to-date") {
    return (
      <View style={styles.actionsRow}>
        <View style={styles.installedLabel}>
          <Check size={14} color={theme.colors.foregroundMuted} />
          <Text style={styles.mutedText}>Installed</Text>
        </View>
        <Button variant="outline" size="sm" onPress={onUninstall} disabled={isWorking}>
          Uninstall
        </Button>
      </View>
    );
  }

  if (state === "drift") {
    return (
      <View style={styles.actionsRow}>
        <Button variant="outline" size="sm" onPress={onUpdate} disabled={isWorking}>
          {isWorking ? "Working..." : "Update"}
        </Button>
        <Button variant="outline" size="sm" onPress={onUninstall} disabled={isWorking}>
          Uninstall
        </Button>
      </View>
    );
  }

  return (
    <Button variant="outline" size="sm" onPress={onInstall} disabled={isWorking}>
      {isWorking ? "Installing..." : "Install"}
    </Button>
  );
}

const styles = StyleSheet.create((theme) => ({
  rowTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  installedLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  mutedText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
}));
