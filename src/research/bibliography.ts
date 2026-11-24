import { parseBib, preambleDependencies } from "./scientific";
import { escapeTex } from "../core/model";
import { maskTex, sourceLineIndex } from "../editor/texAnalysis";

export type BibRecord = {
  type: string;
  key: string;
  raw: string;
  line: number;
};
export function decodeBibFile(bytes: Uint8Array) {
  if (bytes.byteLength > 4 * 1024 * 1024)
    throw Error("Bitte höchstens 4 MB BibTeX auf einmal importieren.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw Error(
      "Die BibTeX-Datei ist nicht gültig UTF-8. Exportiere sie aus deiner Literaturverwaltung mit UTF-8-Kodierung.",
    );
  }
}
export function readBibRecords(source: string): BibRecord[] {
  const records: BibRecord[] = [];
  const lineOf = sourceLineIndex(source);
  let i = 0;
  while (i < source.length) {
    if (source[i] === "%") {
      const next = source.indexOf("\n", i);
      i = next < 0 ? source.length : next + 1;
      continue;
    }
    if (source[i] !== "@") {
      i++;
      continue;
    }
    const header = source.slice(i).match(/^@(\w+)\s*([({])/);
    if (!header) {
      if (/^@\w+/.test(source.slice(i)))
        throw Error("Bei einem BibTeX-Eintrag fehlt die öffnende Klammer.");
      i++;
      continue;
    }
    const start = i,
      type = header[1].toLowerCase(),
      parenthesized = header[2] === "(";
    const rootDepth = parenthesized ? 0 : 1;
    let braces = rootDepth,
      quoted = false;
    i += header[0].length;
    const bodyStart = i;
    let closed = false;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === '"' && braces === rootDepth && type !== "comment") {
        quoted = !quoted;
        continue;
      }
      if (ch === "%" && braces === rootDepth && !quoted) {
        const next = source.indexOf("\n", i);
        i = next < 0 ? source.length : next;
        continue;
      }
      if (ch === "{") braces++;
      else if (ch === "}") {
        braces--;
        if (!parenthesized && braces === 0 && !quoted) {
          closed = true;
          break;
        }
        if (braces < rootDepth && quoted)
          throw Error(
            "Ein BibTeX-Text enthält eine nicht geschlossene Anführungszeichenfolge.",
          );
      } else if (ch === ")" && parenthesized && braces === 0 && !quoted) {
        closed = true;
        break;
      }
    }
    if (!closed || quoted)
      throw Error(
        `BibTeX-Eintrag ab Zeile ${lineOf(start)} ist nicht vollständig geschlossen.`,
      );
    const body = source.slice(bodyStart, i);
    let key = "";
    if (type === "string") {
      key = body.match(/^\s*([\w:-]+)\s*=/)?.[1] || "";
      if (!key)
        throw Error(
          "Eine @string-Definition benötigt einen Namen und einen Wert.",
        );
    } else if (!["comment", "preamble"].includes(type)) {
      key = body.match(/^\s*([^,\s{}()]+)\s*,/)?.[1] || "";
      if (!key || /[\\%#&\[\]]/.test(key))
        throw Error(
          "Ein BibTeX-Eintrag benötigt einen gültigen Zitatschlüssel und ein Komma danach.",
        );
      if (!/\b\w+\s*=/.test(body.slice(body.indexOf(",") + 1)))
        throw Error(
          `„${key}“ enthält noch keine Felder wie title oder author.`,
        );
    }
    records.push({
      type,
      key,
      raw: source.slice(start, ++i),
      line: lineOf(start),
    });
  }
  return records;
}

export function planBibImport(
  text: string,
  sources: Record<string, string>,
  target: string,
) {
  if (new TextEncoder().encode(text).byteLength > 4 * 1024 * 1024)
    throw Error("Bitte höchstens 4 MB BibTeX auf einmal importieren.");
  const records = readBibRecords(text.replace(/^\uFEFF/, ""));
  const incomingEntries = records.filter((r) => r.key && r.type !== "string");
  if (!incomingEntries.length)
    throw Error(
      "Keine vollständigen Literatureinträge im BibTeX-Text gefunden.",
    );
  const existingKeys = new Set<string>();
  const strings = new Map<string, string>();
  const preambles = new Set<string>();
  for (const [file, source] of Object.entries(sources).filter(([file]) =>
    /\.bib$/i.test(file),
  )) {
    parseBib(source, file).forEach((e) => existingKeys.add(e.key));
    try {
      for (const record of readBibRecords(source)) {
        if (record.type === "string")
          strings.set(record.key.toLowerCase(), record.raw.trim());
        if (record.type === "preamble") preambles.add(record.raw.trim());
      }
    } catch {
      if (file === target)
        throw Error(
          "Die vorhandene Zieldatei enthält unvollständiges BibTeX. Korrigiere sie zuerst oder wähle eine neue Literaturdatei.",
        );
    }
  }
  const duplicates: string[] = [],
    conflicts: string[] = [],
    accepted: BibRecord[] = [],
    context: BibRecord[] = [];
  for (const record of records) {
    if (record.type === "string") {
      const key = record.key.toLowerCase();
      if (strings.has(key)) {
        if (strings.get(key) !== record.raw.trim()) conflicts.push(record.key);
      } else {
        strings.set(key, record.raw.trim());
        context.push(record);
      }
    } else if (record.type === "preamble") {
      if (!preambles.has(record.raw.trim())) {
        preambles.add(record.raw.trim());
        context.push(record);
      }
    } else if (record.type === "comment") context.push(record);
    else if (existingKeys.has(record.key)) duplicates.push(record.key);
    else {
      existingKeys.add(record.key);
      accepted.push(record);
    }
  }
  const additions =
    accepted.length && !conflicts.length
      ? "\n" + [...context, ...accepted].map((r) => r.raw).join("\n\n") + "\n"
      : "";
  return {
    additions,
    duplicates,
    conflicts,
    total: incomingEntries.length,
    entries: accepted,
    preview: parseBib(additions, target),
  };
}

export function bibliographyWorkflow(
  main: string,
  sources: Record<string, string>,
) {
  const source = sources[main] || "";
  const preamble =
    source.split(/\\begin\s*\{document\}/)[0] +
    "\n" +
    preambleDependencies(source, sources, main);
  const clean = maskTex(preamble);
  const packages = [
    ...clean.matchAll(
      /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/g,
    ),
  ].flatMap((m) => m[1].split(",").map((p) => p.trim()));
  return packages.includes("biblatex")
    ? "biblatex"
    : packages.includes("natbib")
      ? "natbib"
      : "plain";
}

export function citationCode(
  keys: string[],
  command: string,
  workflow: "plain" | "natbib" | "biblatex",
  before = "",
  after = "",
) {
  const unique = [...new Set(keys)];
  if (!unique.length || unique.some((k) => !k || /[\\{}%#&,\[\]\s]/.test(k)))
    throw Error("Wähle Quellen mit gültigen, eindeutigen Zitatschlüsseln.");
  const allowed =
    workflow === "biblatex"
      ? ["cite", "parencite", "textcite", "autocite"]
      : ["cite", "citep", "citet"];
  if (!allowed.includes(command))
    throw Error("Dieser Zitierbefehl passt nicht zum Literaturverfahren.");
  const note = (value: string) =>
    escapeTex(value.trim()).replaceAll("[", "{[}").replaceAll("]", "{]}");
  const rich = workflow !== "plain" || command !== "cite";
  const prefix = before.trim(),
    suffix = after.trim();
  const options = rich
    ? prefix
      ? `[${note(prefix)}][${note(suffix)}]`
      : suffix
        ? `[${note(suffix)}]`
        : ""
    : suffix
      ? `[${note(suffix)}]`
      : "";
  return `${!rich && prefix ? note(prefix) + "~" : ""}\\${command}${options}{${unique.join(",")}}`;
}
