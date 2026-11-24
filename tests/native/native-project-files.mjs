import { buildArtifact } from "./build-artifact.mjs";
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
const browser = await chromium.connectOverCDP(
  "http://127.0.0.1:" + (process.env.SIMPLELEXEDITOR_TEST_PORT || "9223"),
);
let page = browser
  .contexts()[0]
  .pages()
  .find((p) => p.url().includes("tauri.localhost") || p.url().includes("1420"));
if (!page) {
  const context = browser.contexts()[0];
  page = context.pages()[0] || (await context.waitForEvent("page"));
  await page.waitForURL(
    (url) => url.hostname === "tauri.localhost" || url.port === "1420",
    { timeout: 30000 },
  );
}
await page.getByRole("textbox", { name: "LaTeX-Code" }).waitFor();
const previous = await page.evaluate(() =>
  localStorage.getItem("roxena-last-project"),
);
const fixture = path.resolve(
  `.tools/project-files-native/${Date.now()}/Projektverwaltung`,
);
const main =
  "\\documentclass{report}\n\\usepackage{amsmath,amssymb,amsthm}\n\\newcommand{\\roxenatest}{INHERITED-PREAMBLE}\n\\begin{document}\nMAIN-DOCUMENT-ONLY\n\\end{document}\n";
await mkdir(fixture, { recursive: true });
await writeFile(path.join(fixture, "main.tex"), main);
const waitIdle = () =>
  page.waitForFunction(
    () =>
      !document.querySelector(".compile-button")?.disabled &&
      document.querySelector(".compile-button")?.getAttribute("aria-busy") !==
        "true",
    null,
    { timeout: 90000 },
  );
const waitSuccess = () =>
  page.waitForFunction(
    () =>
      document
        .querySelector(".status-left")
        ?.textContent?.includes("Erfolgreich") &&
      !document.querySelector(".compile-button")?.disabled &&
      document.querySelector(".compile-button")?.getAttribute("aria-busy") !==
        "true",
    null,
    { timeout: 90000 },
  );
