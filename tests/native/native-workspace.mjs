import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const browser = await chromium.connectOverCDP(
  "http://127.0.0.1:" + (process.env.SIMPLELEXEDITOR_TEST_PORT || "9224"),
);
const context = browser.contexts()[0];
const page =
  context
    .pages()
    .find((candidate) => candidate.url().includes("tauri.localhost")) ??
  context.pages()[0] ??
  (await context.waitForEvent("page", { timeout: 30000 }));
await page.waitForURL((url) => url.hostname === "tauri.localhost", {
  timeout: 30000,
});
// Optional local frontend check before rebuilding the native executable.
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
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (message) => {
  if (message.type() === "error") console.error("WebView:", message.text());
});
const fixture = path.resolve(
  `.tools/workspace-native/${Date.now()}/Scientific workspace`,
);
await mkdir(path.join(fixture, "chapters"), { recursive: true });
const main =
  "\\documentclass{article}\n\\usepackage{amsmath,hyperref}\n\\begin{document}\n\\section{Scientific workspace}\nNative SimpleLexEditor quality verification.\n\\newpage\n\\input{chapters/results}\n\\end{document}\n";
const chapter =
  "\\section{Results}\nNATIVE-SEARCH-TARGET\nSee equation~\\ref{eq:unresolved}.\n\\begin{equation} E=mc^2 \\end{equation}\n";
await writeFile(path.join(fixture, "main.tex"), main);
await writeFile(path.join(fixture, "chapters/results.tex"), chapter);
await writeFile(
  path.join(fixture, "references.bib"),
  "@book{example, title={NATIVE-SEARCH-TARGET}, year={2026}}\n",
);
const previous = await page.evaluate(() =>
  localStorage.getItem("roxena-last-project"),
);
const idle = () =>
  page.waitForFunction(
    () =>
      !document.querySelector(".compile-button")?.disabled &&
      document.querySelector(".compile-button")?.getAttribute("aria-busy") !==
        "true",
    null,
    { timeout: 90000 },
  );
