import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { buildArtifact } from "./build-artifact.mjs";

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
}
const previous = await page.evaluate(() => ({
  project: localStorage.getItem("roxena-last-project"),
  settings: localStorage.getItem("roxena-settings"),
}));
const root = path.resolve(".tools/formula-editor-native", String(Date.now()));
await mkdir(root, { recursive: true });
const original =
  "\\documentclass{article}\n\\begin{document}\nFORMEL-EDITOR-TEST\n\\end{document}\n";
await writeFile(path.join(root, "main.tex"), original);
const errors = [];
const external = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (
    /^https?:/.test(request.url()) &&
    !["tauri.localhost", "ipc.localhost"].includes(
      new URL(request.url()).hostname,
    )
  )
    external.push(request.url());
});
try {
  await page.evaluate((root) => {
    localStorage.setItem("roxena-last-project", root);
    localStorage.setItem(
      "roxena-settings",
      JSON.stringify({ theme: "dark", engine: "pdflatex", autoSave: false }),
    );
  }, root);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  await expect(page.locator(".status-left")).toContainText("Erfolgreich", {
    timeout: 90000,
  });
  await page.keyboard.press("Control+m");
  const dialog = page.getByRole("dialog", { name: "Mathematik", exact: true });
  await expect(dialog.locator("math-field")).toBeVisible();
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
  await expect(
    dialog.getByRole("button", { name: "Formel in Dokument einfügen" }),
  ).toBeEnabled();
  const expression = await dialog.getByLabel("Formel-LaTeX").inputValue();
  expect(expression.match(/\\frac/g)).toHaveLength(2);
  expect(expression).toContain("\\sqrt");
  expect(expression).not.toContain("placeholder");
  expect(await readFile(path.join(root, "main.tex"), "utf8")).toBe(original);
  await dialog.getByLabel("Formelmodus").selectOption("numbered");
  await dialog
    .getByLabel("Label für Querverweise (optional)")
    .fill("eq:nested");
  await page.screenshot({
    path: "test-results/simplelexeditor-formeleditor-native.png",
  });
  await dialog
    .getByRole("button", { name: "Formel in Dokument einfügen" })
    .click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("button", { name: /Kompilieren/ })
    .first()
    .click();
  await expect(page.locator(".status-left")).toContainText("Erfolgreich", {
    timeout: 90000,
  });
  await expect(page.locator(".textLayer")).toContainText("FORMEL-EDITOR-TEST", {
    timeout: 20000,
  });
  await expect(page.locator(".textLayer")).toContainText("x");
  const saved = await readFile(path.join(root, "main.tex"), "utf8");
  expect(saved).toContain(expression);
  expect(saved).toContain("\\label{eq:nested}");
  expect(saved.indexOf(expression)).toBeGreaterThan(
    saved.indexOf("\\begin{document}"),
  );
  expect(saved.indexOf(expression)).toBeLessThan(
    saved.indexOf("\\end{document}"),
  );
  expect((await stat(buildArtifact(root, "main.tex"))).size).toBeGreaterThan(
    1000,
  );
  await page.screenshot({
    path: "test-results/simplelexeditor-formeleditor-native-pdf.png",
  });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await writeFile(
    path.join(root, "verification.json"),
    JSON.stringify(
      { passed: true, expression, checkedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(
    "PASS native formula editor: nested fraction/root built visually, no premature file changes, local fonts, numbered insertion and real PDF",
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/simplelexeditor-formeleditor-native-failure.png",
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
