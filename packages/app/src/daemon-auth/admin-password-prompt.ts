import type { DaemonClientAdminPasswordContext } from "@bytetrue/client/internal/daemon-client";

export type DaemonAdminPasswordPromptHandler = (
  context: DaemonClientAdminPasswordContext,
) => Promise<string | null | undefined>;

let promptHandler: DaemonAdminPasswordPromptHandler | null = null;

export function registerDaemonAdminPasswordPrompt(
  handler: DaemonAdminPasswordPromptHandler,
): () => void {
  promptHandler = handler;
  return () => {
    if (promptHandler === handler) {
      promptHandler = null;
    }
  };
}

export async function requestDaemonAdminPassword(
  context: DaemonClientAdminPasswordContext,
): Promise<string | null> {
  if (!promptHandler) {
    return null;
  }
  const password = await promptHandler(context);
  if (typeof password !== "string") {
    return null;
  }
  const trimmed = password.trim();
  return trimmed.length > 0 ? trimmed : null;
}
