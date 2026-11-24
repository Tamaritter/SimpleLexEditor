import { test, expect } from "@playwright/test";
test("keeps inserted definitions outside an existing formula", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "roxena-browser-files",
      JSON.stringify({
        "main.tex":
          "\\documentclass{article}\n\\begin{document}\n\\[\nx+y\n\\]\n\\end{document}",
      }),
    ),
  );
  await page.goto("/");
  const code = page.getByRole("textbox", { name: "LaTeX-Code" });
  await code
    .locator(".cm-line")
    .filter({ hasText: /^x\+y$/ })
    .click();
  await page.keyboard.press("End");
  await page
    .getByRole("button", {
      name: "Literatur, Querverweise und Beweise",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Sätze & Beweise" }).click();
  await dialog.getByRole("button", { name: /^Definition/ }).click();
  await expect(code).toContainText("\\begin{definition}");
  const source = await code.innerText();
  expect(source.indexOf("\\]")).toBeLessThan(
    source.indexOf("\\begin{definition}"),
  );
  expect(source).toContain("x+y");
});
test("math is discoverable, supports searching and inserts numbered formulas into the body", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Mathematik öffnen (Strg+M)", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCSS("width", "1100px");
  await expect(dialog.getByRole("tab", { name: "Bibliothek" })).toBeVisible();
  await dialog.getByRole("tab", { name: "Bibliothek", exact: true }).click();
  await dialog
    .getByPlaceholder("Symbol, Formel oder LaTeX-Befehl suchen …")
    .fill("Bayes");
  await dialog.getByRole("button", { name: /Satz von Bayes/ }).click();
  await expect(dialog.getByLabel("Formel-LaTeX")).toHaveValue(/\\mathbb\{P\}/);
  await dialog.getByLabel("Formelmodus").selectOption("numbered");
  await dialog.getByLabel("Label für Querverweise (optional)").fill("eq:bayes");
  await dialog
    .getByRole("button", { name: /Formel in Dokument einfügen/ })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.keyboard.press("Control+s");
  const source = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("roxena-browser-files")!)[
        "main.tex"
      ] as string,
  );
  expect(source.indexOf("\\label{eq:bayes}")).toBeGreaterThan(
    source.indexOf("\\begin{document}"),
  );
  expect(source.indexOf("\\label{eq:bayes}")).toBeLessThan(
    source.indexOf("\\end{document}"),
  );
});
test("builds rectangular matrices with editable cells and a real math preview", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  await page.keyboard.press("Control+m");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Matrix", exact: true }).click();
  await dialog.getByLabel("Matrixspalten").fill("3");
  await dialog.getByLabel("Matrix Z2 S3").fill("\\alpha");
  await dialog.getByLabel("Matrixklammern").selectOption("bmatrix");
  await expect(dialog.getByLabel("Formel-LaTeX")).toHaveValue(
    /\\begin\{bmatrix\}/,
  );
  await expect(dialog.locator(".formula-preview .katex")).toBeVisible();
  await page.screenshot({
    path: "test-results/simplelexeditor-mathematik.png",
  });
  await dialog
    .getByRole("button", { name: /Formel in Dokument einfügen/ })
    .click();
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toContainText(
    "\\alpha",
  );
});
test("adds a bibliography entry, cites it and inserts a bibliography", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Literatur, Querverweise und Beweise",
      exact: true,
    })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Quelle hinzufügen", exact: true })
    .click();
  await dialog.getByLabel("Zitatschlüssel").fill("doe2026");
  await dialog.getByLabel("Titel", { exact: true }).fill("A Scientific Result");
  await dialog.getByLabel("Autor(en)", { exact: true }).fill("Doe, Jane");
  await dialog.getByLabel("Jahr", { exact: true }).fill("2026");
  await dialog.getByRole("button", { name: "Quelle speichern" }).click();
  await expect(
    dialog.getByRole("button", { name: /A Scientific Result/ }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: /A Scientific Result/ }).click();
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toContainText(
    "\\cite{doe2026}",
  );
  await page
    .getByRole("button", {
      name: "Literatur, Querverweise und Beweise",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Einfügen", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toContainText(
    "\\bibliography{references}",
  );
});
test("inserts theorem definitions in the main preamble from a chapter and offers label completion", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Datei hinzufügen" }).click();
  await page.getByLabel("Dateiname").fill("chapters/method.tex");
  await page.getByRole("radio", { name: /Kapitel \/ Teildatei/ }).click();
  await page.getByRole("button", { name: "Datei erstellen" }).click();
  await page
    .getByRole("button", {
      name: "Literatur, Querverweise und Beweise",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Sätze & Beweise" }).click();
  await dialog.getByRole("button", { name: /^Definition/ }).click();
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toContainText(
    "\\begin{definition}",
  );
  await page.keyboard.press("Control+s");
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("roxena-browser-files")!)["main.tex"],
      ),
    )
    .toContain("\\usepackage{amsthm}");
  await page.locator(".file-row").filter({ hasText: "main.tex" }).click();
  const code = page.getByRole("textbox", { name: "LaTeX-Code" });
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\\label{sec:method}\nSee \\ref{sec:");
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText(
    "sec:method",
  );
});
