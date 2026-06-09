import type { ChildProcess, SpawnOptions } from "node:child_process";
import { spawn as nodeSpawn } from "node:child_process";
import { existsSync as nodeExistsSync } from "node:fs";
import { posix, win32 } from "node:path";
import { z } from "zod";

type LocalOpenTargetKind = "editor" | "file-manager";
type LocalOpenTargetMode = "open" | "reveal";

interface LocalOpenTargetDefinition {
  id: string;
  label: string;
  kind: LocalOpenTargetKind;
  command: string;
  platforms?: readonly NodeJS.Platform[];
  excludedPlatforms?: readonly NodeJS.Platform[];
}

export interface LocalOpenTargetDescriptor {
  id: string;
  label: string;
  kind: LocalOpenTargetKind;
}

export interface OpenLocalTargetInput {
  editorId: string;
  path: string;
  cwd?: string;
  mode?: LocalOpenTargetMode;
}

interface ListLocalOpenTargetsDependencies {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  existsSync?: (path: string) => boolean;
  targetDefinitions?: readonly LocalOpenTargetDefinition[];
}

interface SpawnedProcess {
  once(event: "error", handler: (error: Error) => void): SpawnedProcess;
  once(event: "spawn", handler: () => void): SpawnedProcess;
  unref(): void;
}

interface OpenLocalTargetDependencies extends ListLocalOpenTargetsDependencies {
  spawn?: (command: string, args: string[], options: SpawnOptions) => SpawnedProcess;
}

interface Launch {
  command: string;
  args: string[];
}

interface SpawnLaunch extends Launch {
  shell: boolean;
}

const RUNTIME_CONTROL_ENV_KEYS = [
  "PASEO_NODE_ENV",
  "PASEO_DESKTOP_MANAGED",
  "PASEO_SUPERVISED",
  "ELECTRON_RUN_AS_NODE",
  "ELECTRON_NO_ATTACH_CONSOLE",
] as const;

const BUILT_IN_LOCAL_OPEN_TARGETS: readonly LocalOpenTargetDefinition[] = [
  { id: "cursor", label: "Cursor", kind: "editor", command: "cursor" },
  { id: "vscode", label: "VS Code", kind: "editor", command: "code" },
  { id: "webstorm", label: "WebStorm", kind: "editor", command: "webstorm" },
  { id: "zed", label: "Zed", kind: "editor", command: "zed" },
  {
    id: "finder",
    label: "Finder",
    kind: "file-manager",
    command: "open",
    platforms: ["darwin"],
  },
  {
    id: "explorer",
    label: "Explorer",
    kind: "file-manager",
    command: "explorer",
    platforms: ["win32"],
  },
  {
    id: "file-manager",
    label: "File Manager",
    kind: "file-manager",
    command: "xdg-open",
    excludedPlatforms: ["darwin", "win32"],
  },
];

const OpenLocalTargetInputSchema = z.object({
  editorId: z.string().trim().min(1),
  path: z.string().trim().min(1),
  cwd: z.string().trim().min(1).optional(),
  mode: z.enum(["open", "reveal"]).optional(),
});

function isTargetSupportedOnPlatform(
  target: LocalOpenTargetDefinition,
  platform: NodeJS.Platform,
): boolean {
  if (target.platforms && !target.platforms.includes(platform)) {
    return false;
  }
  if (target.excludedPlatforms?.includes(platform)) {
    return false;
  }
  return true;
}

function createExternalProcessEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...baseEnv };
  for (const key of RUNTIME_CONTROL_ENV_KEYS) {
    delete env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete env[key];
    }
  }
  return env;
}

function resolveExecutable(
  command: string,
  input: {
    env: NodeJS.ProcessEnv;
    existsSync: (path: string) => boolean;
    platform: NodeJS.Platform;
  },
): string | null {
  if (isAbsolutePath(command, input.platform) && input.existsSync(command)) {
    return command;
  }
  const pathValue = input.env.PATH ?? input.env.Path ?? input.env.path ?? "";
  const pathDelimiter = input.platform === "win32" ? ";" : ":";
  for (const directory of pathValue.split(pathDelimiter)) {
    if (!directory) {
      continue;
    }
    const candidate = `${directory}/${command}`;
    if (input.existsSync(candidate)) {
      return candidate;
    }
    if (input.platform === "win32") {
      for (const extension of [".exe", ".cmd"]) {
        const windowsCandidate = `${candidate}${extension}`;
        if (input.existsSync(windowsCandidate)) {
          return windowsCandidate;
        }
      }
    }
  }
  return null;
}

function resolveTargetDefinitions(
  dependencies: ListLocalOpenTargetsDependencies,
): readonly LocalOpenTargetDefinition[] {
  return dependencies.targetDefinitions ?? BUILT_IN_LOCAL_OPEN_TARGETS;
}

function findTarget(
  targetId: string,
  targetDefinitions: readonly LocalOpenTargetDefinition[],
): LocalOpenTargetDefinition {
  const target = targetDefinitions.find((entry) => entry.id === targetId);
  if (!target) {
    throw new Error(`Unknown open target: ${targetId}`);
  }
  return target;
}

function isAbsolutePath(value: string, platform: NodeJS.Platform): boolean {
  return platform === "win32" ? win32.isAbsolute(value) : posix.isAbsolute(value);
}

