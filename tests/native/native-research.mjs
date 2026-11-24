import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const browser = await chromium.connectOverCDP(
  `http://127.0.0.1:${process.env.SIMPLELEXEDITOR_TEST_PORT || "9237"}`,
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
const fixture = path.resolve(`.tools/research-native/${Date.now()}`);
const importFile = fixture + "-export.bib";
await mkdir(path.join(fixture, "chapters"), { recursive: true });
const main = String.raw`\documentclass{article}
\input{preamble}
\title{Wissenschaftlicher Workflowtest}
\author{SimpleLexEditor Test}
\begin{document}
\maketitle
\input{chapters/results}
\bibliographystyle{plain}
\bibliography{references}
\end{document}
`;
const preamble = String.raw`\usepackage{amsmath,amssymb,amsthm}
\newtheorem{theorem}{Satz}
`;
const chapter = String.raw`\section{Energie}\label{sec:energy}
\begin{equation}\label{eq:energy}
E=mc^2
\end{equation}
\begin{theorem}[Nichtnegative Energie]\label{thm:energy}
Fuer $m\geq0$ und $c>0$ ist $E\geq0$.
\end{theorem}
\begin{proof}
Das folgt aus $c^2>0$ und $m\geq0$.
\end{proof}
Siehe Gleichung~\eqref{eq:energy} und Satz~\ref{thm:energy} sowie \cite{Doe2026}.
% TODO Messunsicherheit diskutieren
`;
const originalBib =
  "@article{Doe2026,title={Example Study},author={Doe, Jane},journal={Example Journal},year={2026},pages={1--10}}\n";
const importedBib =
  "@article{Doe2026,title={DO-NOT-REPLACE}}\n@article{Roe2025,title={Second Example Study},author={Roe, Richard},journal={Example Journal},year={2025},pages={11--20}}";
await Promise.all([
  writeFile(path.join(fixture, "main.tex"), main),
  writeFile(path.join(fixture, "preamble.tex"), preamble),
  writeFile(path.join(fixture, "chapters/results.tex"), chapter),
  writeFile(path.join(fixture, "references.bib"), originalBib),
  writeFile(
    path.join(fixture, "unused.tex"),
    "\\ref{inactive-missing}\\label{eq:energy}",
  ),
  writeFile(importFile, importedBib),
]);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const previous = await page.evaluate(() => ({
  project: localStorage.getItem("roxena-last-project"),
  settings: localStorage.getItem("roxena-settings"),
}));
const idle = () =>
  page.waitForFunction(
    () =>
      document.querySelector(".compile-button")?.getAttribute("aria-busy") !==
      "true",
    null,
    { timeout: 90000 },
  );
const success = () =>
  page.waitForFunction(
    () =>
      document.querySelector(".compile-button")?.getAttribute("aria-busy") !==
        "true" &&
      document
        .querySelector(".status-left")
        ?.textContent?.includes("Erfolgreich"),
    null,
    { timeout: 90000 },
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
  await success();
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
  await expect(panel).toContainText("Offene Aufgabe");
  await expect(panel).not.toContainText("Verweisziel nicht gefunden");
  await expect(panel).not.toContainText("Label mehrfach definiert");
  await panel
    .getByRole("tab", { name: "Formeln & Struktur", exact: true })
    .click();
  await panel
    .getByLabel("Indexfilter", { exact: true })
    .selectOption("equation");
  await panel.getByRole("button", { name: /eq:energy/ }).click();
  await expect(page.locator(".file-tab.active")).toContainText("results.tex");
  await expect(page.locator(".cm-activeLine")).toContainText("begin{equation}");
  await expect(page.locator(".textLayer")).toContainText("Energie");
  await page.screenshot({ path: "test-results/research-native-index.png" });
  const code = page.getByRole("textbox", { name: "LaTeX-Code" });
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\n");
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
    .setInputFiles(importFile);
  await expect(dialog).toContainText("1 neue Quelle");
  await expect(dialog).toContainText(
    "1 vorhandener Schlüssel wird übersprungen",
  );
  await dialog
    .getByRole("button", { name: "1 Quelle importieren", exact: true })
    .click();
  await expect(
    dialog.getByRole("checkbox", {
      name: "Quelle Roe2025 vormerken",
      exact: true,
    }),
  ).toBeVisible();
  const savedBib = await readFile(path.join(fixture, "references.bib"), "utf8");
  expect(savedBib).toContain(originalBib.trim());
  expect(savedBib).not.toContain("DO-NOT-REPLACE");
  expect(savedBib).toContain("Second Example Study");
  await dialog.getByLabel("Zitierbefehl", { exact: true }).selectOption("cite");
  await dialog
    .getByRole("checkbox", { name: "Quelle Doe2026 vormerken", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: "Quelle Roe2025 vormerken", exact: true })
    .check();
  await dialog.getByLabel("Text vor dem Zitat", { exact: true }).fill("vgl.");
  await dialog
    .getByLabel("Seitenangabe zum Zitat", { exact: true })
    .fill("S. 12--15");
  await page.screenshot({ path: "test-results/research-native-citation.png" });
  await dialog
    .getByRole("button", { name: "2 Quellen zitieren", exact: true })
    .click();
  await expect(code).toContainText("vgl.~\\cite[S. 12--15]{Doe2026,Roe2025}");
  await page.keyboard.press("Control+Enter");
  await success();
  await expect(page.locator(".textLayer")).toContainText("Roe");
  await panel.getByRole("tab", { name: /^Prüfung/ }).click();
  await expect(panel.locator(".research-loading")).toHaveCount(0);
  await expect(panel).not.toContainText("Zitierte Quelle nicht gefunden");
  expect(await readFile(path.join(fixture, "main.tex"), "utf8")).toBe(main);
  expect(await readFile(path.join(fixture, "preamble.tex"), "utf8")).toBe(
    preamble,
  );
  await page
    .getByRole("button", { name: "Hellen Modus aktivieren", exact: true })
    .click();
  await page.screenshot({ path: "test-results/research-native-light.png" });
  expect(errors).toEqual([]);
  console.log(
    "PASS native research: active-document inspection, formula index navigation, local BibTeX import, duplicate preservation, unsaved edits, multi-source page citation, automatic bibliography refresh, real BibTeX PDF, both themes.",
  );
} catch (error) {
  await page
    .screenshot({ path: "test-results/research-native-failure.png" })
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
