import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Eye, EyeOff, Plus } from "lucide-react-native";
import {
  AdaptiveModalSheet,
  AdaptiveTextInput,
  type SheetHeader,
} from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { CODE_SURFACE_DATASET } from "@/styles/code-surface";
import { settingsStyles } from "@/styles/settings";
import {
  CLAUDE_ENDPOINT_ENV_KEYS,
  generateClaudeEndpointInternalId,
  validateClaudeEndpointVariantForm,
  type ClaudeEndpointEnvKey,
  type ClaudeEndpointVariant,
  type ClaudeEndpointVariantFormErrors,
  type ClaudeEndpointVariantFormValues,
} from "./claude-endpoint-variants";

interface ClaudeEndpointsSectionProps {
  variants: ClaudeEndpointVariant[];
  deletingEndpointId?: string | null;
  onAddEndpoint: () => void;
  onEditEndpoint: (variantId: string) => void;
  onDeleteEndpoint: (variantId: string) => void;
}

interface ClaudeEndpointFormSubSheetProps {
  visible: boolean;
  mode: "add" | "edit";
  initialVariant: ClaudeEndpointVariant | null;
  existingIds: ReadonlySet<string>;
  saving: boolean;
  saveError: string | null;
  onClose: () => void;
  onSave: (values: ClaudeEndpointVariantFormValues) => void;
}

const ENV_FIELD_PLACEHOLDERS: Record<ClaudeEndpointEnvKey, string> = {
  ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
  ANTHROPIC_AUTH_TOKEN: "API key",
  ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-pro[1m]",
  ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-v4-pro[1m]",
  ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-v4-flash",
  CLAUDE_CODE_SUBAGENT_MODEL: "deepseek-v4-flash",
};

function SectionHeader({
  title,
  count,
  onAddEndpoint,
}: {
  title: string;
  count: number;
  onAddEndpoint: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderTitleGroup}>
        <Text style={settingsStyles.sectionHeaderTitle}>{title}</Text>
        <Text style={settingsStyles.sectionHeaderTitle}>{count}</Text>
      </View>
      <Button variant="ghost" size="xs" leftIcon={Plus} onPress={onAddEndpoint}>
        Add endpoint
      </Button>
    </View>
  );
}

