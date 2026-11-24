import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { templates, welcome } from "../../src/core/model.ts";
const browser = await chromium.connectOverCDP(
  `http://127.0.0.1:${process.env.SIMPLELEXEDITOR_TEST_PORT || "9224"}`,
);
try {
  const page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes("tauri.localhost"));
  if (!page) throw Error("Native SimpleLexEditor test window missing");
  await page.waitForFunction(
    () =>
      document
        .querySelector(".status-left")
        ?.textContent?.includes("Erfolgreich"),
    null,
    { timeout: 1800000 },
  );
  if ((await page.locator(".live-value").textContent()) === "An")
    await page.locator(".live-toggle").click();
  const tools = await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("inspect_toolchain", { directory: "" }),
  );
  for (const name of ["pdflatex", "xelatex", "lualatex", "bibtex", "biber"]) {
    const tool = tools.find((tool) => tool.name === name);
    expect(tool?.available, `${name} must be bundled`).toBe(true);
    expect(tool?.path?.replaceAll("\\", "/")).toContain(
      "/TinyTeX/bin/windows/",
    );
  }
  const root = path.resolve(".tools/bundled-tex-native", `${Date.now()}`);
  await fs.mkdir(root, { recursive: true });
  for (const item of [
    ...templates.map((template) => ({
      name: template.id,
      engine: "pdflatex",
      content: template.content,
    })),
    ...["xelatex", "lualatex"].map((engine) => ({
      name: engine,
      engine,
      content: welcome,
    })),
  ]) {
    const directory = path.join(root, item.name);
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, "main.tex"), item.content);
    await page.evaluate(
      (directory) =>
        window.__TAURI_INTERNALS__.invoke("open_project", { path: directory }),
      directory,
    );
    const result = await page.evaluate(
      (engine) =>
        window.__TAURI_INTERNALS__.invoke("compile_project", {
          main: "main.tex",
          engine,
          directory: "",
          timeoutSeconds: 180,
        }),
      item.engine,
    );
    expect(result.success, `${item.name}: ${result.log.slice(-3000)}`).toBe(
      true,
    );
    expect(Buffer.from(result.pdf, "base64").subarray(0, 4).toString()).toBe(
      "%PDF",
    );
    console.log(
      `PASS bundled ${item.engine}: ${item.name} (${result.durationMs} ms)`,
    );
  }
  // Synchronize the UI with the backend before the remaining native suites.
  await page.reload();
  await fs.writeFile(
    path.join(root, "verification.json"),
    JSON.stringify(
      { checkedAt: new Date().toISOString(), tools, passed: true },
      null,
      2,
    ),
  );
  console.log("PASS all standard tools and templates use bundled TeX");
} finally {
  await browser.close();
}
