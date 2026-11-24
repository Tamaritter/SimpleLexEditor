import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
const browser = await chromium.connectOverCDP(
  "http://127.0.0.1:" + (process.env.SIMPLELEXEDITOR_TEST_PORT || "9224"),
);
const page = browser
  .contexts()[0]
  .pages()
  .find((page) => page.url().includes("tauri.localhost"));
if (!page) throw Error("Native test page unavailable");
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const previous = await page.evaluate(() =>
  localStorage.getItem("roxena-last-project"),
);
const fixture = path.resolve(
  `.tools/production-fixtures/${Date.now()}/Wissenschaftliche Arbeit`,
);
const source =
  "\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nNATIVE production.\n\\end{document}\n";
await mkdir(fixture, { recursive: true });
await writeFile(path.join(fixture, "main.tex"), source);
await writeFile(
  path.join(fixture, "dataset.csv.gz"),
  Buffer.from([31, 139, 8, 0, 1, 2, 3]),
);
const invoke = (command, args) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const idle = () =>
  page.waitForFunction(
    () =>
      !!document.querySelector(".compile-button") &&
      !document.querySelector(".compile-button").disabled &&
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
const stopLive = async () => {
  if ((await page.locator(".live-value").textContent()) === "An")
    await page.locator(".live-toggle").click();
  await idle();
};
const code = page.getByRole("textbox", { name: "LaTeX-Code" });
const replace = async (text) => {
  await code.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(text);
};
try {
  await idle();
  await page.evaluate(
    (root) => localStorage.setItem("roxena-last-project", root),
    fixture,
  );
  await page.reload();
  await success();
  await stopLive();
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  if (
    (await page
      .getByRole("switch", { name: "Automatisch speichern", exact: true })
      .getAttribute("aria-checked")) === "true"
  )
    await page
      .getByRole("switch", { name: "Automatisch speichern", exact: true })
      .click();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n% LOCAL-UNSAVED-SCIENTIFIC-RESULT");
  await expect
    .poll(
      async () =>
        (await invoke("recovery_draft", { path: "main.tex" }))?.content,
    )
    .toContain("LOCAL-UNSAVED-SCIENTIFIC-RESULT");
  expect(await readFile(path.join(fixture, "main.tex"), "utf8")).toBe(source);
  const external = source + "\n% EXTERNAL-COLLEAGUE-RESULT\n";
  await writeFile(path.join(fixture, "main.tex"), external);
  await page.keyboard.press("Control+s");
  await expect(
    page.getByRole("dialog", { name: "Dateifassungen vergleichen" }),
  ).toBeVisible();
  await expect(page.getByLabel("Deine Fassung", { exact: true })).toHaveValue(
    /LOCAL-UNSAVED-SCIENTIFIC-RESULT/,
  );
  await expect(page.getByLabel("Externe Fassung", { exact: true })).toHaveValue(
    /EXTERNAL-COLLEAGUE-RESULT/,
  );
  await page.screenshot({
    path: "test-results/simplelexeditor-native-konflikt.png",
  });
  await page
    .getByRole("button", {
      name: "Meine Fassung als neue Datei sichern",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const copy = (await readdir(fixture)).find(
    (name) => name.includes("-konflikt-") && name.endsWith(".tex"),
  );
  expect(copy).toBeTruthy();
  expect(await readFile(path.join(fixture, "main.tex"), "utf8")).toBe(external);
  const local = await readFile(path.join(fixture, copy), "utf8");
  expect(local).toContain("LOCAL-UNSAVED-SCIENTIFIC-RESULT");
  await replace(local + "\n% HISTORY-ONE\n");
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => readFile(path.join(fixture, copy), "utf8"))
    .toContain("HISTORY-ONE");
  await replace(local + "\n% HISTORY-TWO\n");
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => readFile(path.join(fixture, copy), "utf8"))
    .toContain("HISTORY-TWO");
  await page
    .getByRole("button", { name: "Ansicht und Werkzeuge", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Versionsverlauf und Wiederherstellung",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Sicherungsvorschau", { exact: true }),
  ).toHaveValue(/HISTORY-ONE/);
  await page.screenshot({
    path: "test-results/simplelexeditor-native-versionen.png",
  });
  await page
    .getByRole("button", {
      name: "Fassung im Editor wiederherstellen",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(code).toContainText("HISTORY-ONE");
  await expect(code).not.toContainText("HISTORY-TWO");
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => readFile(path.join(fixture, copy), "utf8"))
    .not.toContain("HISTORY-TWO");
  const versions = await invoke("list_backups", { path: copy });
  const texts = await Promise.all(
    versions.map((version) =>
      invoke("read_backup", { path: copy, id: version.id }),
    ),
  );
  expect(texts.some((text) => text.includes("HISTORY-TWO"))).toBe(true);
  const clean =
    (await readFile(path.join(fixture, copy), "utf8")) +
    "\n% CLEAN-EXTERNAL-UPDATE\n";
  await writeFile(path.join(fixture, copy), clean);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(code).toContainText("CLEAN-EXTERNAL-UPDATE", { timeout: 10000 });
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n% DELETED-FILE-RECOVERY");
  await expect
    .poll(async () => (await invoke("recovery_draft", { path: copy }))?.content)
    .toContain("DELETED-FILE-RECOVERY");
  const copiedPath = path.resolve(fixture, copy);
  if (path.dirname(copiedPath) !== fixture)
    throw Error("Unsafe test fixture path");
  await unlink(copiedPath);
  await page.reload();
  await code.waitFor();
  if (await page.getByRole("dialog").count())
    await page.keyboard.press("Escape");
  await stopLive();
  await page
    .locator(".file-tab")
    .filter({ hasText: copy })
    .locator("button")
    .first()
    .click();
  await expect(code).toContainText("DELETED-FILE-RECOVERY");
  await page
    .locator(".safety-banner")
    .getByRole("button", { name: "Fassungen vergleichen" })
    .click();
  await page
    .getByRole("button", {
      name: "Meine Fassung als neue Datei sichern",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const recovered = (await readdir(fixture)).find(
    (name) =>
      name.includes(copy.replace(/\.tex$/, "")) && name.endsWith(".tex"),
  );
  expect(recovered).toBeTruthy();
  await replace(
    "\\documentclass{article}\n\\begin{document}\n\\loop\\iftrue\\repeat\n\\end{document}\n",
  );
  await page.keyboard.press("Control+s");
  await page
    .getByLabel("Vorschaudokument", { exact: true })
    .selectOption(recovered);
  await expect(
    page.getByTitle("Kompilierung abbrechen", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  const cancelledAt = Date.now();
  await page.getByTitle("Kompilierung abbrechen", { exact: true }).click();
  await idle();
  expect(Date.now() - cancelledAt).toBeLessThan(7000);
  await expect(page.locator(".live-value")).toHaveText("Aus");
  await replace(source);
  await page.keyboard.press("Control+s");
  await page.getByRole("button", { name: /Kompilieren/ }).click();
  await success();
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  await page.getByRole("tab", { name: "LaTeX & PDF", exact: true }).click();
  await page
    .getByRole("button", { name: "Installation prüfen", exact: true })
    .click();
  await expect(
    page.locator(".toolchain-tool").filter({ hasText: "pdflatex" }),
  ).toContainText(/MiKTeX|pdfTeX|TeX Live/, { timeout: 20000 });
  await page.screenshot({
    path: "test-results/simplelexeditor-native-installationspruefung.png",
  });
  await page
    .getByRole("button", { name: "Zum Arbeitsbereich", exact: true })
    .click();
  const info = await invoke("open_project", { path: fixture });
  const conflictResult = await invoke("write_file", {
    path: "main.tex",
    content: "bad",
    expected: "wrong baseline",
    projectRoot: info.root,
  }).then(
    () => "UNEXPECTED SUCCESS",
    (error) => String(error),
  );
  expect(conflictResult).toContain("SAVE_CONFLICT");
  expect(await readFile(path.join(fixture, "main.tex"), "utf8")).toBe(external);
  await expect(
    invoke("write_file", {
      path: "../outside.tex",
      content: "bad",
      expected: "",
      projectRoot: info.root,
    }),
  ).rejects.toBeTruthy();
  const archive = path.join(fixture, "research.zip");
  await invoke("export_zip", { destination: archive });
  const zipped = unzipSync(await readFile(archive));
  expect(zipped["dataset.csv.gz"]).toBeTruthy();
  expect(zipped["research.zip"]).toBeUndefined();
  expect(Object.keys(zipped).some((name) => name.startsWith(".roxena/"))).toBe(
    false,
  );
  const many = path.join(fixture, "chapters", "large-project");
  await mkdir(many, { recursive: true });
  for (let i = 0; i < 1000; i++)
    await writeFile(
      path.join(many, `section-${String(i).padStart(4, "0")}.tex`),
      `% UNIQUE-ENTRY-${String(i).padStart(4, "0")}\n\\section{Section ${i}}\nResearch text.\n`,
    );
  await page.locator(".folder-root").click({ button: "right" });
  await page.getByRole("menuitem", { name: /aktualisieren/i }).click();
  await page
    .getByRole("button", { name: "Projekt durchsuchen", exact: true })
    .click();
  await page.getByLabel("Suchbegriff").fill("UNIQUE-ENTRY-0999");
  await expect(page.locator(".search-result")).toHaveCount(1, {
    timeout: 30000,
  });
  await page.locator(".search-result").click();
  await expect(code).toContainText("UNIQUE-ENTRY-0999");
  await page.screenshot({
    path: "test-results/simplelexeditor-native-grosses-projekt.png",
  });
  await page.addInitScript(() => {
    if (location.search.includes("storage-blocked")) {
      for (const name of ["getItem", "setItem", "removeItem"])
        Object.defineProperty(Storage.prototype, name, {
          value() {
            throw new DOMException(
              "Storage disabled by test policy",
              "SecurityError",
            );
          },
        });
    }
  });
  await page.goto("http://tauri.localhost/?storage-blocked=1");
  await code.waitFor();
  await stopLive();
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  if (
    (await page
      .getByRole("switch", { name: "Automatisch speichern", exact: true })
      .getAttribute("aria-checked")) === "true"
  )
    await page
      .getByRole("switch", { name: "Automatisch speichern", exact: true })
      .click();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n% WITHOUT-WEB-STORAGE");
  await expect
    .poll(
      async () =>
        (await invoke("recovery_draft", { path: "main.tex" }))?.content,
    )
    .toContain("WITHOUT-WEB-STORAGE");
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => readFile(path.join(fixture, "main.tex"), "utf8"))
    .toContain("WITHOUT-WEB-STORAGE");
  await page.goto("http://tauri.localhost/");
  await code.waitFor();
  await stopLive();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(async () => {
      const response = await fetch("/pdfjs/wasm/openjpeg.wasm");
      if (!response.ok) return false;
      await WebAssembly.compile(await response.arrayBuffer());
      return true;
    }),
  ).toBe(true);
  console.log(
    "PASS production safety: durable unsaved drafts, external conflicts, preserved copies, version restore, external reload, deleted-file recovery, compiler cancellation and recovery, TeX detection, backend compare-and-save, path protection, streamed ZIP with research data, and a 1000-file project.",
  );
} catch (error) {
  console.error("Browser errors:", errors);
  await page
    .screenshot({
      path: "test-results/simplelexeditor-native-production-failure.png",
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
