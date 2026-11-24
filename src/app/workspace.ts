import { compilerHelp, missingResource } from "../latex/compilerHelp";

export type SearchHit = {
  file: string;
  line: number;
  column: number;
  length: number;
  text: string;
};
export const textFile = (path: string) =>
  /\.(tex|bib|sty|cls|txt|md|csv|json|tikz|cfg|def|bst|latexmkrc)$/i.test(path);

export function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("de")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
}
export function rankActions<
  T extends { name: string; group: string; keywords?: string },
>(actions: T[], query: string): T[] {
  const parts = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return actions;
  return actions
    .map((action, order) => {
      const name = normalizeSearch(action.name);
      const text = `${name} ${normalizeSearch(action.group)} ${normalizeSearch(action.keywords || "")}`;
      if (!parts.every((part) => text.includes(part))) return null;
      const score = parts.reduce(
        (sum, part) =>
          sum +
          (name === part
            ? 100
            : name.startsWith(part)
              ? 60
              : name.includes(part)
                ? 40
                : 10),
        0,
      );
      return { action, order, score };
    })
    .filter(
      (entry): entry is { action: T; order: number; score: number } =>
        entry !== null,
    )
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.action);
}

export function searchSources(
  sources: Record<string, string>,
  query: string,
  options = { caseSensitive: false, wholeWord: false },
  limit = 500,
) {
  const hits: SearchHit[] = [];
  let truncated = false;
  if (!query || query.includes("\n")) return { hits, truncated };
  const needle = options.caseSensitive ? query : query.toLowerCase();
  const word = (ch: string) => /[\p{L}\p{N}_]/u.test(ch);
  outer: for (const [file, source] of Object.entries(sources)) {
    const lines = source.split(/\r?\n/);
    for (let row = 0; row < lines.length; row++) {
      const text = lines[row];
      const haystack = options.caseSensitive ? text : text.toLowerCase();
      let from = 0;
      while (from <= haystack.length - needle.length) {
        const at = haystack.indexOf(needle, from);
        if (at < 0) break;
        from = at + needle.length;
        if (
          options.wholeWord &&
          ((at > 0 && word(text[at - 1])) ||
            (at + needle.length < text.length &&
              word(text[at + needle.length])))
        )
          continue;
        if (hits.length >= limit) {
          truncated = true;
          break outer;
        }
        hits.push({
          file,
          line: row + 1,
          column: at + 1,
          length: query.length,
          text,
        });
      }
    }
  }
  return { hits, truncated };
}

export function rankFiles(
  paths: string[],
  query: string,
  active: string,
  open: string[],
) {
  const parts = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return paths
    .filter(textFile)
    .map((path) => {
      const lower = path.toLocaleLowerCase();
      if (!parts.every((part) => lower.includes(part))) return null;
      const name = lower.split("/").pop()!;
      const score = parts.length
        ? parts.reduce(
            (sum, part) =>
              sum +
              (name === part
                ? 100
                : name.startsWith(part)
                  ? 60
                  : name.includes(part)
                    ? 40
                    : 10),
            0,
          )
        : (open.includes(path) ? 20 : 0) + (path === active ? 5 : 0);
      return { path, score };
    })
    .filter((entry): entry is { path: string; score: number } => !!entry)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, "de"))
    .map((entry) => entry.path);
}

export type Diagnostic = {
  severity: "error" | "warning" | "info";
  message: string;
  file?: string;
  line?: number;
  advice?: string;
  context?: string;
  command?: string;
};

