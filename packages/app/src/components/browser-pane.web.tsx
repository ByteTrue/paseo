import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { getBrowserRecord, useBrowserStore } from "@/stores/browser-store";

const BLOCKED_TIMEOUT_MS = 2500;

interface BrowserPaneProps {
  browserId: string;
  serverId: string;
  workspaceId: string;
  cwd: string | null;
  isInteractive?: boolean;
  onFocusPane?: () => void;
}

type PreviewState = "idle" | "loading" | "loaded" | "blocked";

export function isSupportedPreviewUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function BrowserPane({ browserId }: BrowserPaneProps) {
  const { theme } = useUnistyles();
  const browser = useBrowserStore((state) => state.browsersById[browserId] ?? null);
  const updateBrowser = useBrowserStore((state) => state.updateBrowser);
  const currentUrl = browser?.url ?? getBrowserRecord(browserId)?.url ?? "about:blank";
  const supportedUrl = isSupportedPreviewUrl(currentUrl) ? currentUrl : null;
  const [draftUrl, setDraftUrl] = useState(currentUrl === "about:blank" ? "" : currentUrl);
  const [previewState, setPreviewState] = useState<PreviewState>(supportedUrl ? "loading" : "idle");

  useEffect(() => {
    setDraftUrl(currentUrl === "about:blank" ? "" : currentUrl);
    setPreviewState(supportedUrl ? "loading" : "idle");
  }, [currentUrl, supportedUrl]);

  useEffect(() => {
    if (!supportedUrl || previewState !== "loading") {
      return;
    }
    const timeout = setTimeout(() => setPreviewState("blocked"), BLOCKED_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [previewState, supportedUrl]);

  const titleStyle = useMemo(
    () => [styles.title, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const subtitleStyle = useMemo(
    () => [styles.subtitle, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const errorTextStyle = useMemo(
    () => [styles.subtitle, { color: theme.colors.destructive }],
    [theme.colors.destructive],
  );

  const applyDraftUrl = useCallback(() => {
    const nextUrl = draftUrl.trim();
    if (!nextUrl) {
      return;
    }
    updateBrowser(browserId, { url: nextUrl, lastError: null });
  }, [browserId, draftUrl, updateBrowser]);

  const handleRefresh = useCallback(() => {
    if (supportedUrl) {
      setPreviewState("loading");
    }
  }, [supportedUrl]);

  const handleCopyUrl = useCallback(() => {
    if (supportedUrl) {
      void navigator.clipboard?.writeText(supportedUrl);
    }
  }, [supportedUrl]);

  const handleOpenExternal = useCallback(() => {
    if (supportedUrl) {
      void Linking.openURL(supportedUrl);
    }
  }, [supportedUrl]);
  const handleIframeLoad = useCallback(() => {
    setPreviewState("loaded");
  }, []);

  const frameKey = `${supportedUrl ?? "empty"}:${previewState === "loading" ? "loading" : "stable"}`;

  let previewContent;
  if (supportedUrl) {
    previewContent = (
      <>
        {previewState === "loading" ? <Text style={subtitleStyle}>Loading preview</Text> : null}
        {previewState === "blocked" ? (
          <View style={styles.blockedState}>
            <Text style={titleStyle}>This page may not allow embedded preview</Text>
            <Text style={subtitleStyle}>Open it in a new tab to inspect the page directly.</Text>
            <Pressable style={styles.primaryButton} onPress={handleOpenExternal}>
              <Text style={styles.primaryButtonText}>Open in new tab</Text>
            </Pressable>
          </View>
        ) : null}
        {createElement("iframe", {
          key: frameKey,
          src: supportedUrl,
          onLoad: handleIframeLoad,
          style: styles.iframe,
          title: "Paseo web preview",
          sandbox: "allow-forms allow-modals allow-popups allow-scripts",
        })}
      </>
    );
  } else if (currentUrl === "about:blank") {
    previewContent = (
      <View style={styles.emptyState}>
        <Text style={titleStyle}>Open a preview URL</Text>
        <Text style={subtitleStyle}>Paste an http or https URL to preview it here.</Text>
      </View>
    );
  } else {
    previewContent = (
      <View style={styles.emptyState}>
        <Text style={titleStyle}>Unsupported preview URL</Text>
        <Text style={errorTextStyle}>{new URL(currentUrl).protocol}</Text>
        <Text style={subtitleStyle}>Lite preview only supports http and https URLs.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TextInput
          value={draftUrl}
          onChangeText={setDraftUrl}
          onSubmitEditing={applyDraftUrl}
          placeholder="https://localhost:3000"
          placeholderTextColor={theme.colors.foregroundMuted}
          style={styles.addressInput}
          autoCapitalize="none"
          autoCorrect={false}
          testID="browser-lite-address-input"
        />
        <Pressable style={styles.toolbarButton} onPress={applyDraftUrl} testID="browser-lite-go">
          <Text style={styles.toolbarButtonText}>Go</Text>
        </Pressable>
        <Pressable
          style={styles.toolbarButton}
          onPress={handleRefresh}
          testID="browser-lite-refresh"
        >
          <Text style={styles.toolbarButtonText}>Refresh</Text>
        </Pressable>
        <Pressable
          style={styles.toolbarButton}
          onPress={handleCopyUrl}
          testID="browser-lite-copy-url"
        >
          <Text style={styles.toolbarButtonText}>Copy URL</Text>
        </Pressable>
        <Pressable
          style={styles.toolbarButton}
          onPress={handleOpenExternal}
          testID="browser-lite-open-external"
        >
          <Text style={styles.toolbarButtonText}>Open in new tab</Text>
        </Pressable>
      </View>

      <View style={styles.previewSurface}>{previewContent}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    padding: theme.spacing[2],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  addressInput: {
    flex: 1,
    minWidth: 0,
    height: 34,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[2],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    backgroundColor: theme.colors.surface0,
  },
  toolbarButton: {
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    paddingHorizontal: theme.spacing[2],
    backgroundColor: theme.colors.surface3,
  },
  toolbarButtonText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  previewSurface: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
  },
  iframe: {
    width: "100%",
    height: "100%",
    borderWidth: 0,
    backgroundColor: "#ffffff",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    padding: theme.spacing[3],
  },
  blockedState: {
    position: "absolute",
    zIndex: 2,
    top: theme.spacing[3],
    left: theme.spacing[3],
    right: theme.spacing[3],
    alignItems: "flex-start",
    gap: theme.spacing[1],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    backgroundColor: theme.colors.surface2,
  },
  primaryButton: {
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[2],
    backgroundColor: theme.colors.surface3,
  },
  primaryButtonText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  title: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  subtitle: {
    fontSize: theme.fontSize.xs,
  },
}));
