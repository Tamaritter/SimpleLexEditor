import { describe, expect, it } from "vitest";
import {
  bibliographyWorkflow,
  citationCode,
  planBibImport,
  readBibRecords,
  decodeBibFile,
} from "../../src/research/bibliography";
import { parseBib } from "../../src/research/scientific";
const entry = (key: string) =>
  `@article{${key}, title={A {Scientific} Result}, author={Doe, Jane}, year={2026}}`;
describe("bibliography import", () => {
  it("preserves UTF-8 characters and rejects malformed byte sequences before import", () => {
    const source = "@book{Döe,title={Énergie und Wärme}}";
    expect(decodeBibFile(new TextEncoder().encode(source))).toBe(source);
    expect(() =>
      decodeBibFile(new Uint8Array([0x43, 0x61, 0x66, 0xe9])),
    ).toThrow("nicht gültig UTF-8");
  });
  it("imports complete source records unchanged and skips existing or repeated keys", () => {
    const incoming =
      entry("Existing") + "\n" + entry("New") + "\n" + entry("New");
    const plan = planBibImport(
      incoming,
      { "refs.bib": entry("Existing") },
      "refs.bib",
    );
    expect(plan.entries.map((e) => e.key)).toEqual(["New"]);
    expect(plan.duplicates).toEqual(["Existing", "New"]);
    expect(plan.additions).toContain(entry("New"));
    expect(plan.additions).not.toContain(entry("Existing"));
  });
  it("preserves BibTeX string definitions, concatenation, comments, preambles, math and percent URLs", () => {
    const text = String.raw`% Exported from a reference manager
@string{journalname = {Journal}}
@preamble{"\newcommand{\noop}[1]{}"}
@comment{Information about this export}
@article{Quantum,
 title = {A $\mathbb{R}$ model},
 journal = journalname # { Letters},
 url = {https://example.org/file%20name},
 year = {2026}
}`;
    const plan = planBibImport(text, {}, "refs.bib");
    expect(plan.entries).toHaveLength(1);
    for (const preserved of [
      "@string",
      "@preamble",
      "@comment",
      "journalname #",
      "file%20name",
      "$\\mathbb{R}$",
    ])
      expect(plan.additions).toContain(preserved);
  });
  it("supports parenthesized BibTeX records and quoted nested text", () => {
    const source =
      '@book(Book, title="A {Nested} title (with unmatched opening", author={Doe}, year=2026)';
    expect(readBibRecords(source)[0].key).toBe("Book");
    expect(parseBib(source, "refs.bib")[0].title).toContain("Nested");
    expect(planBibImport(source, {}, "refs.bib").entries).toHaveLength(1);
  });
  it("blocks conflicting string definitions rather than changing existing meanings", () => {
    const plan = planBibImport(
      "@string{journal={New}}\n" + entry("New"),
      { "old.bib": "@string{journal={Old}}\n" + entry("Old") },
      "refs.bib",
    );
    expect(plan.conflicts).toEqual(["journal"]);
    expect(plan.additions).toBe("");
  });
  it.each([
    "@article{unfinished, title={Hello}",
    "@article{missingComma title={Hello}}",
    '@book{key, title="Unclosed}',
    "@string{noValue}",
    "This is not BibTeX",
  ])("rejects incomplete input: %s", (text) => {
    expect(() => planBibImport(text, {}, "refs.bib")).toThrow();
  });
  it("does not append to a structurally broken target bibliography", () => {
    expect(() =>
      planBibImport(
        entry("New"),
        { "refs.bib": "@book{unfinished" },
        "refs.bib",
      ),
    ).toThrow("Zieldatei");
  });
  it("finds duplicate keys in parenthesized existing records", () => {
    expect(
      planBibImport(
        entry("Existing"),
        { "refs.bib": "@book(Existing,title={Book})" },
        "refs.bib",
      ).duplicates,
    ).toEqual(["Existing"]);
  });
});
describe("scientific citations", () => {
  it("detects workflows in included preambles without treating body text as packages", () => {
    expect(
      bibliographyWorkflow("main.tex", {
        "main.tex": "\\input{preamble}\n\\begin{document}Text\\end{document}",
        "preamble.tex": "\\usepackage[backend=biber]{biblatex}",
      }),
    ).toBe("biblatex");
    expect(
      bibliographyWorkflow("main.tex", {
        "main.tex":
          "\\begin{document}\n% \\usepackage{biblatex}\n\\end{document}",
      }),
    ).toBe("plain");
  });
  it("combines unique keys and supports page notes without injecting a new citation package", () => {
    expect(
      citationCode(["A", "B", "A"], "cite", "plain", "vgl.", "S. 12–15"),
    ).toBe("vgl.~\\cite[S. 12–15]{A,B}");
    expect(
      citationCode(["A", "B"], "parencite", "biblatex", "vgl.", "12–15"),
    ).toBe("\\parencite[vgl.][12–15]{A,B}");
    expect(citationCode(["A"], "citep", "natbib", "", "S. 12")).toBe(
      "\\citep[S. 12]{A}",
    );
    expect(citationCode(["A"], "textcite", "biblatex", "siehe", "")).toBe(
      "\\textcite[siehe][]{A}",
    );
  });
  it("protects optional argument brackets and escapes plain-text notes", () => {
    expect(citationCode(["A"], "cite", "plain", "", "[Teil] & 50%")).toBe(
      "\\cite[{[}Teil{]} \\& 50\\%]{A}",
    );
    expect(() => citationCode(["bad}key"], "cite", "plain")).toThrow();
    expect(() => citationCode(["A"], "citep", "biblatex")).toThrow();
  });
});
