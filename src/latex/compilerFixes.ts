import {
  ensurePreamble,
  preambleDependencies,
  theoremBlocks,
  withoutComments,
} from "../research/scientific";
import {
  parseDiagnostics,
  resolveDiagnosticFile,
  type Diagnostic,
} from "../app/workspace";
import { additionalCompilerFixes } from "./compilerRepairs";
import { maskTex } from "../editor/texAnalysis";

export type CompilerFix = {
  file: string;
  before: string;
  after: string;
  reasons: string[];
};

// These repairs deliberately require both a compiler error and matching source.
// Ambiguous syntax, missing files and unknown commands need manual editing.
export function planCompilerFixes(
  log: string,
  main: string,
  sources: Record<string, string>,
  options: { only?: Diagnostic; paths?: string[] } = {},
): CompilerFix[] {
  const changes = new Map<string, CompilerFix>();
  const paths = Object.keys(sources);
  const allDiagnostics = parseDiagnostics(
    log,
    main,
    options.paths || paths,
  ).filter(
    (d) =>
      !options.only ||
      (d.file === options.only.file &&
        d.line === options.only.line &&
        d.message === options.only.message),
  );
  const diagnostics = allDiagnostics.filter((d) => d.severity === "error");
  const cleanSource = maskTex;
  const record = (file: string, after: string, reason: string) => {
    const existing = changes.get(file);
    if (after === (existing?.after ?? sources[file])) return;
    changes.set(file, {
      file,
      before: sources[file],
      after,
      reasons: [...(existing?.reasons || []), reason],
    });
  };
  const knownTheorems = new Set(["proof", ...theoremBlocks.map((b) => b.id)]);
  for (const source of Object.values(sources))
    for (const match of cleanSource(source).matchAll(
      /\\newtheorem\*?\s*\{([a-zA-Z]+)\}/g,
    ))
      knownTheorems.add(match[1]);

  for (const file of paths.filter((p) => /\.tex$/i.test(p))) {
    const original = sources[file];
    const clean = cleanSource(original);
    const lines = diagnostics
      .filter(
        (d) =>
          /Missing \$ inserted/i.test(d.message) &&
          resolveDiagnosticFile(d.file, paths, main) === file,
      )
      .map((d) => d.line);
    const nestingLines = diagnostics
      .filter(
        (d) =>
          /Bad math environment delimiter|Erroneous nesting of equation|Display math should end/i.test(
            d.message,
          ) && resolveDiagnosticFile(d.file, paths, main) === file,
      )
      .map((d) => d.line);
    if (!lines.length && !nestingLines.length) continue;
    const edits: { from: number; to: number; text: string }[] = [];
    // Only standalone, unambiguous display delimiters. Never guess a missing $.
    for (const display of clean.matchAll(
      /^[ \t]*\\\[[ \t]*\r?\n([\s\S]*?)^[ \t]*\\\][ \t]*(?=\r?$)/gm,
    )) {
      const start = display.index;
      const bodyStart = start + display[0].indexOf("\n") + 1;
      const body = display[1];
      // Keep comments on delimiter lines untouched by declining this repair.
      const raw = original.slice(start, start + display[0].length);
      if (
        raw.split("\n")[0].includes("%") ||
        raw.split("\n").at(-1)!.includes("%")
      )
        continue;
      const nested = body.match(
        /^\s*\\begin\{(equation\*?|align\*?|gather\*?|multline\*?)\}[\s\S]*\\end\{\1\}\s*$/,
      );
      if (nested && !/\\[\[\]]/.test(body)) {
        const at = body.indexOf("\\begin");
        if (
          nestingLines.includes(
            clean.slice(0, bodyStart + at).split("\n").length,
          )
        ) {
          edits.push({
            from: start,
            to: start + display[0].length,
            text: original.slice(bodyStart, bodyStart + body.length).trim(),
          });
          continue;
        }
      }
      const blocks = [
        ...body.matchAll(
          /^[ \t]*\\begin\{([a-zA-Z]+)\}(?:\[[^\]\r\n]*\])?[ \t]*\r?\n[\s\S]*?^[ \t]*\\end\{\1\}[ \t]*(?=\r?$)/gm,
        ),
      ];
      if (!blocks.length || blocks.some((b) => !knownTheorems.has(b[1])))
        continue;
      if (
        !blocks.some((b) =>
          lines.includes(
            clean.slice(0, bodyStart + b.index).split("\n").length,
          ),
        )
      )
        continue;
      let rest = body;
      for (const b of [...blocks].reverse())
        rest = rest.slice(0, b.index) + rest.slice(b.index + b[0].length);
      // Nested displays or environments outside the theorem may depend on context.
      if (/\\[\[\]()]|\$|\\(?:begin|end)\s*\{/.test(rest)) continue;
      const balancedFragment = (fragment: string) => {
        let braces = 0,
          fences = 0;
        for (const token of fragment.matchAll(
          /\\[a-zA-Z]+|\\[^a-zA-Z]|[{}]/g,
        )) {
          if (token[0] === "{") braces++;
          if (token[0] === "}") braces--;
          if (token[0] === "\\left") fences++;
          if (token[0] === "\\right") fences--;
          if (braces < 0 || fences < 0) return false;
        }
        return braces === 0 && fences === 0;
      };
      let from = 0;
      const fragments = blocks.map((block) => {
        const fragment = body.slice(from, block.index);
        from = block.index + block[0].length;
        return fragment;
      });
      fragments.push(body.slice(from));
      if (!fragments.every(balancedFragment)) continue;
      const newline = original.includes("\r\n") ? "\r\n" : "\n";
      const parts: string[] = [];
      const mathPart = (from: number, to: number) => {
        const text = original.slice(bodyStart + from, bodyStart + to).trim();
        if (text)
          parts.push(
            withoutComments(text).trim()
              ? `\\[${newline}${text}${newline}\\]`
              : text,
          );
      };
      let at = 0;
      for (const b of blocks) {
        mathPart(at, b.index);
        parts.push(
          original
            .slice(bodyStart + b.index, bodyStart + b.index + b[0].length)
            .trim(),
        );
        at = b.index + b[0].length;
      }
      mathPart(at, body.length);
      edits.push({
        from: start,
        to: start + display[0].length,
        text: parts.join(newline + newline),
      });
    }
    let after = original;
    for (const edit of edits.reverse())
      after = after.slice(0, edit.from) + edit.text + after.slice(edit.to);
    record(
      file,
      after,
      "Mathematikbegrenzung korrigieren; Formeln, Definitionen und Beweise erhalten.",
    );
  }

  // Standard environments offered by SimpleLexEditor can have their prerequisites restored.
  const packages = new Set<string>();
  const declarations = new Set<string>();
  for (const d of diagnostics) {
    const env = d.message.match(
      /^(?:LaTeX Error: )?Environment ([a-zA-Z]+\*?) undefined\.?$/i,
    )?.[1];
    const file = resolveDiagnosticFile(d.file, paths, main);
    if (!env || !file || !d.line) continue;
    const line = cleanSource(sources[file]).split(/\r?\n/)[d.line - 1] || "";
    if (!line.includes(`\\begin{${env}}`)) continue;
    const block = theoremBlocks.find((b) => b.id === env);
    if (block) {
      packages.add("amsthm");
      if (block.declaration) {
        declarations.add(theoremBlocks[0].declaration);
        declarations.add(block.declaration);
      }
    } else if (
      /^(?:align|alignat|gather|multline|equation|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\*?$/.test(
        env,
      )
    )
      packages.add("amsmath");
  }
  if (sources[main] !== undefined && (packages.size || declarations.size)) {
    const source = changes.get(main)?.after ?? sources[main];
    try {
      const prepared = ensurePreamble(source, {
        packages: [...packages],
        declarations: [...declarations],
        preambleContext: preambleDependencies(source, sources, main),
      });
      record(
        main,
        prepared.source,
        "Fehlende Pakete und Definitionen für bekannte LaTeX-Umgebungen ergänzen.",
      );
    } catch {
      /* A missing document skeleton needs a manual decision. */
    }
  }
  return additionalCompilerFixes(
    allDiagnostics,
    main,
    sources,
    [...changes.values()],
    options.paths || paths,
  );
}
