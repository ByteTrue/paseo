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
    expect(
      listLocalDirectoryRoots({
        homeDir: () => "/Users/me",
        cwd: () => "/Users/me/project",
        existsSync: () => true,
      }),
    ).toEqual([
      { id: "home", label: "Home", path: "/Users/me", kind: "home" },
      { id: "cwd", label: "Current Directory", path: "/Users/me/project", kind: "workspace" },
      { id: "root", label: "Root", path: "/", kind: "volume" },
    ]);
  });

  it("lists child directories with parent path and hidden flags", async () => {
    await expect(
      listLocalDirectory("/Users/me", {
        stat: async () => ({ isDirectory: () => true }),
        readdir: async () => [
          dirent("project", true),
          dirent("notes.txt", false),
          dirent(".config", true),
        ],
      }),
    ).resolves.toEqual({
      path: "/Users/me",
      parentPath: "/Users",
      entries: [
        { name: "project", path: "/Users/me/project", kind: "directory", hidden: false },
        { name: ".config", path: "/Users/me/.config", kind: "directory", hidden: true },
      ],
    });
  });

  it("rejects non-directory paths", async () => {
    await expect(
      listLocalDirectory("/Users/me/file.txt", {
        stat: async () => ({ isDirectory: () => false }),
        readdir: async () => [],
      }),
    ).rejects.toThrow("Path is not a directory: /Users/me/file.txt");
  });
});
