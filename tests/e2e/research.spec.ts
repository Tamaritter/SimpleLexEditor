import { test, expect } from "@playwright/test";

test("checks the active paper, navigates its equation index and includes unsaved fixes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "roxena-settings",
      JSON.stringify({ autoSave: false }),
    );
    localStorage.setItem(
      "roxena-browser-files",
      JSON.stringify({
        "main.tex":
          "\\documentclass{article}\n\\usepackage{amsmath,amsthm}\n\\newtheorem{theorem}{Satz}\n\\begin{document}\n\\input{chapters/results}\nSiehe \\ref{eq:missing} und \\cite{Smith}.\n\\bibliography{references}\n\\end{document}",
        "chapters/results.tex":
          "\\section{Ergebnisse}\\label{sec:results}\n\\begin{equation}\\label{eq:energy}\nE=mc^2\n\\end{equation}\n\\begin{theorem}[Energie]\\label{thm:energy}\nEine Aussage.\n\\end{theorem}\n% TODO Unsicherheit der Messung prüfen",
        "references.bib":
          "@article{Smith,title={A Scientific Result},author={Smith, Jane},year={2026}}",
        "unused.tex":
          "\\label{eq:energy}\n\\ref{inactive-missing}\n% TODO Inactive draft",
      }),
    );
  });
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Wissenschaftliche Projektprüfung",
      exact: true,
    })
    .click();
  const panel = page.getByRole("region", {
    name: "Wissenschaftliche Projektprüfung",
    exact: true,
  });
  await expect(
    panel.getByRole("button", { name: /Verweisziel nicht gefunden/ }),
  ).toHaveCount(1);
  await expect(panel).not.toContainText("inactive-missing");
  await expect(panel).not.toContainText("Label mehrfach definiert");
  await panel
    .getByRole("button", { name: /Verweisziel nicht gefunden/ })
    .click();
  await expect(page.locator(".cm-activeLine")).toContainText("eq:missing");
  await panel
    .getByRole("tab", { name: "Formeln & Struktur", exact: true })
    .click();
  await panel
    .getByLabel("Indexfilter", { exact: true })
    .selectOption("equation");
  await panel.getByRole("button", { name: /eq:energy/ }).click();
  await expect(page.locator(".file-tab.active")).toContainText("results.tex");
  await expect(page.locator(".cm-activeLine")).toContainText("begin{equation}");
  await page.screenshot({
    path: "test-results/research-equation-index-dark.png",
  });
  const code = page.getByRole("textbox", { name: "LaTeX-Code" });
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\\label{eq:missing}");
  await panel.getByRole("tab", { name: /^Prüfung/ }).click();
  await expect(panel).not.toContainText("Verweisziel nicht gefunden");
  await expect(panel).toContainText("Offene Änderungen berücksichtigt");
  await expect(panel).toContainText("Offene Aufgabe");
  await page
    .getByRole("button", { name: "Hellen Modus aktivieren", exact: true })
    .click();
  await page.screenshot({ path: "test-results/research-review-light.png" });
});

test("imports a local BibTeX export without replacing duplicates and composes a multi-source citation", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "roxena-browser-files",
      JSON.stringify({
        "main.tex":
          "\\documentclass{article}\n\\input{preamble}\n\\begin{document}\nText.\n\\end{document}",
        "preamble.tex": "\\usepackage{natbib}",
        "references.bib":
          "@article{Existing,title={Existing Result},author={Doe, Jane},year={2025}}",
      }),
    ),
  );
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Literatur, Querverweise und Beweise",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Wissenschaftliche Werkzeuge",
  });
  await dialog
    .getByRole("button", { name: "BibTeX importieren", exact: true })
    .click();
  await dialog
    .getByLabel("BibTeX-Datei importieren", { exact: true })
    .setInputFiles({
      name: "Zotero-export.bib",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "@article{Existing,title={Do not replace this}}\n@article{New,title={A {New} Result},author={Roe, Richard},year={2026}}",
      ),
    });
  await expect(dialog).toContainText("1 neue Quelle");
  await expect(dialog).toContainText(
    "1 vorhandener Schlüssel wird übersprungen",
  );
  await page.screenshot({ path: "test-results/research-bibtex-import.png" });
  await dialog
    .getByRole("button", { name: "1 Quelle importieren", exact: true })
    .click();
  await expect(
    dialog.getByRole("checkbox", { name: "Quelle New vormerken", exact: true }),
  ).toBeVisible();
  const files = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("roxena-browser-files")!),
  );
  expect(files["references.bib"]).toContain("Existing Result");
  expect(files["references.bib"]).not.toContain("Do not replace this");
  expect(files["references.bib"]).toContain("A {New} Result");
  await dialog
    .getByLabel("Zitierbefehl", { exact: true })
    .selectOption("citep");
  await dialog
    .getByRole("checkbox", { name: "Quelle Existing vormerken", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: "Quelle New vormerken", exact: true })
    .check();
  await dialog.getByLabel("Text vor dem Zitat", { exact: true }).fill("vgl.");
  await dialog
    .getByLabel("Seitenangabe zum Zitat", { exact: true })
    .fill("S. 12–15");
  await expect(dialog.locator(".citation-preview")).toContainText(
    "\\citep[vgl.][S. 12–15]{Existing,New}",
  );
  await page.screenshot({
    path: "test-results/research-multiple-citation.png",
  });
  await dialog
    .getByRole("button", { name: "2 Quellen zitieren", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toContainText(
    "\\citep[vgl.][S. 12–15]{Existing,New}",
  );
  await expect(
    page.getByRole("textbox", { name: "LaTeX-Code" }),
  ).not.toContainText("\\usepackage{natbib}");
});