export function parseDiagnostics(
  log: string,
  main: string,
  paths?: string[],
): Diagnostic[] {
  const result: Diagnostic[] = [];
  const lines = log.replaceAll("\r", "").split("\n");
  // File nesting in TeX logs lets warnings in included chapters point to that chapter.
  const stack: (string | null)[] = [];
  let current = main;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    for (const token of raw.matchAll(
      /\((?:"([^"]+\.(?:tex|sty|cls))"|([^()\r\n]+?\.(?:tex|sty|cls))(?=[\s)]|$))?|\)/gi,
    )) {
      if (token[0] === ")") stack.pop();
      else stack.push(token[1] || token[2] || null);
    }
    current =
      [...stack]
        .reverse()
        .find((path): path is string => !!path && /\.tex$/i.test(path)) || main;
    let message = "",
      file: string | undefined,
      line: number | undefined;
    let severity: Diagnostic["severity"] = "error";
    const located = raw.match(
      /^(?:error:\s*)?(.+?\.(?:tex|sty|cls|bib|bst)):(\d+):\s*(.+)/i,
    );
    if (located) {
      [, file, , message] = located;
      line = Number(located[2]);
    } else if (raw.startsWith("!")) {
      message = raw.slice(1).trim();
      const following = lines.slice(i + 1, i + 12);
      const nextError = following.findIndex((l) =>
        /^!|^(?:.+?\.(?:tex|sty|cls)):\d+:/.test(l),
      );
      line =
        Number(
          following
            .slice(0, nextError < 0 ? undefined : nextError)
            .join("\n")
            .match(/\bl\.(\d+)/)?.[1],
        ) || undefined;
      file = current;
    } else if (
      /^(?:LaTeX(?: Font)?|Package \S+|Class \S+|pdfTeX) Warning:/.test(raw)
    ) {
      severity = "warning";
      message = raw.trim();
      let j = i + 1;
      while (
        !/\.$/.test(message) &&
        j < Math.min(lines.length, i + 7) &&
        lines[j].trim() &&
        (!/^(?:!|LaTeX|Package|Overfull|Underfull|\[|\(|\))/.test(lines[j]) ||
          /^\([a-z][\w-]*\)\s+\S/i.test(lines[j]))
      ) {
        message += " " + lines[j].replace(/^\([^)]*\)\s*/, "").trim();
        j++;
        if (/\.$/.test(message)) break;
      }
      line = Number(message.match(/on input line\s+(\d+)/i)?.[1]) || undefined;
      file = current;
    } else if (/^(?:Overfull|Underfull) \\[hv]box/.test(raw)) {
      severity = "info";
      message = raw.trim();
      line = Number(message.match(/at lines?\s+(\d+)/)?.[1]) || undefined;
      file = current;
    } else if (
      /^(?:ERROR\s+-|WARN\s+-|I (?:couldn't|could not) open|I found no|I was expecting|Illegal, another|Repeated entry|---line \d+ of file|Warning--)/.test(
        raw,
      ) ||
      /---line\s+\d+\s+of file/.test(raw)
    ) {
      message = raw.trim();
      severity = /^Warning--|^WARN\s+-/.test(raw) ? "warning" : "error";
      const bib = raw.match(/(?:---line|line)\s+(\d+)\s+of file\s+(.+)/i);
      if (bib) {
        line = Number(bib[1]);
        file = bib[2].trim();
      }
    } else if (
      raw.trim() &&
      compilerHelp({ message: raw }).kind !== "unknown" &&
      !/^\s|^l\.\d|^\\|^\(/.test(raw) &&
      !/^(?:Package:|File:|Document Class:|LaTeX2e\b|This is |(?:Package|Class|LaTeX(?: Font)?) .* Info:|(?:INFO|DEBUG|TRACE)\s+-)/.test(
        raw,
      )
    ) {
      // Backend/toolchain failures do not use TeX's ! or file:line format.
      message = raw.trim();
      severity = /Warning:|shell.escape|epstopdf|Missing character:/i.test(raw)
        ? "warning"
        : "error";
    }
    if (!message) continue;
    message = message.trim().replace(/^==>\s*/, "");
    const contextLines: string[] = [];
    if (severity === "error")
      for (const next of lines.slice(i + 1, i + 12)) {
        if (
          /^!|^(?:error:\s*)?.+?\.(?:tex|sty|cls|bib):\d+:|^(?:LaTeX|Package) .*Warning:/.test(
            next,
          )
        )
          break;
        contextLines.push(next);
        if (/^l\.\d+/.test(next)) break;
      }
    const context = contextLines.join("\n").trim() || undefined;
    let command: string | undefined;
    if (/Undefined control sequence/i.test(message)) {
      // TeX breaks the context line immediately after the unknown token.
      // A macro expansion may point somewhere other than the reported source line.
      command = contextLines
        .map((l) => l.match(/\\([a-zA-Z]+)\s*$/)?.[1])
        .find(Boolean);
    }
    // Missing-file errors often report their source position only on the
    // following Emergency stop. Attach that verified position to the cause.
    if (/Emergency stop/i.test(message) && line && context) {
      const cause = [...result]
        .reverse()
        .find((d) => !compilerHelp(d).secondary);
      const resource = cause && missingResource(cause.message);
      if (
        cause &&
        !cause.line &&
        resource &&
        context.includes(
          resource.replace(/\.(?:tex|bib|sty|cls|png|pdf|jpe?g)$/i, ""),
        )
      ) {
        cause.line = line;
        const locatedFile = file
          ?.trim()
          .replaceAll("\\", "/")
          .replace(/^\.\//, "");
        cause.file = paths
          ? resolveDiagnosticFile(locatedFile, paths, main) || locatedFile
          : locatedFile;
        cause.context = context;
      }
    }
    if (compilerHelp({ message }).secondary) {
      line = undefined;
      file = undefined;
    }
    file = file?.trim().replaceAll("\\", "/").replace(/^\.\//, "");
    if (file && paths) file = resolveDiagnosticFile(file, paths, main) || file;
    result.push({
      severity,
      message,
      file,
      line,
      context,
      command,
      advice: compilerHelp({ message, command }).explanation,
    });
  }
  return result.filter(
    (item, index) =>
      result.findIndex(
        (other) =>
          other.severity === item.severity &&
          other.message === item.message &&
          other.file === item.file &&
          other.line === item.line,
      ) === index,
  );
}

export function resolveDiagnosticFile(
  file: string | undefined,
  paths: string[],
  main: string,
) {
  if (!file) return paths.includes(main) ? main : undefined;
  const normalized = file.replaceAll("\\", "/").replace(/^\.\//, "");
  const exact = paths.find((path) => path === normalized);
  if (exact) return exact;
  const matches = paths
    .filter(
      (path) =>
        normalized.toLowerCase().endsWith("/" + path.toLowerCase()) ||
        normalized.toLowerCase() === path.toLowerCase(),
    )
    .sort((a, b) => b.length - a.length);
  return matches.length &&
    (matches.length === 1 || matches[0].length > matches[1].length)
    ? matches[0]
    : undefined;
}
