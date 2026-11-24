import { test, expect, type Page } from "@playwright/test";
async function rootMenu(page: Page) {
  await page.locator(".folder-root").click({ button: "right" });
}
async function addFile(
  page: Page,
  path: string,
  chapter = false,
  include = true,
) {
  await page
    .getByRole("button", { name: "Datei hinzufügen", exact: true })
    .click();
  await page.getByLabel("Dateiname", { exact: true }).fill(path);
  if (chapter) {
    await page.getByRole("radio", { name: /Kapitel \/ Teildatei/ }).click();
    if (!include)
      await page
        .getByRole("switch", {
          name: "In das Hauptdokument einbinden",
          exact: true,
        })
        .click();
  }
  await page
    .getByRole("button", { name: "Datei erstellen", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
test("right click creates folders and scoped documents, and folders collapse", async ({
  page,
}) => {
  await page.goto("/");
  await rootMenu(page);
  await page.getByRole("menuitem", { name: /Neuer Ordner/ }).click();
  await page.getByLabel("Ordnerpfad").fill("chapters");
  await page.getByRole("button", { name: "Ordner erstellen" }).click();
  const folder = page.getByRole("button", { name: "chapters", exact: true });
  await folder.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Neue Datei/ }).click();
  await expect(page.getByLabel("Dateiname", { exact: true })).toHaveValue(
    "chapters/dokument.tex",
  );
  await page
    .getByRole("button", { name: "Datei erstellen", exact: true })
    .click();
  await expect(
    page.getByLabel("Vorschaudokument", { exact: true }),
  ).toHaveValue("chapters/dokument.tex");
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toContainText(
    "\\documentclass",
  );
  await folder.click();
  await expect(
    page.locator(".file-row").filter({ hasText: "dokument.tex" }),
  ).not.toBeVisible();
  await folder.click();
  await expect(
    page.locator(".file-row").filter({ hasText: "dokument.tex" }),
  ).toBeVisible();
});
test("renaming keeps tabs, unsaved edits and the selected preview together", async ({
  page,
}) => {
  await page.goto("/");
  await addFile(page, "paper.tex");
  const code = page.getByRole("textbox", { name: "LaTeX-Code" });
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n% preserved by rename");
  await page
    .locator(".file-row")
    .filter({ hasText: "paper.tex" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: /Umbenennen/ }).click();
  await page.getByLabel("Neuer Projektpfad").fill("renamed.tex");
  await page.getByRole("button", { name: "Umbenennen", exact: true }).click();
  await expect(page.locator(".file-tab.active")).toContainText("renamed.tex");
  await expect(
    page.getByLabel("Vorschaudokument", { exact: true }),
  ).toHaveValue("renamed.tex");
  await expect(code).toContainText("preserved by rename");
  await page.reload();
  await expect(
    page.getByLabel("Vorschaudokument", { exact: true }),
  ).toHaveValue("renamed.tex");
  await expect(code).toContainText("preserved by rename");
  await page
    .locator(".file-row")
    .filter({ hasText: "renamed.tex" })
    .click({ button: "right" });
  await page.screenshot({
    path: "test-results/simplelexeditor-dateimenue.png",
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).not.toBeVisible();
});
test("project trash is reversible and preserves file contents", async ({
  page,
}) => {
  await page.goto("/");
  await addFile(page, "temporary.tex");
  await page
    .locator(".file-row")
    .filter({ hasText: "temporary.tex" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: /In Projektpapierkorb/ }).click();
  await page
    .getByRole("button", {
      name: "In Projektpapierkorb verschieben",
      exact: true,
    })
    .click();
  await expect(
    page.locator(".file-row").filter({ hasText: "temporary.tex" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Vorschaudokument", { exact: true }),
  ).toHaveValue("main.tex");
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(
    page.locator(".file-row").filter({ hasText: "temporary.tex" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Vorschaudokument", { exact: true }),
  ).toHaveValue("temporary.tex");
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toContainText(
    "Hier beginnt dein Dokument",
  );
});
test("chapter help links fragments and creates a safe independent preview", async ({
  page,
}) => {
  await page.goto("/");
  await addFile(page, "chapters/method.tex", true, false);
  await expect(
    page.getByLabel("Vorschaudokument", { exact: true }),
  ).toHaveValue("main.tex");
  await page.getByRole("button", { name: /Diese Datei anzeigen/ }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Kapitel / Teildatei");
  await dialog.getByRole("button", { name: /^In main.tex einbinden/ }).click();
  await page.keyboard.press("Control+s");
  const original = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("roxena-browser-files")!)[
        "chapters/method.tex"
      ],
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("roxena-browser-files")!)["main.tex"],
    ),
  ).toContain("\\input{chapters/method}");
  await page
    .getByLabel("Vorschaudokument", { exact: true })
    .selectOption("chapters/method.tex");
  dialog = page.getByRole("dialog");
  await page.screenshot({
    path: "test-results/simplelexeditor-vorschauhilfe.png",
  });
  await dialog
    .getByRole("button", { name: /Eigenständige Vorschau-Datei erstellen/ })
    .click();
  await expect(
    page.getByLabel("Vorschaudokument", { exact: true }),
  ).toHaveValue("chapters/method-vorschau.tex");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("roxena-browser-files")!)[
          "chapters/method.tex"
        ],
    ),
  ).toBe(original);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("roxena-browser-files")!)[
          "chapters/method-vorschau.tex"
        ],
    ),
  ).toContain("\\documentclass");
});
