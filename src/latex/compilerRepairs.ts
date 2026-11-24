import type { CompilerFix } from "./compilerFixes";
import { missingResource } from "./compilerHelp";
import {
  ensurePreamble,
  inMath,
  parseBib,
  parseLabels,
  preambleDependencies,
} from "../research/scientific";
import { environmentStack, maskTex } from "../editor/texAnalysis";
import { repairDocumentStart } from "./documentRepairs";
import { resolveDiagnosticFile, type Diagnostic } from "../app/workspace";

const commandPackages: Record<string, string> = Object.fromEntries(
  [
    [
      "amsmath",
      "dfrac tfrac text operatorname eqref overset underset boxed substack boldsymbol numberwithin tag notag",
    ],
    [
      "amssymb",
      "mathbb mathfrak varnothing leqslant geqslant lesssim gtrsim nleq ngeq blacksquare square therefore because",
    ],
    ["graphicx", "includegraphics scalebox resizebox rotatebox"],
    ["hyperref", "href url autoref hyperref phantomsection"],
    ["booktabs", "toprule midrule bottomrule cmidrule addlinespace"],
    ["xcolor", "textcolor color colorbox fcolorbox definecolor pagecolor"],
    ["siunitx", "SI si num qty unit"],
    ["multirow", "multirow"],
    ["cancel", "cancel bcancel xcancel cancelto"],
  ].flatMap(([pkg, names]) => names.split(" ").map((name) => [name, pkg])),
);
const environmentPackages: Record<string, string> = {
  cases: "amsmath",
  aligned: "amsmath",
  alignedat: "amsmath",
  gathered: "amsmath",
  split: "amsmath",
  smallmatrix: "amsmath",
  tikzpicture: "tikz",
  lstlisting: "listings",
  longtable: "longtable",
  multicols: "multicol",
  landscape: "pdflscape",
  subfigure: "subcaption",
  subtable: "subcaption",
  comment: "comment",
};
const typos: Record<string, string> = {
  textbold: "textbf",
  textitalics: "textit",
  textitalic: "textit",
  incluegraphics: "includegraphics",
  includegraphic: "includegraphics",
  begn: "begin",
  beign: "begin",
  ennd: "end",
  secton: "section",
  subsecton: "subsection",
  usepakage: "usepackage",
  usepackge: "usepackage",
  fracd: "dfrac",
};
const unicodeMath: Record<string, string> = {
  α: "alpha",
  β: "beta",
  γ: "gamma",
  δ: "delta",
  ε: "varepsilon",
  θ: "theta",
  λ: "lambda",
  μ: "mu",
  π: "pi",
  ρ: "rho",
  σ: "sigma",
  φ: "varphi",
  ω: "omega",
  Γ: "Gamma",
  Δ: "Delta",
  Θ: "Theta",
  Λ: "Lambda",
  Π: "Pi",
  Σ: "Sigma",
  Φ: "Phi",
  Ω: "Omega",
  "≤": "leq",
  "≥": "geq",
  "≠": "neq",
  "≈": "approx",
  "∞": "infty",
  "∈": "in",
  "∉": "notin",
  "∅": "emptyset",
  "⊂": "subset",
  "⊆": "subseteq",
  "∪": "cup",
  "∩": "cap",
  "→": "rightarrow",
  "←": "leftarrow",
  "↔": "leftrightarrow",
  "⇒": "Rightarrow",
  "⇔": "Leftrightarrow",
  "∀": "forall",
  "∃": "exists",
  "∂": "partial",
  "∇": "nabla",
  "×": "times",
  "±": "pm",
  "−": "mathord{-}",
  "∑": "sum",
  "∏": "prod",
  "∫": "int",
  ℝ: "mathbb{R}",
  ℕ: "mathbb{N}",
  ℤ: "mathbb{Z}",
  ℚ: "mathbb{Q}",
  ℂ: "mathbb{C}",
};

