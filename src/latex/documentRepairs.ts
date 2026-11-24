import { maskTex, environmentStack } from "../editor/texAnalysis";
import type { Diagnostic } from "../app/workspace";

const referenceCommand =
  /^(?:ref|pageref|eqref|autoref|nameref|cref|Cref|vref|Vref)\b/;

// Read complete top-level preamble commands, including multiline arguments.
// A boundary inside a macro definition or a conditional is never inferred.
function bodyBoundary(source: string, limit: number) {
  const clean = maskTex(source);
  let at = 0;
  const preamble = new Set(
    "documentclass usepackage RequirePackage PassOptionsToPackage title author date thanks newcommand renewcommand providecommand DeclareRobustCommand newenvironment renewenvironment newtheorem theoremstyle setlength addtolength setcounter newcounter newlength geometry hypersetup graphicspath DeclareMathOperator addbibresource bibliographystyle pagestyle pagenumbering linespread selectlanguage".split(
      " ",
    ),
  );
  const body =
    /^(?:maketitle|section|subsection|chapter|part|paragraph|begin|tableofcontents|listoffigures|listoftables|noindent|textbf|textit|emph|label|cite|ref|eqref|printbibliography|bibliography)\b/;
  while (at < limit) {
    while (at < limit && /\s/.test(clean[at])) at++;
    if (at >= limit) return null;
    const start = at;
    if (clean[at] !== "\\") return start;
    const token = clean.slice(at).match(/^\\([a-zA-Z]+)\*?/);
    if (!token) return start;
    if (body.test(token[1]) || referenceCommand.test(token[1])) return start;
    if (!preamble.has(token[1])) return undefined;
    at += token[0].length;
    let argumentsRead = 0;
    while (at < limit) {
      while (at < limit && /\s/.test(clean[at])) at++;
      const open = clean[at];
      if (open !== "{" && open !== "[") break;
      const close = open === "{" ? "}" : "]";
      let depth = 1;
      let braces = 0;
      at++;
      while (at < limit && depth) {
        if (clean[at] === "\\") {
          at += 2;
          continue;
        }
        if (open === "[") {
          if (clean[at] === "{") braces++;
          if (clean[at] === "}") braces--;
          if (braces < 0) return undefined;
        }
        if (!braces && clean[at] === open) depth++;
        if (!braces && clean[at] === close) depth--;
        at++;
      }
      if (depth) return undefined;
      argumentsRead++;
    }
    if (!argumentsRead) return undefined;
  }
  return null;
}

// Only ordinary text and complete reference calls may be moved out of the
// preamble. Keep definitions, unknown macros and incomplete arguments in place.
function misplacedParagraph(clean: string) {
  let at = 0;
  let content = false;
  while (at < clean.length) {
    const text = clean.slice(at).match(/^[^\\{}$%]+/);
    if (text) {
      content ||= !!text[0].trim();
      at += text[0].length;
      continue;
    }
    const command = clean
      .slice(at)
      .match(/^\\([a-zA-Z]+)\*?\s*\{([^{}\\\r\n]+)\}/);
    if (!command || !referenceCommand.test(command[1])) break;
    content = true;
    at += command[0].length;
  }
  // Do not detach text from an incomplete command, group or math expression.
  if (
    !content ||
    (at < clean.length && !/^\\[a-zA-Z]+\b/.test(clean.slice(at)))
  )
    return null;
  const lastContent = clean.slice(0, at).trimEnd().length;
  const lineEnd = clean.indexOf("\n", lastContent);
  return lineEnd < 0 ? at : Math.min(at, lineEnd + 1);
}

// A float is moved only as a complete, balanced block. Its nested environments,
// captions, labels and graphics stay together; dynamic boundaries are declined.
function misplacedFloat(clean: string) {
  if (!/^\\begin\s*\{(?:figure|table)\*?\}/.test(clean)) return null;
  const stack: string[] = [];
  let braces = 0;
  for (const token of clean.matchAll(
    /\\(begin|end)\s*\{([^{}]+)\}|\\[a-zA-Z]+|\\[^a-zA-Z]|[{}]/g,
  )) {
    if (token[1]) {
      if (token[2] === "document") return null;
      if (token[1] === "begin") stack.push(token[2]);
      else if (stack.at(-1) === token[2]) stack.pop();
      else return null;
      if (!stack.length) {
        if (braces !== 0) return null;
        const end = token.index + token[0].length;
        const newline = clean.indexOf("\n", end);
        const lineEnd = newline < 0 ? clean.length : newline + 1;
        return clean.slice(end, lineEnd).trim() ? end : lineEnd;
      }
    } else {
      if (
        /^\\(?:if[a-zA-Z]*|else|or|fi|def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|DeclareRobustCommand|newenvironment|renewenvironment|NewDocumentCommand|RenewDocumentCommand|NewDocumentEnvironment|RenewDocumentEnvironment|catcode|csname|endcsname|expandafter|string|input|include|endinput|documentclass|usepackage|RequirePackage)\b/.test(
          token[0],
        )
      )
        return null;
      if (token[0] === "{") braces++;
      if (token[0] === "}") braces--;
      if (braces < 0) return null;
    }
  }
  return null;
}

export function repairDocumentStart(
  source: string,
  diagnostics: Diagnostic[],
  main: string,
): string | null {
  if (
    !diagnostics.some(
      (d) =>
        /Missing \\begin\{document\}/i.test(d.message) &&
        (!d.file || d.file.replaceAll("\\", "/").replace(/^\.\//, "") === main),
    )
  )
    return null;
  const clean = maskTex(source);
  if (
    [...clean.matchAll(/\\documentclass(?:\s*\[[^\]]*\])?\s*\{/g)].length !== 1
  )
    return null;
  const begins = [...clean.matchAll(/\\begin\s*\{document\}/g)];
  const ends = [...clean.matchAll(/\\end\s*\{document\}/g)];
  if (begins.length > 1 || ends.length > 1) return null;
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const boundary = bodyBoundary(
    source,
    begins[0]?.index ?? ends[0]?.index ?? source.length,
  );
  if (boundary == null) return null;
  if (begins.length) {
    // Validate the entire remaining preamble before committing any moves.
    // This also handles several floats separated by legitimate declarations.
    let rest = source;
    let limit = begins[0].index;
    let nextBoundary: number | null | undefined = boundary;
    const fragments: string[] = [];
    while (nextBoundary !== null) {
      if (nextBoundary === undefined || fragments.length >= 64) return null;
      const before = maskTex(rest).slice(nextBoundary, limit);
      const length = misplacedFloat(before) ?? misplacedParagraph(before);
      if (length === null || length === 0) return null;
      fragments.push(rest.slice(nextBoundary, nextBoundary + length).trimEnd());
      rest = rest.slice(0, nextBoundary) + rest.slice(nextBoundary + length);
      limit -= length;
      nextBoundary = bodyBoundary(rest, limit);
    }
    const insertion = limit + begins[0][0].length;
    return (
      rest.slice(0, insertion) +
      newline +
      fragments.join(newline) +
      newline +
      rest.slice(insertion)
    );
  }
  let result =
    source.slice(0, boundary) +
    "\\begin{document}" +
    newline +
    source.slice(boundary);
  if (!ends.length) {
    const stack = environmentStack(result, result.length);
    if (stack?.length !== 1 || stack[0] !== "document") return null;
    result += newline + "\\end{document}" + newline;
  }
  return result;
}