test("recognizes biblatex in a preamble, preserves the workflow and opens bibliography sources", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "roxena-browser-files",
      JSON.stringify({
        "main.tex":
          "\\documentclass{article}\n\\input{config/preamble}\n\\begin{document}\nText.\n\\end{document}",
        "config/preamble.tex":
          "\\usepackage[backend=biber]{biblatex}\n\\addbibresource{refs.bib}",
        "refs.bib":
          "@article{A,title={First Result},author={Doe},year={2026}}\n\n@book{B,title={Second Result},author={Roe},year={2025}}",
      }),
    ),
  );
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Literatur, Querverweise und Beweise",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Wissenschaftliche Werkzeuge",
  });
  await expect(dialog).toContainText("biblatex / Biber");
  await dialog
    .getByLabel("Zitierbefehl", { exact: true })
    .selectOption("textcite");
  await dialog.getByLabel("Text vor dem Zitat", { exact: true }).fill("siehe");
  await dialog.getByLabel("Seitenangabe zum Zitat", { exact: true }).fill("42");
  await dialog.getByRole("button", { name: /First Result/ }).click();
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toContainText(
    "\\textcite[siehe][42]{A}",
  );
  await expect(
    page.getByRole("textbox", { name: "LaTeX-Code" }),
  ).not.toContainText("natbib");
  await page
    .getByRole("button", {
      name: "Literatur, Querverweise und Beweise",
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "BibTeX-Eintrag B öffnen", exact: true })
    .click();
  await expect(page.locator(".file-tab.active")).toContainText("refs.bib");
  await expect(page.locator(".cm-activeLine")).toContainText("@book{B");
});

test("does not write malformed bibliography imports", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Literatur, Querverweise und Beweise",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Wissenschaftliche Werkzeuge",
  });
  await dialog
    .getByRole("button", { name: "BibTeX importieren", exact: true })
    .click();
  await dialog
    .getByLabel("BibTeX-Text", { exact: true })
    .fill("@book{Broken,title={Unclosed}");
  await expect(dialog.getByRole("alert")).toContainText(
    "nicht vollständig geschlossen",
  );
  await expect(
    dialog.getByRole("button", { name: "0 Quellen importieren", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("roxena-browser-files")!)[
          "references.bib"
        ],
    ),
  ).toBeUndefined();
});

test("keeps large bibliographies searchable and preserves a selection across filters", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "roxena-browser-files",
      JSON.stringify({
        "main.tex":
          "\\documentclass{article}\n\\begin{document}\nText\n\\end{document}",
        "references.bib": Array.from(
          { length: 1000 },
          (_, i) =>
            `@book{k${i},title={Result ${i}},author={Example},year={2026}}`,
        ).join("\n"),
      }),
    ),
  );
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Literatur, Querverweise und Beweise",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Wissenschaftliche Werkzeuge",
  });
  await expect(dialog).toContainText("1000 Quellen im Projekt");
  expect(await dialog.locator(".citation-source").count()).toBeLessThan(300);
  await dialog.locator(".science-searchbar input").fill("Result 999");
  await dialog
    .getByRole("checkbox", { name: "Quelle k999 vormerken", exact: true })
    .check();
  await dialog.locator(".science-searchbar input").fill("");
  await dialog
    .getByRole("checkbox", { name: "Quelle k0 vormerken", exact: true })
    .check();
  await expect(dialog.locator(".citation-preview")).toContainText(
    "\\cite{k999,k0}",
  );
});

test("rejects a non-UTF-8 file rather than silently corrupting a source title", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Literatur, Querverweise und Beweise",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Wissenschaftliche Werkzeuge",
  });
  await dialog
    .getByRole("button", { name: "BibTeX importieren", exact: true })
    .click();
  await dialog
    .getByLabel("BibTeX-Datei importieren", { exact: true })
    .setInputFiles({
      name: "legacy.bib",
      mimeType: "text/plain",
      buffer: Buffer.from([0x43, 0x61, 0x66, 0xe9]),
    });
  await expect(dialog.getByRole("alert")).toContainText("nicht gültig UTF-8");
  await expect(
    dialog.getByRole("button", { name: "0 Quellen importieren", exact: true }),
  ).toBeDisabled();
});
