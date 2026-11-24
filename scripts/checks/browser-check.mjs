import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("requestfailed", (r) =>
  console.log("REQUEST FAILED:", r.url(), r.failure()),
);
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    console.log(m.type(), m.text());
});
await page.goto("http://127.0.0.1:1420", {
  waitUntil: "domcontentloaded",
  timeout: 20000,
});
await page
  .getByRole("textbox", { name: "LaTeX-Code" })
  .waitFor({ timeout: 20000 });
await page.locator(".paper-wrap canvas").waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: "test-results/simplelexeditor-dark.png" });
await page.getByRole("button", { name: "Hellen Modus aktivieren" }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: "test-results/simplelexeditor-light.png" });
console.log("TITLE", await page.title());
console.log(
  "PDF",
  await page
    .locator(".paper-wrap canvas")
    .evaluate((el) => ({ width: el.width, height: el.height })),
);
await browser.close();