const invoke = (command, args) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const compile = async () => {
  await page.getByRole("button", { name: /Kompilieren/ }).click();
  await waitSuccess();
};
try {
  await page.getByRole("button", { name: /Kompilieren/ }).click();
  await waitIdle();
  await page.evaluate(
    (root) => localStorage.setItem("roxena-last-project", root),
    fixture,
  );
  await page.reload();
  await waitSuccess();
  if ((await page.locator(".live-value").textContent()) === "An")
    await page.locator(".live-toggle").click();
  await page.locator(".folder-root").click({ button: "right" });
  await page.getByRole("menuitem", { name: /Neuer Ordner/ }).click();
  await page.getByLabel("Ordnerpfad").fill("chapters");
  await page.getByRole("button", { name: "Ordner erstellen" }).click();
  await page
    .getByRole("button", { name: "chapters", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: /Neue Datei/ }).click();
  await page
    .getByLabel("Dateiname", { exact: true })
    .fill("chapters/paper.tex");
  await page
    .getByRole("button", { name: "Datei erstellen", exact: true })
    .click();
  await waitSuccess();
  await expect(
    page.getByLabel("Vorschaudokument", { exact: true }),
  ).toHaveValue("chapters/paper.tex");
  expect(
    (await stat(buildArtifact(fixture, "chapters/paper.tex"))).size,
  ).toBeGreaterThan(1000);
  const ownPdf = spawnSync(
    "pdftotext",
    [buildArtifact(fixture, "chapters/paper.tex"), "-"],
    { encoding: "utf8", windowsHide: true },
  );
  expect(ownPdf.status).toBe(0);
  expect(ownPdf.stdout).not.toContain("MAIN-DOCUMENT-ONLY");
  const code = page.getByRole("textbox", { name: "LaTeX-Code" });
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n% PRESERVED-RENAME");
  await page
    .locator(".file-row")
    .filter({ hasText: "paper.tex" })
    .click({ button: "right" });
  await page.screenshot({
    path: "test-results/simplelexeditor-native-dateimenue.png",
  });
  await page.getByRole("menuitem", { name: /Umbenennen/ }).click();
  await page.getByLabel("Neuer Projektpfad").fill("chapters/renamed.tex");
  await page.getByRole("button", { name: "Umbenennen", exact: true }).click();
  await expect(
    page.getByLabel("Vorschaudokument", { exact: true }),
  ).toHaveValue("chapters/renamed.tex");
  expect(
    await readFile(path.join(fixture, "chapters/renamed.tex"), "utf8"),
  ).toContain("PRESERVED-RENAME");
  await compile();
  expect(
    (await stat(buildArtifact(fixture, "chapters/renamed.tex"))).size,
  ).toBeGreaterThan(1000);
  await page
    .locator(".file-row")
    .filter({ hasText: "renamed.tex" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: /In Projektpapierkorb/ }).click();
  await page
    .getByRole("button", {
      name: "In Projektpapierkorb verschieben",
      exact: true,
    })
    .click();
  await expect(
    page.locator(".file-row").filter({ hasText: "renamed.tex" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect
    .poll(
      () =>
        readFile(path.join(fixture, "chapters/renamed.tex"), "utf8").catch(
          () => "",
        ),
      { timeout: 10000 },
    )
    .toContain("PRESERVED-RENAME");
  await page
    .getByLabel("Vorschaudokument", { exact: true })
    .selectOption("main.tex");
  await waitSuccess();
  await page
    .getByRole("button", { name: "Datei hinzufügen", exact: true })
    .click();
  await page
    .getByLabel("Dateiname", { exact: true })
    .fill("chapters/method.tex");
  await page.getByRole("radio", { name: /Kapitel \/ Teildatei/ }).click();
  await page
    .getByRole("button", { name: "Datei erstellen", exact: true })
    .click();
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\\chapter{CHAPTER-ONLY}\n\\roxenatest\n");
  await page.keyboard.press("Control+s");
  await compile();
  expect(await readFile(path.join(fixture, "main.tex"), "utf8")).toContain(
    "\\input{chapters/method}",
  );
  const chapter = await readFile(
    path.join(fixture, "chapters/method.tex"),
    "utf8",
  );
  await page.getByRole("button", { name: /Diese Datei anzeigen/ }).click();
  await page.screenshot({
    path: "test-results/simplelexeditor-native-vorschauhilfe.png",
  });
  await page
    .getByRole("button", { name: /Eigenständige Vorschau-Datei erstellen/ })
    .click();
  await waitSuccess();
  await expect(
    page.getByLabel("Vorschaudokument", { exact: true }),
  ).toHaveValue("chapters/method-vorschau.tex");
  expect(
    await readFile(path.join(fixture, "chapters/method.tex"), "utf8"),
  ).toBe(chapter);
  const wrapper = await readFile(
    path.join(fixture, "chapters/method-vorschau.tex"),
    "utf8",
  );
  expect(wrapper).toContain("\\newcommand{\\roxenatest}");
  expect(wrapper).not.toContain("MAIN-DOCUMENT-ONLY");
  expect(
    (await stat(buildArtifact(fixture, "chapters/method-vorschau.tex"))).size,
  ).toBeGreaterThan(1000);
  const chapterPdf = spawnSync(
    "pdftotext",
    [buildArtifact(fixture, "chapters/method-vorschau.tex"), "-"],
    { encoding: "utf8", windowsHide: true },
  );
  expect(chapterPdf.status).toBe(0);
  expect(chapterPdf.stdout).toContain("CHAPTER-ONLY");
  expect(chapterPdf.stdout).toContain("INHERITED-PREAMBLE");
  expect(chapterPdf.stdout).not.toContain("MAIN-DOCUMENT-ONLY");
  expect(
    chapterPdf.stdout.split("\f").filter((text) => text.trim()).length,
  ).toBe(1);
  await page.screenshot({
    path: "test-results/simplelexeditor-native-kapitelvorschau.png",
  });
  const result = await invoke("compile_project", {
    main: "main.tex",
    engine: "pdflatex",
  });
  expect(result.success, result.log.slice(-2500)).toBe(true);
  console.log(
    "PASS native project files: scoped folders, standalone PDF selection, saved rename, reversible trash, chapter inclusion, inherited preamble and independent chapter PDF without changing the original chapter.",
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/simplelexeditor-native-files-failure.png",
  });
  throw error;
} finally {
  await page.evaluate((root) => {
    if (root) localStorage.setItem("roxena-last-project", root);
    else localStorage.removeItem("roxena-last-project");
  }, previous);
  await page.reload();
  await browser.close();
}
