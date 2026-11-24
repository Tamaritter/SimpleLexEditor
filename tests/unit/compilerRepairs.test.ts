import { describe, expect, it } from "vitest";
import { planCompilerFixes } from "../../src/latex/compilerFixes";
const wrap = (body: string) =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;
const unknown = (
  command: string,
  line = 3,
  context = `l.${line} \\${command}`,
) => `main.tex:${line}: Undefined control sequence.\n${context}\n {x}`;
const repair = (
  source: string,
  log: string,
  extra: Record<string, string> = {},
  paths?: string[],
) =>
  planCompilerFixes(
    log,
    "main.tex",
    { "main.tex": source, ...extra },
    { paths },
  );

describe("extended compiler repairs", () => {
  it.each([
    ["mathbb", "amssymb"],
    ["dfrac", "amsmath"],
    ["includegraphics", "graphicx"],
    ["href", "hyperref"],
    ["toprule", "booktabs"],
    ["textcolor", "xcolor"],
    ["SI", "siunitx"],
    ["multirow", "multirow"],
    ["cancel", "cancel"],
  ])(
    "loads the package for the actually undefined command \\%s",
    (command, pkg) => {
      const source = wrap(`\\${command}{x}`);
      const fixes = repair(source, unknown(command));
      expect(fixes).toHaveLength(1);
      expect(fixes[0].after).toContain(`\\usepackage{${pkg}}`);
      expect(fixes[0].after).toContain(`\\${command}{x}`);
    },
  );
  it("repairs an exact common typo and adds its package together", () => {
    const fix = repair(
      wrap("\\includegraphic{image.png}"),
      unknown("includegraphic"),
    )[0];
    expect(fix.after).toContain("\\includegraphics{image.png}");
    expect(fix.after).toContain("\\usepackage{graphicx}");
  });
  it("does not repair an expansion at the macro call or guess an unknown command", () => {
    expect(
      repair(
        wrap("\\macro{x}"),
        unknown("macro", 3, "\\macro ->\\mathbb\nl.3 \\macro"),
      ),
    ).toEqual([]);
    expect(repair(wrap("\\myOwnMacro{x}"), unknown("myOwnMacro"))).toEqual([]);
  });
  it("does not load a package already present in an included preamble", () => {
    const source =
      "\\documentclass{article}\n\\input{preamble}\n\\begin{document}\n$\\mathbb{R}$\n\\end{document}";
    expect(
      repair(source, unknown("mathbb", 4), {
        "preamble.tex": "\\usepackage{amssymb}",
      }),
    ).toEqual([]);
  });
  it("ignores comments and verbatim source even when a stale compiler line names them", () => {
    expect(repair(wrap("% \\mathbb{R}"), unknown("mathbb"))).toEqual([]);
    expect(repair(wrap("\\verb|\\mathbb{R}|"), unknown("mathbb"))).toEqual([]);
    expect(
      repair(
        wrap("\\begin{verbatim}\n\\mathbb{R}\n\\end{verbatim}"),
        unknown("mathbb", 4),
      ),
    ).toEqual([]);
  });
  it.each([
    ["tikzpicture", "tikz"],
    ["lstlisting", "listings"],
    ["longtable", "longtable"],
    ["aligned", "amsmath"],
    ["multicols", "multicol"],
  ])("restores the package for %s", (env, pkg) => {
    const fixes = repair(
      wrap(`\\begin{${env}}\nText\n\\end{${env}}`),
      `main.tex:3: LaTeX Error: Environment ${env} undefined.`,
    );
    expect(fixes[0].after).toContain(`\\usepackage{${pkg}}`);
  });
  it("adds float for the reported H placement option", () => {
    expect(
      repair(
        wrap("\\begin{figure}[H]\nText\n\\end{figure}"),
        "main.tex:3: LaTeX Error: Unknown float option `H'.",
      )[0].after,
    ).toContain("\\usepackage{float}");
  });
  it("repairs a unique project file path including images and bibliography resources", () => {
    for (const [command, requested, actual] of [
      ["input", "intro", "chapters/intro.tex"],
      ["includegraphics", "Logo.PNG", "assets/logo.png"],
      ["addbibresource", "sources.bib", "bibliography/sources.bib"],
    ]) {
      const source = wrap(`\\${command}{${requested}}`);
      const fixes = repair(
        source,
        `main.tex:3: LaTeX Error: File '${requested}' not found.`,
        {},
        ["main.tex", actual],
      );
      expect(fixes[0].after).toContain(`\\${command}{${actual}}`);
    }
  });
  it("does not choose among duplicate basenames, invent files or rewrite existing paths", () => {
    const source = wrap("\\input{intro}");
    const log = "main.tex:3: LaTeX Error: File 'intro.tex' not found.";
    expect(repair(source, log, {}, ["a/intro.tex", "b/intro.tex"])).toEqual([]);
    expect(repair(source, log, {}, ["different.tex"])).toEqual([]);
    expect(repair(source, log, {}, ["intro.tex", "a/intro.tex"])).toEqual([]);
  });
  it("converts diagnosed Unicode math without changing comments or other characters", () => {
    const source = wrap("$x ≤ y$ % ≤ bleibt Kommentar");
    const fixes = repair(
      source,
      "main.tex:3: LaTeX Error: Unicode character ≤ (U+2264) not set up for use with LaTeX.",
    );
    expect(fixes[0].after).toContain(
      "$x \\ensuremath{\\leq} y$ % ≤ bleibt Kommentar",
    );
    expect(
      repair(
        wrap("😀"),
        "main.tex:3: LaTeX Error: Unicode character 😀 (U+1F600) not set up for use with LaTeX.",
      ),
    ).toEqual([]);
  });
  it("repairs a text ampersand but preserves math, tables and ambiguous repeated ampersands", () => {
    const log = "main.tex:3: Misplaced alignment tab character &.";
    expect(repair(wrap("Forschung & Lehre"), log)[0].after).toContain(
      "Forschung \\& Lehre",
    );
    expect(repair(wrap("$a&b$"), log)).toEqual([]);
    expect(repair(wrap("a&b&c"), log)).toEqual([]);
    expect(
      repair(
        wrap("\\begin{tabular}{l}\na&b\n\\end{tabular}"),
        "main.tex:4: Misplaced alignment tab character &.",
      ),
    ).toEqual([]);
  });
  it("corrects an unambiguous closing environment name without guessing missing nested blocks", () => {
    const log =
      "main.tex:5: LaTeX Error: \\begin{itemize} on input line 3 ended by \\end{enumerate}.";
    expect(
      repair(wrap("\\begin{itemize}\n\\item A\n\\end{enumerate}"), log)[0]
        .after,
    ).toContain("\\end{itemize}");
    expect(
      repair(
        wrap("\\begin{enumerate}\n\\begin{itemize}\n\\end{enumerate}"),
        log,
      ),
    ).toEqual([]);
  });
  it("removes only redundant display wrappers around a complete equation", () => {
    const source = wrap("\\[\n\\begin{equation}\nx=y\n\\end{equation}\n\\]");
    const fixes = repair(
      source,
      "main.tex:4: LaTeX Error: Bad math environment delimiter.",
    );
    expect(fixes[0].after).not.toContain("\\[");
    expect(fixes[0].after).toContain("\\begin{equation}\nx=y\n\\end{equation}");
    expect(
      repair(
        source.replace("\\begin{equation}", "a+b\n\\begin{equation}"),
        "main.tex:5: LaTeX Error: Bad math environment delimiter.",
      ),
    ).toEqual([]);
  });
  it("closes only a structurally complete document and never masks unclosed arguments or environments", () => {
    const log = "! Emergency stop.\n*** (job aborted, no legal \\end found)";
    const source = "\\documentclass{article}\n\\begin{document}\nText";
    expect(repair(source, log)[0].after).toContain("Text\n\\end{document}");
    expect(repair(source + "\\textbf{unfinished", log)).toEqual([]);
    expect(repair(source + "\\begin{itemize}", log)).toEqual([]);
  });
  it("creates an intentionally empty page while retaining comments", () => {
    const source = wrap("% Intentionally empty");
    expect(
      repair(source, "! Das Dokument hat keine PDF-Seiten erzeugt.")[0].after,
    ).toContain("% Intentionally empty\n\\null\n\\end{document}");
    expect(
      repair(
        wrap("\\input{chapter}"),
        "! Das Dokument hat keine PDF-Seiten erzeugt.",
      ),
    ).toEqual([]);
  });
  it("replaces a standalone line break only after an empty line in ordinary text", () => {
    const source = wrap("Text.\n\n\\\\");
    expect(
      repair(source, "main.tex:5: LaTeX Error: There's no line here to end.")[0]
        .after,
    ).toContain("Text.\n\n\\par");
    expect(
      repair(
        wrap("Text.\n\\\\"),
        "main.tex:4: LaTeX Error: There's no line here to end.",
      ),
    ).toEqual([]);
  });
  it("corrects case-only citation and reference mistakes only when a unique real key exists", () => {
    const source = wrap(
      "Siehe \\ref{SEC:Intro} und \\cite{SMITH}.\n\\section{Einleitung}\\label{sec:intro}",
    );
    const output =
      "LaTeX Warning: Reference 'SEC:Intro' on page 1 undefined on input line 3.\nLaTeX Warning: Citation 'SMITH' on page 1 undefined on input line 3.";
    const fixes = repair(source, output, {
      "references.bib": "@book{Smith,title={Book},author={Writer},year={2026}}",
    });
    // The second change to an already edited line may be deferred to the next run.
    expect(fixes[0].after).toContain("\\ref{sec:intro}");
    const second = repair(fixes[0].after, output, {
      "references.bib": "@book{Smith,title={Book}}",
    });
    expect(second[0].after).toContain("\\cite{Smith}");
    expect(
      repair(
        wrap("\\ref{sec:missing}"),
        "LaTeX Warning: Reference 'sec:missing' on page 1 undefined on input line 3.",
      ),
    ).toEqual([]);
  });
  it("can scope a review to one selected diagnostic", () => {
    const source = wrap("\\textbold{Text}\nForschung & Lehre");
    const output =
      unknown("textbold") +
      "\nmain.tex:4: Misplaced alignment tab character &.";
    const only = {
      severity: "error" as const,
      message: "Misplaced alignment tab character &.",
      file: "main.tex",
      line: 4,
    };
    const fixes = planCompilerFixes(
      output,
      "main.tex",
      { "main.tex": source },
      { only },
    );
    expect(fixes[0].after).toContain("\\textbold{Text}");
    expect(fixes[0].after).toContain("Forschung \\& Lehre");
  });
});
