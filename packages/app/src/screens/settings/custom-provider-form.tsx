import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  buildExtendsProviderConfigPatch,
  type ExtendsProviderFormValues,
} from "@/hooks/use-custom-provider-form";
import type { MutableDaemonConfigPatch } from "@bytetrue/protocol/messages";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedPlus = withUnistyles(Plus);
const ThemedTrash2 = withUnistyles(Trash2);

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const BASE_PROVIDERS = [
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "pi", label: "Pi" },
  { id: "opencode", label: "OpenCode" },
  { id: "copilot", label: "Copilot" },
  { id: "omp", label: "OMP" },
] as const;

const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

interface EnvRow {
  id: string;
  key: string;
  value: string;
}

interface ModelRow {
  id: string;
  modelId: string;
  label: string;
  isDefault: boolean;
}

// --- Sub-components ---

interface BaseProviderChipProps {
  provider: { id: string; label: string };
  selected: boolean;
  onSelect: (id: string) => void;
}

function BaseProviderChip({ provider, selected, onSelect }: BaseProviderChipProps) {
  const handlePress = useCallback(() => onSelect(provider.id), [onSelect, provider.id]);
  const chipStyle = useMemo(
    () => [styles.baseProviderChip, selected && styles.baseProviderChipSelected],
    [selected],
  );
  const chipTextStyle = useMemo(
    () => [styles.baseProviderChipText, selected && styles.baseProviderChipTextSelected],
    [selected],
  );
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  return (
    <Pressable
      onPress={handlePress}
      style={chipStyle}
      accessibilityRole="radio"
      accessibilityState={accessibilityState}
      accessibilityLabel={`${provider.label} provider`}
    >
      <Text style={chipTextStyle}>{provider.label}</Text>
    </Pressable>
  );
}

interface EnvVarRowProps {
  row: EnvRow;
  onUpdateKey: (rowId: string, key: string) => void;
  onUpdateValue: (rowId: string, value: string) => void;
  onRemove: (rowId: string) => void;
}

function EnvVarRow({ row, onUpdateKey, onUpdateValue, onRemove }: EnvVarRowProps) {
  const handleKeyChange = useCallback(
    (text: string) => onUpdateKey(row.id, text),
    [onUpdateKey, row.id],
  );
  const handleValueChange = useCallback(
    (text: string) => onUpdateValue(row.id, text),
    [onUpdateValue, row.id],
  );
  const handleRemove = useCallback(() => onRemove(row.id), [onRemove, row.id]);
  const keyStyle = useMemo(() => [styles.input, styles.envKeyInput], []);
  const valueStyle = useMemo(() => [styles.input, styles.envValueInput], []);
  return (
    <View style={styles.envRow}>
      <TextInput
        value={row.key}
        onChangeText={handleKeyChange}
        placeholder="KEY"
        placeholderTextColor={styles.placeholderColor.color}
        autoCapitalize="none"
        autoCorrect={false}
        style={keyStyle}
        accessibilityLabel="Env var key"
      />
      <TextInput
        value={row.value}
        onChangeText={handleValueChange}
        placeholder="value"
        placeholderTextColor={styles.placeholderColor.color}
        autoCapitalize="none"
        style={valueStyle}
        accessibilityLabel="Env var value"
      />
      <Pressable
        onPress={handleRemove}
        style={styles.removeButton}
        accessibilityLabel="Remove env var"
        hitSlop={8}
      >
        <ThemedTrash2 size={14} uniProps={mutedColorMapping} />
      </Pressable>
    </View>
  );
}

interface ModelRowViewProps {
  row: ModelRow;
  onUpdateField: (rowId: string, field: "modelId" | "label", value: string) => void;
  onSetDefault: (rowId: string) => void;
  onRemove: (rowId: string) => void;
}

