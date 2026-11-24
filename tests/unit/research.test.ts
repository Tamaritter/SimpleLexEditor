import { describe, expect, it } from "vitest";
import {
  inspectResearchProject,
  researchReportText,
} from "../../src/research/research";
const main = (body: string) =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}`;
describe("scientific project inspection", () => {
  it("checks only the chosen document and its chapters and indexes mathematics", () => {
    const report = inspectResearchProject("main.tex", {
      "main.tex": main("\\input{chapters/results}\nSiehe \\eqref{eq:energy}."),
      "chapters/results.tex":
        "\\section{Ergebnis}\n\\begin{equation}\nE=mc^2\\label{eq:energy}\n\\end{equation}",
      "unused.tex": "\\ref{missing}\\label{eq:energy}\n% TODO inactive draft",
    });
    expect(report.files).toEqual(["main.tex", "chapters/results.tex"]);
    expect(report.issues).toEqual([]);
    expect(report.counts.equations).toBe(1);
    expect(report.structure).toContainEqual(
      expect.objectContaining({
        kind: "equation",
        label: "eq:energy",
        file: "chapters/results.tex",
        line: 2,
      }),
    );
  });
  it("reports missing and duplicate labels at source locations", () => {
    const report = inspectResearchProject("main.tex", {
      "main.tex": main("\\label{sec:a}\n\\label{sec:a}\n\\ref{sec:b}"),
    });
    expect(
      report.issues.filter((i) => i.title === "Label mehrfach definiert"),
    ).toHaveLength(2);
    expect(
      report.issues.find((i) => i.title === "Verweisziel nicht gefunden"),
    ).toMatchObject({ file: "main.tex", line: 5, severity: "error" });
  });
  it("detects cycles without recursively expanding them forever", () => {
    const report = inspectResearchProject("main.tex", {
      "main.tex": main("\\input{a}"),
      "a.tex": "\\input{main}",
    });
    expect(
      report.issues.some((i) => i.title === "Zyklische Dateieinbindung"),
    ).toBe(true);
    expect(report.files).toHaveLength(2);
  });
  it("respects includeonly and leaves unrelated chapters out of the check", () => {
    const report = inspectResearchProject("main.tex", {
      "main.tex": main("\\includeonly{a}\n\\include{a}\n\\include{b}"),
      "a.tex": "\\label{sec:a}",
      "b.tex": "\\ref{missing}",
    });
    expect(report.files).toEqual(["main.tex", "a.tex"]);
    expect(report.issues).toEqual([]);
  });
  it("handles root, relative chapter and recursive TeX input paths", () => {
    const report = inspectResearchProject("paper/main.tex", {
      "paper/main.tex": main("\\input{chapter}\n\\input{shared/preamble}"),
      "paper/chapter.tex": "Text.",
      "shared/preamble.tex": "More text.",
    });
    expect(report.files).toContain("paper/chapter.tex");
    expect(report.issues).toEqual([]);
  });
  it("resolves citations only from loaded bibliography files and manual bibitems", () => {
    const sources = {
      "main.tex": main(
        "\\cite{Loaded,Unloaded,Missing,Manual}\n\\bibliography{refs}\n\\begin{thebibliography}{9}\n\\bibitem{Manual} A book.\n\\end{thebibliography}",
      ),
      "refs.bib": "@book{Loaded,title={Book}}",
      "unused.bib": "@book{Unloaded,title={Other}}",
    };
    const report = inspectResearchProject("main.tex", sources);
    expect(report.counts.citations).toBe(4);
    expect(report.issues.filter((i) => i.group === "literature")).toHaveLength(
      2,
    );
    expect(
      report.issues.find((i) => i.title === "Literaturdatei nicht eingebunden")
        ?.detail,
    ).toContain("unused.bib");
    expect(
      report.issues.find((i) => i.title === "Zitierte Quelle nicht gefunden")
        ?.detail,
    ).toContain("Missing");
  });
  it("supports biblatex resources defined in an included preamble", () => {
    const report = inspectResearchProject("main.tex", {
      "main.tex":
        "\\documentclass{article}\n\\input{preamble}\n\\begin{document}\n\\autocite[12]{Smith}\n\\end{document}",
      "preamble.tex": "\\usepackage{biblatex}\n\\addbibresource{library.bib}",
      "library.bib": "@article{Smith,title={Study}}",
    });
    expect(report.bibliography).toEqual(["library.bib"]);
    expect(report.issues).toEqual([]);
  });
  it("ignores literal examples, comments, dynamic references and wildcard citations", () => {
    const report = inspectResearchProject("main.tex", {
      "main.tex": main(
        "% \\ref{comment}\n\\verb|\\ref{literal}|\n\\begin{verbatim}\n\\cite{example}\n\\end{verbatim}\n\\ref{\\dynamic}\n\\nocite{*}",
      ),
    });
    expect(report.issues).toEqual([]);
    expect(report.counts.citations).toBe(0);
  });
  it("retains TODO comments but does not report todos in code samples", () => {
    const report = inspectResearchProject("main.tex", {
      "main.tex": main(
        "% TODO Messfehler prüfen\n\\begin{verbatim}\nTODO sample\n\\end{verbatim}",
      ),
    });
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      title: "Offene Aufgabe",
      line: 3,
      severity: "warning",
    });
  });
  it("detects a theorem inside math and places unlabeled statements in the index", () => {
    const report = inspectResearchProject("main.tex", {
      "main.tex": main(
        "\\[\n\\begin{definition}[Stetigkeit]\nText\n\\end{definition}\n\\]",
      ),
    });
    expect(
      report.issues.some((i) => i.title === "Aussage im Mathematikmodus"),
    ).toBe(true);
    expect(report.structure).toContainEqual(
      expect.objectContaining({ kind: "theorem", title: "Stetigkeit" }),
    );
  });
  it("checks figure label placement and real graphics paths including detokenize", () => {
    const source = main(
      "\\begin{figure}\n\\includegraphics{\\detokenize{figures/my plot.png}}\n\\label{fig:a}\n\\caption{Messung}\n\\end{figure}\n\\includegraphics{missing.png}",
    );
    const report = inspectResearchProject("main.tex", { "main.tex": source }, [
      "main.tex",
      "figures/my plot.png",
    ]);
    expect(
      report.issues.filter((i) => i.title === "Bilddatei nicht gefunden"),
    ).toHaveLength(1);
    expect(
      report.issues.some((i) => i.title === "Label steht vor der Beschriftung"),
    ).toBe(true);
    expect(report.structure).toContainEqual(
      expect.objectContaining({
        kind: "figure",
        title: "Messung",
        label: "fig:a",
      }),
    );
  });
  it("does not recommend labels for deliberately unnumbered equations", () => {
    const report = inspectResearchProject("main.tex", {
      "main.tex": main("\\begin{equation*}\nx=y\n\\end{equation*}"),
    });
    expect(report.issues).toEqual([]);
  });
  it("reports unreadable chapters without falsely declaring their labels absent", () => {
    const report = inspectResearchProject(
      "main.tex",
      { "main.tex": main("\\input{chapter}\n\\ref{eq:in-unread-file}") },
      ["main.tex", "chapter.tex"],
    );
    expect(
      report.issues.some((i) => i.title === "Datei nicht analysiert"),
    ).toBe(true);
    expect(
      report.issues.some((i) => i.title === "Verweisziel nicht gefunden"),
    ).toBe(false);
  });
  it("produces a useful plain-text report with source evidence", () => {
    const report = inspectResearchProject("main.tex", {
      "main.tex": main("\\ref{missing}"),
    });
    expect(researchReportText(report)).toContain("main.tex:3");
    expect(researchReportText(report)).toContain("missing");
  });
});
