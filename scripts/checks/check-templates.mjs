import { spawnSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { templates, welcome } from "../../src/core/model.ts";
const checks = [
  ...templates.map((t) => ({
    name: t.id,
    content: t.content,
    engine: "pdflatex",
  })),
  ...["xelatex", "lualatex"].map((engine) => ({
    name: engine,
    content: welcome,
    engine,
  })),
];
for (const check of checks) {
  const folder = path.resolve(".tools/template-check", check.name);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "main.tex"), check.content);
  const result = spawnSync(
    check.engine,
    [
      "-interaction=nonstopmode",
      "-halt-on-error",
      "-no-shell-escape",
      ...(check.engine === "lualatex" ? [] : ["-max-print-line=1000"]),
      "main.tex",
    ],
    { cwd: folder, windowsHide: true, timeout: 90000, encoding: "utf8" },
  );
  await writeFile(
    path.join(folder, "validation.log"),
    (result.stdout || "") + (result.stderr || ""),
  );
  if (result.status !== 0)
    throw Error(
      `${check.name}: ${result.error || result.stdout?.slice(-1500)}`,
    );
  if (
    !(await readFile(path.join(folder, "main.pdf")))
      .subarray(0, 4)
      .equals(Buffer.from("%PDF"))
  )
    throw Error(`Keine PDF: ${check.name}`);
  console.log(`PASS ${check.engine}: ${check.name}`);
}
