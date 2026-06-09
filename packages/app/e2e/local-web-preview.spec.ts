import { expect, test } from "./fixtures";

test.describe("local web preview", () => {
  test("shows a Web lite preview pane when creating a browser tab", async ({
    page,
    withWorkspace,
  }) => {
    test.setTimeout(90_000);

    const workspace = await withWorkspace({ prefix: "local-web-preview-" });
    await workspace.navigateTo();

    await page.getByTestId("workspace-header-menu-trigger").click();
    await expect(page.getByTestId("workspace-header-new-browser")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("workspace-header-new-browser").click();

    await expect(page.getByTestId("browser-lite-address-input")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Open a preview URL", { exact: true })).toBeVisible();
    await expect(page.getByText("Browser is desktop-only", { exact: true })).toHaveCount(0);
  });
});