function ModelRowView({ row, onUpdateField, onSetDefault, onRemove }: ModelRowViewProps) {
  const handleIdChange = useCallback(
    (text: string) => onUpdateField(row.id, "modelId", text),
    [onUpdateField, row.id],
  );
  const handleLabelChange = useCallback(
    (text: string) => onUpdateField(row.id, "label", text),
    [onUpdateField, row.id],
  );
  const handleSetDefault = useCallback(() => onSetDefault(row.id), [onSetDefault, row.id]);
  const handleRemove = useCallback(() => onRemove(row.id), [onRemove, row.id]);
  const idStyle = useMemo(() => [styles.input, styles.modelIdInput], []);
  const labelStyle = useMemo(() => [styles.input, styles.modelLabelInput], []);
  const defaultButtonStyle = useMemo(
    () => [styles.modelDefaultButton, row.isDefault && styles.modelDefaultButtonActive],
    [row.isDefault],
  );
  const defaultTextStyle = useMemo(
    () => [styles.modelDefaultText, row.isDefault && styles.modelDefaultTextActive],
    [row.isDefault],
  );
  const accessibilityState = useMemo(() => ({ selected: row.isDefault }), [row.isDefault]);
  return (
    <View style={styles.modelRow}>
      <TextInput
        value={row.modelId}
        onChangeText={handleIdChange}
        placeholder="model-id"
        placeholderTextColor={styles.placeholderColor.color}
        autoCapitalize="none"
        autoCorrect={false}
        style={idStyle}
        accessibilityLabel="Model ID"
      />
      <TextInput
        value={row.label}
        onChangeText={handleLabelChange}
        placeholder="Label"
        placeholderTextColor={styles.placeholderColor.color}
        style={labelStyle}
        accessibilityLabel="Model label"
      />
      <Pressable
        onPress={handleSetDefault}
        style={defaultButtonStyle}
        accessibilityRole="radio"
        accessibilityState={accessibilityState}
        accessibilityLabel="Set as default model"
      >
        <Text style={defaultTextStyle}>Default</Text>
      </Pressable>
      <Pressable
        onPress={handleRemove}
        style={styles.removeButton}
        accessibilityLabel="Remove model"
        hitSlop={8}
      >
        <ThemedTrash2 size={14} uniProps={mutedColorMapping} />
      </Pressable>
    </View>
  );
}

// --- Main component ---

interface CustomProviderFormProps {
  existingProviderIds: string[];
  isSubmitting: boolean;
  onSubmit: (patch: MutableDaemonConfigPatch) => Promise<void>;
  onCancel: () => void;
}

