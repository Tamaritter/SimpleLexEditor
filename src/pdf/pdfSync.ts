import type { PdfPosition } from "../core/api";
import { maskTex, sourceLineIndex } from "../editor/texAnalysis";

/** SyncTeX often reports an equation's closing line; reveal its entire source. */
export function pdfSourceSelection(source: string, reportedLine: number) {
  const lines = source.split(/\r?\n/);
  const line = Math.max(1, Math.min(reportedLine, lines.length));
  const clean = maskTex(source);
  const lineAt = sourceLineIndex(clean);
  const ranges: { from: number; to: number }[] = [];
  const stack: { name: string; start: number }[] = [];
  for (const token of clean.matchAll(/\\(begin|end)\s*\{([^}]+)\}/g)) {
    if (token[1] === "begin")
      stack.push({ name: token[2], start: token.index });
    else {
      const open = stack.pop();
      if (!open || open.name !== token[2]) continue;
      if (
        /^(?:equation|align|alignat|gather|multline|flalign|displaymath)\*?$/.test(
          open.name,
        )
      )
        ranges.push({
          from: lineAt(open.start),
          to: lineAt(token.index + token[0].length),
        });
    }
  }
  for (const display of clean.matchAll(/\\\[[\s\S]*?\\\]/g))
    ranges.push({
      from: lineAt(display.index),
      to: lineAt(display.index + display[0].length),
    });
  const range = ranges
    .filter((range) => range.from <= line && range.to >= line)
    .sort((a, b) => a.to - a.from - (b.to - b.from))[0] || {
    from: line,
    to: line,
  };
  return {
    line: range.from,
    column: 1,
    length: lines.slice(range.from - 1, range.to).join("\n").length,
  };
}

/** Convert a CSS click through the exact rendered viewport, independent of DPI. */
export function pdfSourcePosition(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
  viewport: {
    width: number;
    height: number;
    convertToPdfPoint: (x: number, y: number) => number[];
  },
  view: number[],
  page: number,
  userUnit = 1,
): PdfPosition | null {
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    !Number.isInteger(page) ||
    page < 1
  )
    return null;
  const x = clientX - bounds.left,
    y = clientY - bounds.top;
  if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) return null;
  const [pdfX, pdfY] = viewport.convertToPdfPoint(
    (x * viewport.width) / bounds.width,
    (y * viewport.height) / bounds.height,
  );
  const result = {
    page,
    x: (pdfX - view[0]) * userUnit,
    y: (view[3] - pdfY) * userUnit,
  };
  return Number.isFinite(result.x) &&
    Number.isFinite(result.y) &&
    result.x >= 0 &&
    result.y >= 0
    ? result
    : null;
}
