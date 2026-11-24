import { test, expect } from "@playwright/test";

test("keeps the sidebar toggle anchored on the left when collapsed and in focus mode", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  for (const width of [1500, 1000]) {
    await page.setViewportSize({ width, height: 800 });
    const hide = page.getByRole("button", {
      name: "Seitenleiste ausblenden",
      exact: true,
    });
    await expect(hide).toHaveAttribute("aria-expanded", "true");
    const initial = (await hide.boundingBox())!;
    expect(initial.x).toBeLessThan(44);
    await hide.click();
    await expect(page.locator(".sidebar")).toHaveCount(0);
    const show = page.getByRole("button", {
      name: "Seitenleiste anzeigen",
      exact: true,
    });
    await expect(show).toHaveAttribute("aria-expanded", "false");
    const collapsed = (await show.boundingBox())!;
    expect(collapsed.x).toBe(initial.x);
    expect(collapsed.y).toBe(initial.y);
    await page.screenshot({
      path: `test-results/sidebar-toggle-collapsed-${width}.png`,
    });
    await show.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".sidebar")).toBeVisible();
    await page
      .getByRole("button", { name: "Projektdateien", exact: true })
      .click();
    expect((await show.boundingBox())!.x).toBe(initial.x);
    await show.click();
    await page.keyboard.press("Control+Shift+f");
    const exit = page.getByRole("button", {
      name: "Fokusmodus beenden",
      exact: true,
    });
    await expect(exit).toBeVisible();
    const focused = (await exit.boundingBox())!;
    expect(focused.x).toBe(initial.x);
    expect(focused.y).toBe(initial.y);
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await exit.click();
    await expect(page.locator(".sidebar")).toBeVisible();
    expect((await hide.boundingBox())!.x).toBe(initial.x);
  }
});

test("distinguishes matching tab names, remembers the folded outline and presents insertion choices clearly", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("roxena-browser-files"))
      localStorage.setItem(
        "roxena-browser-files",
        JSON.stringify({
          "main.tex":
            "\\documentclass{article}\n\\begin{document}\n\\section{Forschung}\n\\end{document}",
          "methods/results.tex": "\\section{Methoden}\nErgebnisse der Methode.",
          "analysis/results.tex":
            "\\section{Auswertung}\nErgebnisse der Auswertung.",
        }),
      );
  });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  for (const file of ["methods/results", "analysis/results"]) {
    await page.keyboard.press("Control+p");
    await page
      .getByRole("combobox", { name: "Datei suchen", exact: true })
      .fill(file);
    await page.keyboard.press("Enter");
    await expect(
      page.locator(".file-tab.active > button").first(),
    ).toHaveAttribute("aria-label", `${file}.tex`);
  }
  await expect(page.locator(".tab-folder")).toHaveText(["methods", "analysis"]);
  const outline = page.getByRole("button", {
    name: "Dokumentstruktur",
    exact: true,
  });
  await outline.click();
  await expect(outline).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".outline-list")).toBeHidden();
  await page.reload();
  await expect(outline).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".file-tab.active")).toContainText("analysis");
  await outline.click();
  await expect(page.locator(".outline-list")).toContainText("Auswertung");
  await page.screenshot({
    path: "test-results/simplelexeditor-refined-tabs.png",
  });
  await page.getByRole("button", { name: "Einfügen", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: /^Tabelle / })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Fett / })).toBeVisible();
  await page.screenshot({
    path: "test-results/simplelexeditor-refined-insert-dark.png",
  });
  await page.getByPlaceholder("Element suchen …").fill("Tabelle");
  await expect(dialog.locator(".insert-catalog > button")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Hellen Modus aktivieren" }).click();
  await page.getByRole("button", { name: "Einfügen", exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({
    path: "test-results/simplelexeditor-refined-insert-light.png",
  });
});

test("keeps a single compact header and makes secondary actions reachable by keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1466, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  await expect(page.locator(".textLayer")).toContainText("Unendlichkeit");
  await expect
    .poll(() =>
      page.locator(".paper-wrap canvas").evaluate((node) => {
        const canvas = node as HTMLCanvasElement;
        const pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let ink = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] < 180 && pixels[i + 3] > 0) ink++;
        return ink;
      }),
    )
    .toBeGreaterThan(1000);
  const header = page.getByRole("banner");
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(56);
  expect(
    (await page.locator(".app-body").boundingBox())!.y,
  ).toBeLessThanOrEqual(56);
  await expect(
    header.getByRole("button", { name: /Kompilieren/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/simplelexeditor-compact-header-dark.png",
  });

  const projectMenu = page.getByRole("button", { name: /^Projektmenü:/ });
  await projectMenu.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("button", { name: "Projekt öffnen", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Projektname");
  await page.keyboard.press("Escape");
  const tools = page.getByRole("button", {
    name: "Ansicht und Werkzeuge",
    exact: true,
  });
  await tools.click();
  await expect(
    page.getByRole("group", { name: "Ansicht und Werkzeuge" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tools).toBeFocused();
  await expect(tools).toHaveAttribute("aria-expanded", "false");
  await tools.click();
  await page.getByRole("textbox", { name: "LaTeX-Code" }).click();
  await expect(tools).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "Hellen Modus aktivieren" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.waitForTimeout(200);
  await page.screenshot({
    path: "test-results/simplelexeditor-compact-header-light.png",
  });
  await page.setViewportSize({ width: 900, height: 650 });
  expect(
    await header.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", {
      name: "Mathematik öffnen (Strg+M)",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Literatur, Querverweise und Beweise",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/simplelexeditor-compact-header-small.png",
  });
});

test("renders PDFs when newer JavaScript APIs are absent", async ({ page }) => {
  await page.addInitScript(() => {
    for (const [object, name] of [
      [Map.prototype, "getOrInsertComputed"],
      [WeakMap.prototype, "getOrInsertComputed"],
      [Promise, "try"],
    ] as const)
      Object.defineProperty(object, name, {
        value: undefined,
        writable: true,
        configurable: true,
      });
  });
  await page.goto("/");
  await expect(page.locator(".textLayer")).toContainText("Unendlichkeit", {
    timeout: 20000,
  });
  expect((await page.request.get("/pdfjs/wasm/openjpeg.wasm")).ok()).toBe(true);
  expect(
    (await page.request.get("/pdfjs/standard_fonts/FoxitSerif.pfb")).ok(),
  ).toBe(true);
});

test("keeps writing tools accessible in a compact desktop window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  expect(
    await page
      .locator(".editor-toolbar")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await expect(
    page.getByRole("button", {
      name: "Mathematik öffnen (Strg+M)",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Literatur, Querverweise und Beweise",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/simplelexeditor-compact.png" });
});

test("searches unopened project files, includes live edits and selects exact matches", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "roxena-browser-files",
      JSON.stringify({
        "main.tex":
          "\\documentclass{article}\n\\begin{document}\nMain\n\\end{document}",
        "chapters/results.tex":
          "\\section{Results}\nA TARGET and TARGETed\nTARGET again",
        "literature.bib": "@book{example, title={TARGET book}}",
      }),
    );
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Projekt durchsuchen", exact: true })
    .click();
  await page.getByLabel("Suchbegriff").fill("TARGET");
  await expect(page.locator(".search-result")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Nur ganze Wörter", exact: true })
    .click();
  await expect(page.locator(".search-result")).toHaveCount(3);
  await page.locator(".search-result").first().click();
  await expect(page.locator(".file-tab.active")).toContainText("results.tex");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("TARGET");
  await page.keyboard.type("NEEDLE");
  await page.getByLabel("Suchbegriff").fill("NEEDLE");
  await expect(page.locator(".search-result")).toHaveCount(1);
  await page.getByLabel("Suchbereich").selectOption("file");
  await expect(page.locator(".search-result")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/simplelexeditor-projektsuche.png",
  });
});

