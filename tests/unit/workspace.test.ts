import { describe, expect, it } from "vitest";
import {
  searchSources,
  rankFiles,
  parseDiagnostics,
  resolveDiagnosticFile,
  rankActions,
} from "../../src/app/workspace";

describe("project navigation", () => {
  it("finds actions by all query terms and aliases, ranking names ahead of keywords", () => {
    const actions = [
      { name: "Projekt öffnen", group: "Projekt", keywords: "PDF speichern" },
      { name: "PDF exportieren", group: "Projekt", keywords: "speichern" },
      {
        name: "Literatur verwalten",
        group: "Wissenschaft",
        keywords: "Quellen BibTeX",
      },
    ];
    expect(
      rankActions(actions, "pdf speichern").map((item) => item.name),
    ).toEqual(["PDF exportieren", "Projekt öffnen"]);
    expect(rankActions(actions, "quellen wissenschaft")).toEqual([actions[2]]);
    expect(rankActions(actions, "oeffnen")).toEqual([actions[0]]);
    expect(rankActions(actions, "unbekannt")).toEqual([]);
    expect(rankActions(actions, "  ")).toEqual(actions);
  });
  it("finds every occurrence with exact source columns across files", () => {
    const { hits } = searchSources(
      { "main.tex": "A Modell Modell\r\nEnde", "chapters/a.tex": "Das modell" },
      "Modell",
    );
    expect(hits.map((h) => [h.file, h.line, h.column, h.length])).toEqual([
      ["main.tex", 1, 3, 6],
      ["main.tex", 1, 10, 6],
      ["chapters/a.tex", 1, 5, 6],
    ]);
  });
  it("supports literal special characters, case and Unicode word boundaries", () => {
    expect(
      searchSources({ a: "Äpfel Äpfelbaum äpfel" }, "Äpfel", {
        caseSensitive: true,
        wholeWord: true,
      }).hits,
    ).toHaveLength(1);
    expect(
      searchSources({ a: "\\ref{a} \\ref{b}" }, "\\ref{").hits,
    ).toHaveLength(2);
    expect(searchSources({ a: "abc" }, "").hits).toEqual([]);
  });
  it("caps results without incorrectly claiming that the exact limit is truncated", () => {
    expect(searchSources({ a: "x x" }, "x", undefined, 2).truncated).toBe(
      false,
    );
    expect(searchSources({ a: "x x x" }, "x", undefined, 2)).toMatchObject({
      truncated: true,
      hits: expect.any(Array),
    });
    expect(searchSources({ a: "x x x" }, "x", undefined, 2).hits).toHaveLength(
      2,
    );
  });
  it("ranks file names ahead of folders and supports path tokens", () => {
    const paths = [
      "paper/main.tex",
      "chapters/paper.tex",
      "image.png",
      "references.bib",
    ];
    expect(rankFiles(paths, "paper", "", [])).toEqual([
      "chapters/paper.tex",
      "paper/main.tex",
    ]);
    expect(rankFiles(paths, "chap paper", "", [])).toEqual([
      "chapters/paper.tex",
    ]);
    expect(rankFiles(paths, "", "references.bib", ["references.bib"])[0]).toBe(
      "references.bib",
    );
    expect(rankFiles(paths, "png", "", [])).toEqual([]);
  });
});
describe("compiler diagnostics", () => {
  it("resolves the longest real path when a root and chapter share a filename", () => {
    const paths = ["main.tex", "chapters/main.tex"];
    expect(
      resolveDiagnosticFile("C:/project/chapters/main.tex", paths, "main.tex"),
    ).toBe("chapters/main.tex");
    expect(
      resolveDiagnosticFile("C:/project/Chapters/Main.tex", paths, "main.tex"),
    ).toBe("chapters/main.tex");
    expect(
      parseDiagnostics(
        "C:/project/chapters/main.tex:3: Missing $ inserted.\nchapters/main.tex:3: Missing $ inserted.",
        "main.tex",
        paths,
      ),
    ).toHaveLength(1);
  });
  it("tracks MiKTeX input paths containing spaces and extended Windows prefixes", () => {
    const log = String.raw`(//?/C:/Users/Research Project/main.tex
(C:\MiKTeX\article.cls
Document Class: article
)
(\\?\C:\Research Project\chapters/results.tex
LaTeX Warning: Reference 'eq:missing' on page 2 undefined on input line 3.
)
)`;
    const warning = parseDiagnostics(log, "main.tex")[0];
    expect(warning.file).toContain("Research Project/chapters/results.tex");
    expect(
      resolveDiagnosticFile(
        warning.file,
        ["main.tex", "chapters/results.tex"],
        "main.tex",
      ),
    ).toBe("chapters/results.tex");
  });
  it("distinguishes errors, warnings and typography with source locations", () => {
    const log = String.raw`(./main.tex
(./chapters/method.tex
LaTeX Warning: Reference 'eq:test' on page 2 undefined on input line 15.
Overfull \hbox (9.0pt too wide) in paragraph at lines 20--21
)
C:\work\main.tex:42: Undefined control sequence.
! Missing $ inserted.
<inserted text>
$
l.51 x
)`;
    const diagnostics = parseDiagnostics(log, "main.tex");
    expect(diagnostics.map((d) => [d.severity, d.line])).toEqual([
      ["warning", 15],
      ["info", 20],
      ["error", 42],
      ["error", 51],
    ]);
    expect(diagnostics[0].file).toBe("chapters/method.tex");
    expect(diagnostics[0].advice).toContain("Verweisschlüssel");
    expect(diagnostics[2].file).toBe("C:/work/main.tex");
  });
  it("deduplicates repeated diagnostics and safely resolves only project files", () => {
    expect(
      parseDiagnostics(
        "main.tex:5: Undefined control sequence.\nmain.tex:5: Undefined control sequence.",
        "main.tex",
      ),
    ).toHaveLength(1);
    expect(
      resolveDiagnosticFile(
        "C:\\work\\chapters\\a.tex",
        ["main.tex", "chapters/a.tex"],
        "main.tex",
      ),
    ).toBe("chapters/a.tex");
    expect(
      resolveDiagnosticFile("C:/texlive/article.cls", ["main.tex"], "main.tex"),
    ).toBeUndefined();
    expect(resolveDiagnosticFile(undefined, ["main.tex"], "main.tex")).toBe(
      "main.tex",
    );
  });
});
