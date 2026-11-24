import { describe, expect, it } from "vitest";
import {
  escapeTex,
  outline,
  parseErrors,
  tableSnippet,
  templates,
} from "../../src/core/model";
describe("LaTeX document helpers", () => {
  it("finds real section commands, including starred and optional titles, and ignores comments", () => {
    expect(
      outline(
        "% \\section{ignore}\n\\section[Short]{Introduction}\n\\subsection*{Details}",
      ),
    ).toEqual([
      { title: "Introduction", level: 1, line: 2 },
      { title: "Details", level: 2, line: 3 },
    ]);
  });
  it("escapes user text without permitting injected LaTeX", () => {
    expect(escapeTex("A & B_50%")).toBe("A \\& B\\_50\\%");
  });
  it("creates the requested number of table columns and rows", () => {
    const table = tableSnippet(2, 3, "A & B");
    expect(table).toContain("\\begin{tabular}{lll}");
    expect(table).toContain("Wert 2.3");
    expect(table).not.toContain("Wert 3.1");
    expect(table).toContain("\\caption{A \\& B}");
  });
  it("extracts line numbers from both TeX error formats", () => {
    expect(
      parseErrors(
        "main.tex:42: Undefined control sequence.\n! Missing $ inserted.\n<inserted text>\n$\nl.51 x",
      ),
    ).toEqual([
      { message: "Undefined control sequence.", line: 42, file: "main.tex" },
      { message: "Missing $ inserted.", line: 51 },
    ]);
  });
  it("provides complete documents in every starter template", () => {
    for (const template of templates) {
      expect(template.content).toContain("\\documentclass");
      expect(template.content).toContain("\\begin{document}");
      expect(template.content).toContain("\\end{document}");
    }
  });
});
