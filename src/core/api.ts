import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { zipSync, strToU8 } from "fflate";
import type { Project, FileEntry } from "./model";
import type { RecoveryDraft } from "./safety";
import {
  isInside,
  parentPath,
  remapPath,
  validEntryPath,
} from "../projects/projectFiles";
export const native = isTauri();
let projectRoot = "";
const revisions = new Map<string, string>();
const browserHistory = new Map<
  string,
  (BackupVersion & { content: string })[]
>();
function remember(path: string, content: string) {
  const history = browserHistory.get(path) || [];
  history.unshift({
    id: Date.now() + "-" + Math.random().toString(36).slice(2),
    content,
    bytes: new TextEncoder().encode(content).length,
    modifiedMs: Date.now(),
  });
  browserHistory.set(path, history.slice(0, 20));
}
export type BackupVersion = { id: string; bytes: number; modifiedMs: number };
export type ToolStatus = {
  name: string;
  available: boolean;
  path: string | null;
  version: string | null;
};
export type PdfPosition = { page: number; x: number; y: number };
export type PdfSourceLocation = {
  file: string;
  line: number;
  column: number;
  version: string;
};
let browserFiles: Record<string, string> = {};
let browserFolders: string[] = [];
const browserTrash = new Map<
  string,
  { files: Record<string, string>; folders: string[] }
