import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const browser = await chromium.connectOverCDP(
  `http://127.0.0.1:${process.env.SIMPLELEXEDITOR_TEST_PORT || "9224"}`,
);
const page = browser
  .contexts()[0]
  .pages()
  .find((p) => p.url().includes("tauri.localhost"));
if (!page) throw Error("Native SimpleLexEditor window unavailable");
if (process.env.SIMPLELEXEDITOR_TEST_DIST === "1") {
  const dist = path.resolve("dist");
  await page.route("http://tauri.localhost/**", async (route) => {
    const relative = decodeURIComponent(
      new URL(route.request().url()).pathname,
    );
    const file = path.resolve(
      dist,
      "." + (relative === "/" ? "/index.html" : relative),
    );
    if (!file.startsWith(dist + path.sep)) return route.abort();
    await route.fulfill({ path: file });
  });
  await page.reload();
}
const fixture = path.resolve(`.tools/compiler-fixes-native/${Date.now()}`);
await mkdir(fixture, { recursive: true });
const main = String.raw`\documentclass{article}
\usepackage{amsmath,amsthm}
\newtheorem{definition}{Definition}
\begin{document}
\input{kapitel}
\end{document}
`;
const chapter = String.raw`
\[
  \frac{a}{b}
  \begin{definition}[Begriff]
  Hier steht die Definition.
\end{definition}

\]
% kapitel.tex
\section{Mathematik}
\begin{equation}
  E = mc^2
\end{equation}
wad
`;
await writeFile(path.join(fixture, "main.tex"), main);
await writeFile(path.join(fixture, "kapitel.tex"), chapter);
const previous = await page.evaluate(() => ({
  project: localStorage.getItem("roxena-last-project"),
  settings: localStorage.getItem("roxena-settings"),
}));
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const idle = () =>
  page.waitForFunction(
    () =>
      document.querySelector(".compile-button")?.getAttribute("aria-busy") !==
      "true",
    null,
    { timeout: 90000 },
  );
