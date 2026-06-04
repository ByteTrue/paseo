import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { DaemonClientAdminPasswordContext } from "@bytetrue/client/internal/daemon-client";
import { AdaptiveModalSheet, AdaptiveTextInput } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { registerDaemonAdminPasswordPrompt } from "./admin-password-prompt";

interface PromptRequest {
  id: number;
  context: DaemonClientAdminPasswordContext;
  resolve: (password: string | null) => void;
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[4],
  },
  body: {
    gap: theme.spacing[2],
  },
  text: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface0,
  },
}));

function describeServer(context: DaemonClientAdminPasswordContext): string {
  if (context.serverId) {
    return context.serverId;
  }
  return context.url;
}

export function DaemonAuthPromptHost() {
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const [password, setPassword] = useState("");
  const requestIdRef = useRef(0);
  const pendingRef = useRef<PromptRequest | null>(null);

  useEffect(() => {
    return registerDaemonAdminPasswordPrompt(
      (context) =>
        new Promise<string | null>((resolve) => {
          const nextRequest: PromptRequest = {
            id: requestIdRef.current + 1,
            context,
            resolve,
          };
          requestIdRef.current = nextRequest.id;
          pendingRef.current?.resolve(null);
          pendingRef.current = nextRequest;
          setPassword("");
          setRequest(nextRequest);
        }),
    );
  }, []);

  const closeRequest = useCallback((value: string | null) => {
    const active = pendingRef.current;
    if (!active) {
      setRequest(null);
      setPassword("");
      return;
    }
    pendingRef.current = null;
    active.resolve(value);
    setRequest(null);
    setPassword("");
  }, []);

  const handleCancel = useCallback(() => {
    closeRequest(null);
  }, [closeRequest]);

  const handleSubmit = useCallback(() => {
    const trimmed = password.trim();
    closeRequest(trimmed.length > 0 ? trimmed : null);
  }, [closeRequest, password]);

  const header = useMemo(
    () => ({
      title: "Authorize remote daemon",
      subtitle: request ? (
        <Text style={styles.muted} numberOfLines={1}>
          {describeServer(request.context)}
        </Text>
      ) : undefined,
    }),
    [request],
  );

  const canSubmit = password.trim().length > 0;
  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        <Button variant="ghost" onPress={handleCancel}>
          Cancel
        </Button>
        <Button variant="default" onPress={handleSubmit} disabled={!canSubmit}>
          Authorize
        </Button>
      </View>
    ),
    [canSubmit, handleCancel, handleSubmit],
  );

  return (
    <AdaptiveModalSheet
      visible={request !== null}
      header={header}
      onClose={handleCancel}
      footer={footer}
      desktopMaxWidth={460}
      testID="daemon-auth-prompt"
    >
      <View style={styles.content}>
        <View style={styles.body}>
          <Text style={styles.text}>
            Enter the daemon administrator password once to enroll this device. Paseo stores only a
            per-daemon client key after enrollment, not the password.
          </Text>
          {request?.context.error ? (
            <Text style={styles.error}>{request.context.error}</Text>
          ) : null}
        </View>
        <AdaptiveTextInput
          resetKey={request?.id ?? "empty"}
          initialValue=""
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Daemon administrator password"
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
          style={styles.input}
          testID="daemon-auth-password-input"
        />
      </View>
    </AdaptiveModalSheet>
  );
}