>();
try {
  browserFiles = JSON.parse(
    localStorage.getItem("roxena-browser-files") || "{}",
  );
  browserFolders = JSON.parse(
    localStorage.getItem("roxena-browser-folders") || "[]",
  );
} catch {
  /* Fresh workspace. */
}
let browserProject = "Erste Gedanken";
try {
  browserProject =
    localStorage.getItem("roxena-browser-project") || browserProject;
} catch {
  /* Native filesystem access remains available without web storage. */
}
function persist() {
  localStorage.setItem("roxena-browser-files", JSON.stringify(browserFiles));
  localStorage.setItem("roxena-browser-project", browserProject);
  localStorage.setItem(
    "roxena-browser-folders",
    JSON.stringify(browserFolders),
  );
}
export function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export function fromBase64(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
function files(): FileEntry[] {
  const folders = new Set(browserFolders);
  for (const path of [...Object.keys(browserFiles), ...browserFolders]) {
    let parent = parentPath(path);
    while (parent) {
      folders.add(parent);
      parent = parentPath(parent);
    }
  }
  const all = [
    ...[...folders].map((path) => ({
      path,
      name: path.split("/").pop()!,
      directory: true,
    })),
    ...Object.keys(browserFiles).map((path) => ({
      path,
      name: path.split("/").pop()!,
      directory: false,
    })),
  ];
  const result: FileEntry[] = [];
  const visit = (parent: string) => {
    for (const entry of all
      .filter((e) => parentPath(e.path) === parent)
      .sort(
        (a, b) =>
          Number(b.directory) - Number(a.directory) ||
          a.name.localeCompare(b.name),
      )) {
      result.push(entry);
      if (entry.directory) visit(entry.path);
    }
  };
  visit("");
  return result;
}
function browserInfo(): Project {
  return {
    name: browserProject,
    root: `Browser/${browserProject}`,
    files: files(),
    main:
      Object.keys(browserFiles).find((p) =>
        browserFiles[p].includes("\\documentclass"),
      ) || "",
  };
}
export const api = {
  async recoveryIndex(): Promise<{ path: string; updated: string }[]> {
    return native ? invoke("recovery_index") : [];
  },
  setRoot(root: string) {
    projectRoot = root;
    revisions.clear();
  },
  version(path: string) {
    return revisions.get(path);
  },
  async initialize(content: string): Promise<Project> {
    if (native) return invoke("initialize", { content });
    if (!Object.keys(browserFiles).length) {
      browserFiles = { "main.tex": content };
      persist();
    }
    return browserInfo();
  },
  async openProject(): Promise<Project | null> {
    if (native) {
      const path = await open({
        directory: true,
        title: "LaTeX-Projekt öffnen",
      });
      return path ? invoke("open_project", { path }) : null;
    }
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.setAttribute("webkitdirectory", "");
      input.oncancel = () => resolve(null);
      input.onchange = async () => {
        const next: Record<string, string> = {};
        for (const file of Array.from(input.files || [])) {
          if (/\.(tex|bib|sty|cls|txt|md|csv)$/i.test(file.name))
            next[file.webkitRelativePath.split("/").slice(1).join("/")] =
              await file.text();
        }
        if (!Object.keys(next).length) {
          resolve(null);
          return;
        }
        browserProject = input.files![0].webkitRelativePath.split("/")[0];
        browserFiles = next;
        browserFolders = [];
        persist();
        resolve(browserInfo());
      };
      input.click();
    });
  },
  async createProject(name: string, content: string): Promise<Project | null> {
    if (native) {
      const parent = await open({
        directory: true,
        title: "Übergeordneten Ordner auswählen",
      });
      return parent
        ? invoke("create_project", { parent, name, content })
        : null;
    }
    browserProject = name;
    browserFiles = { "main.tex": content };
    browserFolders = [];
    persist();
    return browserInfo();
  },
  async read(path: string): Promise<string> {
    if (native) {
      const root = projectRoot;
      const snapshot = await invoke<{ content: string; version: string }>(
        "read_snapshot",
        { path },
      );
      if (root === projectRoot) revisions.set(path, snapshot.version);
      return snapshot.content;
    }
    const stored = localStorage.getItem("roxena-browser-files");
    if (stored) browserFiles = JSON.parse(stored);
    if (!(path in browserFiles)) throw Error("Die Datei existiert nicht mehr.");
    return browserFiles[path];
  },
  async write(
    path: string,
    content: string,
    expected: string,
    root = projectRoot,
  ): Promise<void> {
    if (native) {
      const version = await invoke<string>("write_file", {
        path,
        content,
        expected,
        projectRoot: root,
      });
      if (projectRoot === root) revisions.set(path, version);
      return;
    }
    if (root !== projectRoot)
      throw Error("Das aktive Projekt hat sich geändert.");
    const stored = JSON.parse(
      localStorage.getItem("roxena-browser-files") || "{}",
    );
    if (stored[path] !== expected && stored[path] !== content)
      throw Error(
        `SAVE_CONFLICT: ${path} wurde außerhalb dieser Ansicht geändert.`,
      );
    if (stored[path] !== content) remember(path, stored[path] || "");
    browserFiles = { ...stored, [path]: content };
    persist();
  },
  async recover(path: string): Promise<RecoveryDraft | null> {
    return native ? invoke("recovery_draft", { path }) : null;
  },
  async saveRecovery(
    path: string,
    content: string,
    expected: string,
    root = projectRoot,
  ): Promise<void> {
    if (native)
      await invoke("save_recovery", {
        path,
        content,
        expected,
        projectRoot: root,
      });
  },
  async clearRecovery(path: string, content: string): Promise<void> {
    if (native) await invoke("clear_recovery", { path, content });
  },
  async stat(
    paths: string[],
  ): Promise<{ path: string; version: string | null }[]> {
    return native ? invoke("file_versions", { paths }) : [];
  },
  async backups(path: string): Promise<BackupVersion[]> {
    return native
      ? invoke("list_backups", { path })
      : browserHistory.get(path) || [];
  },
  async backup(path: string, id: string): Promise<string> {
    if (native) return invoke("read_backup", { path, id });
    const item = browserHistory.get(path)?.find((version) => version.id === id);
    if (!item) throw Error("Sicherung nicht gefunden.");
    return item.content;
  },
  async archive(path: string, content: string): Promise<void> {
    if (native) await invoke("archive_snapshot", { path, content });
    else remember(path, content);
  },
  async tools(directory: string): Promise<ToolStatus[]> {
    return native
      ? invoke("inspect_toolchain", { directory })
      : ["pdflatex", "xelatex", "lualatex", "tectonic", "bibtex", "biber"].map(
          (name) => ({ name, available: false, path: null, version: null }),
        );
  },
  async cancelCompile(): Promise<void> {
    if (native) await invoke("cancel_compile");
  },
  async openHelp(topic: string): Promise<void> {
    if (native) await invoke("open_help", { topic });
  },
  async createFile(path: string, content: string): Promise<void> {
    if (native) return invoke("create_file", { path, content });
    if (path in browserFiles)
      throw Error("Eine Datei mit diesem Namen existiert bereits.");
    browserFiles[path] = content;
    persist();
  },
  async list(): Promise<FileEntry[]> {
    return native ? invoke("list_files") : files();
  },
  async createFolder(path: string): Promise<void> {
    if (native) return invoke("create_folder", { path });
    if (!validEntryPath(path)) throw Error("Ungültiger Ordnername.");
    if (files().some((f) => f.path === path))
      throw Error("Dieser Eintrag existiert bereits.");
    browserFolders.push(path);
    persist();
  },
  async rename(path: string, destination: string): Promise<void> {
    if (native) return invoke("rename_entry", { path, destination });
    if (!validEntryPath(destination) || !validEntryPath(path))
      throw Error("Ungültiger Projektpfad.");
    const entries = files();
    if (!entries.some((f) => f.path === path))
      throw Error("Der Eintrag existiert nicht mehr.");
    if (
      entries.some((f) => f.path === destination) ||
      isInside(destination, path)
    )
      throw Error(
        "Das Ziel existiert bereits oder liegt im umbenannten Ordner.",
      );
    browserFiles = Object.fromEntries(
      Object.entries(browserFiles).map(([p, content]) => [
        remapPath(p, path, destination),
        content,
      ]),
    );
    browserFolders = entries
      .filter((e) => e.directory)
      .map((e) => remapPath(e.path, path, destination));
    persist();
  },
  async trash(path: string): Promise<string> {
    if (native) return invoke("trash_entry", { path });
    if (!validEntryPath(path) || !files().some((e) => e.path === path))
      throw Error("Ungültiger Eintrag.");
    const previousEntries = files();
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    browserTrash.set(id, {
      files: Object.fromEntries(
        Object.entries(browserFiles).filter(([p]) => isInside(p, path)),
      ),
      folders: files()
        .filter((f) => f.directory && isInside(f.path, path))
        .map((f) => f.path),
    });
    browserFiles = Object.fromEntries(
      Object.entries(browserFiles).filter(([p]) => !isInside(p, path)),
    );
    browserFolders = previousEntries
      .filter((f) => f.directory && !isInside(f.path, path))
      .map((f) => f.path);
    persist();
    return id;
  },
  async restore(path: string, id: string): Promise<void> {
    if (native) return invoke("restore_entry", { path, id });
    const item = browserTrash.get(id);
    if (!item) throw Error("Der Eintrag ist nicht mehr im Papierkorb.");
    const entries = files();
    if (
      entries.some((f) => f.path === path) ||
      Object.keys(item.files).some((p) => p in browserFiles)
    )
      throw Error("Am ursprünglichen Ort existiert bereits ein Eintrag.");
    browserFiles = { ...browserFiles, ...item.files };
    browserFolders.push(...item.folders);
    browserTrash.delete(id);
    persist();
  },
  async reveal(path: string): Promise<void> {
    if (!native)
      throw Error("Der Dateimanager ist in der Desktop-App verfügbar.");
    return invoke("reveal_entry", { path });
  },
  async compile(
    main: string,
    engine: string,
    timeoutSeconds = 180,
    directory = "",
  ): Promise<{
    success: boolean;
    pdf: string | null;
    log: string;
    durationMs: number;
    buildDirectory: string;
    sourceMap: boolean;
  }> {
    if (!native)
      throw Error(
        "Die echte LaTeX-Kompilierung ist in der SimpleLexEditor-Desktop-App verfügbar. Starte sie mit npm run desktop.",
      );
    return invoke("compile_project", {
      main,
      engine,
      timeoutSeconds,
      directory,
    });
  },
  async pdfSourceLocation(
    main: string,
    buildDirectory: string,
    position: PdfPosition,
    directory = "",
  ): Promise<PdfSourceLocation> {
    if (!native)
      throw Error(
        "Die PDF-Quelltextzuordnung ist in der SimpleLexEditor-Desktop-App verfügbar.",
      );
    return invoke("pdf_source_location", {
      main,
      buildDirectory,
      position,
      directory,
    });
  },
  async importImage(): Promise<string | null> {
    if (!native)
      throw Error(
        "Bilder lassen sich in der Desktop-App in das Projekt importieren.",
      );
    const source = await open({
      title: "Abbildung importieren",
      filters: [
        { name: "Bilder", extensions: ["png", "jpg", "jpeg", "pdf", "eps"] },
      ],
    });
    return source ? invoke("import_asset", { source }) : null;
  },
  async exportBytes(name: string, bytes: Uint8Array) {
    if (native) {
      const destination = await save({
        defaultPath: name,
        filters: [
          {
            name: name.split(".").pop()!.toUpperCase(),
            extensions: [name.split(".").pop()!],
          },
        ],
      });
      if (!destination) return false;
      await invoke("export_file", {
        destination,
        data: toBase64(bytes),
        extension: name.split(".").pop()!.toLowerCase(),
      });
    } else {
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }
    return true;
  },
  async exportZip(name: string) {
    if (native) {
      const destination = await save({
        defaultPath: `${name}.zip`,
        filters: [{ name: "Projektarchiv", extensions: ["zip"] }],
      });
      if (!destination) return false;
      await invoke("export_zip", { destination });
      return true;
    }
    return api.exportBytes(
      `${name}.zip`,
      zipSync(
        Object.fromEntries(
          Object.entries(browserFiles).map(([k, v]) => [k, strToU8(v)]),
        ),
      ),
    );
  },
};
