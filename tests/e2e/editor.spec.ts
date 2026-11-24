import { test, expect } from "@playwright/test";
test("opens the workspace, navigates sections and switches theme", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Erste Gedanken/ }).first(),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toContainText(
    "documentclass",
  );
  await page.getByRole("button", { name: "Hellen Modus aktivieren" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Dunklen Modus aktivieren" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .locator(".outline-list button")
    .filter({ hasText: "Ein Anfang" })
    .click();
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/simplelexeditor-dark.png" });
});
test("creates a project, inserts a table, persists edits and exports source", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Projektmenü:/ }).click();
  await page
    .getByRole("button", { name: "Neues Projekt", exact: true })
    .click();
  await page.getByText("Leeres Dokument", { exact: true }).click();
  await page.getByLabel("Projektname").fill("Meine Forschung");
  await page.getByRole("button", { name: "Projekt erstellen" }).click();
  await expect(
    page.getByRole("button", { name: /Meine Forschung/ }).first(),
  ).toBeVisible();
  const code = page.getByRole("textbox", { name: "LaTeX-Code" });
  await code.click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Einfügen", exact: true }).click();
  await page.getByRole("button", { name: /^Tabelle Zeilen/ }).click();
  await page.getByLabel("Beschriftung").fill("Messwerte & Ergebnisse");
  await page
    .getByRole("button", { name: "Tabelle einfügen", exact: true })
    .last()
    .click();
  await expect(code).toContainText("Messwerte \\& Ergebnisse");
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nFORMATME");
  await page.keyboard.press("Control+Shift+ArrowLeft");
  await page.getByRole("button", { name: "Einfügen", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Fett / })
    .click();
  await expect(code).toContainText("\\textbf{FORMATME}");
  await page.keyboard.press("Control+s");
  await page.reload();
  await expect(code).toContainText("Messwerte \\& Ergebnisse");
  await page.getByRole("button", { name: /Exportieren/ }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Aktuelle Quelldatei/ }).click();
  expect((await download).suggestedFilename()).toBe("main.tex");
});
test("creates and switches multiple files without losing edits", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  await page.getByRole("button", { name: "Datei hinzufügen" }).click();
  await page.getByLabel("Dateiname").fill("kapitel.tex");
  await page.getByRole("button", { name: "Datei erstellen" }).click();
  const code = page.getByRole("textbox", { name: "LaTeX-Code" });
  await expect(code).toContainText("kapitel.tex");
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nChapter text");
  await page.locator(".file-row").filter({ hasText: "main.tex" }).click();
  await expect(code).toContainText("documentclass");
  await page.locator(".file-row").filter({ hasText: "kapitel.tex" }).click();
  await expect(code).toContainText("Chapter text");
});
test("search, commands, settings and focus mode work", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Projekt durchsuchen", exact: true })
    .click();
  await page.getByPlaceholder("Im Projekt suchen …").fill("Unendlichkeit");
  await expect(page.locator(".search-result")).toHaveCount(1);
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Befehl suchen …").fill("Einstellungen");
  await page
    .getByRole("option", { name: "Einstellungen", exact: true })
    .last()
    .click();
  await page.getByLabel("Schriftgröße").selectOption("16");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.locator(".code-editor")).toHaveCSS("font-size", "16px");
  await page.keyboard.press("Control+Shift+f");
  await expect(page.locator(".app")).toHaveClass(/focus-mode/);
  await page.keyboard.press("Control+Shift+f");
  await expect(page.locator(".app")).not.toHaveClass(/focus-mode/);
});
