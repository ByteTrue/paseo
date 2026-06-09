import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { listFilesRecursive, removeSkill, syncSkills } from "./sync.js";

export type SkillsState = "not-installed" | "up-to-date" | "drift";

export type SkillOp =
  | { kind: "add"; name: string }
  | { kind: "update"; name: string }
  | { kind: "delete"; name: string };

export interface SkillsStatus {
  state: SkillsState;
  ops: SkillOp[];
}

export interface SkillTargets {
  sourceDir: string;
  agentsDir: string;
  claudeDir: string;
  codexDir: string;
}

export interface SkillsSourceResolution {
  available: boolean;
  sourceDir: string | null;
}

export const PASEO_SKILL_NAMES = [
  "paseo",
  "paseo-advisor",
  "paseo-chat",
  "paseo-committee",
  "paseo-epic",
  "paseo-handoff",
  "paseo-loop",
  "paseo-orchestrate",
  "paseo-orchestrator",
] as const;

type SkillFiles = Map<string, string>;
type TargetSkills = Map<string, SkillFiles>;

function getManagedSkillsDir(root: string): string {
  return path.join(root, "skills");
}

export function getAgentsSkillsDir(): string {
  return getManagedSkillsDir(path.join(os.homedir(), ".agents"));
}

export function getClaudeSkillsDir(): string {
  return getManagedSkillsDir(path.join(os.homedir(), ".claude"));
}

export function getCodexSkillsDir(): string {
  return getManagedSkillsDir(path.join(os.homedir(), ".codex"));
}

export function getDefaultSkillTargets(sourceDir: string): SkillTargets {
  return {
    sourceDir,
    agentsDir: getAgentsSkillsDir(),
    claudeDir: getClaudeSkillsDir(),
    codexDir: getCodexSkillsDir(),
  };
}

export function resolveBundledSkillsSourceSync(
  env: NodeJS.ProcessEnv = process.env,
): SkillsSourceResolution {
  const explicitDir = env.PASEO_SKILLS_SOURCE_DIR?.trim();
  const candidates = [
    explicitDir || null,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../skills"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../../skills"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../skills"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return { available: true, sourceDir: candidate };
    }
  }

  return { available: false, sourceDir: explicitDir ?? null };
}

export async function resolveBundledSkillsSource(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SkillsSourceResolution> {
  const syncResolution = resolveBundledSkillsSourceSync(env);
  if (!syncResolution.available && syncResolution.sourceDir === null) {
    return syncResolution;
  }

  const stat = syncResolution.sourceDir
    ? await fs.stat(syncResolution.sourceDir).catch(() => null)
    : null;
  if (stat?.isDirectory()) {
    return { available: true, sourceDir: syncResolution.sourceDir };
  }
  return { available: false, sourceDir: syncResolution.sourceDir };
}

async function hashSkillDir(skillDir: string): Promise<SkillFiles | null> {
  const stat = await fs.stat(skillDir).catch(() => null);
  if (!stat?.isDirectory()) return null;

  const rels = await listFilesRecursive(skillDir);
  const files: SkillFiles = new Map();
  for (const rel of rels) {
    const buf = await fs.readFile(path.join(skillDir, rel));
    const sha = createHash("sha256").update(buf).digest("hex");
    files.set(toPosix(rel), sha);
  }
  return files;
}

async function hashSkills(rootDir: string): Promise<Map<string, SkillFiles>> {
  const out = new Map<string, SkillFiles>();
  for (const name of PASEO_SKILL_NAMES) {
    const files = await hashSkillDir(path.join(rootDir, name));
    if (files !== null) out.set(name, files);
  }
  return out;
}

function diff(bundle: TargetSkills, disks: readonly TargetSkills[]): SkillOp[] {
  const ops: SkillOp[] = [];
  for (const name of PASEO_SKILL_NAMES) {
    const bundledFiles = bundle.get(name);
    const targetFiles = disks.map((disk) => disk.get(name));
    const installedTargets = targetFiles.filter(
      (files): files is SkillFiles => files !== undefined,
    );
    if (bundledFiles) {
      const missingTargets = installedTargets.length < disks.length;
      const changedTargets = installedTargets.some(
        (files) => !bundleFilesMatch(bundledFiles, files),
      );
      if (missingTargets) ops.push({ kind: "add", name });
      else if (changedTargets) ops.push({ kind: "update", name });
    } else if (installedTargets.length > 0) {
      ops.push({ kind: "delete", name });
    }
  }
  ops.sort((a, b) => compareStrings(a.name, b.name));
  return ops;
}

function hasInstalledPaseoSkill(disks: readonly TargetSkills[]): boolean {
  return disks.some((disk) => disk.size > 0);
}

function bundleFilesMatch(bundle: SkillFiles, disk: SkillFiles): boolean {
  for (const [rel, sha] of bundle) {
    if (disk.get(rel) !== sha) return false;
  }
  return true;
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export async function getSkillsStatus(targets: SkillTargets): Promise<SkillsStatus> {
  const [bundle, agentsDisk, claudeDisk, codexDisk] = await Promise.all([
    hashSkills(targets.sourceDir),
    hashSkills(targets.agentsDir),
    hashSkills(targets.claudeDir),
    hashSkills(targets.codexDir),
  ]);
  const disks = [agentsDisk, claudeDisk, codexDisk];
  const ops = diff(bundle, disks);

  if (!hasInstalledPaseoSkill(disks)) return { state: "not-installed", ops };
  if (ops.length === 0) return { state: "up-to-date", ops };
  return { state: "drift", ops };
}

async function applySkills(
  targets: SkillTargets,
  initialStatus?: SkillsStatus,
): Promise<SkillsStatus> {
  const status = initialStatus ?? (await getSkillsStatus(targets));

  const writes = status.ops
    .filter((op) => op.kind === "add" || op.kind === "update")
    .map((op) => op.name);
  if (writes.length > 0) {
    await syncSkills({
      sourceDir: targets.sourceDir,
      agentsDir: targets.agentsDir,
      claudeDir: targets.claudeDir,
      codexDir: targets.codexDir,
      skillNames: writes,
    });
  }

  for (const op of status.ops) {
    if (op.kind !== "delete") continue;
    await removeSkill(op.name, {
      agentsDir: targets.agentsDir,
      claudeDir: targets.claudeDir,
      codexDir: targets.codexDir,
    });
  }

  return getSkillsStatus(targets);
}

export async function installSkills(targets: SkillTargets): Promise<SkillsStatus> {
  return applySkills(targets);
}

export async function updateSkills(targets: SkillTargets): Promise<SkillsStatus> {
  return applySkills(targets);
}

export async function autoUpdateInstalledSkills(targets: SkillTargets): Promise<SkillsStatus> {
  const status = await getSkillsStatus(targets);
  if (status.state !== "drift") return status;
  return applySkills(targets, status);
}

export async function uninstallSkills(targets: SkillTargets): Promise<SkillsStatus> {
  for (const name of PASEO_SKILL_NAMES) {
    await removeSkill(name, {
      agentsDir: targets.agentsDir,
      claudeDir: targets.claudeDir,
      codexDir: targets.codexDir,
    });
  }
  return getSkillsStatus(targets);
}
