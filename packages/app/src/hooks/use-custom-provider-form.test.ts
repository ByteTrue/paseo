import { describe, expect, it } from "vitest";
import {
  buildExtendsProviderConfigPatch,
  type ExtendsProviderFormValues,
} from "./use-custom-provider-form";

function makeValues(overrides: Partial<ExtendsProviderFormValues> = {}): ExtendsProviderFormValues {
  return {
    providerId: "my-zai",
    extends: "claude",
    label: "ZAI",
    env: [{ key: "ANTHROPIC_BASE_URL", value: "https://api.z.ai/api/anthropic" }],
    ...overrides,
  };
}

describe("buildExtendsProviderConfigPatch", () => {
  it("constructs a patch with extends, label, and env vars", () => {
    const patch = buildExtendsProviderConfigPatch(makeValues());
    expect(patch).toEqual({
      providers: {
        "my-zai": {
          extends: "claude",
          label: "ZAI",
          description: undefined,
          env: { ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic" },
          models: undefined,
          disallowedTools: undefined,
        },
      },
    });
  });

  it("includes description when provided", () => {
    const patch = buildExtendsProviderConfigPatch(makeValues({ description: "Z.AI coding plan" }));
    expect(patch.providers?.["my-zai"]?.description).toBe("Z.AI coding plan");
  });

  it("omits description when empty string", () => {
    const patch = buildExtendsProviderConfigPatch(makeValues({ description: "" }));
    expect(patch.providers?.["my-zai"]?.description).toBeUndefined();
  });

  it("filters out env rows with empty keys", () => {
    const patch = buildExtendsProviderConfigPatch(
      makeValues({
        env: [
          { key: "  ", value: "ignored" },
          { key: "VALID_KEY", value: "kept" },
          { key: "", value: "also-ignored" },
        ],
      }),
    );
    expect(patch.providers?.["my-zai"]?.env).toEqual({ VALID_KEY: "kept" });
  });

  it("omits env when all keys are empty", () => {
    const patch = buildExtendsProviderConfigPatch(
      makeValues({
        env: [
          { key: "", value: "a" },
          { key: "  ", value: "b" },
        ],
      }),
    );
    expect(patch.providers?.["my-zai"]?.env).toBeUndefined();
  });

  it("trims env keys", () => {
    const patch = buildExtendsProviderConfigPatch(
      makeValues({
        env: [{ key: "  MY_KEY  ", value: "val" }],
      }),
    );
    expect(patch.providers?.["my-zai"]?.env).toEqual({ MY_KEY: "val" });
  });

  it("includes models when provided", () => {
    const patch = buildExtendsProviderConfigPatch(
      makeValues({
        models: [
          { id: "glm-5-turbo", label: "GLM 5 Turbo", isDefault: true },
          { id: "glm-4.5-air", label: "GLM 4.5 Air" },
        ],
      }),
    );
    expect(patch.providers?.["my-zai"]?.models).toEqual([
      { id: "glm-5-turbo", label: "GLM 5 Turbo", isDefault: true },
      { id: "glm-4.5-air", label: "GLM 4.5 Air" },
    ]);
  });

  it("omits models when empty array", () => {
    const patch = buildExtendsProviderConfigPatch(makeValues({ models: [] }));
    expect(patch.providers?.["my-zai"]?.models).toBeUndefined();
  });

  it("includes disallowedTools when provided", () => {
    const patch = buildExtendsProviderConfigPatch(makeValues({ disallowedTools: ["WebSearch"] }));
    expect(patch.providers?.["my-zai"]?.disallowedTools).toEqual(["WebSearch"]);
  });

  it("omits disallowedTools when empty array", () => {
    const patch = buildExtendsProviderConfigPatch(makeValues({ disallowedTools: [] }));
    expect(patch.providers?.["my-zai"]?.disallowedTools).toBeUndefined();
  });

  it("works with non-claude base provider", () => {
    const patch = buildExtendsProviderConfigPatch(
      makeValues({
        extends: "codex",
        env: [{ key: "OPENAI_BASE_URL", value: "https://custom.example.com" }],
      }),
    );
    expect(patch.providers?.["my-zai"]?.extends).toBe("codex");
    expect(patch.providers?.["my-zai"]?.env).toEqual({
      OPENAI_BASE_URL: "https://custom.example.com",
    });
  });

  it("works with pi base provider", () => {
    const patch = buildExtendsProviderConfigPatch(
      makeValues({ extends: "pi", label: "My Pi Fork" }),
    );
    expect(patch.providers?.["my-zai"]?.extends).toBe("pi");
    expect(patch.providers?.["my-zai"]?.label).toBe("My Pi Fork");
  });
});
