import { z } from "zod";
import type { FirstAgentContext } from "@bytetrue/protocol/messages";
import type { AgentManager } from "./agent/agent-manager.js";
import {
  StructuredAgentFallbackError,
  StructuredAgentResponseError,
  generateStructuredAgentResponseWithFallback,
} from "./agent/agent-response-loop.js";
import {
  resolveStructuredGenerationProviders,
  type StructuredGenerationDaemonConfig,
} from "./agent/structured-generation-providers.js";
import { buildAgentBranchNameSeed } from "./agent/prompt-attachments.js";
import { buildMetadataPrompt } from "../utils/build-metadata-prompt.js";
import type { WorkspaceGitService } from "./workspace-git-service.js";
import type { ProviderSnapshotManager } from "./agent/provider-snapshot-manager.js";

interface BranchNameGeneratorLogger {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

export interface GenerateBranchNameFromFirstAgentContextOptions {
  agentManager: AgentManager;
  cwd: string;
  workspaceGitService?: Pick<WorkspaceGitService, "resolveRepoRoot">;
  providerSnapshotManager?: Pick<ProviderSnapshotManager, "listProviders">;
  daemonConfig?: StructuredGenerationDaemonConfig | null;
  currentSelection?: {
    provider?: string | null;
    model?: string | null;
    thinkingOptionId?: string | null;
  };
  firstAgentContext: FirstAgentContext | undefined;
  logger: BranchNameGeneratorLogger;
  deps?: {
    generateStructuredAgentResponseWithFallback?: typeof generateStructuredAgentResponseWithFallback;
  };
}

const BranchNameSchema = z.object({
  branch: z.string().min(1).max(100),
});

async function buildPrompt(
  seed: string,
  options: {
    cwd: string;
    workspaceGitService?: Pick<WorkspaceGitService, "resolveRepoRoot">;
  },
): Promise<string> {
  return buildMetadataPrompt({
    cwd: options.cwd,
    workspaceGitService: options.workspaceGitService,
    configKey: "branchName",
    before: [
      "Generate a git branch name for a coding agent based on the user prompt and attachments.",
      "Branch: concise lowercase slug using letters, numbers, hyphens, and slashes only.",
      "No spaces, no uppercase, no leading or trailing hyphen, no consecutive hyphens.",
    ].join("\n"),
    after: "Return JSON only with a single field 'branch'.",
    trailing: `User context:\n${seed}`,
  });
}

export async function generateBranchNameFromFirstAgentContext(
  options: GenerateBranchNameFromFirstAgentContextOptions,
): Promise<string | null> {
  const seed = buildAgentBranchNameSeed(options.firstAgentContext);
  if (!seed) {
    return null;
  }

  const generator =
    options.deps?.generateStructuredAgentResponseWithFallback ??
    generateStructuredAgentResponseWithFallback;

  const preferredProviders = buildPreferredProviders(options.daemonConfig, "branchName");

  try {
    const providers = options.providerSnapshotManager
      ? await resolveStructuredGenerationProviders({
          cwd: options.cwd,
          providerSnapshotManager: options.providerSnapshotManager,
          daemonConfig: options.daemonConfig,
          currentSelection: options.currentSelection,
          ...(preferredProviders.length > 0 ? { preferredProviders } : {}),
        })
      : [];
    const result = await generator({
      manager: options.agentManager,
      cwd: options.cwd,
      prompt: await buildPrompt(seed, {
        cwd: options.cwd,
        workspaceGitService: options.workspaceGitService,
      }),
      schema: BranchNameSchema,
      schemaName: "BranchName",
      maxRetries: 2,
      providers,
      persistSession: false,
      logger: options.logger,
      agentConfigOverrides: {
        title: "Branch name generator",
        internal: true,
      },
    });
    return result.branch.trim() || null;
  } catch (error) {
    const attempts = error instanceof StructuredAgentFallbackError ? error.attempts : undefined;
    options.logger.error(
      { err: error, attempts },
      error instanceof StructuredAgentResponseError || error instanceof StructuredAgentFallbackError
        ? "Structured branch name generation failed"
        : "Branch name generation failed",
    );
    return null;
  }
}

function buildPreferredProviders(
  daemonConfig: GenerateBranchNameFromFirstAgentContextOptions["daemonConfig"],
  key: "branchName" | "commitMessage" | "pullRequest" | "agentTitle",
): { provider: string; model?: string; thinkingOptionId?: string }[] {
  const config = daemonConfig?.metadataGeneration?.[key];
  if (!config || config.enabled === false) {
    return [];
  }
  if (!config.provider) {
    return [];
  }
  return [
    {
      provider: config.provider,
      ...(config.model ? { model: config.model } : {}),
      ...(config.thinkingOptionId ? { thinkingOptionId: config.thinkingOptionId } : {}),
    },
  ];
}