export function CustomProviderForm({
  existingProviderIds,
  isSubmitting,
  onSubmit,
  onCancel,
}: CustomProviderFormProps) {
  const envIdCounter = useRef(0);
  const modelIdCounter = useRef(0);

  const [baseProvider, setBaseProvider] = useState<string>("claude");
  const [providerId, setProviderId] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [envRows, setEnvRows] = useState<EnvRow[]>([
    { id: `env-${++envIdCounter.current}`, key: "", value: "" },
  ]);
  const [disallowedWebSearch, setDisallowedWebSearch] = useState(true);
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const [modelRows, setModelRows] = useState<ModelRow[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearFieldError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    const trimmedId = providerId.trim();
    const trimmedLabel = label.trim();

    if (!trimmedId) {
      next.providerId = "Provider ID is required";
    } else if (!PROVIDER_ID_PATTERN.test(trimmedId)) {
      next.providerId = "Provider ID must be lowercase letters, digits, and hyphens";
    } else if (existingProviderIds.includes(trimmedId)) {
      next.providerId = "Provider ID already exists";
    }

    if (!trimmedLabel) {
      next.label = "Label is required";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [providerId, label, existingProviderIds]);

  const handleSubmit = useCallback(async () => {
    setErrors({});
    if (!validate()) return;

    const values: ExtendsProviderFormValues = {
      providerId: providerId.trim(),
      extends: baseProvider,
      label: label.trim(),
      description: description.trim() || undefined,
      env: envRows.map((r) => ({ key: r.key, value: r.value })),
      models:
        modelRows.length > 0
          ? modelRows.map((r) => ({
              id: r.modelId,
              label: r.label,
              isDefault: r.isDefault,
            }))
          : undefined,
      disallowedTools: baseProvider === "claude" && disallowedWebSearch ? ["WebSearch"] : undefined,
    };

    try {
      await onSubmit(buildExtendsProviderConfigPatch(values));
    } catch (error) {
      Alert.alert("Unable to add provider", error instanceof Error ? error.message : String(error));
    }
  }, [
    validate,
    providerId,
    baseProvider,
    label,
    description,
    envRows,
    modelRows,
    disallowedWebSearch,
    onSubmit,
  ]);

  const addEnvRow = useCallback(() => {
    setEnvRows((prev) => [...prev, { id: `env-${++envIdCounter.current}`, key: "", value: "" }]);
  }, []);

  const removeEnvRow = useCallback((rowId: string) => {
    setEnvRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const updateEnvKey = useCallback((rowId: string, key: string) => {
    setEnvRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, key } : r)));
  }, []);

  const updateEnvValue = useCallback((rowId: string, value: string) => {
    setEnvRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, value } : r)));
  }, []);

  const addModelRow = useCallback(() => {
    setModelRows((prev) => [
      ...prev,
      {
        id: `model-${++modelIdCounter.current}`,
        modelId: "",
        label: "",
        isDefault: false,
      },
    ]);
  }, []);

  const removeModelRow = useCallback((rowId: string) => {
    setModelRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const updateModelField = useCallback(
    (rowId: string, field: "modelId" | "label", value: string) => {
      setModelRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)));
    },
    [],
  );

  const setModelDefault = useCallback((rowId: string) => {
    setModelRows((prev) =>
      prev.map((r) => ({
        ...r,
        isDefault: r.id === rowId,
      })),
    );
  }, []);

  const handleProviderIdChange = useCallback(
    (text: string) => {
      setProviderId(text);
      clearFieldError("providerId");
    },
    [clearFieldError],
  );

  const handleLabelChange = useCallback(
    (text: string) => {
      setLabel(text);
      clearFieldError("label");
    },
    [clearFieldError],
  );

  const toggleModels = useCallback(() => {
    setModelsExpanded((prev) => !prev);
  }, []);

  const providerIdInputStyle = useMemo(
    () => [styles.input, errors.providerId ? styles.inputError : null],
    [errors.providerId],
  );

  const labelInputStyle = useMemo(
    () => [styles.input, errors.label ? styles.inputError : null],
    [errors.label],
  );

  return (
    <View style={styles.container}>
      {/* Base provider */}
      <Text style={styles.fieldLabel}>Base provider</Text>
      <View style={styles.baseProviderRow}>
        {BASE_PROVIDERS.map((p) => (
          <BaseProviderChip
            key={p.id}
            provider={p}
            selected={baseProvider === p.id}
            onSelect={setBaseProvider}
          />
        ))}
      </View>

      {/* Provider ID */}
      <Text style={styles.fieldLabel}>Provider ID</Text>
      <TextInput
        value={providerId}
        onChangeText={handleProviderIdChange}
        placeholder="my-provider"
        placeholderTextColor={styles.placeholderColor.color}
        autoCapitalize="none"
        autoCorrect={false}
        style={providerIdInputStyle}
        accessibilityLabel="Provider ID"
        testID="custom-provider-id-input"
      />
      {errors.providerId ? <Text style={styles.errorText}>{errors.providerId}</Text> : null}

      {/* Label */}
      <Text style={styles.fieldLabel}>Label</Text>
      <TextInput
        value={label}
        onChangeText={handleLabelChange}
        placeholder="My Provider"
        placeholderTextColor={styles.placeholderColor.color}
        style={labelInputStyle}
        accessibilityLabel="Provider label"
        testID="custom-provider-label-input"
      />
      {errors.label ? <Text style={styles.errorText}>{errors.label}</Text> : null}

      {/* Description */}
      <Text style={styles.fieldLabel}>Description (optional)</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Short description"
        placeholderTextColor={styles.placeholderColor.color}
        style={styles.input}
        accessibilityLabel="Provider description"
        testID="custom-provider-description-input"
      />

      {/* Env vars */}
      <Text style={styles.fieldLabel}>Environment variables</Text>
      {envRows.map((row) => (
        <EnvVarRow
          key={row.id}
          row={row}
          onUpdateKey={updateEnvKey}
          onUpdateValue={updateEnvValue}
          onRemove={removeEnvRow}
        />
      ))}
      <Pressable
        onPress={addEnvRow}
        style={styles.addRowButton}
        accessibilityLabel="Add environment variable"
      >
        <ThemedPlus size={14} uniProps={mutedColorMapping} />
        <Text style={styles.addRowText}>Add variable</Text>
      </Pressable>

      {/* Disallowed tools (claude only) */}
      {baseProvider === "claude" ? (
        <View style={styles.disallowedRow}>
          <View style={styles.disallowedTextColumn}>
            <Text style={styles.fieldLabel}>Disable WebSearch</Text>
            <Text style={styles.fieldHint}>
              Third-party Anthropic-compatible APIs do not support WebSearch
            </Text>
          </View>
          <Switch
            value={disallowedWebSearch}
            onValueChange={setDisallowedWebSearch}
            accessibilityLabel="Disable WebSearch tool"
          />
        </View>
      ) : null}

      {/* Models (collapsible) */}
      <Pressable
        onPress={toggleModels}
        style={styles.collapseHeader}
        accessibilityRole="button"
        accessibilityLabel={modelsExpanded ? "Collapse models section" : "Expand models section"}
      >
        {modelsExpanded ? (
          <ThemedChevronDown size={14} uniProps={mutedColorMapping} />
        ) : (
          <ThemedChevronRight size={14} uniProps={mutedColorMapping} />
        )}
        <Text style={styles.collapseHeaderText}>Models (optional)</Text>
      </Pressable>
      {modelsExpanded ? (
        <View style={styles.modelsSection}>
          {modelRows.map((row) => (
            <ModelRowView
              key={row.id}
              row={row}
              onUpdateField={updateModelField}
              onSetDefault={setModelDefault}
              onRemove={removeModelRow}
            />
          ))}
          <Pressable
            onPress={addModelRow}
            style={styles.addRowButton}
            accessibilityLabel="Add model"
          >
            <ThemedPlus size={14} uniProps={mutedColorMapping} />
            <Text style={styles.addRowText}>Add model</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          variant="ghost"
          onPress={onCancel}
          disabled={isSubmitting}
          testID="custom-provider-cancel-button"
        >
          Cancel
        </Button>
        <Button
          variant="default"
          onPress={handleSubmit}
          disabled={isSubmitting}
          loading={isSubmitting}
          testID="custom-provider-save-button"
        >
          {isSubmitting ? "Saving" : "Save"}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    padding: theme.spacing[3],
    gap: theme.spacing[3],
  },
  fieldLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  fieldHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  placeholderColor: {
    color: theme.colors.foregroundMuted,
  },
  baseProviderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[1.5],
  },
  baseProviderChip: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  baseProviderChipSelected: {
    borderColor: theme.colors.palette.blue[400],
    backgroundColor: theme.colors.palette.blue[900],
  },
  baseProviderChipText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  baseProviderChipTextSelected: {
    color: theme.colors.palette.blue[300],
  },
  input: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  inputError: {
    borderColor: theme.colors.palette.red[300],
  },
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
    marginTop: -theme.spacing[2],
  },
  envRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
    alignItems: "center",
  },
  envKeyInput: {
    flex: 1,
  },
  envValueInput: {
    flex: 2,
  },
  removeButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  addRowButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[1],
  },
  addRowText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  disallowedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  disallowedTextColumn: {
    flex: 1,
  },
  collapseHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[1],
  },
  collapseHeaderText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  modelsSection: {
    gap: theme.spacing[2],
  },
  modelRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
    alignItems: "center",
  },
  modelIdInput: {
    flex: 1,
  },
  modelLabelInput: {
    flex: 1,
  },
  modelDefaultButton: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modelDefaultButtonActive: {
    borderColor: theme.colors.palette.blue[400],
    backgroundColor: theme.colors.palette.blue[900],
  },
  modelDefaultText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  modelDefaultTextActive: {
    color: theme.colors.palette.blue[300],
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
}));
