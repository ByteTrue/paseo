import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { createTestLogger } from "../../test-utils/test-logger.js";
import type { AgentCapabilityFlags, AgentClient } from "./agent-sdk-types.js";
import { AgentManager } from "./agent-manager.js";
import { AgentStorage } from "./agent-storage.js";

const TEST_CAPABILITIES: AgentCapabilityFlags = {
  supportsStreaming: false,
  supportsSessionPersistence: true,
  supportsDynamicModes: false,
  supportsMcpServers: false,
  supportsReasoningStream: false,
  supportsToolInvocations: true,
  supportsRewindConversation: false,
  supportsRewindFiles: false,
  supportsRewindBoth: false,
};

const tempDirs: string[] = [];
const logger = createTestLogger();

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function createThrowingClient(provider: string): AgentClient {
  return {
    provider,
    capabilities: TEST_CAPABILITIES,
    createSession: async () => {
      throw new Error("createSession should not be called");
    },
    resumeSession: async () => {
      throw new Error("resumeSession should not be called");
    },
    listModels: async () => [],
    isAvailable: async () => true,
  };
}

describe("AgentManager provider registry replacement", () => {
  test("removes providers absent from the replacement state", async () => {
    const workdir = mkdtempSync(join(tmpdir(), "agent-manager-registry-test-"));
    tempDirs.push(workdir);
    const storage = new AgentStorage(join(workdir, "agents"), logger);
    const provider = "zai-claude";
    const manager = new AgentManager({
      clients: {
        [provider]: createThrowingClient(provider),
      },
      providerDefinitions: {
        [provider]: { enabled: true, derivedFromProviderId: "claude" },
      },
      registry: storage,
      logger,
    });

    expect(manager.getRegisteredProviderIds()).toContain(provider);

    manager.updateProviderRegistry({
      providerDefinitions: {},
      clients: {},
    });

    expect(manager.getRegisteredProviderIds()).not.toContain(provider);
    await expect(manager.createAgent({ provider, cwd: workdir })).rejects.toThrow(
      `Unknown provider '${provider}'`,
    );
  });
});
