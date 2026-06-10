import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  autoUpdateInstalledSkills,
  getSkillsStatus,
  installSkills,
  PASEO_SKILL_NAMES,
  resolveBundledSkillsSourceSync,
  type SkillTargets,
  uninstallSkills,
  updateSkills,
} from "./operations.js";

interface Sandbox {
  root: string;
  targets: SkillTargets;
}

async function makeSandbox(): Promise<Sandbox> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "paseo-skills-"));
  const targets: SkillTargets = {
    sourceDir: path.join(root, "bundle"),
    agentsDir: path.join(root, "home", ".agents", "skills"),
    claudeDir: path.join(root, "home", ".claude", "skills"),
    codexDir: path.join(root, "home", ".codex", "skills"),
  };
  await fs.mkdir(targets.sourceDir, { recursive: true });
  return { root, targets };
}

async function writeFiles(rootDir: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(rootDir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
}

async function writeBundleSkill(
  sourceDir: string,
  name: string,
  files: Record<string, string>,
): Promise<void> {
  await writeFiles(path.join(sourceDir, name), files);
}

async function writeOnDiskSkill(
  targetDir: string,
  name: string,
  files: Record<string, string>,
): Promise<void> {
  await writeFiles(path.join(targetDir, name), files);
}

async function writeOnDiskSkillToAllTargets(
  targets: SkillTargets,
  name: string,
  files: Record<string, string>,
): Promise<void> {
  await Promise.all([
    writeOnDiskSkill(targets.agentsDir, name, files),
    writeOnDiskSkill(targets.claudeDir, name, files),
    writeOnDiskSkill(targets.codexDir, name, files),
  ]);
}

async function writeCurrentBundle(sourceDir: string): Promise<void> {
  await writeBundleSkill(sourceDir, "paseo", { "SKILL.md": "paseo-v1" });
  await writeBundleSkill(sourceDir, "paseo-loop", { "SKILL.md": "loop-v1" });
}

async function pathExists(p: string): Promise<boolean> {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}

describe("resolveBundledSkillsSourceSync", () => {
  it("resolves skills bundled with the compiled server package", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paseo-skills-resolver-"));
    try {
      const moduleDir = path.join(
        root,
        "node_modules",
        "@bytetrue",
        "server",
        "dist",
        "server",
        "server",
        "integrations",
        "skills",
      );
      const bundledSkillsDir = path.join(
        root,
        "node_modules",
        "@bytetrue",
        "server",
        "dist",
        "server",
        "skills",
      );
      await fs.mkdir(moduleDir, { recursive: true });
      await fs.mkdir(bundledSkillsDir, { recursive: true });

      expect(resolveBundledSkillsSourceSync({}, { moduleDir })).toEqual({
        available: true,
        sourceDir: bundledSkillsDir,
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("shared skills operations", () => {
  let sandbox: Sandbox;

  beforeEach(async () => {
    sandbox = await makeSandbox();
  });

  afterEach(async () => {
    await fs.rm(sandbox.root, { recursive: true, force: true });
  });

  it("reports not-installed with add ops when the bundle exists but nothing is installed", async () => {
    await writeCurrentBundle(sandbox.targets.sourceDir);

    await expect(getSkillsStatus(sandbox.targets)).resolves.toEqual({
      state: "not-installed",
      ops: [
        { kind: "add", name: "paseo" },
        { kind: "add", name: "paseo-loop" },
      ],
    });
  });

  it("installs the bundle into all managed targets", async () => {
    await writeCurrentBundle(sandbox.targets.sourceDir);
    await writeOnDiskSkill(sandbox.targets.agentsDir, "unslop", { "SKILL.md": "user-unslop" });

    const status = await installSkills(sandbox.targets);

    expect(status).toEqual({ state: "up-to-date", ops: [] });
    expect(
      await fs.readFile(path.join(sandbox.targets.agentsDir, "paseo", "SKILL.md"), "utf-8"),
    ).toBe("paseo-v1");
    expect(
      await fs.readFile(path.join(sandbox.targets.codexDir, "paseo-loop", "SKILL.md"), "utf-8"),
    ).toBe("loop-v1");
    expect(
      await fs.readFile(path.join(sandbox.targets.agentsDir, "unslop", "SKILL.md"), "utf-8"),
    ).toBe("user-unslop");
  });

  it("updates drifted managed skills without removing user-added files", async () => {
    await writeCurrentBundle(sandbox.targets.sourceDir);
    await writeOnDiskSkill(sandbox.targets.agentsDir, "paseo", {
      "SKILL.md": "stale",
      "hooks/guard.sh": "user guard",
    });

    const status = await updateSkills(sandbox.targets);

    expect(status).toEqual({ state: "up-to-date", ops: [] });
    expect(
      await fs.readFile(path.join(sandbox.targets.agentsDir, "paseo", "SKILL.md"), "utf-8"),
    ).toBe("paseo-v1");
    expect(
      await fs.readFile(
        path.join(sandbox.targets.agentsDir, "paseo", "hooks", "guard.sh"),
        "utf-8",
      ),
    ).toBe("user guard");
  });

  it("auto-updates only when installed skills are drifted", async () => {
    await writeCurrentBundle(sandbox.targets.sourceDir);

    await expect(autoUpdateInstalledSkills(sandbox.targets)).resolves.toEqual({
      state: "not-installed",
      ops: [
        { kind: "add", name: "paseo" },
        { kind: "add", name: "paseo-loop" },
      ],
    });

    await writeOnDiskSkillToAllTargets(sandbox.targets, "paseo", { "SKILL.md": "stale" });
    await writeOnDiskSkillToAllTargets(sandbox.targets, "paseo-loop", { "SKILL.md": "loop-v1" });

    await expect(autoUpdateInstalledSkills(sandbox.targets)).resolves.toEqual({
      state: "up-to-date",
      ops: [],
    });
  });

  it("uninstalls only managed skills and keeps unrelated user skills", async () => {
    await writeCurrentBundle(sandbox.targets.sourceDir);
    await installSkills(sandbox.targets);
    await writeOnDiskSkill(sandbox.targets.agentsDir, "unslop", { "SKILL.md": "user-unslop" });

    const status = await uninstallSkills(sandbox.targets);

    expect(status.state).toBe("not-installed");
    for (const name of PASEO_SKILL_NAMES) {
      expect(await pathExists(path.join(sandbox.targets.agentsDir, name))).toBe(false);
      expect(await pathExists(path.join(sandbox.targets.claudeDir, name))).toBe(false);
      expect(await pathExists(path.join(sandbox.targets.codexDir, name))).toBe(false);
    }
    expect(
      await fs.readFile(path.join(sandbox.targets.agentsDir, "unslop", "SKILL.md"), "utf-8"),
    ).toBe("user-unslop");
  });
});
