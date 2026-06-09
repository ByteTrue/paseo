import { useCallback, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { FOOTER_HEIGHT, MAX_CONTENT_WIDTH } from "@/constants/layout";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useKeyboardShiftStyle } from "@/hooks/use-keyboard-shift-style";
import { useToast } from "@/contexts/toast-context";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/styles/theme";

interface ArchivedAgentCalloutProps {
  serverId: string;
  agentId: string;
  cwd: string;
}

interface UnarchiveFailureCopy {
  message: string;
  command: string | null;
}

export function ArchivedAgentCallout({ serverId, agentId, cwd }: ArchivedAgentCalloutProps) {
  const insets = useSafeAreaInsets();
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  const toast = useToast();
  const [failureCopy, setFailureCopy] = useState<UnarchiveFailureCopy | null>(null);

  const { style: keyboardAnimatedStyle } = useKeyboardShiftStyle({ mode: "translate" });

  const containerStyle = useMemo(
    () => [styles.container, { paddingBottom: insets.bottom }, keyboardAnimatedStyle],
    [insets.bottom, keyboardAnimatedStyle],
  );

  const handleUnarchive = useCallback(async () => {
    if (!client || !isConnected || isUnarchiving) return;
    setIsUnarchiving(true);
    try {
      setFailureCopy(null);
      await client.refreshAgent(agentId);
    } catch (error) {
      const nextFailureCopy = buildUnarchiveFailureCopy(error, cwd);
      console.error("[ArchivedAgentCallout] Failed to unarchive agent:", error);
      setFailureCopy(nextFailureCopy);
      toast.error(nextFailureCopy.message);
      setIsUnarchiving(false);
    }
  }, [client, isConnected, isUnarchiving, agentId, cwd, toast]);

  const handleCopyCommand = useCallback(async () => {
    if (!failureCopy?.command) return;
    await Clipboard.setStringAsync(failureCopy.command);
    toast.copied("command");
  }, [failureCopy?.command, toast]);

  return (
    <Animated.View style={containerStyle}>
      <View style={styles.inputAreaContainer}>
        <View style={styles.inputAreaContent}>
          <View style={styles.callout}>
            <View style={styles.calloutHeader}>
              <Text style={styles.calloutText}>This agent is archived</Text>
              <Button
                size="sm"
                variant="secondary"
                onPress={handleUnarchive}
                disabled={!isConnected || isUnarchiving}
                loading={isUnarchiving}
              >
                Unarchive
              </Button>
            </View>
            {failureCopy ? (
              <View style={styles.failureBlock}>
                <Text style={styles.failureText}>{failureCopy.message}</Text>
                {failureCopy.command ? (
                  <View style={styles.commandRow}>
                    <Text style={styles.commandText}>{failureCopy.command}</Text>
                    <Button size="xs" variant="outline" onPress={handleCopyCommand}>
                      Copy command
                    </Button>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    flexDirection: "column",
    position: "relative",
  },
  inputAreaContainer: {
    position: "relative",
    minHeight: FOOTER_HEIGHT,
    marginHorizontal: "auto",
    alignItems: "center",
    width: "100%",
    overflow: "visible",
    padding: theme.spacing[4],
  },
  inputAreaContent: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
  },
  callout: {
    gap: theme.spacing[3],
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius["2xl"],
    paddingVertical: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
    paddingHorizontal: {
      xs: theme.spacing[4],
      md: theme.spacing[6],
    },
  },
  calloutHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
  },
  calloutText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  failureBlock: {
    gap: theme.spacing[2],
  },
  failureText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  commandRow: {
    flexDirection: {
      xs: "column",
      md: "row",
    },
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
  },
  commandText: {
    color: theme.colors.foreground,
    fontFamily: "monospace",
    fontSize: theme.fontSize.xs,
  },
})) as unknown as Record<string, object>;

function buildUnarchiveFailureCopy(error: unknown, cwd: string): UnarchiveFailureCopy {
  const rawMessage = getErrorMessage(error);
  const codexSessionId = extractCodexUnarchiveSessionId(rawMessage);

  if (codexSessionId) {
    return {
      message: "Codex still has this session archived. Run the command below, then try again.",
      command: `cd ${quoteShellArg(cwd)} && codex unarchive ${codexSessionId}`,
    };
  }

  return {
    message: rawMessage || "Failed to unarchive agent.",
    command: null,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "";
}

function extractCodexUnarchiveSessionId(message: string): string | null {
  return message.match(/codex\s+unarchive\s+([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
