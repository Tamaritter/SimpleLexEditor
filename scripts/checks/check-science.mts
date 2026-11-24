import { spawnSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { mathCatalog } from "../../src/math/mathCatalog.ts";
import {
  ensurePreamble,
  matrixCode,
  theoremBlocks,
} from "../../src/research/scientific.ts";
const folder = path.resolve(".tools/scientific-validation");
await mkdir(folder, { recursive: true });
let source =
  "\\documentclass{article}\n\\begin{document}\n\\section{Scientific validation}\n";
source += mathCatalog
  .map(
    (entry) =>
      `\\noindent ${entry.name.replace(/&/g, "\\&")}\n\\[\n${entry.code}\n\\]\n`,
  )
  .join("\n");
source += "\\[" + matrixCode(3, 4, "bmatrix", ["1", "2", "\\alpha"]) + "\\]\n";
source +=
  theoremBlocks.map((block) => block.code).join("\n") + "\\end{document}\n";
source = ensurePreamble(source, {
  packages: ["amsmath", "amssymb", "amsthm", "mathtools"],
  declarations: theoremBlocks.map((b) => b.declaration).filter(Boolean),
}).source;
await writeFile(path.join(folder, "main.tex"), source);
const run = spawnSync(
  "pdflatex",
  [
    "-interaction=nonstopmode",
    "-halt-on-error",
    "-no-shell-escape",
    "-max-print-line=1000",
    "main.tex",
  ],
  { cwd: folder, encoding: "utf8", windowsHide: true, timeout: 90000 },
);
await writeFile(
  path.join(folder, "validation.log"),
  (run.stdout || "") + (run.stderr || ""),
);
if (run.status !== 0)
  throw Error(run.error?.message || run.stdout?.slice(-2500) || run.stderr);
if (
  !(await readFile(path.join(folder, "main.pdf")))
    .subarray(0, 4)
    .equals(Buffer.from("%PDF"))
)
  throw Error("No PDF produced");
console.log(
  `PASS: ${mathCatalog.length} math library items, rectangular matrix and ${theoremBlocks.length} theorem/proof environments compiled with pdfLaTeX.`,
);
