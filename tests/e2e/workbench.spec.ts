import { test, expect } from "@playwright/test";

test("organizes settings into keyboard-accessible categories and applies saved preferences", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Einstellungen",
    exact: true,
  });
  await expect(
    dialog.getByRole("tab", { name: "Arbeitsbereich", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    dialog.getByRole("switch", { name: "Automatisch speichern", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/simplelexeditor-settings-workspace-dark.png",
  });
  await page.getByLabel("Schriftgröße", { exact: true }).selectOption("16");
  const compilerTab = dialog.getByRole("tab", {
    name: "LaTeX & PDF",
    exact: true,
  });
  await compilerTab.click();
  await expect(
    page.getByLabel("LaTeX-Compiler", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Schriftgröße", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("Compiler-Zeitlimit", { exact: true })
    .selectOption("300");
  await dialog.locator("summary").click();
  await expect(
    page.getByPlaceholder("Mitgelieferte SimpleLexEditor-Umgebung verwenden"),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/simplelexeditor-settings-compiler-dark.png",
  });
  await compilerTab.focus();
  await page.keyboard.press("ArrowUp");
  await expect(
    dialog.getByRole("tab", { name: "Arbeitsbereich", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Hell", exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({
    path: "test-results/simplelexeditor-settings-workspace-light.png",
  });
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.reload();
  await expect(page.locator(".code-editor")).toHaveCSS("font-size", "16px");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "pdflatex", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "LaTeX & PDF", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByLabel("Compiler-Zeitlimit", { exact: true }),
  ).toHaveValue("300");
  expect(
    await dialog
      .locator(".settings-content")
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
});

test("finds commands by intent and runs the selected action from the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".textLayer")).toContainText("Unendlichkeit");
  await page.keyboard.press("Control+k");
  const query = page.getByRole("combobox", {
    name: "Befehl suchen",
    exact: true,
  });
  await expect(query).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("option", { name: "Hilfe und Tastenkürzel", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("option", { name: "Datei schnell öffnen", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.screenshot({
    path: "test-results/simplelexeditor-command-palette.png",
  });
  await query.fill("pdf speichern");
  await expect(
    page.getByRole("option", { name: "PDF exportieren", exact: true }),
  ).toHaveAttribute("aria-disabled", "false");
  await query.fill("quellen");
  await expect(
    page.getByRole("option", {
      name: "Literatur verwalten und zitieren",
      exact: true,
    }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveAttribute(
    "aria-label",
    "Wissenschaftliche Werkzeuge",
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await query.fill("vorschau");
  await page.keyboard.press("Enter");
  await expect(page.locator(".preview-pane")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await query.fill("ansicht standard");
  await page.keyboard.press("Enter");
  await expect(page.locator(".preview-pane")).toBeVisible();
  await page.keyboard.press("Control+i");
  await page
    .getByRole("group", { name: "Elementkategorien" })
    .getByRole("button", { name: "Mathematik", exact: true })
    .click();
  await page.getByPlaceholder("Element suchen …").fill("unbekanntes element");
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "Keine passenden Elemente",
  );
  await page
    .getByRole("button", { name: "Alle Elemente anzeigen", exact: true })
    .click();
  await expect(page.locator(".insert-catalog > button")).toHaveCount(18);
});

test("keeps active tabs in view, filters opened files and restores a resizable sidebar", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("roxena-browser-files"))
      localStorage.setItem(
        "roxena-browser-files",
        JSON.stringify(
          Object.fromEntries([
            [
              "main.tex",
              "\\documentclass{article}\n\\begin{document}\nMain\n\\end{document}",
            ],
            ...Array.from({ length: 8 }, (_, index) => [
              `chapters/chapter-${index}.tex`,
              `Chapter ${index}`,
            ]),
            ["unopened.tex", "Unopened"],
          ]),
        ),
      );
  });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press("Control+p");
    await page
      .getByRole("combobox", { name: "Datei suchen", exact: true })
      .fill(`chapter-${index}`);
    await page.keyboard.press("Enter");
    await expect(page.locator(".file-tab.active")).toContainText(
      `chapter-${index}.tex`,
    );
  }
  await expect
    .poll(() =>
      page.locator(".file-tabs").evaluate((node) => {
        const row = node.getBoundingClientRect();
        const active = node
          .querySelector(".file-tab.active")!
          .getBoundingClientRect();
        return active.left >= row.left - 1 && active.right <= row.right + 1;
      }),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Geöffnete Dateien", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Geöffnet", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("listbox", { name: "Projektdateien" }).getByRole("option"),
  ).toHaveCount(9);
  await page
    .getByRole("combobox", { name: "Datei suchen", exact: true })
    .fill("unopened");
  await expect(
    page.getByText("Keine passende Datei", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Alle Dateien", exact: true }).click();
  await page.keyboard.press("Enter");
  await expect(page.locator(".file-tab.active")).toContainText("unopened.tex");
  const handle = page.getByRole("separator", {
    name: "Breite der Seitenleiste ändern",
    exact: true,
  });
  await handle.focus();
  await page.keyboard.press("End");
  await expect(handle).toHaveAttribute("aria-valuenow", "420");
  await page.reload();
  await expect(handle).toHaveAttribute("aria-valuenow", "420");
  await page.setViewportSize({ width: 900, height: 650 });
  await expect(handle).toHaveAttribute("aria-valuenow", "315");
  expect(
    await page
      .locator(".workspace")
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await handle.dblclick();
  await expect(handle).toHaveAttribute("aria-valuenow", "200");
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + 2, bounds.y + 40);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 42, bounds.y + 40);
  await page.mouse.up();
  await expect(handle).toHaveAttribute("aria-valuenow", "240");
  await handle.dblclick();
  await expect(handle).toHaveAttribute("aria-valuenow", "200");
  await page.screenshot({
    path: "test-results/simplelexeditor-workbench-small.png",
  });
});
