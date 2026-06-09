import { expect, test } from "./fixtures";

function platformFileManagerTargetId(): string {
  if (process.platform === "darwin") return "finder";
  if (process.platform === "win32") return "explorer";
  return "file-manager";
}

test.describe("localhost desktop actions", () => {
  test("shows daemon-backed open targets for browser localhost workspaces", async ({
    page,
    withWorkspace,
  }) => {
    const workspace = await withWorkspace({ prefix: "localhost-open-targets-" });
    await workspace.navigateTo();

    await expect(page.getByTestId("workspace-open-in-editor-primary")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("workspace-open-in-editor-caret").click();
    await expect(page.getByTestId("workspace-open-in-editor-menu")).toBeVisible();
    await expect(
      page.getByTestId(`workspace-open-in-editor-item-${platformFileManagerTargetId()}`),
    ).toBeVisible();
  });

  test("shows a daemon-backed directory picker for browser localhost Open Project", async ({
    page,
  }) => {
    const serverId = process.env.E2E_SERVER_ID;
    if (!serverId) {
      throw new Error("E2E_SERVER_ID is not set.");
    }

    await page.goto(`/h/${encodeURIComponent(serverId)}/open-project`);
    await page.getByTestId("open-project-submit").click();

    await expect(page.getByPlaceholder("Type or browse a directory path...")).toBeVisible();
    await expect(page.getByText("Open this folder", { exact: true })).toBeVisible();
    await expect(page.getByText("Home", { exact: true })).toBeVisible();
    await expect(page.getByText("Current Directory", { exact: true })).toBeVisible();
    await expect(page.getByText("Parent Directory", { exact: true })).toBeVisible();
  });
});
