import { describe, it, expect } from "vitest";
import { planCompilerFixes } from "../../src/latex/compilerFixes";
const repair = (source: string, line: number) =>
  planCompilerFixes(
    `main.tex:${line}: LaTeX Error: Missing \\begin{document}.`,
    "main.tex",
    { "main.tex": source },
  );
describe("document start repairs", () => {
  it("repairs the reported figure before the document at main.tex:13 without changing its contents", () => {
    const float = String.raw`\begin{figure}[htbp]
  \centering
  \includegraphics[width=0.6\textwidth]{\detokenize{bilder/beispiel.png}}
  \caption{Ein Bild mit \textbf{Beschriftung}.}
  \label{fig:beispiel}
\end{figure} % Kommentar bleibt beim Bild
`;
    const source = [
      "\\documentclass[11pt,a4paper]{article}",
      "\\usepackage[utf8]{inputenc}",
      "\\usepackage[T1]{fontenc}",
      "\\usepackage[ngerman]{babel}",
      "\\usepackage{graphicx}",
      "\\usepackage{hyperref}",
      "\\title{Meine Arbeit}",
      "\\author{Name}",
      "\\date{\\today}",
      "",
      "% Abbildung versehentlich in der Präambel",
      "",
      float,
      "% Weitere Präambel",
      "\\usepackage{amsthm}",
      "\\newtheorem{theorem}{Satz}",
      "\\begin{document}",
      "\\maketitle",
      "Inhalt bleibt erhalten.",
      "\\end{document}",
    ].join("\n");
    expect(source.split("\n")[12]).toBe("\\begin{figure}[htbp]");
    const changes = repair(source, 13);
    expect(changes).toHaveLength(1);
    expect(changes[0].after).toBe(
      source
        .replace(float, "")
        .replace(
          "\\begin{document}",
          "\\begin{document}\n" + float.trimEnd() + "\n",
        ),
    );
    expect(changes[0].before).toBe(source);
    expect(repair(changes[0].after, 13)).toEqual([]);
  });
  it.each(["figure", "figure*", "table", "table*"])(
    "moves a complete %s including nested environments and preserves CRLF",
    (environment) => {
      const block = `\\begin{${environment}}[htbp]\r\n\\begin{minipage}{0.8\\textwidth}\r\n\\begin{tabular}{cc}\r\nA & B \\\\\r\n\\end{tabular}\r\n\\end{minipage}\r\n\\caption{Inhalt}\r\n\\label{fig:one}\r\n\\end{${environment}}\r\n`;
      const source = `\\documentclass{article}\r\n${block}\\title{Title}\r\n\\begin{document}\r\nText\r\n\\end{document}`;
      const after = repair(source, 2)[0].after;
      expect(after).toContain("\\begin{document}\r\n" + block);
      expect(after).toContain("\\title{Title}\r\n\\begin{document}");
      expect(after.replaceAll("\r\n", "")).not.toContain("\n");
    },
  );
  it("preserves the order of multiple floats and references separated by preamble declarations", () => {
    const figure =
      "\\begin{figure}[htbp]\n\\rule{1cm}{1cm}\n\\caption{Bild}\n\\end{figure}\n";
    const table =
      "\\begin{table}\n\\begin{tabular}{c}A\\end{tabular}\n\\caption{Tabelle}\n\\end{table}\n";
    const reference = "Siehe \\ref{fig:one}.\n";
    const source = `\\documentclass{article}\n${figure}\\usepackage{graphicx}\n${reference}\\title{Title}\n${table}\\begin{document}\nInhalt\n\\end{document}`;
    const after = repair(source, 2)[0].after;
    expect(after).toContain(
      "\\usepackage{graphicx}\n\\title{Title}\n\\begin{document}",
    );
    expect(after.indexOf(figure)).toBeGreaterThan(
      after.indexOf("\\begin{document}"),
    );
    expect(after.indexOf(reference)).toBeGreaterThan(after.indexOf(figure));
    expect(after.indexOf(table)).toBeGreaterThan(after.indexOf(reference));
    expect(after).toContain("Inhalt");
  });
  it("ignores commented and verbatim closing examples inside a figure", () => {
    const block =
      "\\begin{figure}\n% \\end{figure}\n\\verb|\\end{figure}|\n\\caption{\\{Text\\}}\n\\end{figure}\n";
    const source = `\\documentclass{article}\n${block}\\begin{document}\nText\n\\end{document}`;
    expect(repair(source, 2)[0].after).toContain("\\begin{document}\n" + block);
  });
  it.each([
    "\\begin{figure}\n\\caption{Kein Abschluss}",
    "\\begin{figure}\n\\caption{Offen\n\\end{figure}",
    "\\begin{figure}\n\\begin{minipage}{1cm}\nX\n\\end{figure}",
    "\\begin{figure}\n\\end{table}",
    "\\begin{figure}\n\\iffalse\\end{figure}\\fi\n\\end{figure}",
    "\\begin{figure}\n\\newcommand{\\close}{\\end{figure}}\n\\close",
    "\\begin{figure}\n\\input{unknown}\n\\end{figure}",
    "\\begin{figure}\nX\n\\end{figure}\n\\customPreamble",
    "\\begin{figure}\nX\n\\end{figure}\n\\title{Unfinished",
  ])(
    "does not move an incomplete or dynamically delimited float: %s",
    (block) => {
      expect(
        repair(
          `\\documentclass{article}\n${block}\n\\begin{document}\nText\n\\end{document}`,
          2,
        ),
      ).toEqual([]);
    },
  );
  it("restores a genuinely missing document start before a figure without moving the figure", () => {
    const body =
      "\\begin{figure}\n\\rule{1cm}{1cm}\n\\caption{Bild}\n\\end{figure}\n\\end{document}";
    expect(repair("\\documentclass{article}\n" + body, 2)[0].after).toBe(
      "\\documentclass{article}\n\\begin{document}\n" + body,
    );
  });
  it("moves the reported preamble reference while preserving the scientific preamble", () => {
    const source = String.raw`\documentclass[11pt,a4paper]{article}

% Ein ruhiger Ort für große Gedanken.
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[ngerman]{babel}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage[margin=2.6cm]{geometry}
\usepackage{hyperref}

\title{Notizen zur Unendlichkeit}
\author{Dein Name}
\date{\today}

\ref{sec:beispiel}
% Von SimpleLexEditor ergänzte wissenschaftliche Bausteine
\usepackage{amsthm}
\newtheorem{theorem}{Satz}[section]
\theoremstyle{definition}
\newtheorem{definition}[theorem]{Definition}
\theoremstyle{plain}

\begin{document}
\maketitle
Inhalt bleibt erhalten.
\input{kapitel}
\end{document}`;
    const changes = repair(source, 16);
    expect(changes).toHaveLength(1);
    expect(changes[0].before).toBe(source);
    expect(changes[0].after).toBe(
      source
        .replace("\\ref{sec:beispiel}\n", "")
        .replace(
          "\\begin{document}",
          "\\begin{document}\n\\ref{sec:beispiel}\n",
        ),
    );
    expect(repair(changes[0].after, 16)).toEqual([]);
  });
  it.each([
    "ref",
    "pageref",
    "eqref",
    "autoref",
    "nameref",
    "cref",
    "Cref",
    "vref",
    "Vref",
  ])(
    "keeps a complete \\%s call, surrounding text and inline comments together with CRLF",
    (command) => {
      const paragraph = `Siehe \\${command}{sec:beispiel}. % Hinweis`;
      const source = `\\documentclass{article}\r\n${paragraph}\r\n\\title{Arbeit}\r\n\\begin{document}\r\nInhalt\r\n\\end{document}`;
      const after = repair(source, 2)[0].after;
      expect(after).toContain(`\\begin{document}\r\n${paragraph}\r\n`);
      expect(after.indexOf("\\title{Arbeit}")).toBeLessThan(
        after.indexOf("\\begin{document}"),
      );
      expect(after.replaceAll("\r\n", "")).not.toContain("\n");
    },
  );
  it.each([
    "\\ref{unfinished",
    "\\ref{\\customKey}",
    "\\newcommand{\\example}{\\ref{sec:beispiel}}",
    "\\ifdefined\\example\n\\ref{sec:beispiel}\n\\fi",
    "\\ref{sec:beispiel}\n\\customPreamble",
    "\\ref{sec:beispiel}\n\\title{unfinished",
    "Siehe $x + \\ref{sec:beispiel}",
  ])("does not move ambiguous preamble constructs: %s", (preamble) => {
    expect(
      repair(
        `\\documentclass{article}\n${preamble}\n\\begin{document}\nInhalt\n\\end{document}`,
        2,
      ),
    ).toEqual([]);
  });
  it("restores a missing document start after complete multiline preamble commands", () => {
    const source =
      "\\documentclass{article}\n\\usepackage{amsmath}\n\\title{A title\nwith two lines}\n\\author{Name}\n\\maketitle\nText.\n\\end{document}\n";
    const changes = repair(source, 6);
    expect(changes).toHaveLength(1);
    expect(changes[0].after).toContain(
      "\\author{Name}\n\\begin{document}\n\\maketitle",
    );
    expect(changes[0].after).toContain("A title\nwith two lines");
  });
  it("keeps accidentally typed preamble text by moving it into the document", () => {
    const source =
      "\\documentclass{article}\nVersehentlich hier geschrieben.\n\\title{Arbeit}\n\\author{Name}\n\\begin{document}\n\\maketitle\nInhalt.\n\\end{document}\n";
    const after = repair(source, 2)[0].after;
    expect(after).toContain("\\documentclass{article}\n\\title{Arbeit}");
    expect(after).toContain(
      "\\begin{document}\nVersehentlich hier geschrieben.",
    );
    expect(after.match(/Versehentlich hier geschrieben\./g)).toHaveLength(1);
    expect(after).toContain("\\author{Name}");
    expect(after).toContain("Inhalt.");
  });
  it("preserves CRLF and can restore both document boundaries", () => {
    const after = repair(
      "\\documentclass{article}\r\n\\usepackage{amsmath}\r\nText.",
      3,
    )[0].after;
    expect(after).toContain("\\begin{document}\r\nText.");
    expect(after).toContain("\\end{document}\r\n");
    expect(after.replaceAll("\r\n", "")).not.toContain("\n");
  });
  it.each([
    "\\documentclass{article}\n\\newcommand{\\word}{Multiline\nargument}\n\\title{Title}\n\\begin{document}\n\\end{document}",
    "\\documentclass{article}\n\\ifdefined\\special\nBody\n\\fi\n\\end{document}",
    "\\documentclass{article}\n\\myOwnPreamble\nBody\n\\end{document}",
    "\\section{Chapter}\nBody",
  ])(
    "does not infer a boundary inside definitions or unknown preamble constructs",
    (source) => {
      expect(repair(source, 2)).toEqual([]);
    },
  );
  it("does not change an unrelated main document for an error in another file", () => {
    const source = "\\documentclass{article}\nText\n\\end{document}";
    expect(
      planCompilerFixes(
        "other/main.tex:2: LaTeX Error: Missing \\begin{document}.",
        "main.tex",
        { "main.tex": source, "other/main.tex": source },
      ),
    ).toEqual([]);
  });
});
