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
const previous = await page.evaluate(() => ({
  project: localStorage.getItem("roxena-last-project"),
  settings: localStorage.getItem("roxena-settings"),
}));
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const root = path.resolve(".tools/figure-repairs-native", String(Date.now()));
const image = await readFile("src-tauri/icons/32x32.png");
const invoke = (command, args) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const dialog = page.getByRole("dialog", {
  name: "Compilerfehler beheben",
  exact: true,
});
const editor = page.getByRole("textbox", { name: "LaTeX-Code" });
const success = () =>
  expect(page.locator(".status-left")).toContainText("Erfolgreich", {
    timeout: 90000,
  });
async function load(name, source) {
  const folder = path.join(root, name);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "main.tex"), source);
  await writeFile(path.join(folder, "bild.png"), image);
  await page.evaluate((folder) => {
    localStorage.setItem("roxena-last-project", folder);
    localStorage.setItem(
      "roxena-settings",
      JSON.stringify({ theme: "dark", autoSave: false, engine: "pdflatex" }),
    );
  }, folder);
  await page.reload();
  await expect(editor).toBeVisible();
  return folder;
}
async function repair() {
  await expect(page.locator(".status-left")).toContainText("Compilerfehler", {
    timeout: 90000,
  });
  await page
    .getByRole("button", { name: "Compilerfehler beheben", exact: true })
    .first()
    .click();
  await dialog
    .getByRole("button", {
      name: "Alle Fehler automatisch beheben",
      exact: true,
    })
    .click();
}
async function importImageAtCursor() {
  // Substitute only the OS file picker; import, source edits and compilation
  // use the real desktop backend and the same insertion action as the user.
  const picker = "http://ipc.localhost/plugin*dialog*open";
  await page.unroute(picker);
  await page.route(picker, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "Tauri-Response": "ok",
        "Access-Control-Allow-Origin": "http://tauri.localhost",
        "Access-Control-Expose-Headers": "Tauri-Response",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify(path.resolve("src-tauri/icons/32x32.png")),
    }),
  );
  await page.getByRole("button", { name: "Einfügen", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Abbildung/ })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(editor).toContainText("\\begin{figure}[htbp]");
  await page
    .getByRole("button", { name: /Kompilieren/ })
    .first()
    .click();
  await success();
}
try {
  await expect(editor).toBeVisible({ timeout: 120000 });
  await success(); // consume the --project bootstrap before loading fixtures
  const figure = String.raw`\begin{figure}[htbp]
  \centering
  \includegraphics[width=2cm]{\detokenize{bild.png}}
  \caption{ABBILDUNGSINHALT bleibt erhalten.}
  \label{fig:beispiel}
\end{figure} % Kommentar am Abschluss
`;
  const before = [
    "\\documentclass[11pt,a4paper]{article}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage[T1]{fontenc}",
    "\\usepackage[ngerman]{babel}",
    "\\usepackage{graphicx}",
    "\\usepackage{hyperref}",
    "\\title{Abbildung}",
    "\\author{Name}",
    "\\date{\\today}",
    "",
    "% Versehentlich in der Präambel",
    "",
    figure,
    "\\usepackage{amsthm}",
    "\\newtheorem{theorem}{Satz}",
    "\\begin{document}",
    "HAUPTINHALT bleibt erhalten.",
    "\\end{document}",
  ].join("\n");
  expect(before.split("\n")[12]).toBe("\\begin{figure}[htbp]");
  const folder = await load("reported-main-line-13", before);
  await repair();
  await expect(dialog).toBeHidden({ timeout: 90000 });
  await success();
  const after = await readFile(path.join(folder, "main.tex"), "utf8");
  expect(after).toBe(
    before
      .replace(figure, "")
      .replace(
        "\\begin{document}",
        "\\begin{document}\n" + figure.trimEnd() + "\n",
      ),
  );
  await expect(page.locator(".textLayer")).toContainText("ABBILDUNGSINHALT");
  await expect(page.locator(".textLayer")).toContainText("HAUPTINHALT");
  const backups = await invoke("list_backups", { path: "main.tex" });
  expect(
    await Promise.all(
      backups.map((backup) =>
        invoke("read_backup", { path: "main.tex", id: backup.id }),
      ),
    ),
  ).toContain(before);
  await page.screenshot({
    path: "test-results/simplelexeditor-figure-automatisch-repariert.png",
  });
  console.log(
    "PASS reported main.tex:13: complete figure with detokenized image path, caption, label and comment moved; preamble preserved; original backed up; PDF compiled",
  );

  const missing =
    "\\documentclass{article}\n\\usepackage{graphicx}\n" +
    figure +
    "HAUPTINHALT\n\\end{document}";
  const missingFolder = await load("missing-document-start", missing);
  await repair();
  await expect(dialog).toBeHidden({ timeout: 90000 });
  await success();
  expect(await readFile(path.join(missingFolder, "main.tex"), "utf8")).toBe(
    missing.replace("\\begin{figure}", "\\begin{document}\n\\begin{figure}"),
  );
  console.log(
    "PASS genuinely missing document start restored before the figure",
  );

  const incomplete =
    "\\documentclass{article}\n\\begin{figure}[htbp]\n\\caption{Offener Block}\n\\begin{document}\nText\n\\end{document}";
  const incompleteFolder = await load("incomplete-float", incomplete);
  await repair();
  await expect(dialog.getByRole("alert")).toContainText(
    "keine sichere automatische Korrektur",
    { timeout: 30000 },
  );
  expect(await readFile(path.join(incompleteFolder, "main.tex"), "utf8")).toBe(
    incomplete,
  );
  await dialog
    .getByRole("button", { name: "Schließen", exact: true })
    .last()
    .click();
  console.log("PASS incomplete float left unchanged");

  const body =
    "\\documentclass{article}\n\\title{Titel bleibt in der Präambel}\n\\begin{document}\nHAUPTINHALT\n\\[\nx+y\n\\]\n\\end{document}\n";
  for (const position of ["preamble", "math"]) {
    const importedFolder = await load(`image-insertion-${position}`, body);
    await success();
    if (position === "preamble") {
      await editor.click();
      await page.keyboard.press("Control+Home");
    } else {
      await editor
        .locator(".cm-line")
        .filter({ hasText: /^x\+y$/ })
        .click();
      await page.keyboard.press("End");
    }
    await importImageAtCursor();
    const source = await readFile(
      path.join(importedFolder, "main.tex"),
      "utf8",
    );
    expect(source.indexOf("\\usepackage{graphicx}")).toBeLessThan(
      source.indexOf("\\begin{document}"),
    );
    expect(source.indexOf("\\begin{figure}")).toBeGreaterThan(
      source.indexOf(position === "math" ? "\\]" : "\\begin{document}"),
    );
    expect(source).toContain("\\title{Titel bleibt in der Präambel}");
    expect(
      await readFile(path.join(importedFolder, "assets/32x32.png")),
    ).toEqual(image);
    await expect(page.locator(".textLayer")).toContainText(
      "Beschreibung der Abbildung",
    );
    console.log(
      `PASS image insertion from ${position}: figure goes into document body outside math, graphicx is added automatically, real image import and PDF work`,
    );
  }
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
    path: "test-results/simplelexeditor-figure-repair-failure.png",
  });
  throw error;
} finally {
  await page
    .evaluate((previous) => {
      for (const [key, value] of [
        ["roxena-last-project", previous.project],
        ["roxena-settings", previous.settings],
      ]) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
    }, previous)
    .catch(() => {});
  await browser.close();
}
