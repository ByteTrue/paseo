import { describe, expect, it } from "vitest";
import { workspaceFileQueryKey, workspaceFileQueryPrefix } from "./file-preview-query";

describe("workspace file preview query keys", () => {
  it("keeps the file preview key under the server prefix", () => {
    expect(
      workspaceFileQueryKey({
        serverId: "srv_local",
        cwd: "/repo",
        path: "src/app.ts",
      }),
    ).toEqual(["workspaceFile", "srv_local", "/repo", "src/app.ts"]);
    expect(workspaceFileQueryPrefix({ serverId: "srv_local" })).toEqual([
      "workspaceFile",
      "srv_local",
    ]);
  });
});
