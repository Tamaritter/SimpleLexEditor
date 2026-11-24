import { describe, it, expect } from "vitest";
import {
  automaticMainDocument,
  runAutomaticRepairs,
} from "../../src/latex/automaticRepairs";
import { planCompilerFixes } from "../../src/latex/compilerFixes";

describe("automatic repair flow", () => {
  it("repairs successive causes without another confirmation and checks the final PDF", async () => {
    const applied: number[] = [];
    const progress: string[] = [];
    let compiled = 0;
    const result = await runAutomaticRepairs({
      cancelled: () => false,
      progress: (message) => progress.push(message),
      compile: async () => ({ success: ++compiled === 4 }),
      next: async () => ({
        id: String(compiled),
        description: "Fix",
        apply: async () => {
          applied.push(compiled);
        },
      }),
    });
    expect(result).toEqual({ status: "success", rounds: 3 });
    expect(applied).toEqual([1, 2, 3]);
    expect(compiled).toBe(4);
    expect(progress.some((message) => message.includes("PDF"))).toBe(true);
  });
  it("stops on unknown errors without changing source", async () => {
    const source =
      "\\documentclass{article}\n\\begin{document}\n\\myUnknownMacro\n\\end{document}";
    const result = await runAutomaticRepairs({
      cancelled: () => false,
      progress: () => {},
      compile: async () => ({ success: false }),
      next: async () => {
        expect(
          planCompilerFixes(
            "main.tex:3: Undefined control sequence.\nl.3 \\myUnknownMacro",
            "main.tex",
            { "main.tex": source },
          ),
        ).toEqual([]);
        return null;
      },
    });
    expect(result).toEqual({ status: "blocked", rounds: 0 });
  });
  it("honours cancellation after compilation before applying any changes", async () => {
    let cancelled = false;
    let planned = false;
    const result = await runAutomaticRepairs({
      cancelled: () => cancelled,
      progress: () => {},
      compile: async () => {
        cancelled = true;
        return { success: false };
      },
      next: async () => {
        planned = true;
        return null;
      },
    });
    expect(result.status).toBe("cancelled");
    expect(planned).toBe(false);
  });
  it("stops repeat actions and bounds new failing actions", async () => {
    let count = 0;
    const repeated = await runAutomaticRepairs({
      cancelled: () => false,
      progress: () => {},
      compile: async () => ({ success: false }),
      next: async () => ({
        id: "same",
        description: "Fix",
        apply: async () => {
          count++;
        },
      }),
    });
    expect(repeated).toEqual({ status: "blocked", rounds: 1 });
    expect(count).toBe(1);
    const bounded = await runAutomaticRepairs(
      {
        cancelled: () => false,
        progress: () => {},
        compile: async () => ({ success: false }),
        next: async () => ({
          id: String(count++),
          description: "Fix",
          apply: async () => {},
        }),
      },
      3,
    );
    expect(bounded).toEqual({ status: "limit", rounds: 3 });
  });
  it("selects only one actual parent document, never an unrelated or ambiguous root", () => {
    const sources = {
      "chapter.tex": "\\section{Chapter}Text",
      "paper.tex":
        "\\documentclass{article}\n\\begin{document}\n\\input{chapter}\n\\end{document}",
      "other.tex":
        "\\documentclass{article}\n\\begin{document}Other\\end{document}",
    };
    expect(
      automaticMainDocument(sources, Object.keys(sources), "chapter.tex"),
    ).toBe("paper.tex");
    expect(
      automaticMainDocument(
        { ...sources, "second.tex": sources["paper.tex"] },
        [...Object.keys(sources), "second.tex"],
        "chapter.tex",
      ),
    ).toBeNull();
    expect(
      automaticMainDocument(sources, Object.keys(sources), "other.tex"),
    ).toBeNull();
  });
});
