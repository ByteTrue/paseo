import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { DaemonClientAdminPasswordContext } from "@bytetrue/client/internal/daemon-client";
import { SheetHeaderView } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { isWeb } from "@/constants/platform";
import { getOverlayRoot, OVERLAY_Z } from "@/lib/overlay-root";
import { registerDaemonAdminPasswordPrompt } from "./admin-password-prompt";

interface PromptRequest {
  id: number;
  context: DaemonClientAdminPasswordContext;
  resolve: (password: string | null) => void;
}

const ABSOLUTE_FILL_STYLE = { ...StyleSheet.absoluteFillObject };

const styles = StyleSheet.create((theme) => ({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.58)",
    padding: theme.spacing[6],
    pointerEvents: "auto" as const,
    zIndex: OVERLAY_Z.criticalModal,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "85%",
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.surface2,
  },
  content: {
    gap: theme.spacing[4],
    padding: theme.spacing[6],
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
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.surface2,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
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
  const { theme } = useUnistyles();

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

  const isVisible = request !== null;

  useEffect(() => {
    if (!isWeb || !isVisible || typeof window === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.preventDefault();
      handleCancel();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleCancel, isVisible]);

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

  const promptContent = (
    <View style={styles.overlay} testID="daemon-auth-prompt">
      <Pressable accessibilityLabel="Dismiss" style={ABSOLUTE_FILL_STYLE} onPress={handleCancel} />
      <View style={styles.card}>
        <SheetHeaderView header={header} onClose={handleCancel} />
        <View style={styles.content}>
          <View style={styles.body}>
            <Text style={styles.text}>
              Enter the daemon administrator password once to enroll this device. Paseo stores only
              a per-daemon client key after enrollment, not the password.
            </Text>
            {request?.context.error ? (
              <Text style={styles.error}>{request.context.error}</Text>
            ) : null}
          </View>
          <TextInput
            key={request?.id ?? "empty"}
            defaultValue=""
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            placeholder="Daemon administrator password"
            placeholderTextColor={theme.colors.foregroundMuted}
            onChangeText={setPassword}
            onSubmitEditing={handleSubmit}
            style={styles.input}
            testID="daemon-auth-password-input"
          />
        </View>
        {footer}
      </View>
    </View>
  );

  if (isWeb && typeof document !== "undefined") {
    if (!isVisible) return null;
    return createPortal(promptContent, getOverlayRoot());
  }

  return (
    <Modal
      transparent
      animationType="fade"
      visible={isVisible}
      onRequestClose={handleCancel}
      hardwareAccelerated
    >
      {promptContent}
    </Modal>
  );
}
