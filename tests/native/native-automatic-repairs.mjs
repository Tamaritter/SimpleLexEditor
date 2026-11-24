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
if (!page) throw Error("Native SimpleLexEditor missing");
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
const root = path.resolve(
  ".tools/automatic-repairs-native",
  String(Date.now()),
);
await mkdir(root, { recursive: true });
const previous = await page.evaluate(() => ({
  project: localStorage.getItem("roxena-last-project"),
  settings: localStorage.getItem("roxena-settings"),
}));
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const invoke = (command, args) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const dialog = page.getByRole("dialog", {
  name: "Compilerfehler beheben",
  exact: true,
});
const success = () =>
  expect(page.locator(".status-left")).toContainText("Erfolgreich", {
    timeout: 180000,
  });
const failure = () =>
  expect(page.locator(".status-left")).toContainText("Compilerfehler", {
    timeout: 90000,
  });
async function load(name, source, extra = {}) {
  const folder = path.join(root, name);
  await mkdir(folder, { recursive: true });
  for (const [file, text] of Object.entries({ "main.tex": source, ...extra }))
    await writeFile(path.join(folder, file), text);
  await page.evaluate((folder) => {
    localStorage.setItem("roxena-last-project", folder);
    localStorage.setItem(
      "roxena-settings",
      JSON.stringify({ theme: "dark", autoSave: false, engine: "pdflatex" }),
    );
  }, folder);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  return folder;
}
async function openRepairs() {
  await page
    .getByRole("button", { name: "Compilerfehler beheben", exact: true })
    .first()
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Alle Fehler automatisch beheben",
      exact: true,
    }),
  ).toBeEnabled();
}
async function repair() {
  await openRepairs();
  await dialog
    .getByRole("button", {
      name: "Alle Fehler automatisch beheben",
      exact: true,
    })
    .click();
  await expect(dialog).toBeHidden({ timeout: 180000 });
  await success();
  await expect(page.locator(".build-panel")).toHaveCount(0);
}
try {
  const broken = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[ngerman]{babel}
\title{Automatische Reparatur}
\author{SimpleLexEditor Test}
\maketitle
\textbold{INHALT-BLEIBT-ERHALTEN}
$\mathbb{R}$
Forschung & Lehre.
\begin{itemize}
\item Listeninhalt
\end{enumerate}
\end{document}
`;
  const folder = await load("document-and-chain", broken);
  await failure();
  await openRepairs();
  await page.screenshot({
    path: "test-results/simplelexeditor-automatic-repairs-button.png",
  });
  await dialog
    .getByRole("button", {
      name: "Alle Fehler automatisch beheben",
      exact: true,
    })
    .click();
  await expect(dialog).toBeHidden({ timeout: 180000 });
  await success();
  const fixed = await readFile(path.join(folder, "main.tex"), "utf8");
  for (const token of [
    "\\begin{document}",
    "\\textbf{INHALT-BLEIBT-ERHALTEN}",
    "\\usepackage{amssymb}",
    "Forschung \\& Lehre.",
    "\\end{itemize}",
  ])
    expect(fixed).toContain(token);
  expect(fixed.indexOf("\\begin{document}")).toBeLessThan(
    fixed.indexOf("\\maketitle"),
  );
  expect(await invoke("list_backups", { path: "main.tex" })).not.toHaveLength(
    0,
  );
  await page.screenshot({
    path: "test-results/simplelexeditor-automatic-repairs-success.png",
  });
  console.log(
    "PASS one click: document start, typo, package, ampersand and environment repaired in successive real compiler runs",
  );

  const referencePreamble = String.raw`\documentclass[11pt,a4paper]{article}

% Ein ruhiger Ort für große Gedanken.
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[ngerman]{babel}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage[margin=2.6cm]{geometry}
\usepackage{hyperref}

\title{Notizen zur Unendlichkeit}
\author{Dein Name}
\date{\today}

\ref{sec:beispiel}
% Von SimpleLexEditor ergänzte wissenschaftliche Bausteine
\usepackage{amsthm}
\newtheorem{theorem}{Satz}[section]
\theoremstyle{definition}
\newtheorem{definition}[theorem]{Definition}
\theoremstyle{plain}

\begin{document}
\maketitle
INHALT-BLEIBT-ERHALTEN
\input{kapitel}
\end{document}`;
  const referenceFolder = await load("preamble-reference", referencePreamble, {
    "kapitel.tex": "\\section{Beispiel}\\label{sec:beispiel}\nKapitelinhalt.",
  });
  await failure();
  await repair();
  await expect(page.locator(".textLayer")).toContainText("1");
  // The preserved reference precedes \maketitle and occupies the first page.
  await page.getByLabel("PDF-Seite", { exact: true }).fill("2");
  await page.getByLabel("PDF-Seite", { exact: true }).press("Enter");
  await expect(page.locator(".textLayer")).toContainText(
    "INHALT-BLEIBT-ERHALTEN",
  );
  expect(await readFile(path.join(referenceFolder, "main.tex"), "utf8")).toBe(
    referencePreamble
      .replace("\\ref{sec:beispiel}\n", "")
      .replace("\\begin{document}", "\\begin{document}\n\\ref{sec:beispiel}\n"),
  );
  const referenceBackups = await invoke("list_backups", { path: "main.tex" });
  expect(
    await Promise.all(
      referenceBackups.map((backup) =>
        invoke("read_backup", { path: "main.tex", id: backup.id }),
      ),
    ),
  ).toContain(referencePreamble);
  await page.screenshot({
    path: "test-results/simplelexeditor-preamble-reference-repaired.png",
  });
  console.log(
    "PASS reported main.tex:16: preamble reference moved, theorem definitions preserved, original backed up and PDF compiled",
  );

  const many =
    "\\documentclass{article}\n\\begin{document}\n" +
    Array.from({ length: 12 }, (_, i) => `\\textbold{Satz ${i}}`).join("\n") +
    "\n\\end{document}\n";
  const historyFolder = await load("many-errors", many);
  await failure();
  await repair();
  expect(
    await readFile(path.join(historyFolder, "main.tex"), "utf8"),
  ).not.toContain("\\textbold");
  const backups = await invoke("list_backups", { path: "main.tex" });
  const contents = await Promise.all(
    backups.map((backup) =>
      invoke("read_backup", { path: "main.tex", id: backup.id }),
    ),
  );
  expect(contents).toContain(many);
  console.log(
    "PASS twelve successive errors: one click and original retained beyond the history limit",
  );

  const preamble =
    "\\documentclass{article}\nVersehentlich vor dem Titel.\n\\title{Arbeit}\n\\begin{document}\n\\maketitle\nINHALT\n\\end{document}";
  const preambleFolder = await load("preamble-text", preamble);
  await failure();
  await repair();
  const moved = await readFile(path.join(preambleFolder, "main.tex"), "utf8");
  expect(moved.indexOf("Versehentlich")).toBeGreaterThan(
    moved.indexOf("\\begin{document}"),
  );
  expect(moved.match(/Versehentlich vor dem Titel\./g)).toHaveLength(1);
  console.log("PASS misplaced preamble text moved without deleting content");

  const font =
    "\\documentclass{article}\n\\usepackage{fontspec}\n\\begin{document}\nSCHRIFT-REPARATUR\n\\end{document}";
  const fontFolder = await load("font-engine", font);
  await failure();
  await repair();
  expect(await readFile(path.join(fontFolder, "main.tex"), "utf8")).toBe(font);
  await expect(page.locator(".textLayer")).toContainText("SCHRIFT-REPARATUR");
  console.log(
    "PASS suitable bundled Unicode compiler selected without source changes",
  );

  const parent =
    "\\documentclass{article}\n\\begin{document}\n\\input{main}\n\\end{document}";
  const fragment = "\\section{Kapitel}\nKAPITEL-IM-HAUPTDOKUMENT";
  const parentFolder = await load(
    "parent-document",
    "\\documentclass{article}\n\\begin{document}\nKapitel\n\\end{document}",
    {
      "parent.tex": parent,
    },
  );
  await success();
  await page.getByRole("textbox", { name: "LaTeX-Code" }).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(fragment);
  await page.keyboard.press("Control+Enter");
  await failure();
  const chapterBeforeRepair = await readFile(
    path.join(parentFolder, "main.tex"),
    "utf8",
  );
  await repair();
  await expect(page.locator(".textLayer")).toContainText(
    "KAPITEL-IM-HAUPTDOKUMENT",
  );
  expect(await readFile(path.join(parentFolder, "parent.tex"), "utf8")).toBe(
    parent,
  );
  expect(await readFile(path.join(parentFolder, "main.tex"), "utf8")).toBe(
    chapterBeforeRepair,
  );
  console.log(
    "PASS unambiguous parent selected for a chapter without wrapping or rewriting its content",
  );

  const unknown =
    "\\documentclass{article}\n\\begin{document}\n\\MyPersonalUnknownMacro{INHALT}\n\\end{document}";
  const unknownFolder = await load("unknown", unknown);
  await failure();
  await openRepairs();
  await dialog
    .getByRole("button", {
      name: "Alle Fehler automatisch beheben",
      exact: true,
    })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "keine sichere automatische Korrektur",
    { timeout: 30000 },
  );
  expect(await readFile(path.join(unknownFolder, "main.tex"), "utf8")).toBe(
    unknown,
  );
  await expect(dialog.locator(".compiler-guidance")).toBeHidden();
  await dialog
    .getByRole("button", { name: "Schließen", exact: true })
    .last()
    .click();
  console.log(
    "PASS unknown macro: honest stop, no fabricated source and details hidden by default",
  );

  const cancelFolder = await load("cancel", many);
  await failure();
  await openRepairs();
  await dialog
    .getByRole("button", {
      name: "Alle Fehler automatisch beheben",
      exact: true,
    })
    .click();
  await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("angehalten", {
    timeout: 30000,
  });
  const cancelled = await readFile(path.join(cancelFolder, "main.tex"), "utf8");
  await page.waitForTimeout(1200);
  expect(await readFile(path.join(cancelFolder, "main.tex"), "utf8")).toBe(
    cancelled,
  );
  for (let i = 0; i < 12; i++) expect(cancelled).toContain(`Satz ${i}`);
  console.log(
    "PASS cancellation stops further rounds and preserves document content",
  );
  expect(errors).toEqual([]);
  await writeFile(
    path.join(root, "verification.json"),
    JSON.stringify(
      { passed: true, checkedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/simplelexeditor-automatic-repairs-failure.png",
  });
  throw error;
} finally {
  await page
    .evaluate((previous) => {
      if (previous.project)
        localStorage.setItem("roxena-last-project", previous.project);
      else localStorage.removeItem("roxena-last-project");
      if (previous.settings)
        localStorage.setItem("roxena-settings", previous.settings);
      else localStorage.removeItem("roxena-settings");
    }, previous)
    .catch(() => {});
  await page.reload().catch(() => {});
  await browser.close();
}
