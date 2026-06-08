import { useCallback, useMemo, useReducer, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { Check, ChevronDown, ChevronRight, Link2 } from "lucide-react-native";
import type { HostProfile } from "@/types/host-connection";
import { useHosts, useHostMutations } from "@/runtime/host-runtime";
import {
  parseConnectionUri,
  serializeConnectionUri,
  serializeConnectionUriForStorage,
} from "@/utils/daemon-endpoints";
import { DaemonConnectionTestError } from "@/utils/test-daemon-connection";
import { AdaptiveModalSheet, AdaptiveTextInput, type SheetHeader } from "./adaptive-modal-sheet";
import { Button } from "@/components/ui/button";

const FLEX_ONE_STYLE = { flex: 1 } as const;
const DIRECT_CONNECTION_HEADER: SheetHeader = { title: "Direct connection" };

interface DirectConnectionDraft {
  host: string;
  port: string;
  useTls: boolean;
}

interface PreparedDirectConnection {
  uri: string;
  endpoint: string;
  useTls: boolean;
}

const styles = StyleSheet.create((theme) => ({
  field: {
    gap: theme.spacing[2],
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  input: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  portRow: {
    flexDirection: "row",
    gap: theme.spacing[3],
  },
  hostField: {
    flex: 1,
    minWidth: 0,
  },
  portField: {
    width: 112,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    alignSelf: "flex-start",
    paddingVertical: theme.spacing[1],
  },
  advancedText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
  helper: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));

function isIpv6Host(host: string): boolean {
  return host.includes(":") && !host.startsWith("[") && !host.endsWith("]");
}

function buildConnectionUriFromDraft(draft: DirectConnectionDraft): string {
  const host = draft.host.trim();
  const port = Number(draft.port.trim());
  if (!host) {
    throw new Error("Host is required");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Port must be between 1 and 65535");
  }

  return serializeConnectionUriForStorage({
    host,
    port,
    isIpv6: isIpv6Host(host),
    useTls: draft.useTls,
  });
}

function prepareDirectConnection(draft: DirectConnectionDraft): PreparedDirectConnection {
  const parsed = parseConnectionUri(buildConnectionUriFromDraft(draft));
  const endpoint = parsed.isIpv6
    ? `[${parsed.host}]:${parsed.port}`
    : `${parsed.host}:${parsed.port}`;

  return {
    uri: serializeConnectionUri(parsed),
    endpoint,
    useTls: parsed.useTls,
  };
}

function draftFromConnectionUri(uri: string): DirectConnectionDraft {
  const parsed = parseConnectionUri(uri);
  return {
    host: parsed.host,
    port: String(parsed.port),
    useTls: parsed.useTls,
  };
}

function normalizeTransportMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  const trimmed = message.trim();
  if (!trimmed) return null;
  return trimmed;
}

function formatTechnicalTransportDetails(details: (string | null)[]): string | null {
  const unique = Array.from(
    new Set(
      details
        .map((value) => normalizeTransportMessage(value))
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );

  if (unique.length === 0) return null;

  const allGeneric = unique.every((value) => {
    const lower = value.toLowerCase();
    return lower === "transport error" || lower === "transport closed";
  });

  if (allGeneric) {
    return `${unique[0]} (no additional details provided)`;
  }

  return unique.join(" — ");
}

function buildConnectionFailureCopy(
  endpoint: string,
  error: unknown,
): { title: string; detail: string | null; raw: string | null } {
  const title = `We failed to connect to ${endpoint}.`;

  const raw = (() => {
    if (error instanceof DaemonConnectionTestError) {
      return (
        formatTechnicalTransportDetails([error.reason, error.lastError]) ??
        normalizeTransportMessage(error.message)
      );
    }
    if (error instanceof Error) {
      return normalizeTransportMessage(error.message);
    }
    return null;
  })();

  const rawLower = raw?.toLowerCase() ?? "";
  let detail: string | null = null;

  if (raw === "Incorrect password" || raw === "Password required") {
    detail = raw;
  } else if (rawLower.includes("timed out")) {
    detail = "Connection timed out. Check the host/port and your network.";
  } else if (
    rawLower.includes("econnrefused") ||
    rawLower.includes("connection refused") ||
    rawLower.includes("err_connection_refused")
  ) {
    detail = "Connection refused. Is the server running at this address?";
  } else if (rawLower.includes("enotfound") || rawLower.includes("not found")) {
    detail = "Host not found. Check the hostname and try again.";
  } else if (rawLower.includes("ehostunreach") || rawLower.includes("host is unreachable")) {
    detail = "Host is unreachable. Check your network and firewall.";
  } else if (rawLower.includes("enrollment requires")) {
    detail =
      "Direct connections require TLS or relay for enrollment. Enable SSL or use relay pairing instead.";
  } else if (
    rawLower.includes("certificate") ||
    rawLower.includes("tls") ||
    rawLower.includes("ssl")
  ) {
    detail =
      "TLS error. Direct connections use SSL only when a TLS terminator is in front of the daemon.";
  } else {
    detail = "Unable to connect. Check the host/port and that the daemon is reachable.";
  }

  return { title, detail, raw };
}

export interface AddHostModalProps {
  visible: boolean;
  onClose: () => void;
  onCancel?: () => void;
  onSaved?: (result: {
    profile: HostProfile;
    serverId: string;
    hostname: string | null;
    isNewHost: boolean;
  }) => void;
}

export function AddHostModal({ visible, onClose, onCancel, onSaved }: AddHostModalProps) {
  const { theme } = useUnistyles();
  const daemons = useHosts();
  const { probeAndUpsertDirectConnection } = useHostMutations();
  const isMobile = useIsCompactFormFactor();

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("6767");
  const [useTls, setUseTls] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [advancedUri, setAdvancedUri] = useState("");
  const [inputResetKey, bumpInputResetKey] = useReducer((key: number) => key + 1, 0);

  const clearInput = useCallback(() => {
    setHost("");
    setPort("6767");
    setUseTls(false);
    setIsAdvancedOpen(false);
    setAdvancedUri("");
    bumpInputResetKey();
  }, []);

  const connectIcon = useMemo(
    () => <Link2 size={16} color={theme.colors.palette.white} />,
    [theme.colors.palette.white],
  );
  const hostFieldStyle = useMemo(() => [styles.field, styles.hostField], []);
  const portFieldStyle = useMemo(() => [styles.field, styles.portField], []);
  const checkboxStyle = useMemo(
    () => [styles.checkbox, useTls ? styles.checkboxChecked : null],
    [useTls],
  );
  const useTlsAccessibilityState = useMemo(
    () => ({ checked: useTls, disabled: isSaving }),
    [isSaving, useTls],
  );

  const handleClose = useCallback(() => {
    if (isSaving) return;
    clearInput();
    setErrorMessage("");
    onClose();
  }, [isSaving, clearInput, onClose]);

  const handleCancel = useCallback(() => {
    if (isSaving) return;
    clearInput();
    setErrorMessage("");
    (onCancel ?? onClose)();
  }, [isSaving, clearInput, onCancel, onClose]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;

    let connection: PreparedDirectConnection;
    try {
      connection = prepareDirectConnection({ host, port, useTls });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid connection";
      setErrorMessage(message);
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");

      const { profile, serverId, hostname } = await probeAndUpsertDirectConnection({
        endpoint: connection.endpoint,
        useTls: connection.useTls,
      });
      const isNewHost = !daemons.some((daemon) => daemon.serverId === serverId);

      onSaved?.({ profile, serverId, hostname, isNewHost });
      handleClose();
    } catch (error) {
      const { title, detail, raw: rawDetail } = buildConnectionFailureCopy(connection.uri, error);
      let combined: string;
      if (rawDetail && detail && rawDetail !== detail) {
        combined = `${title}\n${detail}\nDetails: ${rawDetail}`;
      } else if (detail) {
        combined = `${title}\n${detail}`;
      } else {
        combined = title;
      }
      setErrorMessage(combined);
      if (!isMobile) {
        Alert.alert("Connection failed", combined);
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    daemons,
    handleClose,
    host,
    isMobile,
    isSaving,
    onSaved,
    port,
    probeAndUpsertDirectConnection,
    useTls,
  ]);

  const handleSubmitEditing = useCallback(() => {
    void handleSave();
  }, [handleSave]);

  const handleSavePress = useCallback(() => {
    void handleSave();
  }, [handleSave]);

  const handleToggleUseTls = useCallback(() => {
    if (isSaving) return;
    setUseTls((current) => !current);
  }, [isSaving]);

  const handleToggleAdvanced = useCallback(() => {
    if (!isAdvancedOpen) {
      try {
        setAdvancedUri(buildConnectionUriFromDraft({ host, port, useTls }));
      } catch {
        setAdvancedUri("");
      }
      setErrorMessage("");
      setIsAdvancedOpen(true);
      return;
    }

    try {
      const next = draftFromConnectionUri(advancedUri);
      setHost(next.host);
      setPort(next.port);
      setUseTls(next.useTls);
      setErrorMessage("");
      bumpInputResetKey();
    } catch {
      setErrorMessage("");
    }
    setIsAdvancedOpen(false);
  }, [advancedUri, host, isAdvancedOpen, port, useTls]);

  const AdvancedIcon = isAdvancedOpen ? ChevronDown : ChevronRight;

  return (
    <AdaptiveModalSheet
      header={DIRECT_CONNECTION_HEADER}
      visible={visible}
      onClose={handleClose}
      testID="add-host-modal"
    >
      <Text style={styles.helper}>Enter the address of a Paseo server.</Text>

      <View style={styles.portRow}>
        <View style={hostFieldStyle}>
          <Text style={styles.label}>Host</Text>
          <AdaptiveTextInput
            testID="direct-host-input"
            nativeID="direct-host-input"
            accessibilityLabel="Host"
            initialValue={host}
            resetKey={`direct-host-${inputResetKey}`}
            value={host}
            onChangeText={setHost}
            placeholder="localhost"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!isSaving}
            returnKeyType="next"
          />
        </View>
        <View style={portFieldStyle}>
          <Text style={styles.label}>Port</Text>
          <AdaptiveTextInput
            testID="direct-port-input"
            nativeID="direct-port-input"
            accessibilityLabel="Port"
            initialValue={port}
            resetKey={`direct-port-${inputResetKey}`}
            value={port}
            onChangeText={setPort}
            placeholder="6767"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            editable={!isSaving}
            returnKeyType="done"
            onSubmitEditing={handleSubmitEditing}
          />
        </View>
      </View>

      <Pressable
        style={styles.checkboxRow}
        onPress={handleToggleUseTls}
        disabled={isSaving}
        accessibilityRole="checkbox"
        accessibilityLabel="Use SSL"
        accessibilityState={useTlsAccessibilityState}
        testID="direct-ssl-toggle"
      >
        <View style={checkboxStyle}>
          {useTls ? (
            <View testID="direct-ssl-toggle-checked">
              <Check size={14} color={theme.colors.accentForeground} />
            </View>
          ) : null}
        </View>
        <Text style={styles.label}>Use SSL</Text>
      </Pressable>

      <View style={styles.field}>
        <Pressable
          style={styles.advancedToggle}
          onPress={handleToggleAdvanced}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel={isAdvancedOpen ? "Hide advanced" : "Show advanced"}
          testID="direct-host-advanced-toggle"
        >
          <AdvancedIcon size={16} color={theme.colors.foregroundMuted} />
          <Text style={styles.advancedText}>Advanced</Text>
        </Pressable>
        {isAdvancedOpen ? (
          <AdaptiveTextInput
            testID="direct-host-uri-input"
            nativeID="direct-host-uri-input"
            accessibilityLabel="Connection URI"
            initialValue={advancedUri}
            resetKey={`direct-host-uri-${inputResetKey}`}
            value={advancedUri}
            onChangeText={setAdvancedUri}
            placeholder="tcp://localhost:6767?ssl=true"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!isSaving}
            returnKeyType="done"
            onSubmitEditing={handleToggleAdvanced}
          />
        ) : null}
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </View>

      <View style={styles.actions}>
        <Button
          style={FLEX_ONE_STYLE}
          variant="secondary"
          onPress={handleCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          style={FLEX_ONE_STYLE}
          variant="default"
          onPress={handleSavePress}
          disabled={isSaving}
          leftIcon={connectIcon}
          testID="direct-host-submit"
        >
          {isSaving ? "Connecting..." : "Connect"}
        </Button>
      </View>
    </AdaptiveModalSheet>
  );
}