const success = async () => {
  await expect(page.locator(".status-left")).toContainText("Erfolgreich", {
    timeout: 90000,
  });
  await idle();
};
const failure = async () => {
  await expect(page.locator(".status-left")).toContainText("Compilerfehler", {
    timeout: 90000,
  });
  await idle();
};
const invoke = (command, args) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
try {
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  await idle();
  await page.evaluate((root) => {
    localStorage.setItem("roxena-last-project", root);
    localStorage.setItem(
      "roxena-settings",
      JSON.stringify({ theme: "dark", autoSave: false }),
    );
  }, fixture);
  await page.reload();
  await failure();
  await expect(page.locator(".preview-empty")).toContainText(
    "PDF konnte nicht erstellt werden",
  );
  await page.keyboard.press("Control+p");
  await page
    .getByRole("combobox", { name: "Datei suchen", exact: true })
    .fill("kapitel");
  await page.keyboard.press("Enter");
  const code = page.getByRole("textbox", { name: "LaTeX-Code" });
  await expect(code).toContainText("Hier steht die Definition.");
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nUngespeicherter Text.");
  const pending = chapter + "\nUngespeicherter Text.";
  await page
    .getByRole("button", { name: "Compilerfehler beheben", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Compilerfehler beheben",
    exact: true,
  });
  await dialog
    .getByText("Änderungen einzeln prüfen (optional)", { exact: true })
    .click();
  await expect(
    dialog.getByLabel("kapitel.tex vorher", { exact: true }),
  ).toHaveValue(pending);
  await expect(
    dialog.getByLabel("kapitel.tex nachher", { exact: true }),
  ).toHaveValue(/\\frac\{a\}\{b\}\n\\\]\n\n\\begin\{definition\}/);
  expect(await readFile(path.join(fixture, "kapitel.tex"), "utf8")).toBe(
    chapter,
  );
  await page.screenshot({
    path: "test-results/simplelexeditor-compiler-fixes-preview.png",
  });
  await page.keyboard.press("Escape");
  expect(await readFile(path.join(fixture, "kapitel.tex"), "utf8")).toBe(
    chapter,
  );
  await page
    .getByRole("button", { name: "Compilerfehler beheben", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Übernehmen und kompilieren", exact: true })
    .click();
  await success();
  await expect(page.locator(".textLayer")).toContainText("Definition");
  await expect(page.locator(".textLayer")).toContainText(
    "Ungespeicherter Text.",
  );
  expect(await readFile(path.join(fixture, "main.tex"), "utf8")).toBe(main);
  const backups = await invoke("list_backups", { path: "kapitel.tex" });
  const contents = await Promise.all(
    backups.map((b) =>
      invoke("read_backup", { path: "kapitel.tex", id: b.id }),
    ),
  );
  expect(contents).toContain(pending);
  await page.screenshot({
    path: "test-results/simplelexeditor-compiler-fixes-success.png",
  });

  // A later error with a last-good PDF is reachable through the problem panel.
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\\SimpleLexEditorUnknownCommand");
  await page.keyboard.press("Control+Enter");
  await failure();
  const panel = page.getByRole("region", { name: "Kompilierung und Probleme" });
  await expect(page.locator(".paper-wrap canvas")).toBeVisible();
  await panel
    .getByRole("button", { name: "Compilerfehler beheben", exact: true })
    .click();
  await expect(dialog).toContainText("keine eindeutige automatische Korrektur");
  await expect(
    dialog.getByRole("button", { name: "Übernehmen und kompilieren" }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Probleme anzeigen", exact: true })
    .click();
  const unknown = await readFile(path.join(fixture, "kapitel.tex"), "utf8");
  expect(unknown).toContain("\\SimpleLexEditorUnknownCommand");
  await page.screenshot({
    path: "test-results/simplelexeditor-compiler-actions.png",
  });
  await panel
    .getByRole("button", { name: "Fehlerstelle öffnen", exact: true })
    .click();
  await expect(code).toBeFocused();
  await panel
    .getByRole("button", { name: "Protokoll ansehen", exact: true })
    .click();
  await expect(
    panel.getByRole("tabpanel", { name: "Compilerprotokoll", exact: true }),
  ).toContainText("SimpleLexEditorUnknownCommand");
  await panel.getByRole("tab", { name: /^Probleme/ }).click();
  await panel
    .getByRole("button", { name: "Compilerfehler beheben", exact: true })
    .click();
  await dialog.getByText("Weitere Hilfe", { exact: true }).click();
  await dialog
    .getByRole("button", { name: "Im Projekt suchen", exact: true })
    .click();
  await expect(page.getByLabel("Suchbegriff", { exact: true })).toHaveValue(
    "\\SimpleLexEditorUnknownCommand",
  );

  // A known undefined environment adds requirements to the main preamble.
  await writeFile(
    path.join(fixture, "main.tex"),
    main.replace(
      "\\usepackage{amsmath,amsthm}\n\\newtheorem{definition}{Definition}\n",
      "",
    ),
  );
  await writeFile(
    path.join(fixture, "kapitel.tex"),
    "\\begin{definition}\nDefinition nach Reparatur.\n\\end{definition}\n",
  );
  await page.reload();
  await failure();
  await page
    .getByRole("button", { name: "Compilerfehler beheben", exact: true })
    .click();
  await expect(
    dialog.getByLabel("main.tex nachher", { exact: true }),
  ).toHaveValue(/\\usepackage\{amsthm\}/);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Hellen Modus aktivieren", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Compilerfehler beheben", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/simplelexeditor-compiler-fixes-light.png",
  });
  await dialog
    .getByRole("button", { name: "Übernehmen und kompilieren", exact: true })
    .click();
  await success();
  await expect(page.locator(".textLayer")).toContainText(
    "Definition nach Reparatur.",
  );
  // A closed chapter changed on disk after the review must not be overwritten.
  const staleFixture = path.join(fixture, "stale-review");
  await mkdir(staleFixture);
  await writeFile(path.join(staleFixture, "main.tex"), main);
  await writeFile(path.join(staleFixture, "kapitel.tex"), chapter);
  await page.evaluate(
    (root) => localStorage.setItem("roxena-last-project", root),
    staleFixture,
  );
  await page.reload();
  await failure();
  await page
    .getByRole("button", { name: "Compilerfehler beheben", exact: true })
    .click();
  await expect(
    dialog.getByLabel("kapitel.tex vorher", { exact: true }),
  ).toHaveValue(chapter);
  const external = chapter + "\nExtern geänderter Text.";
  await writeFile(path.join(staleFixture, "kapitel.tex"), external);
  await dialog
    .getByRole("button", { name: "Übernehmen und kompilieren", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "kapitel.tex wurde geändert",
  );
  expect(await readFile(path.join(staleFixture, "kapitel.tex"), "utf8")).toBe(
    external,
  );
  await page.keyboard.press("Escape");
  // A real document with six independent errors should stay in one repair flow.
  const chainFixture = path.join(fixture, "multiple-errors");
  await mkdir(path.join(chainFixture, "chapters"), { recursive: true });
  const chainSource = String.raw`\documentclass{article}
\begin{document}
$\mathbb{R}$
\textbold{Komfort}
Forschung & Lehre
$x ≤ y$
\begin{itemize}
\item Eintrag
\end{enumerate}
\input{old/intro}
\end{document}
`;
  await writeFile(path.join(chainFixture, "main.tex"), chainSource);
  await writeFile(
    path.join(chainFixture, "chapters/intro.tex"),
    "DATEIPFAD-REPARIERT",
  );
  await page.evaluate(
    (root) => localStorage.setItem("roxena-last-project", root),
    chainFixture,
  );
  await page.reload();
  await failure();
  await page
    .getByRole("button", { name: "Compilerfehler beheben", exact: true })
    .click();
  let repairRuns = 0;
  for (; repairRuns < 10; repairRuns++) {
    if (!(await dialog.isVisible())) break;
    const apply = dialog.getByRole("button", {
      name: "Übernehmen und kompilieren",
      exact: true,
    });
    await expect(apply).toBeEnabled();
    const before = await dialog
      .getByLabel("main.tex vorher", { exact: true })
      .inputValue();
    await apply.click();
    await page.waitForFunction(
      (previous) => {
        const dialog = document.querySelector(
          'dialog[aria-label="Compilerfehler beheben"][open]',
        );
        if (!dialog)
          return document
            .querySelector(".status-left")
            ?.textContent?.includes("Erfolgreich");
        const before = dialog.querySelector(
          'textarea[aria-label="main.tex vorher"]',
        );
        const apply = [...dialog.querySelectorAll("button")].find((b) =>
          b.textContent.includes("Übernehmen und kompilieren"),
        );
        return (
          (before?.value !== previous && apply && !apply.disabled) ||
          (!apply &&
            dialog.querySelector(".compiler-guidance") &&
            !dialog.querySelector('[role="status"]'))
        );
      },
      before,
      { timeout: 90000 },
    );
  }
  await success();
  expect(repairRuns).toBeGreaterThanOrEqual(6);
  const repaired = await readFile(path.join(chainFixture, "main.tex"), "utf8");
  for (const token of [
    "\\usepackage{amssymb}",
    "\\textbf{Komfort}",
    "Forschung \\& Lehre",
    "\\ensuremath{\\leq}",
    "\\end{itemize}",
    "\\input{chapters/intro.tex}",
  ])
    expect(repaired).toContain(token);
  await expect(page.locator(".textLayer")).toContainText("DATEIPFAD-REPARIERT");
  await page.screenshot({
    path: "test-results/simplelexeditor-compiler-multiple-success.png",
  });
  const packageFixture = path.join(fixture, "missing-package");
  await mkdir(packageFixture);
  const missingPackageSource = String.raw`\documentclass{article}
\usepackage{SimpleLexEditorMissingTestPackage}
\begin{document}Package test.\end{document}`;
  await writeFile(path.join(packageFixture, "main.tex"), missingPackageSource);
  await page.evaluate(
    (root) => localStorage.setItem("roxena-last-project", root),
    packageFixture,
  );
  await page.reload();
  await failure();
  await page
    .getByRole("button", { name: "Compilerfehler beheben", exact: true })
    .click();
  await expect(dialog).toContainText("LaTeX-Paket oder Dokumentklasse fehlt");
  await dialog.getByText("Weitere Hilfe", { exact: true }).click();
  await page.screenshot({
    path: "test-results/simplelexeditor-compiler-package-help.png",
  });
  await dialog
    .getByRole("button", { name: "TeX-Installation prüfen", exact: true })
    .click();
  await expect(page.locator(".missing-package-guide")).toContainText(
    "SimpleLexEditorMissingTestPackage.sty",
  );
  expect(await readFile(path.join(packageFixture, "main.tex"), "utf8")).toBe(
    missingPackageSource,
  );
  await page.keyboard.press("Escape");

  const fontFixture = path.join(fixture, "unicode-engine");
  await mkdir(fontFixture);
  const fontSource = String.raw`\documentclass{article}
\usepackage{fontspec}
\begin{document}UNICODE-COMPILER-OK\end{document}`;
  await writeFile(path.join(fontFixture, "main.tex"), fontSource);
  await page.evaluate(
    (root) => localStorage.setItem("roxena-last-project", root),
    fontFixture,
  );
  await page.reload();
  await failure();
  await page
    .getByRole("button", { name: "Compilerfehler beheben", exact: true })
    .click();
  await expect(dialog).toContainText(
    "Zeichen oder Schrift wird nicht unterstützt",
  );
  await dialog.getByText("Weitere Hilfe", { exact: true }).click();
  await dialog
    .getByRole("button", { name: "Unicode-Compiler wählen", exact: true })
    .click();
  await success();
  await expect(page.locator(".textLayer")).toContainText("UNICODE-COMPILER-OK");
  expect(await readFile(path.join(fontFixture, "main.tex"), "utf8")).toBe(
    fontSource,
  );
  expect(errors).toEqual([]);
  console.log(
    "PASS native compiler fixes: screenshot case, six successive real errors in one repair flow, unsaved chapter, cancel, backup, last-good PDF, stale review, missing-package help, Unicode compiler selection, both themes.",
  );
} catch (error) {
  await page
    .screenshot({
      path: "test-results/simplelexeditor-compiler-fixes-failure.png",
    })
    .catch(() => {});
  throw error;
} finally {
  await page.evaluate((previous) => {
    for (const [key, value] of [
      ["roxena-last-project", previous.project],
      ["roxena-settings", previous.settings],
    ]) {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    }
  }, previous);
  await browser.close();
}
