import { describe, expect, test } from "vitest";
import {
  buildClaudeEndpointVariantPatch,
  generateClaudeEndpointInternalId,
  listClaudeEndpointVariants,
  validateClaudeEndpointVariantForm,
} from "./claude-endpoint-variants";

describe("Claude endpoint variant config", () => {
  test("filters blank env fields and emits the managed Claude provider override", () => {
    expect(
      buildClaudeEndpointVariantPatch({
        internalId: "claude-deepseek",
        label: "Claude via DeepSeek",
        env: {
          ANTHROPIC_BASE_URL: " https://api.deepseek.com/anthropic ",
          ANTHROPIC_AUTH_TOKEN: "sk-deepseek",
          ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-pro[1m]",
          ANTHROPIC_DEFAULT_SONNET_MODEL: "",
          ANTHROPIC_DEFAULT_HAIKU_MODEL: "   ",
          CLAUDE_CODE_SUBAGENT_MODEL: "deepseek-v4-flash",
        },
      }),
    ).toEqual({
      providers: {
        "claude-deepseek": {
          extends: "claude",
          label: "Claude via DeepSeek",
          description: "Claude endpoint",
          env: {
            ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
            ANTHROPIC_AUTH_TOKEN: "sk-deepseek",
            ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-pro[1m]",
            CLAUDE_CODE_SUBAGENT_MODEL: "deepseek-v4-flash",
          },
          disallowedTools: ["WebSearch"],
          params: { paseoManagedKind: "claudeEndpointVariant" },
        },
      },
    });
  });

  test("emits an empty env object when replacing existing endpoint env", () => {
    expect(
      buildClaudeEndpointVariantPatch(
        {
          internalId: "claude-deepseek",
          label: "Claude via DeepSeek",
          env: {
            ANTHROPIC_BASE_URL: "",
            ANTHROPIC_AUTH_TOKEN: "   ",
          },
        },
        { replaceEnv: true },
      ),
    ).toEqual({
      providers: {
        "claude-deepseek": {
          extends: "claude",
          label: "Claude via DeepSeek",
          description: "Claude endpoint",
          env: {},
          disallowedTools: ["WebSearch"],
          params: { paseoManagedKind: "claudeEndpointVariant" },
        },
      },
    });
  });

  test("lists only marked Claude endpoint variants", () => {
    expect(
      listClaudeEndpointVariants({
        "claude-deepseek": {
          extends: "claude",
          label: "Claude via DeepSeek",
          env: {
            ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
            ANTHROPIC_MODEL: "ignored-by-ui",
          },
          params: { paseoManagedKind: "claudeEndpointVariant" },
        },
        "handwritten-claude": {
          extends: "claude",
          label: "Handwritten Claude",
          params: { other: true },
        },
        "codex-endpoint": {
          extends: "codex",
          label: "Codex endpoint",
          params: { paseoManagedKind: "claudeEndpointVariant" },
        },
      }),
    ).toEqual([
      {
        id: "claude-deepseek",
        label: "Claude via DeepSeek",
        env: { ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic" },
      },
    ]);
  });

  test("generates unique Claude-prefixed internal ids from display names", () => {
    expect(
      generateClaudeEndpointInternalId(
        "Claude via DeepSeek",
        new Set(["claude-via-deepseek", "claude-via-deepseek-2"]),
      ),
    ).toBe("claude-via-deepseek-3");
  });

  test("validates required display names and duplicate internal ids", () => {
    expect(
      validateClaudeEndpointVariantForm({
        values: { internalId: "claude-deepseek", label: "", env: {} },
        existingIds: new Set(),
        originalId: null,
      }),
    ).toEqual({ label: "Display name is required" });

    expect(
      validateClaudeEndpointVariantForm({
        values: { internalId: "claude-deepseek", label: "Claude via DeepSeek", env: {} },
        existingIds: new Set(["claude-deepseek"]),
        originalId: null,
      }),
    ).toEqual({ internalId: "Internal ID is already in use" });

    expect(
      validateClaudeEndpointVariantForm({
        values: { internalId: "Claude DeepSeek", label: "Claude via DeepSeek", env: {} },
        existingIds: new Set(),
        originalId: null,
      }),
    ).toEqual({
      internalId:
        "Internal ID must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens",
    });
  });
});
