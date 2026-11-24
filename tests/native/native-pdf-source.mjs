import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const browser = await chromium.connectOverCDP(
  `http://127.0.0.1:${process.env.SIMPLELEXEDITOR_TEST_PORT || "9237"}`,
);
const page = browser
  .contexts()[0]
  .pages()
  .find((page) => page.url().includes("tauri.localhost"));
if (!page) throw Error("Native SimpleLexEditor missing");
const previous = await page.evaluate(() => ({
  project: localStorage.getItem("roxena-last-project"),
  settings: localStorage.getItem("roxena-settings"),
}));
const root = path.resolve(
  ".tools/pdf-source-native",
  String(Date.now()),
  "Projekt mit Räumen",
);
await mkdir(path.join(root, "kapitel"), { recursive: true });
const files = {
  "main.tex":
    "\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\section{Start}\nHAUPTZIEL steht im Hauptdokument.\n\\input{kapitel/main}\n\\newpage\n\\input{kapitel/mathe}\n\\end{document}\n",
  "kapitel/main.tex":
    "\\section{Kapitel}\nKAPITELZIEL steht in der eingebundenen Datei.\nNoch ein Absatz.\n",
  "kapitel/mathe.tex":
    "\\section{Mathematik}\nFORMELZIEL auf der zweiten Seite.\n\\begin{equation}\nE=mc^2+\\frac{x^2}{1+x}\n\\end{equation}\nUnter der Formel.\n",
};
for (const [file, content] of Object.entries(files))
  await writeFile(path.join(root, file), content);
const errors = [];
const requests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (request.url().includes("pdf_source_location"))
    requests.push(request.postData());
});
const sourceButton = page.getByRole("button", {
  name: "PDF-Klick öffnet LaTeX-Stelle",
  exact: true,
});
const sourceFile = page.locator(".editor-footer .file-location");
const pdfText = (text) =>
  page.locator(".textLayer span").filter({ hasText: text }).first();
const success = async () => {
  await expect(page.locator(".status-left")).toContainText("Erfolgreich", {
    timeout: 90000,
  });
  await expect(sourceButton).toBeEnabled();
  await expect(page.locator(".render-indicator")).toHaveCount(0);
};
try {
  // Consume the --project bootstrap before loading the actual test project.
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible({
    timeout: 120000,
  });
  await expect(page.locator(".status-left")).toContainText("Erfolgreich", {
    timeout: 90000,
  });
  await page.evaluate(
    ({ root, directory }) => {
      localStorage.setItem("roxena-last-project", root);
      localStorage.setItem(
        "roxena-settings",
        JSON.stringify({
          theme: "dark",
          engine: "pdflatex",
          autoSave: false,
          toolchainDirectory: directory,
        }),
      );
    },
    {
      root,
      directory: path.resolve(
        "src-tauri/target/release/tex/TinyTeX/bin/windows",
      ),
    },
  );
  await page.reload();
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible({
    timeout: 120000,
  });
  await success();
  await expect(page.locator(".textLayer")).toContainText("KAPITELZIEL");
  await expect(sourceButton).toHaveAttribute("aria-pressed", "true");
  for (const zoom of ["50", "125", "width"]) {
    await page.getByLabel("PDF-Zoom", { exact: true }).selectOption(zoom);
    await expect(page.locator(".render-indicator")).toHaveCount(0);
    await pdfText("KAPITELZIEL").click();
    await expect(sourceFile).toHaveText("kapitel/main.tex");
    await expect(page.locator(".toast")).toContainText(
      "kapitel/main.tex · Zeile 2",
    );
    await pdfText("HAUPTZIEL").click();
    await expect(sourceFile).toHaveText("main.tex");
    await expect(page.locator(".toast")).toContainText("main.tex · Zeile 5");
  }
  console.log(
    "PASS PDF text → correct root/chapter source at 50%, 125% and fit-to-width, including duplicate main.tex basenames and spaces/umlauts",
  );
  await page.getByLabel("PDF-Seite", { exact: true }).fill("2");
  await page.getByLabel("PDF-Seite", { exact: true }).press("Enter");
  await expect(page.locator(".textLayer")).toContainText("FORMELZIEL");
  await expect(page.locator(".render-indicator")).toHaveCount(0);
  await page
    .locator(".textLayer span")
    .filter({ hasText: /^E$/ })
    .first()
    .click();
  await expect(sourceFile).toHaveText("kapitel/mathe.tex");
  await expect(page.locator(".toast")).toContainText("kapitel/mathe.tex");
  await expect(page.locator(".cm-selectionBackground").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/simplelexeditor-pdf-quelltext.png",
  });
  console.log(
    "PASS formula on page 2 opens its chapter and selects the complete equation source",
  );

  await sourceButton.click();
  const before = requests.length;
  await pdfText("FORMELZIEL").click();
  const box = await pdfText("FORMELZIEL").boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + Math.min(100, box.width - 2),
    box.y + box.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => window.getSelection()?.toString().length || 0),
    )
    .toBeGreaterThan(0);
  expect(requests.length).toBe(before);
  await sourceButton.click();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  console.log(
    "PASS source mode can be disabled and PDF text remains selectable",
  );

  if ((await page.locator(".live-toggle").innerText()).includes("An"))
    await page.locator(".live-toggle").click();
  const editor = page.getByRole("textbox", { name: "LaTeX-Code" });
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n% Added after the PDF build");
  await expect(sourceButton).toBeDisabled();
  await expect(page.locator(".preview-status")).toContainText(
    "Änderungen noch nicht in der PDF",
  );
  await page
    .getByRole("button", { name: /Kompilieren/ })
    .first()
    .click();
  await success();
  await pdfText("FORMELZIEL").click();
  await expect(page.locator(".toast")).toContainText(
    "kapitel/mathe.tex · Zeile 2",
  );
  for (const file of ["main.tex", "kapitel/main.tex"])
    expect(await readFile(path.join(root, file), "utf8")).toBe(files[file]);
  expect(
    await readFile(path.join(root, "kapitel/mathe.tex"), "utf8"),
  ).toContain("% Added after the PDF build");
  expect(errors).toEqual([]);
  await writeFile(
    path.join(root, "verification.json"),
    JSON.stringify(
      {
        passed: true,
        checkedAt: new Date().toISOString(),
        requests: requests.length,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS stale PDF navigation is disabled, recompilation restores it, and source navigation never edits files",
  );
} catch (error) {
  console.log("Source requests:", requests);
  await page.screenshot({
    path: "test-results/simplelexeditor-pdf-quelltext-failure.png",
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
