import { describe, expect, it } from "vitest";
import {
  includeChapter,
  chapterPreviewDocument,
  isInside,
  isStandalone,
  hasDocumentClass,
  remapPath,
  standaloneDocument,
  validEntryPath,
  visibleEntries,
} from "../../src/projects/projectFiles";
describe("project structure and preview documents", () => {
  it("recognizes a repairable root without treating a chapter or literal example as one", () => {
    expect(
      hasDocumentClass("\\documentclass{article}\nText\n\\end{document}"),
    ).toBe(true);
    expect(
      isStandalone("\\documentclass{article}\nText\n\\end{document}"),
    ).toBe(false);
    expect(hasDocumentClass("\\section{Chapter}")).toBe(false);
    expect(hasDocumentClass("\\verb|\\documentclass{article}|")).toBe(false);
  });
  it("creates chapter previews using the main preamble without replacing the fragment", () => {
    const main =
      "\\documentclass{report}\n\\usepackage{amsthm}\n\\newtheorem{theorem}{Satz}\n\\begin{document}\nOld body\n\\end{document}";
    const preview = chapterPreviewDocument(
      main,
      "chapters/method.tex",
      "chapters/method-vorschau.tex",
    );
    expect(preview).toContain("\\documentclass{report}");
    expect(preview).toContain("\\newtheorem{theorem}{Satz}");
    expect(preview).toContain("\\input{chapters/method}");
    expect(preview).not.toContain("Old body");
    expect(preview.indexOf("\\null")).toBeGreaterThan(
      preview.indexOf("\\input"),
    );
  });
  it("distinguishes complete documents from chapters and commented examples", () => {
    expect(isStandalone(standaloneDocument("paper.tex"))).toBe(true);
    expect(isStandalone("\\section{Chapter}")).toBe(false);
    expect(isStandalone("% \\documentclass{article}\n\\begin{document}")).toBe(
      false,
    );
  });
  it("preserves chapter content when constructing an independent document", () => {
    const body = "\\section{Methods}\nText $x^2$.";
    const full = standaloneDocument("paper.tex", body);
    expect(full).toContain(body);
    expect(full.match(/\\documentclass/g)).toHaveLength(1);
    expect(full.indexOf(body)).toBeGreaterThan(
      full.indexOf("\\begin{document}"),
    );
  });
  it("inserts chapter inputs before the real document end and avoids duplicates", () => {
    const source = standaloneDocument("main.tex");
    const result = includeChapter(source, "chapters/method.tex");
    expect(result.inserted).toBe(true);
    expect(result.source).toContain("\\input{chapters/method}");
    expect(result.source.indexOf("\\input")).toBeLessThan(
      result.source.indexOf("\\end{document}"),
    );
    expect(includeChapter(result.source, "chapters/method.tex").inserted).toBe(
      false,
    );
    expect(
      includeChapter(
        source.replace(
          "\\end{document}",
          "% \\input{chapters/method}\n\\end{document}",
        ),
        "chapters/method.tex",
      ).inserted,
    ).toBe(true);
    expect(() => includeChapter("chapter only", "other.tex")).toThrow();
  });
  it("keeps remapping and removal inside the selected subtree", () => {
    expect(remapPath("chapters/one.tex", "chapters", "sections")).toBe(
      "sections/one.tex",
    );
    expect(remapPath("chapters-extra/one.tex", "chapters", "sections")).toBe(
      "chapters-extra/one.tex",
    );
    expect(isInside("chapters-extra/file", "chapters")).toBe(false);
  });
  it("rejects path traversal, reserved files and ambiguous names", () => {
    for (const path of [
      "",
      "../paper.tex",
      "a/../b.tex",
      "/main.tex",
      ".roxena/main.tex",
      "a\\b.tex",
      "CON.tex",
      "folder./x.tex",
      "a//b",
    ])
      expect(validEntryPath(path), path).toBe(false);
    expect(validEntryPath("kapitel/Einführung 2.tex")).toBe(true);
  });
  it("collapses descendants without hiding sibling entries", () => {
    const files = [
      { path: "a", name: "a", directory: true },
      { path: "a/main.tex", name: "main.tex", directory: false },
      { path: "b.tex", name: "b.tex", directory: false },
    ];
    expect(visibleEntries(files, new Set(["a"])).map((f) => f.path)).toEqual([
      "a",
      "b.tex",
    ]);
  });
});
