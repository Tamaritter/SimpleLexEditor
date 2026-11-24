import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "roxena-browser-files",
      JSON.stringify({
        "main.tex":
          "\\documentclass{article}\n\\begin{document}\nFORMEL-HIER\n\\end{document}",
      }),
    );
    localStorage.setItem(
      "roxena-settings",
      JSON.stringify({ theme: "dark", autoSave: false }),
    );
  });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  await page.keyboard.press("Control+m");
  await expect(page.locator("math-field")).toBeVisible();
});

test("composes a nested fraction and root without LaTeX and inserts only when complete", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const dialog = page.getByRole("dialog");
  const source = page.getByRole("textbox", { name: "LaTeX-Code" });
  const before = await source.innerText();
  const insert = dialog.getByRole("button", {
    name: "Formel in Dokument einfügen",
  });
  await expect(insert).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Bruch einsetzen", exact: true })
    .click();
  await expect(dialog.locator(".formula-slots-notice")).toContainText(
    "2 Kästchen",
  );
  await dialog
    .getByRole("button", { name: "Wurzel einsetzen", exact: true })
    .click();
  await page.keyboard.type("1+x^2");
  await dialog.getByRole("button", { name: "Nächstes Kästchen" }).click();
  await page.keyboard.type("1+");
  await dialog
    .getByRole("button", { name: "Bruch einsetzen", exact: true })
    .click();
  await page.keyboard.type("1");
  await dialog.getByRole("button", { name: "Nächstes Kästchen" }).click();
  await page.keyboard.type("x");
  await expect(insert).toBeEnabled();
  const expression = await dialog.getByLabel("Formel-LaTeX").inputValue();
  expect(expression.match(/\\frac/g)).toHaveLength(2);
  expect(expression).toContain("\\sqrt");
  expect(expression).not.toContain("placeholder");
  await expect(dialog.locator(".formula-preview .katex")).toBeVisible();
  expect(await source.innerText()).toBe(before);
  await page.screenshot({
    path: "test-results/simplelexeditor-formeleditor-dark.png",
  });
  await insert.click();
  await expect(dialog).toBeHidden();
  await expect(source).toContainText(expression);
  const after = await source.innerText();
  expect(after.indexOf(expression)).toBeGreaterThan(
    after.indexOf("\\begin{document}"),
  );
  expect(after.indexOf(expression)).toBeLessThan(
    after.indexOf("\\end{document}"),
  );
  expect(errors).toEqual([]);
});

test("wraps selections, supports undo and redo, and keeps drafts across tabs", async ({
  page,
}) => {
  const dialog = page.getByRole("dialog");
  const field = dialog.locator("math-field");
  const latex = dialog.getByLabel("Formel-LaTeX");
  await field.click();
  await expect(field.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("x+1");
  await expect(latex).toHaveValue("x+1");
  const original = await latex.inputValue();
  expect(original).toBe("x+1");
  await page.keyboard.press("Control+a");
  await dialog
    .getByRole("button", { name: "Wurzel einsetzen", exact: true })
    .click();
  await expect(latex).toHaveValue(/\\sqrt\{x\+1\}/);
  const wrapped = await latex.inputValue();
  await dialog.getByRole("button", { name: "Formel rückgängig" }).click();
  await expect(latex).toHaveValue(original);
  await dialog.getByRole("button", { name: "Formel wiederholen" }).click();
  await expect(latex).toHaveValue(wrapped);
  for (const tab of [
    "Bibliothek",
    "Formelbaukasten",
    "Matrix",
    "Formeleditor",
  ]) {
    await dialog.getByRole("tab", { name: tab, exact: true }).click();
    await expect(latex).toHaveValue(wrapped);
  }
  await dialog.getByRole("button", { name: "Formel leeren" }).click();
  await expect(latex).toHaveValue("");
  await dialog.getByRole("button", { name: "Formel rückgängig" }).click();
  await expect(latex).toHaveValue(wrapped);
});

test("synchronizes manual LaTeX, example formulas and a compact light layout with local fonts", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith("http://127.0.0.1:")
    )
      external.push(request.url());
  });
  const dialog = page.getByRole("dialog");
  const latex = dialog.getByLabel("Formel-LaTeX");
  await dialog
    .getByText("LaTeX-Code bearbeiten (optional)", { exact: true })
    .click();
  await latex.fill("\\frac{a+b}{c}");
  await expect
    .poll(() =>
      dialog
        .locator("math-field")
        .evaluate((el) => (el as HTMLElement & { value: string }).value),
    )
    .toBe("\\frac{a+b}{c}");
  await dialog
    .getByLabel("Formelbeispiel")
    .selectOption({ label: "Integral mit verschachteltem Bruch" });
  await expect(latex).toHaveValue(/\\int/);
  await expect(latex).toHaveValue(/\\sqrt/);
  await expect(
    dialog.getByRole("button", { name: "Formel in Dokument einfügen" }),
  ).toBeEnabled();
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.setViewportSize({ width: 940, height: 850 });
  await expect(
    dialog.locator(".formula-structure-grid button").first(),
  ).toHaveCSS("background-color", "rgb(253, 253, 254)");
  await page.screenshot({
    path: "test-results/simplelexeditor-formeleditor-light.png",
  });
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await expect(dialog.locator(".formula-preview .katex")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.fonts].some(
          (font) => font.status === "loaded" && font.family.includes("KaTeX"),
        ),
      ),
    )
    .toBe(true);
  expect(external).toEqual([]);
});
