import { describe, expect, it } from "vitest";
import { planCompilerFixes } from "../../src/latex/compilerFixes";

const main = String.raw`\documentclass{article}
\usepackage{amsmath,amsthm}
\newtheorem{definition}{Definition}
\begin{document}
\input{kapitel}
\end{document}
`;
const chapter = String.raw`
\[
  \frac{a}{b}
  \begin{definition}[Begriff]
  Hier steht die Definition.
\end{definition}

\]
% kapitel.tex
\section{Mathematik}
\begin{equation}
  E = mc^2
\end{equation}
wad
`;
const log =
  "./kapitel.tex:4: Missing $ inserted.\n! ==> Fatal error occurred, no output PDF file produced!";

describe("compiler repairs", () => {
  it("repairs the screenshot case without deleting the formula, definition or chapter content", () => {
    const fixes = planCompilerFixes(log, "main.tex", {
      "main.tex": main,
      "kapitel.tex": chapter,
    });
    expect(fixes).toHaveLength(1);
    expect(fixes[0].file).toBe("kapitel.tex");
    expect(fixes[0].before).toBe(chapter);
    expect(fixes[0].after).toContain(
      "\\frac{a}{b}\n\\]\n\n\\begin{definition}",
    );
    expect(fixes[0].after).toContain("Hier steht die Definition.");
    expect(fixes[0].after).toContain("% kapitel.tex\n\\section{Mathematik}");
    expect(fixes[0].after).toContain("\\end{equation}\nwad");
    expect(
      planCompilerFixes(log, "main.tex", {
        "main.tex": main,
        "kapitel.tex": fixes[0].after,
      }),
    ).toEqual([]);
  });

  it("preserves formulas on both sides, comments, and CRLF line endings", () => {
    const source = chapter
      .replace("\n\\]\n", "\n% Erhalten\nc+d\n\\]\n")
      .replaceAll("\n", "\r\n");
    const after = planCompilerFixes(log, "main.tex", {
      "main.tex": main,
      "kapitel.tex": source,
    })[0].after;
    expect(after).toContain("\\[\r\n% Erhalten\r\nc+d\r\n\\]");
    expect(after.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("removes empty display wrappers and supports locally declared theorem names", () => {
    const source = "\\[\n\\begin{claim}\nText\n\\end{claim}\n\\]";
    const fixes = planCompilerFixes(
      "part.tex:2: Missing $ inserted.",
      "main.tex",
      {
        "main.tex": main.replace(
          "\\begin{document}",
          "\\newtheorem{claim}{Behauptung}\n\\begin{document}",
        ),
        "part.tex": source,
      },
    );
    expect(fixes[0].after).toBe("\\begin{claim}\nText\n\\end{claim}");
  });

  it("uses full compiler paths and never edits an unrelated file with the same basename", () => {
    const fixes = planCompilerFixes(
      "C:/project/chapters/kapitel.tex:4: Missing $ inserted.",
      "main.tex",
      {
        "main.tex": main,
        "chapters/kapitel.tex": chapter,
        "other/kapitel.tex": chapter,
      },
    );
    expect(fixes.map((f) => f.file)).toEqual(["chapters/kapitel.tex"]);
  });

  it.each([
    ["wrong line", "kapitel.tex:3: Missing $ inserted.", chapter],
    ["unknown error", "kapitel.tex:4: Undefined control sequence.", chapter],
    [
      "warning",
      "Package example Warning: Missing $ inserted on input line 4.",
      chapter,
    ],
    [
      "commented block",
      log,
      chapter
        .split("\n")
        .map((line) => "% " + line)
        .join("\n"),
    ],
    [
      "literal example",
      "kapitel.tex:5: Missing $ inserted.",
      "\\begin{verbatim}\n" + chapter + "\\end{verbatim}",
    ],
    [
      "nested environment",
      log,
      chapter.replace("\\frac{a}{b}", "\\begin{aligned} a&=b"),
    ],
    ["missing closing delimiter", log, chapter.replace("\\]", "")],
    [
      "group spanning the definition",
      log,
      chapter.replace("\\frac{a}{b}", "{a").replace("\n\\]\n", "\n}\n\\]\n"),
    ],
    [
      "fences spanning the definition",
      log,
      chapter
        .replace("\\frac{a}{b}", "\\left(a")
        .replace("\n\\]\n", "\n\\right)\n\\]\n"),
    ],
  ])("does not guess a correction for %s", (_name, output, source) => {
    expect(
      planCompilerFixes(output, "main.tex", {
        "main.tex": main,
        "kapitel.tex": source,
      }),
    ).toEqual([]);
  });

  it("restores missing theorem declarations in the main preamble and respects included declarations", () => {
    const sources = {
      "main.tex":
        "\\documentclass{article}\n\\input{preamble}\n\\begin{document}\n\\input{kapitel}\n\\end{document}",
      "preamble.tex": "\\usepackage{amsthm}\n\\newtheorem{theorem}{Satz}",
      "kapitel.tex": "\\begin{definition}\nText\n\\end{definition}",
    };
    const fixes = planCompilerFixes(
      "kapitel.tex:1: LaTeX Error: Environment definition undefined.",
      "main.tex",
      sources,
    );
    expect(fixes).toHaveLength(1);
    expect(fixes[0].file).toBe("main.tex");
    expect(fixes[0].after).toContain(
      "\\newtheorem{definition}[theorem]{Definition}",
    );
    expect(fixes[0].after).not.toContain("\\usepackage{amsthm}");
    expect(fixes[0].after).not.toContain("\\newtheorem{theorem}");
  });

  it("restores amsmath for known math environments and skips unknown environments", () => {
    const source =
      "\\documentclass{article}\n\\begin{document}\n\\begin{align}\nx&=y\n\\end{align}\n\\end{document}";
    const fixes = planCompilerFixes(
      "main.tex:3: LaTeX Error: Environment align undefined.",
      "main.tex",
      { "main.tex": source },
    );
    expect(fixes[0].after).toContain("\\usepackage{amsmath}");
    expect(
      planCompilerFixes(
        "main.tex:3: LaTeX Error: Environment custom undefined.",
        "main.tex",
        { "main.tex": source },
      ),
    ).toEqual([]);
  });
});
