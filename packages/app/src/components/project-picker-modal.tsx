import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { ArrowUp, Folder, HardDrive, Home } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useQuery } from "@tanstack/react-query";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { shortenPath } from "@/utils/shorten-path";
import { useRecommendedProjectPaths } from "@/stores/session-store-hooks";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useOpenProject } from "@/hooks/use-open-project";
import { buildWorkingDirectorySuggestions } from "@/utils/working-directory-suggestions";
import { isNative } from "@/constants/platform";
import { useActiveServerId } from "@/hooks/use-active-server-id";
import { useLocalOsIntegration } from "@/hooks/use-local-os-integration";

type LocalDirectoryRoot = Awaited<
  ReturnType<NonNullable<ReturnType<typeof useHostRuntimeClient>>["listLocalDirectoryRoots"]>
>["roots"][number];
type LocalDirectoryListing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof useHostRuntimeClient>>["listLocalDirectory"]>
>;

const EMPTY_DIRECTORY_ROOTS: LocalDirectoryRoot[] = [];

interface PathRowProps {
  path: string;
  active: boolean;
  onSelect: (path: string) => void;
}

interface DirectoryBrowserRowProps {
  label: string;
  path: string;
  icon: "folder" | "home" | "volume" | "up";
  onPress: (path: string) => void;
}

interface SuggestionResultsProps {
  isSubmitting: boolean;
  options: string[];
  query: string;
  activeIndex: number;
  emptyTextStyle: object;
  onSelectPath: (path: string) => void;
}

interface DirectoryPickerResultsProps {
  isSubmitting: boolean;
  roots: LocalDirectoryRoot[];
  listing: LocalDirectoryListing | null | undefined;
  browserError: unknown;
  emptyTextStyle: object;
  onBrowseDirectory: (path: string) => void;
}

