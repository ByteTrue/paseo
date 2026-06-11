import type { MutableDaemonConfigPatch } from "@bytetrue/protocol/messages";

export interface ExtendsProviderFormValues {
  providerId: string;
  extends: string;
  label: string;
  description?: string;
  env: Array<{ key: string; value: string }>;
  models?: Array<{ id: string; label: string; isDefault?: boolean }>;
  disallowedTools?: string[];
}

export function buildExtendsProviderConfigPatch(
  values: ExtendsProviderFormValues,
): MutableDaemonConfigPatch {
  const env: Record<string, string> = {};
  for (const { key, value } of values.env) {
    if (key.trim()) env[key.trim()] = value;
  }
  return {
    providers: {
      [values.providerId]: {
        extends: values.extends,
        label: values.label,
        description: values.description || undefined,
        env: Object.keys(env).length > 0 ? env : undefined,
        models: values.models?.length ? values.models : undefined,
        disallowedTools: values.disallowedTools?.length ? values.disallowedTools : undefined,
      },
    },
  };
}
