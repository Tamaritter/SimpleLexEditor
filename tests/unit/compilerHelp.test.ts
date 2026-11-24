import { describe, expect, it } from "vitest";
import { compilerHelp, missingResource } from "../../src/latex/compilerHelp";
import { parseDiagnostics } from "../../src/app/workspace";
import { maskTex } from "../../src/editor/texAnalysis";

describe("compiler guidance", () => {
  it("explains misplaced preamble references for a missing document start error", () => {
    const help = compilerHelp({
      message: "LaTeX Error: Missing \\begin{document}.",
    });
    expect(help.explanation).toContain("\\ref");
    expect(help.explanation).toContain("verschieben");
    expect(help.explanation).toContain("figure");
    expect(help.explanation).toContain("table");
    expect(help.actions).toContain("repair");
  });
  it.each([
    ["Undefined control sequence.", "command", "repair"],
    [
      "LaTeX Error: Environment tikzpicture undefined.",
      "environment",
      "repair",
    ],
    ["LaTeX Error: File `booktabs.sty' not found.", "package", "environment"],
    ["LaTeX Error: File `images/logo.pdf' not found.", "file", "repair"],
    [
      "ERROR - Cannot find 'references.bib'!",
      "bibliography-file",
      "bibliography",
    ],
    ["Missing $ inserted.", "math", "source"],
    [
      "LaTeX Error: \\begin{itemize} on input line 4 ended by \\end{enumerate}.",
      "mismatch",
      "repair",
    ],
    ["Runaway argument?", "braces", "source"],
    ["File ended while scanning use of \\textbf.", "braces", "log"],
    ["Misplaced alignment tab character &.", "alignment", "repair"],
    [
      "LaTeX Error: Unicode character ≤ (U+2264) not set up for use with LaTeX.",
      "unicode",
      "unicode",
    ],
    [
      "Package fontspec Error: The fontspec package requires either XeTeX or LuaTeX.",
      "unicode",
      "unicode",
    ],
    ["Zeitlimit von 180 Sekunden erreicht.", "timeout", "settings"],
    ["pdflatex wurde nicht gefunden.", "tool", "environment"],
    [
      "biber ist für dieses Literaturverzeichnis erforderlich, wurde aber nicht gefunden.",
      "tool",
      "environment",
    ],
    [
      "pdflatex konnte nicht gestartet werden: access is denied.",
      "access",
      "settings",
    ],
    [
      "Dieses Projekt wird bereits in einer anderen SimpleLexEditor-Instanz kompiliert.",
      "busy",
      "retry",
    ],
    ["LaTeX Error: Unknown float option `H'.", "float", "repair"],
    ["LaTeX Error: There's no line here to end.", "linebreak", "repair"],
    ["LaTeX Error: Missing \\begin{document}.", "document", "preview"],
    ["Das Dokument hat keine PDF-Seiten erzeugt.", "empty", "repair"],
    ["LaTeX Error: Option clash for package xcolor.", "conflict", "source"],
    [
      "Package epstopdf Warning: Shell escape feature is not enabled.",
      "external",
      "log",
    ],
    [
      "TeX capacity exceeded, sorry [input stack size=10000].",
      "capacity",
      "log",
    ],
    [
      "LaTeX Warning: Citation `Smith' on page 1 undefined on input line 5.",
      "bibliography",
      "bibliography",
    ],
    [
      "LaTeX Warning: Reference `sec:Test' on page 1 undefined on input line 6.",
      "references",
      "references",
    ],
    ["Overfull \\hbox (10pt too wide)", "overfull", "source"],
    ["Underfull \\hbox (badness 10000)", "underfull", "source"],
    ["Missing number, treated as zero.", "dimension", "source"],
    [
      "LaTeX Error: Lonely \\item--perhaps a missing list environment.",
      "list",
      "source",
    ],
    ["LaTeX Error: Can be used only in preamble.", "preamble", "source"],
    ["LaTeX Error: Not in outer par mode.", "float-placement", "source"],
    ["Unbekannte interne Paketmeldung", "unknown", "log"],
  ])(
    "explains %s and offers an appropriate next action",
    (message, kind, action) => {
      const help = compilerHelp({ message });
      expect(help.kind).toBe(kind);
      expect(help.explanation.length).toBeGreaterThan(40);
      expect(help.actions).toContain(action);
    },
  );
  it("separates the fatal follow-up from the root cause without inheriting a later line", () => {
    const output =
      "main.tex:3: Undefined control sequence.\nl.3 \\mathbb\n {R}\n! ==> Fatal error occurred, no output PDF file produced!\nmain.tex:9: Missing $ inserted.\nl.9 x";
    const ds = parseDiagnostics(output, "main.tex");
    expect(ds).toHaveLength(3);
    expect(ds[0].command).toBe("mathbb");
    expect(ds[0].context).toContain("l.3");
    expect(ds[1].line).toBeUndefined();
    expect(compilerHelp(ds[1]).secondary).toBe(true);
  });
  it("retains macro expansion context instead of accusing the macro call", () => {
    const ds = parseDiagnostics(
      "! Undefined control sequence.\n\\mycommand ->\\textbold\n {hmmm}\nl.8 My command is used here \\mycommand\n .",
      "main.tex",
    );
    expect(ds[0].command).toBe("textbold");
    expect(ds[0].line).toBe(8);
  });
  it("attaches a missing-file source location from its following emergency stop", () => {
    const output =
      "! LaTeX Error: File `old/intro.tex' not found.\nType X to quit or <RETURN> to proceed,\nor enter new name. (Default extension: tex)\n\nEnter file name:\nC:/Project/main.tex:14: Emergency stop.\n<read *>\n\nl.14 \\input{old/intro}\n! ==> Fatal error occurred, no output PDF file produced!";
    const ds = parseDiagnostics(output, "main.tex", [
      "main.tex",
      "chapters/intro.tex",
    ]);
    expect(ds[0]).toMatchObject({ line: 14, file: "main.tex" });
    expect(ds[1].line).toBeUndefined();
  });
  it("recognizes backend errors, Biber, BibTeX and Tectonic locations", () => {
    const ds = parseDiagnostics(
      "Zeitlimit von 180 Sekunden erreicht.\nERROR - Cannot find 'references.bib'!\nWarning--I didn't find a database entry for \"smith\"\nerror: chapters/test.tex:7: Undefined control sequence.\nl.7 \\textbold\n{x}",
      "main.tex",
    );
    expect(ds.map((d) => d.severity)).toEqual([
      "error",
      "error",
      "warning",
      "error",
    ]);
    expect(ds[3]).toMatchObject({
      file: "chapters/test.tex",
      line: 7,
      command: "textbold",
    });
    expect(missingResource(ds[1].message)).toBe("references.bib");
  });
  it("does not interpret ordinary package-loading log lines as errors", () => {
    expect(
      parseDiagnostics(
        "This is pdfTeX, Version 3.14\nLaTeX2e <2026-06-01>\nDocument Class: article\n(c:/MiKTeX/amsmath.sty\nPackage: amsmath 2025/07/09\n)\nOutput written on main.pdf (1 page).",
        "main.tex",
      ),
    ).toEqual([]);
  });
  it("keeps TeX Live package metadata out of diagnostics and preserves the actual error", () => {
    const log = String.raw`This is pdfTeX, Version 3.141592653 (TeX Live 2026)
Package: rerunfilecheck 2025-06-21 v1.11 Rerun checks for auxiliary files (HO)
Package rerunfilecheck Info: File 'main.out' has not changed.
Package: epstopdf-base 2020-01-24 v2.11 Base part for package epstopdf
File: hluatex.def 2026-07-20 Hyperref driver for LuaTeX
INFO - This is Biber 2.22
main.tex:8: Undefined control sequence.
l.8 \SimpleLexEditorUndefinedCommand
Package rerunfilecheck Warning: File 'main.out' has changed.
(rerunfilecheck) Rerun to get outlines right.
`;
    const diagnostics = parseDiagnostics(log, "main.tex");
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({
      severity: "error",
      line: 8,
      command: "SimpleLexEditorUndefinedCommand",
    });
    expect(diagnostics[1]).toMatchObject({ severity: "warning" });
    expect(compilerHelp(diagnostics[1]).kind).toBe("references");
  });
  it("locates BibTeX syntax errors in the editable bibliography instead of the auxiliary file", () => {
    const ds = parseDiagnostics(
      "I was expecting a `,' or a `}'---line 4 of file references.bib\n : title = {Unfinished}\nWARN - Duplicate entry key: 'Smith'",
      "main.tex",
    );
    expect(ds[0]).toMatchObject({
      severity: "error",
      file: "references.bib",
      line: 4,
    });
    expect(compilerHelp(ds[0]).kind).toBe("bibliography");
    expect(ds[1].severity).toBe("warning");
  });
  it("masks comments and literal examples while preserving positions, escapes and line endings", () => {
    const source =
      "\\% visible % hidden\r\n\\verb|% \\mathbb|\n\\begin{verbatim}\n\\[\n\\mathbb\n\\]\n\\end{verbatim}\n$\\mathbb{R}$";
    const clean = maskTex(source);
    expect(clean.length).toBe(source.length);
    expect(clean).toContain("\\% visible");
    expect(clean).not.toContain("hidden");
    expect(clean.match(/mathbb/g)).toHaveLength(1);
    expect(clean.match(/\r?\n/g)).toEqual(source.match(/\r?\n/g));
  });
});
