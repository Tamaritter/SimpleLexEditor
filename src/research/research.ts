import { outline, wordCount } from "../core/model";
import { parseBib, inMath, theoremBlocks } from "./scientific";
import { maskTex, sourceLineIndex } from "../editor/texAnalysis";
import { readBibRecords } from "./bibliography";

export type SourceLocation = { file: string; line: number };
export type ResearchIssue = SourceLocation & {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
  group: "references" | "literature" | "files" | "math" | "tasks";
};
export type ResearchItem = SourceLocation & {
  kind: "section" | "equation" | "theorem" | "figure" | "table";
  title: string;
  label?: string;
  level: number;
};
export type ResearchReport = {
  main: string;
  files: string[];
  bibliography: string[];
  issues: ResearchIssue[];
  structure: ResearchItem[];
  counts: {
    words: number;
    equations: number;
    statements: number;
    figures: number;
    tables: number;
    labels: number;
    citations: number;
  };
};
const normalize = (path: string) => {
  const parts: string[] = [];
  for (const segment of path.replaceAll("\\", "/").split("/")) {
    if (segment === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else if (segment && segment !== ".") parts.push(segment);
  }
  return parts.join("/");
};
const literal = (value: string) => !!value.trim() && !/[\\#$%{}]/.test(value);
const lineText = (source: string, line: number) =>
  source.split(/\r?\n/)[line - 1] || "";

/** Source inspection follows the selected main document, not unrelated drafts. */
export function inspectResearchProject(
  main: string,
  sources: Record<string, string>,
  projectPaths = Object.keys(sources),
): ResearchReport {
  const lineIndexes = new Map<string, (index: number) => number>();
  const lineAt = (text: string, index: number) => {
    if (!lineIndexes.has(text)) lineIndexes.set(text, sourceLineIndex(text));
    return lineIndexes.get(text)!(index);
  };
  const issueIds = new Set<string>();
  const issues: ResearchIssue[] = [],
    structure: ResearchItem[] = [];
  const files: string[] = [],
    bibliography = new Set<string>(),
    visited = new Set<string>(),
    visiting = new Set<string>();
  const references: (SourceLocation & { key: string })[] = [],
    citations: (SourceLocation & { key: string })[] = [];
  const labels: (SourceLocation & { key: string })[] = [],
    manualBibs: (SourceLocation & { key: string })[] = [];
  const counts = {
    words: 0,
    equations: 0,
    statements: 0,
    figures: 0,
    tables: 0,
    labels: 0,
    citations: 0,
  };
  const declarations = new Set([
    ...theoremBlocks.map((t) => t.id),
    ...Object.values(sources).flatMap((s) =>
      [...maskTex(s).matchAll(/\\newtheorem\*?\s*\{([a-zA-Z]+)\}/g)].map(
        (m) => m[1],
      ),
    ),
  ]);
  let includeOnly: Set<string> | null = null;
  const add = (
    severity: ResearchIssue["severity"],
    group: ResearchIssue["group"],
    title: string,
    detail: string,
    file: string,
    line: number,
  ) => {
    const id = `${file}:${line}:${title}:${detail}`;
    if (!issueIds.has(id)) {
      issueIds.add(id);
      issues.push({ id, severity, group, title, detail, file, line });
    }
  };
  const resolve = (name: string, file: string, extension: string | null) => {
    const parent = file.includes("/")
      ? file.slice(0, file.lastIndexOf("/") + 1)
      : "";
    const candidates = [
      ...new Set([normalize(name), normalize(parent + name)]),
    ].filter((p): p is string => p !== null);
    const expanded = candidates.flatMap((p) =>
      extension && !p.toLowerCase().endsWith(extension)
        ? [p, p + extension]
        : [p],
    );
    const exact = expanded
      .map(
        (p) =>
          projectPaths.find((path) => path === p) ||
          projectPaths.find((path) => path.toLowerCase() === p.toLowerCase()),
      )
      .find(Boolean);
    if (exact) return exact;
    // SimpleLexEditor's compiler uses a recursive project TeX search path. Only an
    // unambiguous basename can be resolved by this fallback.
    const matches = projectPaths.filter((p) =>
      expanded.some((c) => !c.includes("/") && p.endsWith("/" + c)),
    );
    return matches.length === 1 ? matches[0] : undefined;
  };
  const walk = (file: string, depth: number) => {
    if (depth > 64) {
      add(
        "warning",
        "files",
        "Einbindung zu tief verschachtelt",
        "Die weitere Analyse wurde an dieser Stelle begrenzt.",
        file,
        1,
      );
      return;
    }
    if (visited.has(file)) return;
    visited.add(file);
    visiting.add(file);
    files.push(file);
    const source = sources[file];
    if (source === undefined) {
      add(
        "warning",
        "files",
        "Datei nicht analysiert",
        "Die Quelldatei konnte nicht gelesen werden. Aktualisiere die Projektquellen.",
        file,
        1,
      );
      visiting.delete(file);
      return;
    }
    const clean = maskTex(source);
    const only = clean.match(/\\includeonly\s*\{([^{}]*)\}/);
    if (only)
      includeOnly = new Set(
        only[1].split(",").map((s) => s.trim().replace(/\.tex$/i, "")),
      );
    for (const match of clean.matchAll(/\\(input|include)\s*\{([^{}]+)\}/g)) {
      if (!literal(match[2])) continue;
      if (
        match[1] === "include" &&
        includeOnly &&
        !includeOnly.has(match[2].trim().replace(/\.tex$/i, ""))
      )
        continue;
      const child = resolve(match[2].trim(), file, ".tex");
      const line = lineAt(clean, match.index);
      if (!child)
        add(
          "error",
          "files",
          "Eingebundene Datei fehlt",
          `„${match[2]}“ wurde im Projekt nicht eindeutig gefunden. Prüfe den Pfad.`,
          file,
          line,
        );
      else if (visiting.has(child))
        add(
          "error",
          "files",
          "Zyklische Dateieinbindung",
          `„${child}“ wird innerhalb seiner eigenen Einbindung erneut geladen.`,
          file,
          line,
        );
      else walk(child, depth + 1);
    }
    for (const match of clean.matchAll(
      /\\(bibliography|addbibresource)(?:\s*\[[^\]]*\])?\s*\{([^{}]+)\}/g,
    )) {
      for (const name of match[1] === "bibliography"
        ? match[2].split(",")
        : [match[2]]) {
        if (!literal(name)) continue;
        const bib = resolve(name.trim(), file, ".bib");
        if (bib) bibliography.add(bib);
        else
          add(
            "error",
            "literature",
            "Literaturdatei fehlt",
            `„${name.trim()}“ wurde im Projekt nicht gefunden.`,
            file,
            lineAt(clean, match.index),
          );
      }
    }
    for (const match of clean.matchAll(
      /\\(?:ref|eqref|pageref|autoref|cref|Cref|vref|Vref)\*?\s*\{([^{}]+)\}/g,
    ))
      for (const key of match[1]
        .split(",")
        .map((k) => k.trim())
        .filter(literal))
        references.push({ key, file, line: lineAt(clean, match.index) });
    for (const match of clean.matchAll(
      /\\(?:[a-zA-Z]*cite[a-zA-Z]*|nocite)\*?(?:\s*\[[^\]]*\])*\s*\{([^{}]+)\}/g,
    ))
      for (const key of match[1]
        .split(",")
        .map((k) => k.trim())
        .filter((k) => literal(k) && k !== "*"))
        citations.push({ key, file, line: lineAt(clean, match.index) });
    for (const match of clean.matchAll(/\\label\s*\{([^{}]+)\}/g))
      if (literal(match[1]))
        labels.push({ key: match[1], file, line: lineAt(clean, match.index) });
    for (const match of clean.matchAll(
      /\\bibitem(?:\s*\[[^\]]*\])?\s*\{([^{}]+)\}/g,
    ))
      manualBibs.push({
        key: match[1],
        file,
        line: lineAt(clean, match.index),
      });
    for (const entry of outline(clean))
      structure.push({
        kind: "section",
        title: entry.title,
        file,
        line: entry.line,
        level: entry.level,
      });
    for (const match of clean.matchAll(
      /\\includegraphics\*?(?:\s*\[[^\]]*\])?\s*\{(?:\\detokenize\{([^{}]+)\}|([^{}]+))\}/g,
    )) {
      const name = (match[1] || match[2]).trim();
      if (!literal(name)) continue;
      const found =
        resolve(name, file, null) ||
        [".pdf", ".png", ".jpg", ".jpeg", ".eps"]
          .map((ext) => resolve(name, file, ext))
          .find(Boolean);
      if (!found)
        add(
          "error",
          "files",
          "Bilddatei nicht gefunden",
          `„${name}“ wurde im Projekt nicht gefunden.`,
          file,
          lineAt(clean, match.index),
        );
    }
    for (const match of clean.matchAll(
      /\\begin\s*\{([a-zA-Z]+\*?)\}(?:\s*\[([^\]\n]*)\])?/g,
    )) {
      const env = match[1],
        base = env.replace(/\*$/, "");
      const equation = /^(?:equation|align|alignat|gather|multline)$/.test(
        base,
      );
      const kind: ResearchItem["kind"] | null = equation
        ? "equation"
        : declarations.has(base)
          ? "theorem"
          : base === "figure"
            ? "figure"
            : base === "table"
              ? "table"
              : null;
      if (!kind) continue;
      const end = clean.indexOf(`\\end{${env}}`, match.index + match[0].length);
      const body =
        end < 0 ? "" : clean.slice(match.index + match[0].length, end);
      const label = body.match(/\\label\s*\{([^{}]+)\}/)?.[1];
      const caption = body.match(
        /\\caption\*?(?:\[[^\]]*\])?\s*\{([^{}]+)\}/,
      )?.[1];
      const title =
        kind === "equation"
          ? "Gleichung"
          : kind === "figure"
            ? "Abbildung"
            : kind === "table"
              ? "Tabelle"
              : theoremBlocks.find((t) => t.id === base)?.name || base;
      const line = lineAt(clean, match.index);
      structure.push({
        kind,
        title: caption || (kind === "theorem" ? match[2] : "") || title,
        label,
        file,
        line,
        level: 0,
      });
      if (kind === "equation") counts.equations++;
      else if (kind === "theorem") {
        if (base !== "proof") counts.statements++;
        if (inMath(clean, match.index))
          add(
            "error",
            "math",
            "Aussage im Mathematikmodus",
            "Sätze, Definitionen und Beweise gehören außerhalb der umgebenden Formel.",
            file,
            line,
          );
      } else if (kind === "figure") counts.figures++;
      else counts.tables++;
      if (end >= 0 && !label && !env.endsWith("*") && base !== "proof")
        add(
          "info",
          "references",
          `${title} ohne Label`,
          "Ein eindeutiges Label erleichtert spätere Querverweise.",
          file,
          line,
        );
      if (
        (kind === "figure" || kind === "table") &&
        label &&
        /\\caption/.test(body) &&
        body.indexOf("\\label") < body.indexOf("\\caption")
      )
        add(
          "warning",
          "references",
          "Label steht vor der Beschriftung",
          "Setze \\label nach \\caption, damit der Verweis die richtige Nummer erhält.",
          file,
          line,
        );
    }
    const tasks = maskTex(source, { comments: false });
    for (const match of tasks.matchAll(
      /\b(?:TODO|FIXME|TBD)\b|\\todo(?:\[|\{)/g,
    )) {
      const line = lineAt(tasks, match.index);
      if (
        /\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand)\*?\s*\{?\\(?:todo|TODO)\b/.test(
          lineText(source, line),
        )
      )
        continue;
      add(
        "warning",
        "tasks",
        "Offene Aufgabe",
        lineText(source, line).trim().slice(0, 240),
        file,
        line,
      );
    }
    const begin = clean.match(/\\begin\s*\{document\}/);
    const bodyStart = begin ? begin.index! + begin[0].length : 0;
    const bodyEnd = clean.indexOf("\\end{document}", bodyStart);
    const body = clean
      .slice(bodyStart, bodyEnd < 0 ? clean.length : bodyEnd)
      .replace(
        /\\(?:label|(?:[a-zA-Z]*cite[a-zA-Z]*)|ref|eqref|pageref|autoref)\*?(?:\s*\[[^\]]*\])*\s*\{[^{}]*\}/g,
        " ",
      );
    counts.words += wordCount(body);
    visiting.delete(file);
  };
  if (!main || sources[main] === undefined) {
    add(
      "warning",
      "files",
      "Hauptdokument auswählen",
      "Wähle ein vorhandenes Hauptdokument, um die eingebundenen Kapitel zu prüfen.",
      main,
      1,
    );
  } else walk(main, 0);
  const labelKeys = new Set(labels.map((l) => l.key));
  const incomplete = files.some((file) => sources[file] === undefined);
  for (const ref of references)
    if (!incomplete && !labelKeys.has(ref.key))
      add(
        "error",
        "references",
        "Verweisziel nicht gefunden",
        `Für „${ref.key}“ wurde kein wörtliches \\label im analysierten Dokument gefunden.`,
        ref.file,
        ref.line,
      );
  const labelCounts = new Map<string, number>();
  for (const label of labels)
    labelCounts.set(label.key, (labelCounts.get(label.key) || 0) + 1);
  for (const label of labels)
    if (labelCounts.get(label.key)! > 1)
      add(
        "error",
        "references",
        "Label mehrfach definiert",
        `„${label.key}“ ist nicht eindeutig. Vergib unterschiedliche Labels.`,
        label.file,
        label.line,
      );
  let bibliographyIncomplete = false;
  const activeBibs = [...bibliography].flatMap((file) => {
    const source = sources[file];
    if (source === undefined) {
      bibliographyIncomplete = true;
      add(
        "warning",
        "files",
        "Literaturdatei nicht analysiert",
        "Aktualisiere die Projektquellen.",
        file,
        1,
      );
      return [];
    }
    const positions = new Map<string, number[]>();
    try {
      for (const record of readBibRecords(source))
        if (record.key && record.type !== "string")
          positions.set(record.key, [
            ...(positions.get(record.key) || []),
            record.line,
          ]);
    } catch (e) {
      bibliographyIncomplete = true;
      add(
        "warning",
        "literature",
        "BibTeX-Struktur unvollständig",
        e instanceof Error ? e.message : String(e),
        file,
        1,
      );
    }
    return parseBib(source, file).map((entry) => ({
      ...entry,
      line: positions.get(entry.key)?.shift() || 1,
    }));
  });
  const allBibs = Object.entries(sources)
    .filter(([p]) => /\.bib$/i.test(p))
    .flatMap(([file, source]) => parseBib(source, file));
  const entries = [...activeBibs, ...manualBibs];
  const entryCounts = new Map<string, number>();
  for (const entry of entries)
    entryCounts.set(entry.key, (entryCounts.get(entry.key) || 0) + 1);
  for (const entry of entries)
    if (entryCounts.get(entry.key)! > 1)
      add(
        "error",
        "literature",
        "Zitatschlüssel mehrfach definiert",
        `„${entry.key}“ ist in der eingebundenen Literatur nicht eindeutig.`,
        entry.file,
        entry.line,
      );
  for (const cite of citations)
    if (!bibliographyIncomplete && !entryCounts.has(cite.key)) {
      const existing = allBibs.find((e) => e.key === cite.key);
      add(
        existing ? "warning" : "error",
        "literature",
        existing
          ? "Literaturdatei nicht eingebunden"
          : "Zitierte Quelle nicht gefunden",
        existing
          ? `„${cite.key}“ existiert in „${existing.file}“. Binde diese Literaturdatei ein.`
          : `Für „${cite.key}“ wurde kein Eintrag in der eingebundenen Literatur gefunden.`,
        cite.file,
        cite.line,
      );
    }
  counts.labels = labels.length;
  counts.citations = new Set(citations.map((c) => c.key)).size;
  const priority = { error: 0, warning: 1, info: 2 };
  issues.sort(
    (a, b) =>
      priority[a.severity] - priority[b.severity] ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
  structure.sort(
    (a, b) => files.indexOf(a.file) - files.indexOf(b.file) || a.line - b.line,
  );
  return {
    main,
    files,
    bibliography: [...bibliography],
    issues,
    structure,
    counts,
  };
}

export function researchReportText(report: ResearchReport) {
  const summary = `SimpleLexEditor · Wissenschaftliche Projektprüfung\nHauptdokument: ${report.main || "nicht gewählt"}\n${report.files.length} Quelldateien · ${report.counts.equations} Gleichungsumgebungen · ${report.counts.labels} Labels · ${report.counts.citations} Zitatschlüssel\n`;
  return (
    summary +
    "\n" +
    (report.issues.length
      ? report.issues
          .map(
            (issue) =>
              `${issue.severity === "error" ? "FEHLER" : issue.severity === "warning" ? "PRÜFEN" : "HINWEIS"} · ${issue.file}:${issue.line}\n${issue.title}\n${issue.detail}`,
          )
          .join("\n\n")
      : "Keine Auffälligkeiten in der Quelltextprüfung gefunden.")
  );
}
