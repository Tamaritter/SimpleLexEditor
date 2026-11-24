import { describe, expect, it } from "vitest";
import { pdfSourcePosition, pdfSourceSelection } from "../../src/pdf/pdfSync";

describe("PDF source selection", () => {
  it("selects an entire equation even when SyncTeX points at the closing line", () => {
    const source =
      "\\begin{document}\r\nText\r\n\\begin{equation}\r\nE=mc^2\r\n\\end{equation}\r\n\\end{document}";
    expect(pdfSourceSelection(source, 5)).toEqual({
      line: 3,
      column: 1,
      length: "\\begin{equation}\nE=mc^2\n\\end{equation}".length,
    });
  });
  it("recognizes display delimiters but ignores comments and literal examples", () => {
    const source =
      "% \\begin{equation}\nText\n\\[\nx^2\n\\]\n\\begin{verbatim}\n\\begin{equation}\nexample\n\\end{equation}\n\\end{verbatim}";
    expect(pdfSourceSelection(source, 4)).toEqual({
      line: 3,
      column: 1,
      length: "\\[\nx^2\n\\]".length,
    });
    expect(pdfSourceSelection(source, 8)).toEqual({
      line: 8,
      column: 1,
      length: "example".length,
    });
    expect(pdfSourceSelection(source, 2)).toEqual({
      line: 2,
      column: 1,
      length: 4,
    });
  });
});

describe("PDF source coordinates", () => {
  const view = [0, 0, 600, 800];
  it("maps the same PDF point at different CSS zoom levels without using the device pixel ratio", () => {
    for (const scale of [0.5, 1, 2]) {
      const bounds = {
        left: 40,
        top: 100,
        width: 600 * scale,
        height: 800 * scale,
      };
      const viewport = {
        width: 600 * scale,
        height: 800 * scale,
        convertToPdfPoint: (x: number, y: number) => [
          x / scale,
          800 - y / scale,
        ],
      };
      expect(
        pdfSourcePosition(
          40 + 300 * scale,
          100 + 400 * scale,
          bounds,
          viewport,
          view,
          3,
        ),
      ).toEqual({ page: 3, x: 300, y: 400 });
    }
  });
  it("accounts for viewport rotation and nonzero page origins", () => {
    const viewport = {
      width: 800,
      height: 600,
      convertToPdfPoint: (x: number, y: number) => [y + 10, x + 20],
    };
    expect(
      pdfSourcePosition(
        200,
        300,
        { left: 0, top: 0, width: 800, height: 600 },
        viewport,
        [10, 20, 610, 820],
        1,
      ),
    ).toEqual({ page: 1, x: 300, y: 600 });
  });
  it("scales PDF user units to big points", () => {
    const viewport = {
      width: 600,
      height: 800,
      convertToPdfPoint: (x: number, y: number) => [x, 800 - y],
    };
    expect(
      pdfSourcePosition(
        30,
        40,
        { left: 0, top: 0, width: 600, height: 800 },
        viewport,
        view,
        1,
        2,
      ),
    ).toEqual({ page: 1, x: 60, y: 80 });
    expect(
      pdfSourcePosition(
        -1,
        0,
        { left: 0, top: 0, width: 600, height: 800 },
        viewport,
        view,
        1,
      ),
    ).toBeNull();
    expect(
      pdfSourcePosition(
        0,
        0,
        { left: 0, top: 0, width: 0, height: 800 },
        viewport,
        view,
        1,
      ),
    ).toBeNull();
    expect(
      pdfSourcePosition(
        NaN,
        0,
        { left: 0, top: 0, width: 600, height: 800 },
        viewport,
        view,
        1,
      ),
    ).toBeNull();
  });
});
