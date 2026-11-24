import { escapeTex } from "../core/model.ts";
import { maskTex } from "../editor/texAnalysis.ts";
export type Requirements = {
  packages?: string[];
  declarations?: string[];
  preambleContext?: string;
};
export type ScientificInsert = Requirements & {
  code: string;
  math?: boolean;
  mode?: "inline" | "display" | "numbered" | "raw";
  label?: string;
  outsideMath?: boolean;
};
export const withoutComments = (source: string) =>
  source.replace(/(?<!\\)%[^\n]*/g, (match) => " ".repeat(match.length));
export function ensurePreamble(source: string, requirements: Requirements) {
  const clean = withoutComments(source),
    start = clean.search(/\\begin\s*\{document\}/);
  const packages = new Set<string>();
  const known =
    clean + "\n" + withoutComments(requirements.preambleContext || "");
  for (const match of known.matchAll(
    /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/g,
  ))
    match[1].split(",").forEach((p) => packages.add(p.trim()));
  if (packages.has("mathtools")) packages.add("amsmath");
  const missing = (requirements.packages || []).filter((p) => !packages.has(p));
  const declarations = (requirements.declarations || []).filter(
    (declaration) => {
      const env = declaration.match(/\\newtheorem\*?\{([^}]+)\}/)?.[1];
      if (env)
        return !new RegExp("\\\\newtheorem\\*?\\s*\\{" + env + "\\}").test(
          known,
        );
      return !known.includes(declaration);
    },
  );
  if (!missing.length && !declarations.length)
    return { source, added: "", at: 0 };
  if (start < 0)
    throw Error(
      "Im Hauptdokument fehlt \\begin{document}. Pakete können dort noch nicht ergänzt werden.",
    );
  const at = clean.search(/\\begin\s*\{document\}/);
  const added =
    "\n% Von SimpleLexEditor ergänzte wissenschaftliche Bausteine\n" +
    missing.map((p) => `\\usepackage{${p}}\n`).join("") +
    declarations.map((d) => d + "\n").join("") +
    "\n";
  return { source: source.slice(0, at) + added + source.slice(at), added, at };
}
export function preambleDependencies(
  source: string,
  sources: Record<string, string>,
  mainPath: string,
) {
  const visited = new Set<string>(),
    chunks: string[] = [];
  const normalize = (path: string) => {
    const segments: string[] = [];
    for (const part of path.replaceAll("\\", "/").split("/")) {
      if (part === "..") segments.pop();
      else if (part && part !== ".") segments.push(part);
    }
    return segments.join("/");
  };
  const walk = (text: string, path: string, depth: number) => {
    if (depth > 16) return;
    const clean = withoutComments(text),
      begin = clean.search(/\\begin\s*\{document\}/),
      preamble = begin >= 0 ? clean.slice(0, begin) : clean;
    const parent = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/") + 1)
      : "";
    for (const match of preamble.matchAll(
      /\\(?:input|include)\s*\{([^}]+)\}/g,
    )) {
      const file = match[1].endsWith(".tex") ? match[1] : match[1] + ".tex";
      const resolved = [normalize(file), normalize(parent + file)].find(
        (p) => sources[p] !== undefined,
      );
      if (resolved && !visited.has(resolved)) {
        visited.add(resolved);
        chunks.push(sources[resolved]);
        walk(sources[resolved], resolved, depth + 1);
      }
    }
  };
  walk(source, mainPath, 0);
  return chunks.join("\n");
}
export function inMath(source: string, position: number) {
  const text = withoutComments(source.slice(0, position));
  const tokens =
    text.match(
      /\\(?:begin|end)\{(?:equation\*?|align\*?|alignat\*?|gather\*?|multline\*?|math|displaymath)\}|\\[\[\]() ]|(?<!\\)\$\$|(?<!\\)\$/g,
    ) || [];
  let math = false;
  for (const token of tokens) {
    if (token === "\\ ") continue;
    if (token.startsWith("\\begin") || token === "\\[" || token === "\\(")
      math = true;
    else if (token.startsWith("\\end") || token === "\\]" || token === "\\)")
      math = false;
    else math = !math;
  }
  return math;
}
export function bodyInsertionRange(source: string, from: number, to: number) {
  const clean = withoutComments(source),
    begin = /\\begin\s*\{document\}/.exec(clean),
    end = clean.lastIndexOf("\\end{document}");
  if (
    begin &&
    end > begin.index &&
    (from < begin.index + begin[0].length || to > end)
  )
    return { from: end, to: end };
  return { from, to };
}
export function formatScientificCode(
  item: ScientificInsert,
  source: string,
  position: number,
) {
  if (!item.math || item.mode === "raw" || inMath(source, position))
    return item.code;
  if (item.mode === "inline") return `$${item.code}$`;
  if (item.mode === "numbered")
    return `\n\\begin{equation}${item.label ? "\n  \\label{" + item.label + "}" : ""}\n  ${item.code}\n\\end{equation}\n`;
  return `\n\\[\n  ${item.code}\n\\]\n`;
}
export function scientificInsertionRange(
  source: string,
  from: number,
  to: number,
  item: ScientificInsert,
) {
  const range = bodyInsertionRange(source, from, to);
  if (!item.outsideMath) return range;
  const clean = maskTex(source);
  if (!inMath(clean, range.from)) return range;
  for (const token of clean
    .slice(range.from)
    .matchAll(
      /\\end\{(?:equation\*?|align\*?|alignat\*?|gather\*?|multline\*?|math|displaymath)\}|\\[\])]|(?<!\\)\$\$|(?<!\\)\$/g,
    )) {
    const after = range.from + token.index + token[0].length;
    if (!inMath(clean, after)) return { from: after, to: after };
  }
  throw Error(
    "Schließe zuerst die aktuelle Formel mit dem passenden Mathematikabschluss. Sätze, Definitionen und Beweise werden außerhalb der Formel eingefügt.",
  );
}
export function matrixCode(
  rows: number,
  cols: number,
  bracket: string,
  cells: string[],
) {
  const env = [
    "pmatrix",
    "bmatrix",
    "Bmatrix",
    "vmatrix",
    "Vmatrix",
    "matrix",
  ].includes(bracket)
    ? bracket
    : "pmatrix";
  const r = Math.max(1, Math.min(10, Math.floor(rows))),
    c = Math.max(1, Math.min(10, Math.floor(cols)));
  return `\\begin{${env}}\n${Array.from({ length: r }, (_, row) => "  " + Array.from({ length: c }, (_, col) => cells[row * c + col]?.trim() || "0").join(" & ")).join(" \\\\\n")}\n\\end{${env}}`;
}
export type BibEntry = {
  key: string;
  type: string;
  title: string;
  author: string;
  year: string;
  file: string;
};
function balancedEnd(text: string, start: number, open = "{", close = "}") {
  let depth = 1,
    quoted = false;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === '"' && depth === 1) quoted = !quoted;
    if (quoted) continue;
    if (text[i] === open) depth++;
    if (text[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length;
}
export function parseBib(source: string, file: string): BibEntry[] {
  source = withoutComments(source);
  const entries: BibEntry[] = [];
  const header = /@(\w+)\s*([({])\s*([^,\s]+)\s*,/g;
  for (let match; (match = header.exec(source));) {
    if (["comment", "preamble", "string"].includes(match[1].toLowerCase()))
      continue;
    let end = source.length,
      depth = 0,
      quoted = false;
    for (let i = header.lastIndex; i < source.length; i++) {
      const ch = source[i];
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === '"' && depth === 0) {
        quoted = !quoted;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        if (!depth && match[2] === "{" && !quoted) {
          end = i;
          break;
        }
        depth--;
      } else if (ch === ")" && match[2] === "(" && !depth && !quoted) {
        end = i;
        break;
      }
    }
    const body = source.slice(header.lastIndex, end),
      fields: Record<string, string> = {};
    const fieldPattern = /(\w+)\s*=\s*/g;
    for (let field; (field = fieldPattern.exec(body));) {
      const at = fieldPattern.lastIndex;
      let stop = at,
        value = "";
      if (body[at] === "{") {
        stop = balancedEnd(body, at + 1);
        value = body.slice(at + 1, stop);
        stop++;
      } else if (body[at] === '"') {
        stop = at + 1;
        while (
          stop < body.length &&
          (body[stop] !== '"' || body[stop - 1] === "\\")
        )
          stop++;
        value = body.slice(at + 1, stop);
        stop++;
      } else {
        stop = body.indexOf(",", at);
        if (stop < 0) stop = body.length;
        value = body.slice(at, stop);
      }
      fields[field[1].toLowerCase()] = value.replace(/[{}]/g, "").trim();
      fieldPattern.lastIndex = stop;
    }
    entries.push({
      key: match[3],
      type: match[1].toLowerCase(),
      title: fields.title || match[3],
      author: fields.author || fields.editor || "",
      year: fields.year || fields.date || "",
      file,
    });
    header.lastIndex = end + 1;
  }
  return entries;
}
export function parseLabels(source: string, file: string) {
  return [...withoutComments(source).matchAll(/\\label\s*\{([^}]+)\}/g)].map(
    (match) => ({
      key: match[1],
      file,
      line: source.slice(0, match.index).split("\n").length,
    }),
  );
}
export function bibEntryCode(fields: {
  type: string;
  key: string;
  title: string;
  author: string;
  year: string;
  venue: string;
  doi: string;
  url: string;
}) {
  if (!/^[a-zA-Z0-9_:.-]+$/.test(fields.key))
    throw Error(
      "Der Zitatschlüssel darf Buchstaben, Zahlen, Punkt, Doppelpunkt, Unterstrich und Bindestrich enthalten.",
    );
  if (
    !fields.title.trim() ||
    !fields.author.trim() ||
    !/^\d{4}$/.test(fields.year)
  )
    throw Error(
      "Bitte Titel, Autor und ein vierstelliges Erscheinungsjahr angeben.",
    );
  const values: Record<string, string> = {
    author: fields.author.trim(),
    title: fields.title.trim(),
    year: fields.year,
    [fields.type === "book"
      ? "publisher"
      : fields.type === "inproceedings"
        ? "booktitle"
        : "journal"]: fields.venue.trim(),
    doi: fields.doi.trim(),
    url: fields.url.trim(),
  };
  return (
    `\n@${fields.type}{${fields.key},\n` +
    Object.entries(values)
      .filter(([, value]) => value)
      .map(
        ([name, value]) =>
          `  ${name} = {${name === "url" || name === "doi" ? value.replace(/[{}\r\n]/g, "") : escapeTex(value)}}`,
      )
      .join(",\n") +
    "\n}\n"
  );
}
export const theoremBlocks = [
  {
    id: "theorem",
    name: "Satz",
    description: "Eine nummerierte mathematische Aussage",
    code: "\n\\begin{theorem}[Titel des Satzes]\n  Hier steht die Aussage.\n\\end{theorem}\n",
    declaration: "\\newtheorem{theorem}{Satz}[section]",
  },
  {
    id: "lemma",
    name: "Lemma",
    description: "Hilfssatz mit gemeinsamer Nummerierung",
    code: "\n\\begin{lemma}\n  Hier steht das Lemma.\n\\end{lemma}\n",
    declaration: "\\newtheorem{lemma}[theorem]{Lemma}",
  },
  {
    id: "proposition",
    name: "Proposition",
    description: "Eine eigenständige Aussage",
    code: "\n\\begin{proposition}\n  Hier steht die Aussage.\n\\end{proposition}\n",
    declaration: "\\newtheorem{proposition}[theorem]{Proposition}",
  },
  {
    id: "corollary",
    name: "Korollar",
    description: "Eine unmittelbare Folgerung",
    code: "\n\\begin{corollary}\n  Hier steht die Folgerung.\n\\end{corollary}\n",
    declaration: "\\newtheorem{corollary}[theorem]{Korollar}",
  },
  {
    id: "definition",
    name: "Definition",
    description: "Begriff mit aufrechter Schrift",
    code: "\n\\begin{definition}[Begriff]\n  Hier steht die Definition.\n\\end{definition}\n",
    declaration:
      "\\theoremstyle{definition}\n\\newtheorem{definition}[theorem]{Definition}\n\\theoremstyle{plain}",
  },
  {
    id: "remark",
    name: "Bemerkung",
    description: "Eine ergänzende Anmerkung",
    code: "\n\\begin{remark}\n  Hier steht die Bemerkung.\n\\end{remark}\n",
    declaration:
      "\\theoremstyle{remark}\n\\newtheorem{remark}[theorem]{Bemerkung}\n\\theoremstyle{plain}",
  },
  {
    id: "proof",
    name: "Beweis",
    description: "Beweis mit automatischem QED-Zeichen",
    code: "\n\\begin{proof}\n  Hier steht der Beweis.\n\\end{proof}\n",
    declaration: "",
  },
];
