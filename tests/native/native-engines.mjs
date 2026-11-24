import { chromium, expect } from "@playwright/test";
const browser = await chromium.connectOverCDP(
  "http://127.0.0.1:" + (process.env.SIMPLELEXEDITOR_TEST_PORT || "9223"),
);
const page = browser
  .contexts()[0]
  .pages()
  .find((p) => p.url().includes("tauri.localhost") || p.url().includes("1420"));
if (!page) throw Error("SimpleLexEditor läuft nicht.");
await page.waitForFunction(
  () =>
    document
      .querySelector(".status-left")
      ?.textContent?.includes("Erfolgreich"),
  null,
  { timeout: 90000 },
);
const wasLive = (await page.locator(".live-value").textContent()) === "An";
if (wasLive) await page.locator(".live-toggle").click();
try {
  for (const engine of ["pdflatex", "xelatex", "lualatex"]) {
    const result = await page.evaluate(
      (engine) =>
        window.__TAURI_INTERNALS__.invoke("compile_project", {
          main: "main.tex",
          engine,
        }),
      engine,
    );
    expect(result.success, result.log.slice(-2000)).toBe(true);
    expect(Buffer.from(result.pdf, "base64").subarray(0, 4).toString()).toBe(
      "%PDF",
    );
    console.log(`PASS native ${engine}: ${result.durationMs} ms`);
  }
} finally {
  if (wasLive) await page.locator(".live-toggle").click();
  await browser.close();
}
