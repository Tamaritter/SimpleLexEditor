import { test, expect } from "@playwright/test";
test("compares external changes and saves both versions without overwriting", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "roxena-settings",
      JSON.stringify({ autoSave: false }),
    ),
  );
  await page.goto("/");
  const code = page.getByRole("textbox", { name: "LaTeX-Code" });
  await expect(code).toBeVisible();
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nMY-LOCAL-RESULT");
  await page.evaluate(() => {
    const files = JSON.parse(localStorage.getItem("roxena-browser-files")!);
    files["main.tex"] = "EXTERNAL-COLLEAGUE-RESULT";
    localStorage.setItem("roxena-browser-files", JSON.stringify(files));
  });
  await page.keyboard.press("Control+s");
  await expect(
    page.getByRole("dialog", { name: "Dateifassungen vergleichen" }),
  ).toBeVisible();
  await expect(page.getByLabel("Deine Fassung", { exact: true })).toHaveValue(
    /MY-LOCAL-RESULT/,
  );
  await expect(page.getByLabel("Externe Fassung", { exact: true })).toHaveValue(
    "EXTERNAL-COLLEAGUE-RESULT",
  );
  await page
    .getByRole("button", {
      name: "Meine Fassung als neue Datei sichern",
      exact: true,
    })
    .click();
  const files = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("roxena-browser-files")!),
  );
  expect(files["main.tex"]).toBe("EXTERNAL-COLLEAGUE-RESULT");
  expect(
    Object.entries(files).some(
      ([name, text]) =>
        name.includes("-konflikt-") && String(text).includes("MY-LOCAL-RESULT"),
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/simplelexeditor-safe-conflict-copy.png",
  });
});
test("restores a prior version and keeps the replaced text recoverable", async ({
  page,
}) => {
  await page.goto("/");
  const code = page.getByRole("textbox", { name: "LaTeX-Code" });
  await expect(code).toBeVisible();
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nVERSION-ONE");
  await page.keyboard.press("Control+s");
  await expect(
    page.getByText("Alle Änderungen gespeichert", { exact: true }).first(),
  ).toBeVisible();
  await page.keyboard.type("\nVERSION-TWO");
  await page.keyboard.press("Control+s");
  await page
    .getByRole("button", { name: "Ansicht und Werkzeuge", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Versionsverlauf und Wiederherstellung",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Sicherungsvorschau")).toHaveValue(
    /VERSION-ONE/,
  );
  await expect(dialog.getByLabel("Sicherungsvorschau")).not.toHaveValue(
    /VERSION-TWO/,
  );
  await dialog
    .getByRole("button", { name: "Fassung im Editor wiederherstellen" })
    .click();
  await expect(code).not.toContainText("VERSION-TWO");
  await page.keyboard.press("Control+s");
  await page
    .getByRole("button", { name: "Ansicht und Werkzeuge", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Versionsverlauf und Wiederherstellung",
      exact: true,
    })
    .click();
  const versions = dialog.locator(".history-list button");
  let preserved = false;
  for (let i = 0; i < (await versions.count()); i++) {
    await versions.nth(i).click();
    if (
      (await dialog.getByLabel("Sicherungsvorschau").inputValue()).includes(
        "VERSION-TWO",
      )
    ) {
      preserved = true;
      break;
    }
  }
  expect(preserved).toBe(true);
});
test("does not rewrite CRLF source just by opening it and validates startup settings", async ({
  page,
}) => {
  const source =
    "\\documentclass{article}\r\n\\begin{document}\r\nOriginal\r\n\\end{document}\r\n";
  await page.addInitScript((source) => {
    localStorage.setItem(
      "roxena-browser-files",
      JSON.stringify({ "main.tex": source }),
    );
    localStorage.setItem(
      "roxena-settings",
      JSON.stringify({ fontSize: 500000, engine: "invalid" }),
    );
  }, source);
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  await page.waitForTimeout(1100);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("roxena-browser-files")!)["main.tex"],
    ),
  ).toBe(source);
  await page.getByRole("textbox", { name: "LaTeX-Code" }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("% EDIT");
  await page.keyboard.press("Control+s");
  const edited = await page.evaluate(
    () => JSON.parse(localStorage.getItem("roxena-browser-files")!)["main.tex"],
  );
  expect(edited.replaceAll("\r\n", "")).not.toContain("\n");
});
