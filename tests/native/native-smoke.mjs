import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";

// For development only: launch with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223.
const browser = await chromium.connectOverCDP(
  "http://127.0.0.1:" + (process.env.SIMPLELEXEDITOR_TEST_PORT || "9223"),
);
const page = browser
  .contexts()[0]
  .pages()
  .find((p) => p.url().includes("1420") || p.url().includes("tauri.localhost"));
if (!page) throw Error("Keine SimpleLexEditor-WebView gefunden.");
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const previous = await page.evaluate(() =>
  localStorage.getItem("roxena-last-project"),
);
const fixture = path.resolve(
  `.tools/native-fixture/${Date.now()}/Erste Gedanken`,
);
const output = path.resolve("test-results/native");
const chapter = "Ein eingebundenes Kapitel. $a^2+b^2=c^2$";
await mkdir(path.join(fixture, "chapters"), { recursive: true });
await mkdir(output, { recursive: true });
const source = (await readFile("examples/erste-gedanken/main.tex", "utf8"))
  .replace("\\end{document}", "\\input{chapters/introduction}\n\\end{document}")
  .replace(
    "\\section{Was als Nächstes kommt}",
    "\\newpage\n\\section{Was als Nächstes kommt}",
  );
await writeFile(path.join(fixture, "main.tex"), source);
await writeFile(path.join(fixture, "chapters/introduction.tex"), chapter);
const invoke = async (command, args) =>
  page.evaluate(
    async ({ command, args }) =>
      window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
async function waitSuccess() {
  await page.waitForFunction(
    () =>
      document
        .querySelector(".status-left")
        ?.textContent?.includes("Erfolgreich"),
    null,
    { timeout: 90000 },
  );
  await page.waitForFunction(
    () =>
      !document.querySelector(".compile-button")?.disabled &&
      document.querySelector(".compile-button")?.getAttribute("aria-busy") !==
        "true",
  );
}
try {
  // Let the startup compilation finish before reloading into the isolated fixture.
  await page.getByRole("button", { name: /Kompilieren/ }).click();
  await waitSuccess();
  await page.evaluate((root) => {
    localStorage.setItem("roxena-last-project", root);
    localStorage.setItem(
      "roxena-settings",
      JSON.stringify({
        theme: "dark",
        fontSize: 13,
        autoSave: true,
        lineWrap: true,
        engine: "pdflatex",
      }),
    );
  }, fixture);
  await page.reload();
  await page.getByRole("textbox", { name: "LaTeX-Code" }).waitFor();
  await waitSuccess();
  await expect(page.locator(".paper-wrap canvas")).toBeVisible();
  await page
    .getByRole("button", { name: "Nächste Seite", exact: true })
    .click();
  await expect(page.locator(".paper-wrap canvas")).toHaveAttribute(
    "aria-label",
    "PDF-Vorschau, Seite 2 von 2",
  );
  await page
    .getByRole("button", { name: "Vorherige Seite", exact: true })
    .click();
  await page.getByRole("button", { name: "Vergrößern", exact: true }).click();
  await expect(page.getByLabel("PDF-Zoom", { exact: true })).toHaveValue(
    /^[0-9]+$/,
  );
  await page
    .getByRole("button", { name: "An Breite anpassen", exact: true })
    .click();
  if ((await page.locator(".live-value").textContent()) === "An")
    await page.locator(".live-toggle").click();
  expect(await invoke("read_file", { path: "main.tex" })).toContain(
    "\\documentclass",
  );
  const editor = page.getByRole("textbox", { name: "LaTeX-Code" });
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n% Native smoke test");
  await page.keyboard.press("Control+s");
  await expect
    .poll(async () => readFile(path.join(fixture, "main.tex"), "utf8"))
    .toContain("Native smoke test");
  expect(
    await readFile(path.join(fixture, ".roxena/backups/main.tex"), "utf8"),
  ).toContain("\\documentclass");
  const asset = await invoke("import_asset", {
    source: path.resolve("src-tauri/icons/icon.png"),
  }).catch((error) => {
    if (String(error).includes("exist")) return "assets/icon.png";
    throw error;
  });
  await invoke("write_file", {
    projectRoot: (await invoke("open_project", { path: fixture })).root,
    expected: await invoke("read_file", { path: "chapters/introduction.tex" }),
    path: "chapters/introduction.tex",
    content: `${chapter}\n\\includegraphics[width=1cm]{${asset}}`,
  });
  const run = await invoke("compile_project", {
    main: "main.tex",
    engine: "pdflatex",
  });
  expect(run.success).toBe(true);
  expect(Buffer.from(run.pdf, "base64").subarray(0, 4).toString()).toBe("%PDF");
  await invoke("write_file", {
    path: "chapters/introduction.tex",
    content: "\\thiscommanddoesnotexist",
  });
  await page.getByRole("button", { name: /Kompilieren/ }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".status-left")
        ?.textContent?.includes("Compilerfehler"),
    null,
    { timeout: 90000 },
  );
  await expect(page.locator(".build-panel")).toContainText(
    "Undefined control sequence",
  );
  await expect(page.locator(".paper-wrap canvas")).toBeVisible();
  await page
    .locator(".diagnostic.error")
    .filter({ hasText: "Undefined control sequence" })
    .first()
    .click();
  await expect(page.locator(".file-tab.active")).toContainText(
    "introduction.tex",
  );
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type(chapter);
  await page.getByRole("button", { name: /Kompilieren/ }).click();
  await waitSuccess();
  await page.getByRole("button", { name: "Protokoll schließen" }).click();
  await page.locator(".file-row").filter({ hasText: "main.tex" }).click();
  await page
    .locator(".outline-list button")
    .filter({ hasText: "Die Schönheit" })
    .click();
  if (await page.getByRole("button", { name: "Hinweis schließen" }).count())
    await page.getByRole("button", { name: "Hinweis schließen" }).click();
  let blocked = false;
  try {
    await invoke("read_file", { path: "../outside.tex" });
  } catch {
    blocked = true;
  }
  expect(blocked).toBe(true);
  await invoke("export_file", {
    destination: path.join(output, "document.pdf"),
    data: run.pdf,
    extension: "pdf",
  });
  expect(
    (await readFile(path.join(output, "document.pdf")))
      .subarray(0, 4)
      .toString(),
  ).toBe("%PDF");
  await invoke("export_zip", { destination: path.join(output, "project.zip") });
  const zip = unzipSync(await readFile(path.join(output, "project.zip")));
  expect(strFromU8(zip["main.tex"])).toContain("Native smoke test");
  expect(zip["assets/icon.png"]).toBeDefined();
  expect(Object.keys(zip).some((key) => key.startsWith(".roxena/"))).toBe(
    false,
  );
  await page.waitForTimeout(500);
  const png = await page
    .locator(".paper-wrap canvas")
    .evaluate((el) => el.toDataURL("image/png").split(",")[1]);
  await invoke("export_file", {
    destination: path.join(output, "page.png"),
    data: png,
    extension: "png",
  });
  expect(
    (await readFile(path.join(output, "page.png"))).subarray(1, 4).toString(),
  ).toBe("PNG");
  await page.screenshot({
    path: "test-results/simplelexeditor-desktop-dark.png",
  });
  await page.getByRole("button", { name: "Hellen Modus aktivieren" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({
    path: "test-results/simplelexeditor-desktop-light.png",
  });
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify(
      {
        native: true,
        multifileCompilation: true,
        imageImport: true,
        savedToDisk: true,
        backupCreated: true,
        compilerDiagnostics: true,
        preservedPdfOnError: true,
        exportPdf: true,
        exportZip: true,
        exportPng: true,
        traversalBlocked: blocked,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await page.evaluate((previous) => {
    if (previous) localStorage.setItem("roxena-last-project", previous);
    else localStorage.removeItem("roxena-last-project");
  }, previous);
  await page.reload();
  await browser.close();
}