export function additionalCompilerFixes(
  diagnostics: Diagnostic[],
  main: string,
  sources: Record<string, string>,
  initial: CompilerFix[],
  projectPaths: string[],
) {
  const changes = new Map(initial.map((c) => [c.file, c]));
  const paths = Object.keys(sources);
  const current = (file: string) => changes.get(file)?.after ?? sources[file];
  const record = (file: string, after: string, reason: string) => {
    if (after === current(file)) return;
    const reasons = [
      ...new Set([...(changes.get(file)?.reasons || []), reason]),
    ];
    changes.set(file, { file, before: sources[file], after, reasons });
  };
  // A previous repair may shift lines. Reuse a line only when its full text is
  // still uniquely identifiable; otherwise the next compilation will locate it.
  const target = (d: Diagnostic) => {
    const file = resolveDiagnosticFile(d.file, paths, main);
    if (!file || !d.line) return null;
    const beforeLines = sources[file].split(/\r?\n/);
    const oldLine = beforeLines[d.line - 1];
    if (oldLine === undefined) return null;
    const source = current(file);
    const lines = source.split(/\r?\n/);
    const matches = lines.flatMap((line, i) => (line === oldLine ? [i] : []));
    const row =
      source === sources[file]
        ? d.line - 1
        : matches.length === 1
          ? matches[0]
          : -1;
    if (row < 0) return null;
    let start = 0;
    for (let i = 0; i < row; i++) start = source.indexOf("\n", start) + 1;
    const line = lines[row];
    const clean = maskTex(source).slice(start, start + line.length);
    return { file, source, line, clean, start };
  };
  const packages = new Set<string>();
  const requirePackage = (name: string) => packages.add(name);
  const labels = Object.entries(sources).flatMap(([file, text]) =>
    parseLabels(maskTex(text), file).map((l) => l.key),
  );
  const citations = Object.entries(sources)
    .filter(([file]) => /\.bib$/i.test(file))
    .flatMap(([file, text]) => parseBib(text, file).map((b) => b.key));

  for (const d of diagnostics) {
    const t = target(d);
    if (/Undefined control sequence/i.test(d.message) && d.command && t) {
      const command = d.command;
      const tokens = [...t.clean.matchAll(/\\([a-zA-Z]+)/g)].filter(
        (m) => m[1] === command,
      );
      // No edits to a macro call when the undefined token is in its expansion.
      if (tokens.length === 1) {
        const replacement = typos[command];
        if (replacement) {
          const at = tokens[0].index;
          record(
            t.file,
            t.source.slice(0, t.start + at) +
              "\\" +
              replacement +
              t.source.slice(t.start + at + command.length + 1),
            `Befehl \\${command} durch \\${replacement} ersetzen.`,
          );
        }
        const pkg = commandPackages[replacement || command];
        if (pkg) requirePackage(pkg);
      }
    }
    const env = d.message.match(/Environment ([a-zA-Z]+\*?) undefined/i)?.[1];
    if (env && t?.clean.includes(`\\begin{${env}}`) && environmentPackages[env])
      requirePackage(environmentPackages[env]);
    if (
      /Unknown float option [`'"]?H/i.test(d.message) &&
      t &&
      /\\begin\{(?:figure|table)\}\s*\[H\]/.test(t.clean)
    )
      requirePackage("float");

    const missing = missingResource(d.message);
    if (missing && t && !/\.(?:sty|cls|def|fd|bst)$/i.test(missing)) {
      const tokens = [
        ...t.clean.matchAll(
          /\\(input|include|includegraphics|addbibresource|bibliography)(?:\s*\[[^\]]*\])?\s*\{([^{}]+)\}/g,
        ),
      ];
      for (const token of tokens) {
        const requested = token[2];
        const ext =
          token[1] === "includegraphics"
            ? /\.(?:pdf|png|jpe?g)$/i
            : token[1] === "input" || token[1] === "include"
              ? /\.tex$/i
              : /\.bib$/i;
        const stem = (value: string) =>
          value
            .replaceAll("\\", "/")
            .split("/")
            .pop()!
            .replace(ext, "")
            .toLocaleLowerCase();
        if (stem(missing) !== stem(requested)) continue;
        const candidates = projectPaths.filter(
          (p) => ext.test(p) && stem(p) === stem(requested),
        );
        const alreadyValid = projectPaths.some(
          (p) =>
            p === requested ||
            p ===
              requested +
                (token[1] === "includegraphics"
                  ? ""
                  : ext.test("a.tex")
                    ? ".tex"
                    : ".bib"),
        );
        if (
          candidates.length !== 1 ||
          alreadyValid ||
          /[{}%#]/.test(candidates[0])
        )
          continue;
        const replacement = ["include", "bibliography"].includes(token[1])
          ? candidates[0].replace(ext, "")
          : candidates[0];
        const at = token.index + token[0].lastIndexOf("{") + 1;
        record(
          t.file,
          t.source.slice(0, t.start + at) +
            replacement +
            t.source.slice(t.start + at + requested.length),
          `Dateipfad „${requested}“ durch vorhandene Projektdatei „${replacement}“ ersetzen.`,
        );
        break;
      }
    }
    if (t && /Unicode character/i.test(d.message)) {
      const codepoint = d.message.match(/U\+([0-9A-F]{4,6})/i)?.[1];
      const point = codepoint ? parseInt(codepoint, 16) : 0;
      const char =
        point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
      const command = unicodeMath[char];
      if (command && t.clean.includes(char)) {
        let line = t.line;
        const positions = [...t.clean.matchAll(new RegExp(char, "gu"))].map(
          (m) => m.index,
        );
        for (const at of positions.reverse())
          line =
            line.slice(0, at) +
            `\\ensuremath{\\${command}}` +
            line.slice(at + char.length);
        record(
          t.file,
          t.source.slice(0, t.start) +
            line +
            t.source.slice(t.start + t.line.length),
          `Unicode-Zeichen „${char}“ als LaTeX-Mathematik setzen.`,
        );
        if (command.startsWith("mathbb")) requirePackage("amssymb");
      }
    }
    if (t && /Misplaced alignment tab character &/i.test(d.message)) {
      const ampersands = [...t.clean.matchAll(/(?<!\\)&/g)];
      const stack = environmentStack(t.source, t.start);
      if (
        ampersands.length === 1 &&
        stack?.length === 1 &&
        stack[0] === "document" &&
        !inMath(maskTex(t.source), t.start + ampersands[0].index)
      ) {
        const at = t.start + ampersands[0].index;
        record(
          t.file,
          t.source.slice(0, at) + "\\&" + t.source.slice(at + 1),
          "Kaufmännisches Und im Fließtext als \\& setzen.",
        );
      }
    }
    if (
      t &&
      /There's no line here to end/i.test(d.message) &&
      /^\s*\\(?:\\|newline)\s*$/.test(t.clean)
    ) {
      const stack = environmentStack(t.source, t.start);
      const previous = maskTex(t.source.slice(0, t.start)).trimEnd();
      if (
        stack?.length === 1 &&
        stack[0] === "document" &&
        !inMath(maskTex(t.source), t.start) &&
        /\n[ \t]*\r?\n$/.test(t.source.slice(0, t.start)) &&
        previous.includes("\\begin{document}")
      )
        record(
          t.file,
          t.source.slice(0, t.start) +
            "\\par" +
            t.source.slice(t.start + t.line.length),
          "Unzulässigen alleinstehenden Zeilenumbruch durch Absatzwechsel \\par ersetzen.",
        );
    }
    const mismatch = d.message.match(
      /\\begin\{([^}]+)\} on input line \d+ ended by \\end\{([^}]+)\}/,
    );
    if (mismatch && t) {
      const [open, close] = mismatch.slice(1);
      const clean = maskTex(t.source);
      const stack = environmentStack(t.source, t.start);
      if (
        /^[a-zA-Z*]+$/.test(open) &&
        /^[a-zA-Z*]+$/.test(close) &&
        stack?.at(-1) === open &&
        !clean.includes(`\\begin{${close}}`) &&
        t.clean.trim() === `\\end{${close}}` &&
        !clean.slice(t.start + t.line.length).includes(`\\end{${open}}`)
      ) {
        record(
          t.file,
          t.source.slice(0, t.start) +
            t.line.replace(`\\end{${close}}`, `\\end{${open}}`) +
            t.source.slice(t.start + t.line.length),
          `Umgebung „${open}“ mit passendem Abschluss schließen.`,
        );
      }
    }
    if (
      t &&
      /(?:Citation|Reference) [`'"]([^`'"]+)[`'"][\s\S]*undefined/i.test(
        d.message,
      )
    ) {
      const key = d.message.match(
        /(?:Citation|Reference) [`'"]([^`'"]+)[`'"]/i,
      )![1];
      const isCitation = /Citation/i.test(d.message);
      const known = isCitation ? citations : labels;
      const candidates = [
        ...new Set(
          known.filter(
            (k) => k.toLocaleLowerCase() === key.toLocaleLowerCase(),
          ),
        ),
      ];
      if (!known.includes(key) && candidates.length === 1) {
        const pattern = isCitation
          ? /\\(?:cite[a-zA-Z]*|[a-zA-Z]*cite)(?:\s*\[[^\]]*\])*\s*\{([^}]+)\}/g
          : /\\(?:ref|eqref|pageref|autoref|cref|Cref)\s*\{([^}]+)\}/g;
        let line = t.line;
        for (const token of [...t.clean.matchAll(pattern)].reverse()) {
          const keys = token[1].split(",");
          if (!keys.some((k) => k.trim() === key)) continue;
          const replacement = keys
            .map((k) => (k.trim() === key ? k.replace(key, candidates[0]) : k))
            .join(",");
          const at = token.index + token[0].lastIndexOf("{") + 1;
          line =
            line.slice(0, at) + replacement + line.slice(at + token[1].length);
        }
        record(
          t.file,
          t.source.slice(0, t.start) +
            line +
            t.source.slice(t.start + t.line.length),
          `Groß-/Kleinschreibung des ${isCitation ? "Zitier" : "Verweis"}schlüssels an „${candidates[0]}“ anpassen.`,
        );
      }
    }
  }
  if (current(main) !== undefined) {
    const repaired = repairDocumentStart(current(main), diagnostics, main);
    if (repaired !== null)
      record(
        main,
        repaired,
        "Dokumentbeginn ergänzen oder vorangestellten Text, Verweise und vollständige Abbildungs- und Tabellenblöcke in das Dokument übernehmen; Inhalt erhalten.",
      );
  }
  const mainSource = current(main);
  if (mainSource !== undefined) {
    const clean = maskTex(mainSource);
    const newline = mainSource.includes("\r\n") ? "\r\n" : "\n";
    if (
      diagnostics.some((d) => /no legal \\end found/i.test(d.message)) &&
      !/\\end\s*\{document\}/.test(clean)
    ) {
      const stack = environmentStack(mainSource, mainSource.length);
      let braces = 0;
      let balanced = true;
      for (const token of clean.matchAll(/\\[a-zA-Z]+|\\[^a-zA-Z]|[{}]/g)) {
        if (token[0] === "{") braces++;
        if (token[0] === "}") braces--;
        if (braces < 0) balanced = false;
      }
      if (
        stack?.length === 1 &&
        stack[0] === "document" &&
        braces === 0 &&
        balanced &&
        /\\documentclass/.test(clean)
      )
        record(
          main,
          mainSource + newline + "\\end{document}" + newline,
          "Fehlenden Dokumentabschluss \\end{document} ergänzen.",
        );
    }
    if (
      diagnostics.some((d) =>
        /keine PDF-Seiten|No pages of output/i.test(d.message),
      )
    ) {
      const empty = clean.match(/\\begin\{document\}(\s*)\\end\{document\}/);
      if (empty) {
        const at = empty.index! + empty[0].lastIndexOf("\\end");
        record(
          main,
          current(main).slice(0, at) +
            "\\null" +
            newline +
            current(main).slice(at),
          "Leere PDF-Seite mit \\null erzeugen.",
        );
      }
    }
    if (packages.size) {
      const working = Object.fromEntries(paths.map((p) => [p, current(p)]));
      try {
        const prepared = ensurePreamble(current(main), {
          packages: [...packages],
          preambleContext: preambleDependencies(current(main), working, main),
        });
        record(
          main,
          prepared.source,
          `Benötigte Pakete ergänzen: ${[...packages].join(", ")}.`,
        );
      } catch {
        /* Document help offers a proper main document instead. */
      }
    }
  }
  return [...changes.values()];
}
