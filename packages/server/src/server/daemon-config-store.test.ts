import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { DaemonConfigStore, applyMutableProviderConfigToOverrides } from "./daemon-config-store.js";
import { loadPersistedConfig } from "./persisted-config.js";

const topLevelTempDirs: string[] = [];

afterEach(() => {
  for (const dir of topLevelTempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("applyMutableProviderConfigToOverrides", () => {
  test("merges mutable provider fields onto provider overrides", () => {
    expect(
      applyMutableProviderConfigToOverrides(
        {
          gemini: {
            extends: "acp",
            label: "Gemini",
            command: ["gemini", "--acp"],
          },
        },
        {
          gemini: {
            enabled: false,
            description: "Gemini ACP",
            env: { GEMINI_AUTO_UPDATE: "0" },
          },
          claude: {
            additionalModels: [
              {
                id: "claude-custom",
                label: "claude-custom",
              },
            ],
          },
        },
      ),
    ).toEqual({
      gemini: {
        extends: "acp",
        label: "Gemini",
        description: "Gemini ACP",
        command: ["gemini", "--acp"],
        env: { GEMINI_AUTO_UPDATE: "0" },
        enabled: false,
      },
      claude: {
        additionalModels: [
          {
            id: "claude-custom",
            label: "claude-custom",
          },
        ],
      },
    });
  });

  test("removes providers from overrides", () => {
    expect(
      applyMutableProviderConfigToOverrides(
        {
          gemini: { extends: "acp", label: "Gemini", command: ["gemini", "--acp"] },
          claude: { additionalModels: [{ id: "claude-custom", label: "claude-custom" }] },
        },
        {
          gemini: { removed: true },
        },
      ),
    ).toEqual({
      claude: { additionalModels: [{ id: "claude-custom", label: "claude-custom" }] },
    });
  });
});

describe("DaemonConfigStore", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("patch persists provider enabled flags into config.json", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);

    const initial = loadPersistedConfig(paseoHome);
    const configPath = path.join(paseoHome, "config.json");
    // Reuse the validated serializer through the store path by seeding the file directly.
    // This keeps the test focused on the merge behavior.
    const seeded =
      JSON.stringify(
        {
          ...initial,
          agents: {
            providers: {
              gemini: {
                extends: "acp",
                label: "Gemini",
                command: ["gemini", "--acp"],
              },
            },
          },
        },
        null,
        2,
      ) + "\n";
    writeFileSync(configPath, seeded);

    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
        providers: {},
        metadataGeneration: { providers: [] },
        autoArchiveAfterMerge: false,
        appendSystemPrompt: "",
      },
      undefined,
    );

    store.patch({
      providers: {
        gemini: { enabled: false },
      },
    });

    const persisted = loadPersistedConfig(paseoHome);
    expect(persisted.agents?.providers?.gemini).toEqual({
      extends: "acp",
      label: "Gemini",
      command: ["gemini", "--acp"],
      enabled: false,
    });
  });

  test("patch persists append system prompt into config.json", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);

    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
        providers: {},
        metadataGeneration: { providers: [] },
        autoArchiveAfterMerge: false,
        appendSystemPrompt: "",
      },
      undefined,
    );

    store.patch({
      appendSystemPrompt: "Prefer terse replies.",
    });

    const persisted = loadPersistedConfig(paseoHome);
    expect(persisted.daemon?.appendSystemPrompt).toBe("Prefer terse replies.");
  });

  test("patch persists provider additional models into config.json", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);

    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
        providers: {},
        metadataGeneration: { providers: [] },
        autoArchiveAfterMerge: false,
        appendSystemPrompt: "",
      },
      undefined,
    );

    store.patch({
      providers: {
        claude: {
          additionalModels: [
            {
              id: "claude-custom",
              label: "claude-custom",
            },
          ],
        },
      },
    });

    const persisted = loadPersistedConfig(paseoHome);
    expect(persisted.agents?.providers?.claude).toEqual({
      additionalModels: [
        {
          id: "claude-custom",
          label: "claude-custom",
        },
      ],
    });
  });

  test("patch persists daemon append system prompt into config.json", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);

    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
        providers: {},
        metadataGeneration: { providers: [] },
        autoArchiveAfterMerge: false,
        appendSystemPrompt: "",
      },
      undefined,
    );

    store.patch({
      appendSystemPrompt: "Prefer terse replies.",
    });

    const persisted = loadPersistedConfig(paseoHome);
    expect(persisted.daemon?.appendSystemPrompt).toBe("Prefer terse replies.");
  });

  test("patch persists metadata generation providers into config.json", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);

    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
        providers: {},
        metadataGeneration: { providers: [] },
        autoArchiveAfterMerge: false,
        appendSystemPrompt: "",
      },
      undefined,
    );

    store.patch({
      metadataGeneration: {
        providers: [
          { provider: "claude", model: "haiku" },
          { provider: "codex", model: "gpt-5.4-mini", thinkingOptionId: "low" },
        ],
      },
    });

    const persisted = loadPersistedConfig(paseoHome);
    expect(persisted.agents?.metadataGeneration).toEqual({
      providers: [
        { provider: "claude", model: "haiku" },
        { provider: "codex", model: "gpt-5.4-mini", thinkingOptionId: "low" },
      ],
    });
  });

  test("patch persists clearing metadata generation providers into config.json", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);

    const configPath = path.join(paseoHome, "config.json");
    writeFileSync(
      configPath,
      `${JSON.stringify(
        {
          version: 1,
          agents: {
            metadataGeneration: {
              providers: [{ provider: "claude", model: "haiku" }],
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
        providers: {},
        autoArchiveAfterMerge: false,
        appendSystemPrompt: "",
        metadataGeneration: { providers: [{ provider: "claude", model: "haiku" }] },
      },
      undefined,
    );

    store.patch({ metadataGeneration: { providers: [] } });

    const persisted = loadPersistedConfig(paseoHome);
    expect(persisted.agents?.metadataGeneration).toEqual({ providers: [] });
  });

  test("patch persists generated title settings into config.json", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);

    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
        providers: {},
        metadataGeneration: { providers: [] },
        autoArchiveAfterMerge: false,
        appendSystemPrompt: "",
      },
      undefined,
    );

    store.patch({
      metadataGeneration: {
        agentTitle: {
          enabled: true,
          provider: "claude",
          model: "claude-haiku",
          thinkingOptionId: "low",
        },
      },
    });

    const persisted = loadPersistedConfig(paseoHome);
    expect(persisted.agents?.metadataGeneration).toEqual({
      providers: [],
      agentTitle: {
        enabled: true,
        provider: "claude",
        model: "claude-haiku",
        thinkingOptionId: "low",
      },
    });
  });

  test("patch replaces generated title settings when returning to automatic", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);

    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
        providers: {},
        metadataGeneration: {
          providers: [],
          agentTitle: {
            enabled: true,
            provider: "claude",
            model: "claude-haiku",
          },
        },
        autoArchiveAfterMerge: false,
        appendSystemPrompt: "",
      },
      undefined,
    );

    store.patch({ metadataGeneration: { agentTitle: { enabled: true } } });

    expect(store.get().metadataGeneration.agentTitle).toEqual({ enabled: true });
    const persisted = loadPersistedConfig(paseoHome);
    expect(persisted.agents?.metadataGeneration).toEqual({
      providers: [],
      agentTitle: { enabled: true },
    });
  });

  test("patch persists custom ACP provider overrides into config.json", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);

    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
        providers: {},
        autoArchiveAfterMerge: false,
        appendSystemPrompt: "",
        metadataGeneration: { providers: [] },
      },
      undefined,
    );

    store.patch({
      providers: {
        "paseo-e2e-acp": {
          extends: "acp",
          label: "Paseo E2E ACP",
          description: "E2E ACP provider fixture",
          command: ["npx", "-y", "--version"],
          env: {},
        },
      },
    });

    const persisted = loadPersistedConfig(paseoHome);
    expect(persisted.agents?.providers?.["paseo-e2e-acp"]).toEqual({
      extends: "acp",
      label: "Paseo E2E ACP",
      description: "E2E ACP provider fixture",
      command: ["npx", "-y", "--version"],
      env: {},
    });
  });

  test("patch removeProviders deletes custom provider overrides from config.json", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);

    const configPath = path.join(paseoHome, "config.json");
    writeFileSync(
      configPath,
      `${JSON.stringify(
        {
          version: 1,
          agents: {
            providers: {
              "paseo-e2e-acp": {
                extends: "acp",
                label: "Paseo E2E ACP",
                command: ["npx", "-y", "--version"],
              },
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
        providers: {
          "paseo-e2e-acp": {
            extends: "acp",
            label: "Paseo E2E ACP",
            command: ["npx", "-y", "--version"],
          },
        },
        metadataGeneration: { providers: [] },
        autoArchiveAfterMerge: false,
        appendSystemPrompt: "",
      },
      undefined,
    );

    store.patch({ removeProviders: ["paseo-e2e-acp"] });

    expect(store.get().providers["paseo-e2e-acp"]).toEqual({ removed: true });
    const persisted = loadPersistedConfig(paseoHome);
    expect(persisted.agents?.providers?.["paseo-e2e-acp"]).toBeUndefined();
  });
});