function ClaudeEndpointRow({
  variant,
  deleting,
  onEditEndpoint,
  onDeleteEndpoint,
}: {
  variant: ClaudeEndpointVariant;
  deleting: boolean;
  onEditEndpoint: (variantId: string) => void;
  onDeleteEndpoint: (variantId: string) => void;
}) {
  const handleEdit = useCallback(() => onEditEndpoint(variant.id), [onEditEndpoint, variant.id]);
  const handleDelete = useCallback(
    () => onDeleteEndpoint(variant.id),
    [onDeleteEndpoint, variant.id],
  );

  return (
    <View style={styles.endpointRow}>
      <View style={styles.endpointContent}>
        <View style={styles.endpointTitleRow}>
          <Text style={styles.endpointTitle} numberOfLines={1}>
            {variant.label}
          </Text>
          <StatusBadge label="Claude endpoint" />
        </View>
        <View style={styles.endpointMetaRow}>
          <Text style={styles.monoHint} numberOfLines={1} selectable dataSet={CODE_SURFACE_DATASET}>
            {variant.id}
          </Text>
          {variant.env.ANTHROPIC_BASE_URL ? (
            <Text
              style={styles.endpointUrl}
              numberOfLines={1}
              selectable
              dataSet={CODE_SURFACE_DATASET}
            >
              {variant.env.ANTHROPIC_BASE_URL}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.endpointActions}>
        <Button variant="ghost" size="xs" onPress={handleEdit} disabled={deleting}>
          Edit
        </Button>
        <Button variant="ghost" size="xs" onPress={handleDelete} disabled={deleting}>
          Remove
        </Button>
      </View>
    </View>
  );
}

export function ClaudeEndpointsSection({
  variants,
  deletingEndpointId = null,
  onAddEndpoint,
  onEditEndpoint,
  onDeleteEndpoint,
}: ClaudeEndpointsSectionProps) {
  return (
    <View style={styles.section}>
      <SectionHeader
        title="Claude endpoints"
        count={variants.length}
        onAddEndpoint={onAddEndpoint}
      />
      <View style={settingsStyles.card}>
        {variants.length > 0 ? (
          variants.map((variant) => (
            <ClaudeEndpointRow
              key={variant.id}
              variant={variant}
              deleting={deletingEndpointId === variant.id}
              onEditEndpoint={onEditEndpoint}
              onDeleteEndpoint={onDeleteEndpoint}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.mutedText}>No custom Claude endpoints yet</Text>
            <Button variant="secondary" size="sm" leftIcon={Plus} onPress={onAddEndpoint}>
              Add endpoint
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}

function FormField({
  label,
  initialValue,
  placeholder,
  resetKey,
  onChangeText,
  error,
  editable = true,
}: {
  label: string;
  initialValue: string;
  placeholder?: string;
  resetKey: string;
  onChangeText: (value: string) => void;
  error?: string;
  editable?: boolean;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <AdaptiveTextInput
        initialValue={initialValue}
        resetKey={resetKey}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
        onChangeText={onChangeText}
        style={editable ? FORM_INPUT_STYLE : DISABLED_FORM_INPUT_STYLE}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function buildInitialEnv(variant: ClaudeEndpointVariant | null) {
  const env: Partial<Record<ClaudeEndpointEnvKey, string>> = {};
  for (const key of CLAUDE_ENDPOINT_ENV_KEYS) {
    env[key] = variant?.env[key] ?? "";
  }
  return env;
}

function hasErrors(errors: ClaudeEndpointVariantFormErrors): boolean {
  return Boolean(errors.label || errors.internalId);
}

export function ClaudeEndpointFormSubSheet({
  visible,
  mode,
  initialVariant,
  existingIds,
  saving,
  saveError,
  onClose,
  onSave,
}: ClaudeEndpointFormSubSheetProps) {
  const [label, setLabel] = useState("");
  const [internalId, setInternalId] = useState("claude-endpoint");
  const [env, setEnv] = useState<Partial<Record<ClaudeEndpointEnvKey, string>>>({});
  const [internalIdEdited, setInternalIdEdited] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);
  const [errors, setErrors] = useState<ClaudeEndpointVariantFormErrors>({});

  const formResetKey = `${mode}:${initialVariant?.id ?? "new"}:${visible ? "open" : "closed"}`;
  const originalId = mode === "edit" ? (initialVariant?.id ?? null) : null;

  useEffect(() => {
    if (!visible) {
      return;
    }
    const nextLabel = initialVariant?.label ?? "";
    setLabel(nextLabel);
    setInternalId(initialVariant?.id ?? generateClaudeEndpointInternalId(nextLabel, existingIds));
    setEnv(buildInitialEnv(initialVariant));
    setInternalIdEdited(false);
    setAdvancedOpen(false);
    setSecretVisible(false);
    setErrors({});
  }, [existingIds, initialVariant, visible]);

  const header = useMemo<SheetHeader>(
    () => ({ title: mode === "edit" ? "Edit Claude endpoint" : "Add Claude endpoint" }),
    [mode],
  );

  const handleLabelChange = useCallback(
    (value: string) => {
      setLabel(value);
      setErrors((current) => ({ ...current, label: undefined }));
      if (mode === "add" && !internalIdEdited) {
        setInternalId(generateClaudeEndpointInternalId(value, existingIds));
      }
    },
    [existingIds, internalIdEdited, mode],
  );

  const handleInternalIdChange = useCallback((value: string) => {
    setInternalId(value);
    setInternalIdEdited(true);
    setErrors((current) => ({ ...current, internalId: undefined }));
  }, []);

  const handleEnvChange = useCallback((key: ClaudeEndpointEnvKey, value: string) => {
    setEnv((current) => ({ ...current, [key]: value }));
  }, []);
  const handleBaseUrlChange = useCallback(
    (value: string) => handleEnvChange("ANTHROPIC_BASE_URL", value),
    [handleEnvChange],
  );
  const handleAuthTokenChange = useCallback(
    (value: string) => handleEnvChange("ANTHROPIC_AUTH_TOKEN", value),
    [handleEnvChange],
  );
  const handleOpusModelChange = useCallback(
    (value: string) => handleEnvChange("ANTHROPIC_DEFAULT_OPUS_MODEL", value),
    [handleEnvChange],
  );
  const handleSonnetModelChange = useCallback(
    (value: string) => handleEnvChange("ANTHROPIC_DEFAULT_SONNET_MODEL", value),
    [handleEnvChange],
  );
  const handleHaikuModelChange = useCallback(
    (value: string) => handleEnvChange("ANTHROPIC_DEFAULT_HAIKU_MODEL", value),
    [handleEnvChange],
  );
  const handleSubagentModelChange = useCallback(
    (value: string) => handleEnvChange("CLAUDE_CODE_SUBAGENT_MODEL", value),
    [handleEnvChange],
  );

  const handleToggleAdvanced = useCallback(() => setAdvancedOpen((current) => !current), []);
  const handleToggleSecret = useCallback(() => setSecretVisible((current) => !current), []);

  const handleSave = useCallback(() => {
    const values: ClaudeEndpointVariantFormValues = { internalId, label, env };
    const nextErrors = validateClaudeEndpointVariantForm({ values, existingIds, originalId });
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      return;
    }
    onSave(values);
  }, [env, existingIds, internalId, label, onSave, originalId]);

  const canSave = label.trim().length > 0 && !saving;

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      desktopMaxWidth={520}
      snapPoints={ENDPOINT_FORM_SNAP_POINTS}
      testID="claude-endpoint-form-sheet"
    >
      <View style={styles.formGroup}>
        <FormField
          label="Display name"
          initialValue={label}
          resetKey={`${formResetKey}:label`}
          placeholder="Claude via DeepSeek"
          onChangeText={handleLabelChange}
          error={errors.label}
        />
        <FormField
          label="ANTHROPIC_BASE_URL"
          initialValue={env.ANTHROPIC_BASE_URL ?? ""}
          resetKey={`${formResetKey}:base-url`}
          placeholder={ENV_FIELD_PLACEHOLDERS.ANTHROPIC_BASE_URL}
          onChangeText={handleBaseUrlChange}
        />
        <View style={styles.formField}>
          <Text style={styles.formLabel}>ANTHROPIC_AUTH_TOKEN</Text>
          <View style={styles.secretInputRow}>
            <AdaptiveTextInput
              initialValue={env.ANTHROPIC_AUTH_TOKEN ?? ""}
              resetKey={`${formResetKey}:auth-token`}
              placeholder={ENV_FIELD_PLACEHOLDERS.ANTHROPIC_AUTH_TOKEN}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!secretVisible}
              onChangeText={handleAuthTokenChange}
              style={SECRET_INPUT_STYLE}
            />
            <Button
              variant="ghost"
              size="xs"
              leftIcon={secretVisible ? EyeOff : Eye}
              onPress={handleToggleSecret}
              accessibilityLabel={secretVisible ? "Hide API key" : "Show API key"}
            />
          </View>
        </View>
        <FormField
          label="ANTHROPIC_DEFAULT_OPUS_MODEL"
          initialValue={env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? ""}
          resetKey={`${formResetKey}:opus`}
          placeholder={ENV_FIELD_PLACEHOLDERS.ANTHROPIC_DEFAULT_OPUS_MODEL}
          onChangeText={handleOpusModelChange}
        />
        <FormField
          label="ANTHROPIC_DEFAULT_SONNET_MODEL"
          initialValue={env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? ""}
          resetKey={`${formResetKey}:sonnet`}
          placeholder={ENV_FIELD_PLACEHOLDERS.ANTHROPIC_DEFAULT_SONNET_MODEL}
          onChangeText={handleSonnetModelChange}
        />
        <FormField
          label="ANTHROPIC_DEFAULT_HAIKU_MODEL"
          initialValue={env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? ""}
          resetKey={`${formResetKey}:haiku`}
          placeholder={ENV_FIELD_PLACEHOLDERS.ANTHROPIC_DEFAULT_HAIKU_MODEL}
          onChangeText={handleHaikuModelChange}
        />
        <FormField
          label="CLAUDE_CODE_SUBAGENT_MODEL"
          initialValue={env.CLAUDE_CODE_SUBAGENT_MODEL ?? ""}
          resetKey={`${formResetKey}:subagent`}
          placeholder={ENV_FIELD_PLACEHOLDERS.CLAUDE_CODE_SUBAGENT_MODEL}
          onChangeText={handleSubagentModelChange}
        />
        <Button variant="ghost" size="xs" onPress={handleToggleAdvanced}>
          {advancedOpen ? "Hide advanced" : "Advanced"}
        </Button>
        {advancedOpen ? (
          <FormField
            label="Internal ID"
            initialValue={internalId}
            resetKey={`${formResetKey}:internal-id`}
            placeholder="claude-deepseek"
            onChangeText={handleInternalIdChange}
            error={errors.internalId}
            editable={mode === "add"}
          />
        ) : null}
        {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
        <View style={styles.formActions}>
          <Button variant="secondary" size="sm" onPress={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onPress={handleSave}
            disabled={!canSave}
            loading={saving}
          >
            Save
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    marginBottom: theme.spacing[4],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
    marginLeft: theme.spacing[1],
  },
  sectionHeaderTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  endpointRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  endpointContent: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  endpointTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  endpointTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    flexShrink: 1,
  },
  endpointMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    minWidth: 0,
  },
  endpointUrl: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
  },
  monoHint: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    flexShrink: 0,
  },
  endpointActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  emptyState: {
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    alignItems: "center",
    gap: theme.spacing[3],
  },
  mutedText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  formGroup: {
    gap: theme.spacing[3],
  },
  formField: {
    gap: theme.spacing[2],
  },
  formLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  formInput: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: theme.fontSize.sm,
  },
  disabledInput: {
    opacity: theme.opacity[50],
  },
  secretInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  secretInput: {
    flex: 1,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.destructive,
  },
}));

const FORM_INPUT_STYLE = styles.formInput;
const DISABLED_FORM_INPUT_STYLE = [styles.formInput, styles.disabledInput];
const SECRET_INPUT_STYLE = [styles.formInput, styles.secretInput];
const ENDPOINT_FORM_SNAP_POINTS = ["85%"];
