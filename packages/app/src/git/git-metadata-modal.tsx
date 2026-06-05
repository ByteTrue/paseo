import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  AdaptiveModalSheet,
  AdaptiveTextInput,
  type SheetHeader,
} from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export interface CommitMessageModalProps {
  visible: boolean;
  /** When null = still loading; when "" = generation disabled or failed */
  initialMessage: string | null;
  isLoading?: boolean;
  onClose: () => void;
  onSubmit: (message: string) => Promise<void> | void;
  testID?: string;
}

export function CommitMessageModal({
  visible,
  initialMessage,
  isLoading = false,
  onClose,
  onSubmit,
  testID,
}: CommitMessageModalProps) {
  const { theme } = useUnistyles();
  const [draft, setDraft] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDirtyRef = useRef(false);
  const inputRef = useRef<TextInput>(null);

  // Seed draft with generated message when it arrives, unless user already typed
  useEffect(() => {
    if (!visible) {
      isDirtyRef.current = false;
      return;
    }
    if (initialMessage !== null && !isDirtyRef.current) {
      setDraft(initialMessage);
    }
  }, [visible, initialMessage]);

  // Reset error state when modal opens
  useEffect(() => {
    if (visible) {
      setError(null);
      setIsPending(false);
    }
  }, [visible]);

  const handleChange = useCallback((value: string) => {
    isDirtyRef.current = true;
    setDraft(value);
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isPending) return;
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Commit message is required");
      return;
    }
    try {
      setIsPending(true);
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setIsPending(false);
      setError(err instanceof Error && err.message ? err.message : "Failed to commit");
    }
  }, [isPending, draft, onSubmit, onClose]);

  const handleSubmitVoid = useCallback(() => {
    void handleSubmit();
  }, [handleSubmit]);

  const sheetHeader = useMemo<SheetHeader>(() => ({ title: "Commit" }), []);
  const submitDisabled = isPending || isLoading || !draft.trim();

  return (
    <AdaptiveModalSheet visible={visible} onClose={onClose} header={sheetHeader} testID={testID}>
      <View style={styles.body}>
        {isLoading ? (
          <View style={styles.loadingRow}>
            <LoadingSpinner size={14} color={theme.colors.foregroundMuted} />
            <Text style={styles.loadingText}>Generating commit message…</Text>
          </View>
        ) : null}
        <AdaptiveTextInput
          ref={inputRef}
          initialValue={draft}
          onChangeText={handleChange}
          placeholder="Commit message"
          editable={!isPending && !isLoading}
          multiline
          numberOfLines={3}
          style={styles.input}
          testID={testID ? `${testID}-input` : undefined}
        />
        {error ? (
          <Text style={styles.errorText} testID={testID ? `${testID}-error` : undefined}>
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            style={styles.actionButton}
            onPress={onClose}
            disabled={isPending}
            testID={testID ? `${testID}-cancel` : undefined}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            style={styles.actionButton}
            onPress={handleSubmitVoid}
            disabled={submitDisabled}
            testID={testID ? `${testID}-submit` : undefined}
          >
            {isPending ? "Committing…" : "Commit"}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

export interface PullRequestModalProps {
  visible: boolean;
  initialTitle: string | null;
  initialBody: string | null;
  isLoading?: boolean;
  onClose: () => void;
  onSubmit: (title: string, body: string) => Promise<void> | void;
  testID?: string;
}

export function PullRequestModal({
  visible,
  initialTitle,
  initialBody,
  isLoading = false,
  onClose,
  onSubmit,
  testID,
}: PullRequestModalProps) {
  const { theme: prTheme } = useUnistyles();
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTitleDirtyRef = useRef(false);
  const isBodyDirtyRef = useRef(false);
  const titleRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) {
      isTitleDirtyRef.current = false;
      isBodyDirtyRef.current = false;
      return;
    }
    if (initialTitle !== null && !isTitleDirtyRef.current) {
      setDraftTitle(initialTitle);
    }
    if (initialBody !== null && !isBodyDirtyRef.current) {
      setDraftBody(initialBody);
    }
  }, [visible, initialTitle, initialBody]);

  useEffect(() => {
    if (visible) {
      setError(null);
      setIsPending(false);
    }
  }, [visible]);

  const handleTitleChange = useCallback((value: string) => {
    isTitleDirtyRef.current = true;
    setDraftTitle(value);
    setError(null);
  }, []);

  const handleBodyChange = useCallback((value: string) => {
    isBodyDirtyRef.current = true;
    setDraftBody(value);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isPending) return;
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setError("PR title is required");
      return;
    }
    try {
      setIsPending(true);
      await onSubmit(trimmedTitle, draftBody.trim());
      onClose();
    } catch (err) {
      setIsPending(false);
      setError(err instanceof Error && err.message ? err.message : "Failed to create PR");
    }
  }, [isPending, draftTitle, draftBody, onSubmit, onClose]);

  const handleSubmitVoid = useCallback(() => {
    void handleSubmit();
  }, [handleSubmit]);

  const sheetHeader = useMemo<SheetHeader>(() => ({ title: "Create PR" }), []);
  const submitDisabled = isPending || isLoading || !draftTitle.trim();

  return (
    <AdaptiveModalSheet visible={visible} onClose={onClose} header={sheetHeader} testID={testID}>
      <View style={styles.body}>
        {isLoading ? (
          <View style={styles.loadingRow}>
            <LoadingSpinner size={14} color={prTheme.colors.foregroundMuted} />
            <Text style={styles.loadingText}>Generating PR details…</Text>
          </View>
        ) : null}
        <AdaptiveTextInput
          ref={titleRef}
          initialValue={draftTitle}
          onChangeText={handleTitleChange}
          placeholder="PR title"
          editable={!isPending && !isLoading}
          style={styles.input}
          testID={testID ? `${testID}-title-input` : undefined}
        />
        <AdaptiveTextInput
          initialValue={draftBody}
          onChangeText={handleBodyChange}
          placeholder="PR description (optional)"
          editable={!isPending && !isLoading}
          multiline
          numberOfLines={5}
          style={styles.input}
        />
        {error ? (
          <Text style={styles.errorText} testID={testID ? `${testID}-error` : undefined}>
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            style={styles.actionButton}
            onPress={onClose}
            disabled={isPending}
            testID={testID ? `${testID}-cancel` : undefined}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            style={styles.actionButton}
            onPress={handleSubmitVoid}
            disabled={submitDisabled}
            testID={testID ? `${testID}-submit` : undefined}
          >
            {isPending ? "Creating…" : "Create PR"}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  loadingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  input: {
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: theme.fontSize.base,
  },
  bodyInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  actionButton: {
    flex: 1,
  },
}));