function PathRow({ path, active, onSelect }: PathRowProps) {
  const { theme } = useUnistyles();
  const handlePress = useCallback(() => {
    onSelect(path);
  }, [onSelect, path]);
  const pressableStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      (Boolean(hovered) || pressed || active) && {
        backgroundColor: theme.colors.surface1,
      },
    ],
    [active, theme.colors.surface1],
  );
  const rowTextStyle = useMemo(
    () => [styles.rowText, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  return (
    <Pressable style={pressableStyle} onPress={handlePress}>
      <View style={styles.rowContent}>
        <View style={styles.iconSlot}>
          <Folder size={16} strokeWidth={2.2} color={theme.colors.foregroundMuted} />
        </View>
        <Text style={rowTextStyle} numberOfLines={1}>
          {shortenPath(path)}
        </Text>
      </View>
    </Pressable>
  );
}

function DirectoryBrowserRow({ label, path, icon, onPress }: DirectoryBrowserRowProps) {
  const { theme } = useUnistyles();
  const handlePress = useCallback(() => onPress(path), [onPress, path]);
  const pressableStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      (Boolean(hovered) || pressed) && { backgroundColor: theme.colors.surface1 },
    ],
    [theme.colors.surface1],
  );
  const titleStyle = useMemo(
    () => [styles.rowText, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const subtitleStyle = useMemo(
    () => [styles.rowSubtitle, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const Icon = useMemo<ComponentType<{ size: number; color: string; strokeWidth?: number }>>(() => {
    if (icon === "home") return Home;
    if (icon === "volume") return HardDrive;
    if (icon === "up") return ArrowUp;
    return Folder;
  }, [icon]);
  return (
    <Pressable style={pressableStyle} onPress={handlePress}>
      <View style={styles.rowContent}>
        <View style={styles.iconSlot}>
          <Icon size={16} strokeWidth={2.2} color={theme.colors.foregroundMuted} />
        </View>
        <View style={styles.rowTextColumn}>
          <Text style={titleStyle} numberOfLines={1}>
            {label}
          </Text>
          <Text style={subtitleStyle} numberOfLines={1}>
            {shortenPath(path)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function SuggestionResults({
  isSubmitting,
  options,
  query,
  activeIndex,
  emptyTextStyle,
  onSelectPath,
}: SuggestionResultsProps) {
  return (
    <ScrollView
      style={styles.results}
      contentContainerStyle={styles.resultsContent}
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
    >
      {isSubmitting ? <Text style={emptyTextStyle}>Opening project...</Text> : null}
      {!isSubmitting && options.length === 0 && !query.trim() ? (
        <Text style={emptyTextStyle}>Start typing a path</Text>
      ) : null}
      {!isSubmitting && !(options.length === 0 && !query.trim())
        ? options.map((path, index) => (
            <PathRow
              key={path}
              path={path}
              active={index === activeIndex}
              onSelect={onSelectPath}
            />
          ))
        : null}
    </ScrollView>
  );
}

function DirectoryPickerResults({
  isSubmitting,
  roots,
  listing,
  browserError,
  emptyTextStyle,
  onBrowseDirectory,
}: DirectoryPickerResultsProps) {
  const errorMessage =
    browserError instanceof Error ? browserError.message : String(browserError ?? "");
  return (
    <ScrollView
      style={styles.results}
      contentContainerStyle={styles.resultsContent}
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
    >
      {isSubmitting ? <Text style={emptyTextStyle}>Opening project...</Text> : null}
      {!isSubmitting && browserError ? <Text style={emptyTextStyle}>{errorMessage}</Text> : null}
      {!isSubmitting
        ? roots.map((root) => (
            <DirectoryBrowserRow
              key={root.id}
              label={root.label}
              path={root.path}
              icon={directoryRootIcon(root.kind)}
              onPress={onBrowseDirectory}
            />
          ))
        : null}
      {!isSubmitting && listing?.parentPath ? (
        <DirectoryBrowserRow
          label="Parent Directory"
          path={listing.parentPath}
          icon="up"
          onPress={onBrowseDirectory}
        />
      ) : null}
      {!isSubmitting
        ? listing?.entries.map((entry) => (
            <DirectoryBrowserRow
              key={entry.path}
              label={entry.name}
              path={entry.path}
              icon="folder"
              onPress={onBrowseDirectory}
            />
          ))
        : null}
      {!isSubmitting && !browserError && listing?.entries.length === 0 ? (
        <Text style={emptyTextStyle}>No child folders</Text>
      ) : null}
    </ScrollView>
  );
}

function directoryRootIcon(kind: string): DirectoryBrowserRowProps["icon"] {
  if (kind === "home") return "home";
  if (kind === "volume") return "volume";
  return "folder";
}

function useProjectPickerKeyboard(input: {
  activeIndex: number;
  canUseDirectoryPicker: boolean;
  currentDirectoryPath: string | null;
  open: boolean;
  options: string[];
  query: string;
  onSelectPath: (path: string) => void;
  onSubmitCustom: () => void;
  setActiveIndex: (updater: (current: number) => number) => void;
  setOpen: (open: boolean) => void;
}) {
  useEffect(() => {
    if (!input.open || isNative) return;

    function handler(event: KeyboardEvent) {
      const key = event.key;
      if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter" && key !== "Escape") return;

      if (key === "Escape") {
        event.preventDefault();
        input.setOpen(false);
        return;
      }
      if (key === "Enter") {
        event.preventDefault();
        handleKeyboardEnter(input);
        return;
      }
      if (!input.canUseDirectoryPicker) {
        handleKeyboardArrow(key, input);
      }
    }

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [input]);
}

function handleKeyboardEnter(input: {
  activeIndex: number;
  canUseDirectoryPicker: boolean;
  currentDirectoryPath: string | null;
  options: string[];
  query: string;
  onSelectPath: (path: string) => void;
  onSubmitCustom: () => void;
}) {
  if (input.canUseDirectoryPicker) {
    if (input.query.trim()) {
      input.onSubmitCustom();
    } else if (input.currentDirectoryPath) {
      input.onSelectPath(input.currentDirectoryPath);
    }
    return;
  }
  if (input.options.length > 0 && input.activeIndex < input.options.length) {
    input.onSelectPath(input.options[input.activeIndex]);
  } else if (input.query.trim()) {
    input.onSubmitCustom();
  }
}

function handleKeyboardArrow(
  key: string,
  input: {
    options: string[];
    setActiveIndex: (updater: (current: number) => number) => void;
  },
) {
  if (input.options.length === 0) return;
  input.setActiveIndex((current) => {
    const delta = key === "ArrowDown" ? 1 : -1;
    const next = current + delta;
    if (next < 0) return input.options.length - 1;
    if (next >= input.options.length) return 0;
    return next;
  });
}

export function ProjectPickerModal() {
  const { theme } = useUnistyles();
  const serverId = useActiveServerId();
  const open = useKeyboardShortcutsStore((s) => s.projectPickerOpen);
  const setOpen = useKeyboardShortcutsStore((s) => s.setProjectPickerOpen);
  const normalizedServerId = serverId ?? "";
  const client = useHostRuntimeClient(normalizedServerId);
  const isConnected = useHostRuntimeIsConnected(normalizedServerId);
  const canUseDirectoryPicker = useLocalOsIntegration(normalizedServerId) && client !== null;
  const recommendedPaths = useRecommendedProjectPaths(serverId);
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentDirectoryPath, setCurrentDirectoryPath] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const openProject = useOpenProject(serverId);

  const directorySuggestionsQuery = useProjectPickerSuggestions({
    canUseDirectoryPicker,
    client,
    isConnected,
    open,
    query,
    serverId,
  });
  const directoryRootsQuery = useProjectPickerRoots({
    canUseDirectoryPicker,
    client,
    isConnected,
    open,
    serverId,
  });
  const directoryListingQuery = useProjectPickerDirectoryListing({
    canUseDirectoryPicker,
    client,
    currentDirectoryPath,
    isConnected,
    open,
    serverId,
  });
  const options = useMemo(
    () =>
      resolveProjectPickerOptions({
        query,
        recommendedPaths,
        serverPaths: directorySuggestionsQuery.data ?? [],
      }),
    [directorySuggestionsQuery.data, query, recommendedPaths],
  );
  const handleClose = useCallback(() => setOpen(false), [setOpen]);
  const handleSelectPath = useCallback(
    async (path: string) => {
      const trimmed = path.trim();
      if (!trimmed || !client || !serverId) return;
      setIsSubmitting(true);
      try {
        const didOpenProject = await openProject(trimmed);
        if (didOpenProject) setOpen(false);
      } finally {
        setIsSubmitting(false);
      }
    },
    [client, openProject, serverId, setOpen],
  );
  const handleSubmitCustom = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed) void handleSelectPath(trimmed);
  }, [handleSelectPath, query]);
  const handleChangeQuery = useCallback((text: string) => {
    setQuery(text);
    setActiveIndex(0);
  }, []);
  const handleBrowseDirectory = useCallback((path: string) => {
    setCurrentDirectoryPath(path);
    setQuery("");
  }, []);
  const handleOpenCurrentDirectory = useCallback(() => {
    if (currentDirectoryPath) void handleSelectPath(currentDirectoryPath);
  }, [currentDirectoryPath, handleSelectPath]);

  const directoryRoots = directoryRootsQuery.data ?? EMPTY_DIRECTORY_ROOTS;
  useProjectPickerLifecycle({ open, inputRef, setActiveIndex, setCurrentDirectoryPath, setQuery });
  useFirstDirectoryRoot({
    canUseDirectoryPicker,
    currentDirectoryPath,
    open,
    roots: directoryRoots,
    setCurrentDirectoryPath,
  });
  useClampActiveIndex({ activeIndex, open, optionsLength: options.length, setActiveIndex });
  useProjectPickerKeyboard({
    activeIndex,
    canUseDirectoryPicker,
    currentDirectoryPath,
    open,
    options,
    query,
    onSelectPath: handleSelectPath,
    onSubmitCustom: handleSubmitCustom,
    setActiveIndex,
    setOpen,
  });

  const stylesForRender = useProjectPickerRenderStyles(theme);
  const browserError = directoryRootsQuery.error ?? directoryListingQuery.error;
  const directoryListing = directoryListingQuery.data;

  if (!serverId) return null;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={stylesForRender.panelStyle}>
          <View style={stylesForRender.headerStyle}>
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={handleChangeQuery}
              placeholder={
                canUseDirectoryPicker
                  ? "Type or browse a directory path..."
                  : "Type a directory path..."
              }
              placeholderTextColor={theme.colors.foregroundMuted}
              style={stylesForRender.inputStyle}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              editable={!isSubmitting}
              returnKeyType="go"
              onSubmitEditing={handleSubmitCustom}
            />
          </View>
          {canUseDirectoryPicker ? (
            <View style={styles.browserBody}>
              <ProjectPickerBrowserToolbar
                currentDirectoryPath={currentDirectoryPath}
                isSubmitting={isSubmitting}
                textStyle={stylesForRender.currentPathTextStyle}
                buttonStyle={stylesForRender.openButtonStyle}
                buttonTextStyle={stylesForRender.openButtonTextStyle}
                onOpenCurrentDirectory={handleOpenCurrentDirectory}
              />
              <DirectoryPickerResults
                isSubmitting={isSubmitting}
                roots={directoryRoots}
                listing={directoryListing}
                browserError={browserError}
                emptyTextStyle={stylesForRender.emptyTextStyle}
                onBrowseDirectory={handleBrowseDirectory}
              />
            </View>
          ) : (
            <SuggestionResults
              isSubmitting={isSubmitting}
              options={options}
              query={query}
              activeIndex={activeIndex}
              emptyTextStyle={stylesForRender.emptyTextStyle}
              onSelectPath={handleSelectPath}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function ProjectPickerBrowserToolbar({
  currentDirectoryPath,
  isSubmitting,
  textStyle,
  buttonStyle,
  buttonTextStyle,
  onOpenCurrentDirectory,
}: {
  currentDirectoryPath: string | null;
  isSubmitting: boolean;
  textStyle: object;
  buttonStyle: (state: PressableStateCallbackType & { hovered?: boolean }) => object[];
  buttonTextStyle: object;
  onOpenCurrentDirectory: () => void;
}) {
  return (
    <View style={styles.browserToolbar}>
      <Text style={textStyle} numberOfLines={1}>
        {currentDirectoryPath ? shortenPath(currentDirectoryPath) : "Choose a folder"}
      </Text>
      <Pressable
        style={buttonStyle}
        onPress={onOpenCurrentDirectory}
        disabled={!currentDirectoryPath || isSubmitting}
      >
        <Text style={buttonTextStyle}>Open this folder</Text>
      </Pressable>
    </View>
  );
}

function useProjectPickerSuggestions(input: {
  canUseDirectoryPicker: boolean;
  client: ReturnType<typeof useHostRuntimeClient>;
  isConnected: boolean;
  open: boolean;
  query: string;
  serverId: string | null;
}) {
  return useQuery({
    queryKey: ["project-picker-directory-suggestions", input.serverId, input.query],
    queryFn: async () => {
      if (!input.client) return [];
      const result = await input.client.getDirectorySuggestions({
        query: input.query,
        includeDirectories: true,
        includeFiles: false,
        limit: 30,
      });
      return (
        result.entries?.flatMap((entry) => (entry.kind === "directory" ? [entry.path] : [])) ?? []
      );
    },
    enabled:
      Boolean(input.client) && input.isConnected && input.open && !input.canUseDirectoryPicker,
    staleTime: 15_000,
    retry: false,
  });
}

function useProjectPickerRoots(input: {
  canUseDirectoryPicker: boolean;
  client: ReturnType<typeof useHostRuntimeClient>;
  isConnected: boolean;
  open: boolean;
  serverId: string | null;
}) {
  return useQuery({
    queryKey: ["project-picker-local-directory-roots", input.serverId],
    queryFn: async () => {
      if (!input.client) return [];
      const result = await input.client.listLocalDirectoryRoots();
      if (result.error) throw new Error(result.error);
      return result.roots;
    },
    enabled:
      Boolean(input.client) && input.isConnected && input.open && input.canUseDirectoryPicker,
    staleTime: 60_000,
    retry: false,
  });
}

function useProjectPickerDirectoryListing(input: {
  canUseDirectoryPicker: boolean;
  client: ReturnType<typeof useHostRuntimeClient>;
  currentDirectoryPath: string | null;
  isConnected: boolean;
  open: boolean;
  serverId: string | null;
}) {
  return useQuery({
    queryKey: ["project-picker-local-directory", input.serverId, input.currentDirectoryPath],
    queryFn: async () => {
      if (!input.client || !input.currentDirectoryPath) return null;
      const result = await input.client.listLocalDirectory(input.currentDirectoryPath);
      if (result.error) throw new Error(result.error);
      return result;
    },
    enabled:
      Boolean(input.client) &&
      input.isConnected &&
      input.open &&
      input.canUseDirectoryPicker &&
      Boolean(input.currentDirectoryPath),
    staleTime: 5_000,
    retry: false,
  });
}

function resolveProjectPickerOptions(input: {
  recommendedPaths: string[];
  serverPaths: string[];
  query: string;
}): string[] {
  const suggestedPaths = buildWorkingDirectorySuggestions(input);
  const trimmedQuery = input.query.trim();
  if (!trimmedQuery || suggestedPaths.includes(trimmedQuery)) {
    return suggestedPaths;
  }
  return [trimmedQuery, ...suggestedPaths];
}

function useProjectPickerLifecycle(input: {
  open: boolean;
  inputRef: React.RefObject<TextInput | null>;
  setActiveIndex: (value: number) => void;
  setCurrentDirectoryPath: (value: string | null) => void;
  setQuery: (value: string) => void;
}) {
  useEffect(() => {
    if (input.open) {
      input.setQuery("");
      input.setActiveIndex(0);
      const id = setTimeout(() => input.inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    input.setCurrentDirectoryPath(null);
  }, [input]);
}

function useFirstDirectoryRoot(input: {
  canUseDirectoryPicker: boolean;
  currentDirectoryPath: string | null;
  open: boolean;
  roots: LocalDirectoryRoot[];
  setCurrentDirectoryPath: (path: string) => void;
}) {
  useEffect(() => {
    if (!input.open || !input.canUseDirectoryPicker || input.currentDirectoryPath) return;
    const firstRoot = input.roots[0];
    if (firstRoot) input.setCurrentDirectoryPath(firstRoot.path);
  }, [input]);
}

function useClampActiveIndex(input: {
  activeIndex: number;
  open: boolean;
  optionsLength: number;
  setActiveIndex: (value: number) => void;
}) {
  useEffect(() => {
    if (!input.open) return;
    if (input.activeIndex >= input.optionsLength) {
      input.setActiveIndex(input.optionsLength > 0 ? input.optionsLength - 1 : 0);
    }
  }, [input]);
}

function useProjectPickerRenderStyles(theme: ReturnType<typeof useUnistyles>["theme"]) {
  const panelStyle = useMemo(
    () => [
      styles.panel,
      {
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface0,
      },
    ],
    [theme.colors.border, theme.colors.surface0],
  );
  const headerStyle = useMemo(
    () => [styles.header, { borderBottomColor: theme.colors.border }],
    [theme.colors.border],
  );
  const inputStyle = useMemo(
    () => [styles.input, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const emptyTextStyle = useMemo(
    () => [styles.emptyText, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const currentPathTextStyle = useMemo(
    () => [styles.currentPathText, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const openButtonStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.openCurrentButton,
      { backgroundColor: theme.colors.accent, opacity: hovered || pressed ? 0.9 : 1 },
    ],
    [theme.colors.accent],
  );
  const openButtonTextStyle = useMemo(
    () => [styles.openCurrentButtonText, { color: theme.colors.accentForeground }],
    [theme.colors.accentForeground],
  );
  return {
    panelStyle,
    headerStyle,
    inputStyle,
    emptyTextStyle,
    currentPathTextStyle,
    openButtonStyle,
    openButtonTextStyle,
  };
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: theme.spacing[12],
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  panel: {
    width: 640,
    maxWidth: "92%",
    maxHeight: "80%",
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
    ...theme.shadow.lg,
  },
  header: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
  },
  input: {
    fontSize: theme.fontSize.lg,
    paddingVertical: theme.spacing[1],
    outlineStyle: "none",
  } as object,
  browserBody: {
    minHeight: 320,
  },
  browserToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  currentPathText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
  },
  openCurrentButton: {
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  openCurrentButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
  },
  results: {
    flexGrow: 0,
  },
  resultsContent: {
    paddingVertical: theme.spacing[2],
  },
  row: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  iconSlot: {
    width: 16,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  rowText: {
    fontSize: theme.fontSize.base,
    fontWeight: "400",
    lineHeight: 20,
    flexShrink: 1,
  },
  rowSubtitle: {
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
    flexShrink: 1,
  },
  emptyText: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
    fontSize: theme.fontSize.base,
  },
}));
