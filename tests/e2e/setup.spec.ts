import { test, expect } from "@playwright/test";

test("pauses project actions and shortcuts until bundled LaTeX preparation finishes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Delay the native setup response to reproduce a first portable start.
    // No project can be opened yet, so only the preparation IPC is pending.
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main" },
        },
        transformCallback: () => 1,
        unregisterCallback: () => {},
        invoke: (command: string) =>
          command === "prepare_toolchain"
            ? new Promise(() => {})
            : Promise.resolve(null),
      },
    });
  });
  await page.goto("/");
  await expect(page.locator('.index-warning[role="status"]')).toContainText(
    "LaTeX wird vorbereitet",
  );
  await expect(page.locator("header.appbar")).toHaveAttribute("inert", "");
  await expect(page.locator(".app-body")).toHaveAttribute("inert", "");
  for (const shortcut of [
    "Control+n",
    "Control+o",
    "Control+k",
    "Control+Enter",
  ]) {
    await page.keyboard.press(shortcut);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await expect(page.locator('.index-warning[role="status"]')).toBeVisible();
});