test("opens files and commands with the keyboard and restores tabs across restart", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "LaTeX-Code" })).toBeVisible();
  await page
    .getByRole("button", { name: "Datei hinzufügen", exact: true })
    .click();
  await page
    .getByLabel("Dateiname", { exact: true })
    .fill("chapters/research.tex");
  await page
    .getByRole("button", { name: "Datei erstellen", exact: true })
    .click();
  await page.keyboard.press("Control+p");
  await page
    .getByRole("combobox", { name: "Datei suchen", exact: true })
    .fill("main");
  await page.keyboard.press("Enter");
  await expect(page.locator(".file-tab.active")).toContainText("main.tex");
  await page.keyboard.press("Control+p");
  await page
    .getByRole("combobox", { name: "Datei suchen", exact: true })
    .fill("chap research");
  await page.screenshot({
    path: "test-results/simplelexeditor-dateisuche.png",
  });
  await page.keyboard.press("Enter");
  await expect(page.locator(".file-tab.active")).toContainText("research.tex");
  await page.reload();
  await expect(page.locator(".file-tab")).toHaveCount(2);
  await expect(page.locator(".file-tab.active")).toContainText("research.tex");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Befehl suchen …").fill("Einstellungen");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Schriftgröße");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+j");
  await expect(
    page.getByRole("region", { name: "Kompilierung und Probleme" }),
  ).toBeVisible();
});

test("offers selectable PDF text, direct zoom and validates page input", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".textLayer")).toContainText("Unendlichkeit", {
    timeout: 20000,
  });
  await page.getByLabel("PDF-Zoom", { exact: true }).selectOption("page");
  await expect(page.locator(".textLayer")).toContainText("Unendlichkeit");
  await page.getByLabel("PDF-Zoom", { exact: true }).selectOption("125");
  await expect
    .poll(() =>
      page
        .locator(".paper-wrap canvas")
        .evaluate((el) => parseFloat((el as HTMLCanvasElement).style.width)),
    )
    .toBeGreaterThan(700);
  await page.getByLabel("PDF-Seite", { exact: true }).fill("99");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("PDF-Seite", { exact: true })).toHaveValue("1");
  await page.getByLabel("PDF-Zoom", { exact: true }).selectOption("width");
  await expect
    .poll(() =>
      page.locator(".paper-wrap canvas").evaluate((el) => {
        const canvas = el as HTMLCanvasElement;
        const pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let ink = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] < 180 && pixels[i + 3] > 0) ink++;
        return ink;
      }),
    )
    .toBeGreaterThan(1000);
  await expect(page.locator(".render-indicator")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/simplelexeditor-workspace-professional.png",
  });
  await page.getByRole("button", { name: "Hellen Modus aktivieren" }).click();
  await page.waitForTimeout(250);
  await page.screenshot({
    path: "test-results/simplelexeditor-workspace-light.png",
  });
  expect(errors).toEqual([]);
});
