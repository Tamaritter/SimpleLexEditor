import { buildArtifact } from "./build-artifact.mjs";
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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
const invoke = (command, args) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const previous = await page.evaluate(() =>
  localStorage.getItem("roxena-last-project"),
);
const fixture = path.resolve(
  `.tools/science-native/${Date.now()}/Wissenschaftliche Arbeit`,
);
await mkdir(fixture, { recursive: true });
await writeFile(
  path.join(fixture, "main.tex"),
  "\\documentclass{article}\n\\begin{document}\n\\section{Research}\nScientific work.\n\\end{document}\n",
);
const waitSuccess = async () => {
  await page.waitForFunction(
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
};
const openScience = () =>
  page
    .getByRole("button", {
      name: "Literatur, Querverweise und Beweise",
      exact: true,
    })
    .click();
try {
  await page.getByRole("button", { name: /Kompilieren/ }).click();
  await page.waitForFunction(
    () =>
      !document.querySelector(".compile-button")?.disabled &&
      document.querySelector(".compile-button")?.getAttribute("aria-busy") !==
        "true",
    null,
    { timeout: 90000 },
  );
  await page.evaluate(
    (root) => localStorage.setItem("roxena-last-project", root),
    fixture,
  );
  await page.reload();
  await waitSuccess();
  await page.locator(".live-toggle").click();
  await page
    .getByRole("button", { name: "Mathematik öffnen (Strg+M)", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCSS("width", "1100px");
  await expect(dialog.locator(".formula-preview .katex")).toBeVisible();
  await dialog
    .getByRole("tab", { name: "Formelbaukasten", exact: true })
    .click();
  await dialog.getByLabel("Formeltyp").selectOption({ label: "Integral" });
  await dialog.getByLabel("Integrand", { exact: true }).fill("x^2");
  await dialog.getByLabel("Untere Grenze", { exact: true }).fill("0");
  await dialog.getByLabel("Obere Grenze", { exact: true }).fill("1");
  await dialog.getByLabel("Formelmodus").selectOption("numbered");
  await dialog
    .getByLabel("Label für Querverweise (optional)")
    .fill("eq:integral");
  await page.screenshot({
    path: "test-results/simplelexeditor-science-formel.png",
  });
  await dialog
    .getByRole("button", { name: /Formel in Dokument einfügen/ })
    .click();
  await openScience();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Quelle hinzufügen", exact: true })
    .click();
  await dialog.getByLabel("Zitatschlüssel").fill("doe2026");
  await dialog.getByLabel("Titel", { exact: true }).fill("A Scientific Result");
  await dialog.getByLabel("Autor(en)", { exact: true }).fill("Doe, Jane");
  await dialog.getByLabel("Jahr", { exact: true }).fill("2026");
  await dialog
    .getByLabel("Zeitschrift / Verlag / Konferenz")
    .fill("Research Journal");
  await dialog.getByRole("button", { name: "Quelle speichern" }).click();
  await expect(
    dialog.getByRole("button", { name: /A Scientific Result/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/simplelexeditor-science-literatur.png",
  });
  await dialog.getByRole("button", { name: /A Scientific Result/ }).click();
  await openScience();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Einfügen", exact: true }).click();
  await openScience();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Querverweise", exact: true }).click();
  await dialog.getByLabel("Querverweistyp").selectOption("eqref");
  await dialog.getByRole("button", { name: /eq:integral/ }).click();
  await openScience();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Sätze & Beweise" }).click();
  await dialog.getByRole("button", { name: /^Satz/ }).click();
  await page.getByRole("button", { name: /Kompilieren/ }).click();
  await waitSuccess();
  const source = await readFile(path.join(fixture, "main.tex"), "utf8");
  expect(source).toContain("\\usepackage{amsmath}");
  expect(source).toContain("\\usepackage{amsthm}");
  expect(source).toContain("\\newtheorem{theorem}");
  expect(source).toContain("\\cite{doe2026}");
  expect(source).toContain("\\eqref{eq:integral}");
  expect(source).toContain("\\bibliography{references}");
  expect(source.indexOf("\\label{eq:integral}")).toBeGreaterThan(
    source.indexOf("\\begin{document}"),
  );
  expect(
    (
      await readFile(buildArtifact(fixture, "main.tex", "bbl"), "utf8")
    ).toLowerCase(),
  ).toContain("scientific result");
  const result = await invoke("compile_project", {
    main: "main.tex",
    engine: "pdflatex",
  });
  expect(result.success, result.log.slice(-2500)).toBe(true);
  expect(result.log).not.toContain("undefined references");
  expect(result.log).not.toContain("Citation `doe2026'");
  await writeFile(
    path.join(fixture, "biblatex-test.tex"),
    "\\documentclass{article}\n\\usepackage[backend=biber,style=numeric]{biblatex}\n\\addbibresource{references.bib}\n\\begin{document}\nResearch \\autocite{doe2026}.\n\\printbibliography\n\\end{document}\n",
  );
  const biber = await invoke("compile_project", {
    main: "biblatex-test.tex",
    engine: "pdflatex",
  });
  expect(biber.success, biber.log.slice(-3000)).toBe(true);
  expect(
    await readFile(buildArtifact(fixture, "biblatex-test.tex", "bbl"), "utf8"),
  ).toContain("doe2026");
  await page.screenshot({
    path: "test-results/simplelexeditor-science-desktop.png",
  });
  console.log(
    "PASS native science: formula builder, automatic packages, numbered equations, BibTeX and Biber, citations, bibliography, references, theorems and real PDF.",
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/simplelexeditor-science-failure.png",
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
