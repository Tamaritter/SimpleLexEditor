import { escapeTex, type FileEntry } from "../core/model";
import { withoutComments } from "../research/scientific";
import { maskTex } from "../editor/texAnalysis";
export type EntryAction =
  | "open"
  | "new-file"
  | "new-folder"
  | "rename"
  | "trash"
  | "restore"
  | "main"
  | "include"
  | "reveal"
  | "copy"
  | "refresh"
  | "open-project";
export const parentPath = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
export const remapPath = (path: string, from: string, to: string) =>
  path === from
    ? to
    : path.startsWith(from + "/")
      ? to + path.slice(from.length)
      : path;
export const isInside = (path: string, folder: string) =>
  path === folder || path.startsWith(folder + "/");
export function validEntryPath(path: string) {
  return (
    !!path.trim() &&
    !path.startsWith("/") &&
    !/[\\:*?"<>|\x00-\x1F]/.test(path) &&
    path
      .split("/")
      .every(
        (part) =>
          !!part &&
          !part.startsWith(".") &&
          !/[ .]$/.test(part) &&
          !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part),
      )
  );
}
export function hasDocumentClass(source: string) {
  return /\\documentclass(?:\s*\[[^\]]*\])?\s*\{/.test(maskTex(source));
}
export function isStandalone(source: string) {
  const clean = withoutComments(source);
  return hasDocumentClass(source) && /\\begin\s*\{document\}/.test(clean);
}
export function standaloneDocument(path: string, body?: string) {
  const title = escapeTex(
    path
      .split("/")
      .pop()!
      .replace(/\.tex$/i, ""),
  );
  return `% ${path}\n\\documentclass[11pt,a4paper]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n\\usepackage[ngerman]{babel}\n\\usepackage{amsmath,amssymb,graphicx}\n\\usepackage[margin=2.5cm]{geometry}\n\\usepackage{hyperref}\n\n\\begin{document}\n${body !== undefined ? body + "\n" : `\\section{${title}}\n\nHier beginnt dein Dokument.\n`}\n\\end{document}\n`;
}
export function includeChapter(source: string, path: string) {
  const clean = withoutComments(source),
    stem = path.replace(/\.tex$/i, "");
  const included = [
    ...clean.matchAll(
      /\\(?:input|include)\s*\{(?:\\detokenize\{)?([^}]+)\}\}?/g,
    ),
  ].some(
    (match) => match[1].replace(/^\.\//, "").replace(/\.tex$/i, "") === stem,
  );
  if (included) return { source, inserted: false };
  const at = clean.lastIndexOf("\\end{document}");
  if (at < 0)
    throw Error(
      "Im Hauptdokument fehlt ein sichtbares \\end{document}. Füge die Kapiteldatei dort manuell mit \\input ein.",
    );
  const command = /[ %#$&^~{}]/.test(stem)
    ? `\\input{\\detokenize{${stem}}}`
    : `\\input{${stem}}`;
  return {
    source: source.slice(0, at) + `\n${command}\n` + source.slice(at),
    inserted: true,
  };
}
export function chapterPreviewDocument(
  mainSource: string,
  chapter: string,
  wrapper: string,
) {
  const clean = withoutComments(mainSource),
    begin = /\\begin\s*\{document\}/.exec(clean);
  const base =
    isStandalone(mainSource) && begin
      ? mainSource.slice(0, begin.index) +
        "\\begin{document}\n\\end{document}\n"
      : standaloneDocument(wrapper, "");
  const included = includeChapter(base, chapter).source;
  const end = included.lastIndexOf("\\end{document}");
  return (
    `% SimpleLexEditor-Vorschaudokument für ${chapter}\n` +
    included.slice(0, end) +
    "\\null\n" +
    included.slice(end)
  );
}
export function visibleEntries(files: FileEntry[], collapsed: Set<string>) {
  return files.filter(
    (entry) =>
      ![...collapsed].some((folder) => entry.path.startsWith(folder + "/")),
  );
}