test("patch persists daemon display name into config.json", () => {
  const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
  topLevelTempDirs.push(paseoHome);

  const store = new DaemonConfigStore(
    paseoHome,
    {
      mcp: { injectIntoAgents: false },
      providers: {},
      metadataGeneration: { providers: [] },
      agentFormPreferences: {},
      autoArchiveAfterMerge: false,
      appendSystemPrompt: "",
      displayName: "",
    },
    undefined,
  );

  store.patch({ displayName: "Studio Mac" });

  const persisted = loadPersistedConfig(paseoHome);
  expect(persisted.daemon?.displayName).toBe("Studio Mac");
});

test("patch persists agent form preferences into config.json", () => {
  const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
  topLevelTempDirs.push(paseoHome);

  const store = new DaemonConfigStore(
    paseoHome,
    {
      mcp: { injectIntoAgents: false },
      providers: {},
      metadataGeneration: { providers: [] },
      agentFormPreferences: {},
      autoArchiveAfterMerge: false,
      appendSystemPrompt: "",
      displayName: "",
    },
    undefined,
  );

  store.patch({
    agentFormPreferences: {
      provider: "codex",
      providerPreferences: {
        codex: {
          model: "gpt-5.4-mini",
          mode: "auto",
          thinkingByModel: { "gpt-5.4-mini": "low" },
          featureValues: { webSearch: true },
        },
      },
      favoriteModels: [{ provider: "codex", modelId: "gpt-5.4-mini" }],
    },
  });

  const persisted = loadPersistedConfig(paseoHome);
  expect(persisted.agents?.formPreferences).toEqual({
    provider: "codex",
    providerPreferences: {
      codex: {
        model: "gpt-5.4-mini",
        mode: "auto",
        thinkingByModel: { "gpt-5.4-mini": "low" },
        featureValues: { webSearch: true },
      },
    },
    favoriteModels: [{ provider: "codex", modelId: "gpt-5.4-mini" }],
  });
});
