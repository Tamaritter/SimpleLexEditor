import { describe, expect, it } from "vitest";
import {
  ensurePreamble,
  bodyInsertionRange,
  preambleDependencies,
  inMath,
  formatScientificCode,
  matrixCode,
  parseBib,
  parseLabels,
  bibEntryCode,
  theoremBlocks,
  scientificInsertionRange,
} from "../../src/research/scientific";
import { mathCatalog } from "../../src/math/mathCatalog";
import katex from "katex";
const main =
  "\\documentclass{article}\n% \\begin{document} fake\n\\usepackage{amsmath,amssymb}\n\\begin{document}\nText\n\\end{document}";
describe("scientific editing", () => {
  it("inserts statements after the surrounding formula and preserves its selected content", () => {
    for (const formula of [
      "\\[\nx+y\n\\]",
      "$x+y$",
      "\\begin{equation}\nx+y\n\\end{equation}",
    ]) {
      const source = `\\begin{document}\n${formula}\n\\end{document}`;
      const from = source.indexOf("x+y");
      const range = scientificInsertionRange(source, from, from + 3, {
        code: theoremBlocks[0].code,
        outsideMath: true,
      });
      const expected = source.indexOf(formula) + formula.length;
      expect(range).toEqual({ from: expected, to: expected });
    }
    expect(() =>
      scientificInsertionRange("\\[ x+y", 5, 5, {
        code: "Definition",
        outsideMath: true,
      }),
    ).toThrow("Schließe zuerst");
  });
  it("preserves theorem definitions and packages in an included preamble, including cyclic input files", () => {
    const text =
      "\\documentclass{article}\n\\input{config/preamble}\n\\begin{document}\n\\input{body}\n\\end{document}";
    const sources = {
      "config/preamble.tex":
        "\\usepackage{amsthm}\n\\newtheorem{theorem}{Custom theorem}\n\\input{other}",
      "other.tex": "\\input{config/preamble}",
      "body.tex": "\\usepackage{mathtools}",
    };
    const context = preambleDependencies(text, sources, "main.tex");
    expect(context).toContain("Custom theorem");
    expect(context).not.toContain("mathtools");
    expect(
      ensurePreamble(text, {
        packages: ["amsthm"],
        declarations: [theoremBlocks[0].declaration],
        preambleContext: context,
      }).added,
    ).toBe("");
  });
  it("places body elements inside the document when the cursor is in the preamble or after the end", () => {
    const end = main.lastIndexOf("\\end{document}");
    expect(bodyInsertionRange(main, 0, 0)).toEqual({ from: end, to: end });
    expect(bodyInsertionRange(main, main.length, main.length)).toEqual({
      from: end,
      to: end,
    });
    expect(bodyInsertionRange("Kapiteltext", 2, 4)).toEqual({ from: 2, to: 4 });
  });
  it("inserts missing packages at the real preamble and avoids duplicates", () => {
    const prepared = ensurePreamble(main, {
      packages: ["amsmath", "amsthm"],
      declarations: [theoremBlocks[0].declaration],
    });
    expect(prepared.source.match(/\\usepackage\{amsmath/g)).toHaveLength(1);
    expect(prepared.source.indexOf("\\usepackage{amsthm}")).toBeLessThan(
      prepared.source.lastIndexOf("\\begin{document}"),
    );
    expect(
      ensurePreamble(prepared.source, {
        packages: ["amsthm"],
        declarations: [theoremBlocks[0].declaration],
      }).added,
    ).toBe("");
    expect(prepared.source.indexOf("\\usepackage{amsthm}")).toBeGreaterThan(
      prepared.source.indexOf("% \\begin{document} fake"),
    );
  });
  it("recognizes math contexts and avoids nested formula delimiters", () => {
    for (const source of ["$x+", "$$x+", "\\(x+", "\\[x+", "\\begin{align}x&="])
      expect(inMath(source, source.length)).toBe(true);
    for (const source of [
      "\\$20",
      "$x$ text",
      "% $comment\ntext",
      "\\[x\\] text",
    ])
      expect(inMath(source, source.length)).toBe(false);
    expect(
      formatScientificCode(
        { code: "\\alpha", math: true, mode: "display" },
        "$x+",
        3,
      ),
    ).toBe("\\alpha");
    expect(
      formatScientificCode(
        { code: "x", math: true, mode: "numbered", label: "eq:x" },
        "",
        0,
      ),
    ).toContain("\\label{eq:x}");
  });
  it("generates rectangular matrices with rows, columns and fallback cells", () => {
    const code = matrixCode(2, 3, "bmatrix", ["1", "2", "3", "4"]);
    expect(code).toContain("1 & 2 & 3 \\\\");
    expect(code).toContain("4 & 0 & 0");
    expect(code).toContain("\\end{bmatrix}");
  });
  it("parses nested BibTeX braces, quoted fields and bare years without truncation", () => {
    const bib =
      '@article{key, title={A {Nested} Result}, author="Doe, Jane and Doe, John", year=2026, journal={Test}}\n@book{other, title="Other title", author={Smith}, year={2025}}';
    expect(parseBib(bib, "refs.bib")).toEqual([
      {
        key: "key",
        type: "article",
        title: "A Nested Result",
        author: "Doe, Jane and Doe, John",
        year: "2026",
        file: "refs.bib",
      },
      {
        key: "other",
        type: "book",
        title: "Other title",
        author: "Smith",
        year: "2025",
        file: "refs.bib",
      },
    ]);
  });
  it("ignores commented labels and reports their actual lines", () =>
    expect(
      parseLabels(
        "% \\label{ignore}\n\\label{sec:one}\n\\label{eq:two}",
        "main.tex",
      ),
    ).toEqual([
      { key: "sec:one", file: "main.tex", line: 2 },
      { key: "eq:two", file: "main.tex", line: 3 },
    ]));
  it("validates bibliography keys and safely serializes text fields", () => {
    expect(() =>
      bibEntryCode({
        type: "article",
        key: "bad}key",
        title: "Title",
        author: "Name",
        year: "2026",
        venue: "",
        doi: "",
        url: "",
      }),
    ).toThrow();
    const entry = bibEntryCode({
      type: "article",
      key: "doe2026",
      title: "A & B",
      author: "Doe, Jane",
      year: "2026",
      venue: "Journal",
      doi: "10.1/test",
      url: "",
    });
    expect(entry).toContain("A \\& B");
    expect(parseBib(entry, "refs.bib")[0].key).toBe("doe2026");
  });
  it("renders every math library item without a KaTeX error", () => {
    expect(mathCatalog.length).toBeGreaterThan(150);
    for (const entry of mathCatalog)
      expect(
        () =>
          katex.renderToString(entry.code, {
            throwOnError: true,
            trust: false,
            strict: "ignore",
          }),
        entry.name,
      ).not.toThrow();
  });
});
