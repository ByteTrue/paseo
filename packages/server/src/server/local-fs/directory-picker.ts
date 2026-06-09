import { readdir as nodeReaddir, stat as nodeStat } from "node:fs/promises";
import { existsSync as nodeExistsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";

export interface LocalDirectoryRoot {
  id: string;
  label: string;
  path: string;
  kind: "home" | "workspace" | "volume";
}

export interface LocalDirectoryEntry {
  name: string;
  path: string;
  kind: "directory";
  hidden: boolean;
}

export interface LocalDirectoryListing {
  path: string;
  parentPath: string | null;
  entries: LocalDirectoryEntry[];
}

interface DirentLike {
  name: string;
  isDirectory(): boolean;
}

interface StatLike {
  isDirectory(): boolean;
}

interface LocalDirectoryRootDependencies {
  homeDir?: () => string;
  cwd?: () => string;
  existsSync?: (path: string) => boolean;
  platform?: NodeJS.Platform;
}

interface LocalDirectoryListDependencies {
  stat?: (path: string) => Promise<StatLike>;
  readdir?: (path: string, options: { withFileTypes: true }) => Promise<DirentLike[]>;
}

function normalizeAbsolutePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new Error("Directory path is required");
  }
  const expanded =
    trimmed === "~" || trimmed.startsWith("~/") ? join(homedir(), trimmed.slice(2)) : trimmed;
  if (!isAbsolute(expanded)) {
    throw new Error("Directory path must be an absolute local path");
  }
  return resolve(expanded);
}

function pushRoot(
  roots: LocalDirectoryRoot[],
  seen: Set<string>,
  root: LocalDirectoryRoot,
  existsSync: (path: string) => boolean,
): void {
  const normalized = normalizeAbsolutePath(root.path);
  if (seen.has(normalized) || !existsSync(normalized)) {
    return;
  }
  seen.add(normalized);
  roots.push({ ...root, path: normalized });
}

export function listLocalDirectoryRoots(
  dependencies: LocalDirectoryRootDependencies = {},
): LocalDirectoryRoot[] {
  const homeDir = dependencies.homeDir ?? homedir;
  const cwd = dependencies.cwd ?? process.cwd;
  const existsSync = dependencies.existsSync ?? nodeExistsSync;
  const platform = dependencies.platform ?? process.platform;
  const roots: LocalDirectoryRoot[] = [];
  const seen = new Set<string>();

  pushRoot(roots, seen, { id: "home", label: "Home", path: homeDir(), kind: "home" }, existsSync);
  pushRoot(
    roots,
    seen,
    { id: "cwd", label: "Current Directory", path: cwd(), kind: "workspace" },
    existsSync,
  );

  if (platform === "win32") {
    for (const drive of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const path = `${drive}:\\`;
      if (existsSync(path)) {
        pushRoot(
          roots,
          seen,
          { id: `drive-${drive.toLowerCase()}`, label: `${drive}:`, path, kind: "volume" },
          existsSync,
        );
      }
    }
  } else {
    pushRoot(
      roots,
      seen,
      { id: "root", label: "Root", path: parse(homeDir()).root, kind: "volume" },
      existsSync,
    );
  }

  return roots;
}

export async function listLocalDirectory(
  path: string,
  dependencies: LocalDirectoryListDependencies = {},
): Promise<LocalDirectoryListing> {
  const normalizedPath = normalizeAbsolutePath(path);
  const stat = dependencies.stat ?? nodeStat;
  const readdir = dependencies.readdir ?? nodeReaddir;
  const pathStat = await stat(normalizedPath);
  if (!pathStat.isDirectory()) {
    throw new Error(`Path is not a directory: ${normalizedPath}`);
  }

  const dirents = await readdir(normalizedPath, { withFileTypes: true });
  const entries = dirents
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: join(normalizedPath, entry.name),
      kind: "directory" as const,
      hidden: entry.name.startsWith("."),
    }))
    .sort((left, right) => {
      if (left.hidden !== right.hidden) {
        return left.hidden ? 1 : -1;
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
  const parentPath = dirname(normalizedPath);

  return {
    path: normalizedPath,
    parentPath: parentPath === normalizedPath ? null : parentPath,
    entries,
  };
}