const success = () =>
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
try {
  if (await page.getByRole("dialog").count())
    await page.keyboard.press("Escape");
  await idle();
  await page.evaluate(
    (root) => localStorage.setItem("roxena-last-project", root),
    fixture,
  );
  await page.reload();
  await success();
  if ((await page.locator(".live-value").textContent()) === "An")
    await page.locator(".live-toggle").click();
  await expect(page.locator(".textLayer")).toContainText(
    "Scientific workspace",
  );
  const selected = await page.locator(".textLayer").evaluate((layer) => {
    const span = [...layer.querySelectorAll("span")].find((span) =>
      span.textContent.includes("Scientific workspace"),
    );
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  expect(selected).toContain("Scientific workspace");
  await page.getByLabel("PDF-Seite", { exact: true }).fill("2");
  await page.keyboard.press("Enter");
  await expect(page.locator(".textLayer")).toContainText(
    "NATIVE-SEARCH-TARGET",
  );
  await page.getByLabel("PDF-Zoom", { exact: true }).selectOption("page");
  await page
    .getByRole("button", { name: "Projekt durchsuchen", exact: true })
    .click();
  await page.getByLabel("Suchbegriff").fill("NATIVE-SEARCH-TARGET");
  await expect(page.locator(".search-result")).toHaveCount(2);
  await page.locator(".search-result").first().click();
  await expect(page.locator(".file-tab.active")).toContainText("results.tex");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("NATIVE-SEARCH-TARGET");
  await page.keyboard.press("Control+j");
  await expect(page.locator(".diagnostic.warning").first()).toBeVisible();
  await page.getByRole("button", { name: /^Warnungen/ }).click();
  const warning = page
    .locator(".diagnostic.warning")
    .filter({ hasText: "eq:unresolved" })
    .first();
  await expect(warning).toContainText("Zeile 3");
  await expect(warning).toContainText("chapters/results.tex");
  await warning.click();
  await expect(page.locator(".status-cursor")).toContainText("Z 3");
  await page.screenshot({
    path: "test-results/simplelexeditor-native-probleme.png",
  });
  await page
    .getByRole("button", { name: "Protokoll schließen", exact: true })
    .click();
  await page.keyboard.press("Control+p");
  await page
    .getByRole("combobox", { name: "Datei suchen", exact: true })
    .fill("main");
  await page.keyboard.press("Enter");
  const code = page.getByRole("textbox", { name: "LaTeX-Code" });
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Home");
  await page.keyboard.type("\\SimpleLexEditorUndefinedCommand\n");
  // Live diagnostics must preserve the writing layout. Explicit compilation
  // still opens the full error report and both paths retain the last good PDF.
  await page.locator(".live-toggle").click();
  await expect(page.locator(".status-left")).toContainText("Compilerfehler", {
    timeout: 15000,
  });
  await idle();
  await expect(page.locator(".build-panel")).toHaveCount(0);
  await expect(
    page.getByText(
      "Die Kompilierung enthält Fehler. Details findest du im Protokoll.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await page.locator(".live-toggle").click();
  await page.getByRole("button", { name: /Kompilieren/ }).click();
  await idle();
  await expect(page.locator(".status-left")).toContainText("Compilerfehler");
  await expect(page.locator(".preview-status.error")).toContainText(
    "Letzte erfolgreiche PDF",
  );
  await expect(page.locator(".diagnostic.error").first()).toContainText(
    "Undefined control sequence",
  );
  await expect(page.locator(".diagnostic").first()).toHaveClass(/error/);
  await page.locator(".diagnostic.error").first().click();
  await expect(page.locator(".file-tab.active")).toContainText("main.tex");
  await page.getByRole("tab", { name: "Protokoll", exact: true }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Compilerprotokoll" }),
  ).toContainText("Undefined control sequence");
  await page.screenshot({
    path: "test-results/simplelexeditor-native-compilerfehler.png",
  });
  // Restore the known fixture through the editor and verify recovery.
  await code.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(main);
  await page.getByRole("button", { name: /Kompilieren/ }).click();
  await success();
  await expect(page.locator(".preview-status.error")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Protokoll schließen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Projektdateien", exact: true })
    .click();
  // Replace PDF data repeatedly while changing the available page height.
  // This catches calls into a destroyed PDF proxy during asynchronous reloads.
  for (let run = 0; run < 3; run++) {
    await page.getByRole("button", { name: /Kompilieren/ }).click();
    await success();
    await page.keyboard.press("Control+j");
    await page.keyboard.press("Control+j");
    await expect(page.locator(".textLayer")).toContainText(
      "NATIVE-SEARCH-TARGET",
    );
    await expect(page.locator(".render-indicator")).toHaveCount(0);
  }
  await page.screenshot({
    path: "test-results/simplelexeditor-native-workspace-dark.png",
  });
  await page
    .getByRole("button", { name: "Hellen Modus aktivieren", exact: true })
    .click();
  await page.waitForTimeout(250);
  await page.screenshot({
    path: "test-results/simplelexeditor-native-workspace-light.png",
  });
  await page
    .getByRole("button", { name: "Dunklen Modus aktivieren", exact: true })
    .click();
  await page.reload();
  await success();
  await expect(page.locator(".file-tab")).toHaveCount(2);
  await expect(page.locator(".file-tab.active")).toContainText("main.tex");
  // A fresh session has no last-good PDF; its error state must offer a useful
  // next action without opening a panel as a side effect of live preview.
  await writeFile(
    path.join(fixture, "main.tex"),
    main.replace(
      "\\end{document}",
      "\\SimpleLexEditorUndefinedCommand\n\\end{document}",
    ),
  );
  await page.reload();
  await expect(page.locator(".status-left")).toContainText("Compilerfehler", {
    timeout: 15000,
  });
  await idle();
  await expect(page.locator(".preview-empty")).toContainText(
    "PDF konnte nicht erstellt werden",
  );
  await expect(page.locator(".build-panel")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Probleme anzeigen", exact: true })
    .click();
  await expect(page.locator(".diagnostic.error").first()).toContainText(
    "Undefined control sequence",
  );
  await writeFile(path.join(fixture, "main.tex"), main);
  await page.reload();
  await success();
  expect(errors).toEqual([]);
  console.log(
    "PASS native workspace: multi-page selectable PDF, project search, exact navigation, warning locations, quiet live errors, explicit error reports, helpful empty-PDF recovery, last-good PDF, repeated PDF replacement, file picker, session restore and both themes.",
  );
} catch (error) {
  console.error("Browser errors:", errors);
  await page
    .screenshot({
      path: "test-results/simplelexeditor-native-workspace-failure.png",
    })
    .catch(() => {});
  throw error;
} finally {
  if (previous)
    await page.evaluate(
      (root) => localStorage.setItem("roxena-last-project", root),
      previous,
    );
  await browser.close();
}
