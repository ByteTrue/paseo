import type { MutableDaemonConfigPatch } from "@bytetrue/protocol/messages";

export const CLAUDE_ENDPOINT_VARIANT_MANAGED_KIND = "claudeEndpointVariant";
export const CLAUDE_ENDPOINT_VARIANT_BASE_PROVIDER_ID = "claude";
export const CLAUDE_ENDPOINT_VARIANT_DESCRIPTION = "Claude endpoint";

export const CLAUDE_ENDPOINT_ENV_KEYS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
] as const;

export type ClaudeEndpointEnvKey = (typeof CLAUDE_ENDPOINT_ENV_KEYS)[number];

export interface ClaudeEndpointVariantFormValues {
  internalId: string;
  label: string;
  env: Partial<Record<ClaudeEndpointEnvKey, string>>;
}

type MutableDaemonProviderPatch = NonNullable<MutableDaemonConfigPatch["providers"]>[string];

export interface ClaudeEndpointVariant {
  id: string;
  label: string;
  env: Partial<Record<ClaudeEndpointEnvKey, string>>;
}

export interface ClaudeEndpointVariantFormErrors {
  label?: string;
  internalId?: string;
}

export interface ValidateClaudeEndpointVariantFormInput {
  values: ClaudeEndpointVariantFormValues;
  existingIds: ReadonlySet<string>;
  originalId: string | null;
}

export interface BuildClaudeEndpointVariantPatchOptions {
  replaceEnv?: boolean;
}

const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const INTERNAL_ID_FORMAT_ERROR =
  "Internal ID must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readClaudeEndpointEnv(value: unknown): Partial<Record<ClaudeEndpointEnvKey, string>> {
  if (!isRecord(value)) {
    return {};
  }

  const env: Partial<Record<ClaudeEndpointEnvKey, string>> = {};
  for (const key of CLAUDE_ENDPOINT_ENV_KEYS) {
    const envValue = value[key];
    if (typeof envValue === "string") {
      env[key] = envValue;
    }
  }
  return env;
}

export function isClaudeEndpointVariantProviderConfig(providerConfig: unknown): boolean {
  if (
    !isRecord(providerConfig) ||
    providerConfig.extends !== CLAUDE_ENDPOINT_VARIANT_BASE_PROVIDER_ID
  ) {
    return false;
  }
  if (!isRecord(providerConfig.params)) {
    return false;
  }
  return providerConfig.params.paseoManagedKind === CLAUDE_ENDPOINT_VARIANT_MANAGED_KIND;
}

export function listClaudeEndpointVariants(
  providers: Record<string, unknown> | null | undefined,
  query = "",
): ClaudeEndpointVariant[] {
  if (!providers) {
    return [];
  }
  const normalizedQuery = query.trim().toLowerCase();
  return Object.entries(providers)
    .filter(([, providerConfig]) => isClaudeEndpointVariantProviderConfig(providerConfig))
    .map(([id, providerConfig]) => {
      const providerRecord = providerConfig as Record<string, unknown>;
      const label = typeof providerRecord.label === "string" ? providerRecord.label : id;
      const env = buildEnvPatch(readClaudeEndpointEnv(providerRecord.env)) ?? {};
      return { id, label, env };
    })
    .filter((variant) => {
      if (!normalizedQuery) {
        return true;
      }
      const searchable = [variant.id, variant.label, variant.env.ANTHROPIC_BASE_URL ?? ""]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
}

export function generateClaudeEndpointInternalId(
  label: string,
  existingIds: ReadonlySet<string>,
): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let baseId = "claude-endpoint";
  if (slug && slug !== "claude") {
    baseId = slug;
    if (!baseId.startsWith("claude-")) {
      baseId = `claude-${baseId}`;
    }
  }
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

export function validateClaudeEndpointVariantForm(
  input: ValidateClaudeEndpointVariantFormInput,
): ClaudeEndpointVariantFormErrors {
  const errors: ClaudeEndpointVariantFormErrors = {};
  const label = input.values.label.trim();
  const internalId = input.values.internalId.trim();

  if (!label) {
    errors.label = "Display name is required";
  }
  if (!PROVIDER_ID_PATTERN.test(internalId)) {
    errors.internalId = INTERNAL_ID_FORMAT_ERROR;
  } else if (internalId !== input.originalId && input.existingIds.has(internalId)) {
    errors.internalId = "Internal ID is already in use";
  }

  return errors;
}

function buildEnvPatch(
  env: ClaudeEndpointVariantFormValues["env"],
): Record<string, string> | undefined {
  const entries = CLAUDE_ENDPOINT_ENV_KEYS.flatMap((key) => {
    const value = env[key]?.trim();
    return value ? ([[key, value]] as const) : [];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function buildClaudeEndpointVariantPatch(
  values: ClaudeEndpointVariantFormValues,
  options: BuildClaudeEndpointVariantPatchOptions = {},
): MutableDaemonConfigPatch {
  const providerPatch: MutableDaemonProviderPatch = {
    extends: CLAUDE_ENDPOINT_VARIANT_BASE_PROVIDER_ID,
    label: values.label.trim(),
    description: CLAUDE_ENDPOINT_VARIANT_DESCRIPTION,
    disallowedTools: ["WebSearch"],
    params: { paseoManagedKind: CLAUDE_ENDPOINT_VARIANT_MANAGED_KIND },
  };
  const env = buildEnvPatch(values.env);
  if (env || options.replaceEnv === true) {
    providerPatch.env = env ?? {};
  }

  return {
    providers: {
      [values.internalId.trim()]: providerPatch,
    },
  };
}
