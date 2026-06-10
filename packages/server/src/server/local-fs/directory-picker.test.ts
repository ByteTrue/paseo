import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { listLocalDirectory, listLocalDirectoryRoots } from "./directory-picker.js";

interface DirentLike {
  name: string;
  isDirectory(): boolean;
}

function dirent(name: string, directory: boolean): DirentLike {
  return { name, isDirectory: () => directory };
}

describe("local directory picker", () => {
  it("returns roots including home and current working directory", () => {
    const homePath = resolve("/Users/me");
    const cwdPath = resolve("/Users/me/project");
    const rootPath = resolve("/");

    expect(
      listLocalDirectoryRoots({
        homeDir: () => "/Users/me",
        cwd: () => "/Users/me/project",
        existsSync: () => true,
        platform: "darwin",
      }),
    ).toEqual([
      { id: "home", label: "Home", path: homePath, kind: "home" },
      { id: "cwd", label: "Current Directory", path: cwdPath, kind: "workspace" },
      { id: "root", label: "Root", path: rootPath, kind: "volume" },
    ]);
  });

  it("lists child directories with parent path and hidden flags", async () => {
    const inputPath = process.platform === "win32" ? "D:\\Users\\me" : "/Users/me";
    const normalizedPath = resolve(inputPath);
    await expect(
      listLocalDirectory(inputPath, {
        stat: async () => ({ isDirectory: () => true }),
        readdir: async () => [
          dirent("project", true),
          dirent("notes.txt", false),
          dirent(".config", true),
        ],
      }),
    ).resolves.toEqual({
      path: normalizedPath,
      parentPath: dirname(normalizedPath),
      entries: [
        {
          name: "project",
          path: join(normalizedPath, "project"),
          kind: "directory",
          hidden: false,
        },
        { name: ".config", path: join(normalizedPath, ".config"), kind: "directory", hidden: true },
      ],
    });
  });

  it("rejects non-directory paths", async () => {
    const inputPath =
      process.platform === "win32" ? "D:\\Users\\me\\file.txt" : "/Users/me/file.txt";
    const normalizedPath = resolve(inputPath);
    await expect(
      listLocalDirectory(inputPath, {
        stat: async () => ({ isDirectory: () => false }),
        readdir: async () => [],
      }),
    ).rejects.toThrow(`Path is not a directory: ${normalizedPath}`);
  });
});