function dirnameForPlatform(value: string, platform: NodeJS.Platform): string {
  return platform === "win32" ? win32.dirname(value) : posix.dirname(value);
}

function isWindowsCommandScript(executable: string, platform: NodeJS.Platform): boolean {
  if (platform !== "win32") {
    return false;
  }
  const extension = win32.extname(executable).toLowerCase();
  return extension === ".cmd" || extension === ".bat";
}

function escapeWindowsCmdValue(value: string): string {
  const isQuoted = value.startsWith('"') && value.endsWith('"');
  const unquoted = isQuoted ? value.slice(1, -1) : value;

  if (isQuoted || /[\s"&|^<>()!]/u.test(unquoted)) {
    const quoted = unquoted
      .replace(/(\\*)"/g, (_match, slashes: string) => `${slashes}${slashes}\\"`)
      .replace(/\\+$/u, (slashes) => `${slashes}${slashes}`);
    return `"${quoted}"`;
  }

  return unquoted;
}

function createSpawnLaunch(launch: Launch, platform: NodeJS.Platform): SpawnLaunch {
  if (!isWindowsCommandScript(launch.command, platform)) {
    return { ...launch, shell: false };
  }

  return {
    command: escapeWindowsCmdValue(launch.command),
    args: launch.args.map(escapeWindowsCmdValue),
    shell: true,
  };
}

function buildLaunch(input: {
  target: LocalOpenTargetDefinition;
  path: string;
  cwd?: string;
  mode: LocalOpenTargetMode;
  platform: NodeJS.Platform;
  executable: string;
}): Launch {
  if (input.mode === "reveal") {
    if (input.target.id === "finder" && input.platform === "darwin") {
      return { command: input.executable, args: ["-R", input.path] };
    }
    if (input.target.id === "explorer" && input.platform === "win32") {
      return { command: input.executable, args: ["/select,", input.path] };
    }
    if (input.target.id === "file-manager") {
      return { command: input.executable, args: [dirnameForPlatform(input.path, input.platform)] };
    }
  }

  if (input.target.kind === "editor" && input.cwd && input.cwd !== input.path) {
    return { command: input.executable, args: [input.cwd, input.path] };
  }
  return { command: input.executable, args: [input.path] };
}

function spawnDetachedProcess(
  command: string,
  args: string[],
  options: SpawnOptions,
): SpawnedProcess {
  return nodeSpawn(command, args, options) as ChildProcess as SpawnedProcess;
}

export function listAvailableLocalOpenTargets(
  dependencies: ListLocalOpenTargetsDependencies = {},
): LocalOpenTargetDescriptor[] {
  const platform = dependencies.platform ?? process.platform;
  const existsSync = dependencies.existsSync ?? nodeExistsSync;
  const env = dependencies.env ?? process.env;

  const targetDefinitions = resolveTargetDefinitions(dependencies);

  return targetDefinitions
    .filter((target) => isTargetSupportedOnPlatform(target, platform))
    .filter((target) => resolveExecutable(target.command, { platform, env, existsSync }))
    .map((target) => ({ id: target.id, label: target.label, kind: target.kind }));
}

export async function openLocalTarget(
  input: OpenLocalTargetInput,
  dependencies: OpenLocalTargetDependencies = {},
): Promise<void> {
  const parsedInput = OpenLocalTargetInputSchema.parse(input);
  const platform = dependencies.platform ?? process.platform;
  const existsSync = dependencies.existsSync ?? nodeExistsSync;
  const env = dependencies.env ?? process.env;
  const spawn = dependencies.spawn ?? spawnDetachedProcess;
  const pathToOpen = parsedInput.path;

  if (!isAbsolutePath(pathToOpen, platform)) {
    throw new Error("Open target path must be an absolute local path");
  }
  if (!existsSync(pathToOpen)) {
    throw new Error(`Path does not exist: ${pathToOpen}`);
  }

  const target = findTarget(parsedInput.editorId, resolveTargetDefinitions(dependencies));
  if (!isTargetSupportedOnPlatform(target, platform)) {
    throw new Error(`Open target unavailable: ${target.label}`);
  }

  const executable = resolveExecutable(target.command, { platform, env, existsSync });
  if (!executable) {
    throw new Error(`Open target unavailable: ${target.label}`);
  }

  const workspaceCwd =
    parsedInput.cwd &&
    isAbsolutePath(parsedInput.cwd, platform) &&
    parsedInput.cwd !== pathToOpen &&
    existsSync(parsedInput.cwd)
      ? parsedInput.cwd
      : undefined;
  const launch = buildLaunch({
    target,
    path: pathToOpen,
    cwd: workspaceCwd,
    mode: parsedInput.mode ?? "open",
    platform,
    executable,
  });
  const spawnLaunch = createSpawnLaunch(launch, platform);

  await new Promise<void>((resolve, reject) => {
    let child: SpawnedProcess;
    try {
      child = spawn(spawnLaunch.command, spawnLaunch.args, {
        detached: true,
        env: createExternalProcessEnv(env),
        shell: spawnLaunch.shell,
        stdio: "ignore",
      });
    } catch (error) {
      reject(error);
      return;
    }

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
