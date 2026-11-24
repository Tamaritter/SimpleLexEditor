import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  lazy,
  Suspense,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Code2,
  Columns2,
  Download,
  FileArchive,
  FileCode2,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  Image,
  LoaderCircle,
  Maximize2,
  MoreHorizontal,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Settings2,
  Sun,
  Terminal,
  X,
  Zap,
  Sigma,
  GraduationCap,
  Link2,
  FolderPlus,
  Pencil,
  Trash2,
  RotateCcw,
  Play,
  History,
  ShieldCheck,
  Square,
  ClipboardCheck,
} from "lucide-react";
import { api, fromBase64, native } from "../core/api";
import { Editor, type EditorHandle } from "../editor/Editor";
import { PdfPreview } from "../pdf/PdfPreview";
import { pdfSourceSelection } from "../pdf/pdfSync";
import { ProjectTree } from "../projects/ProjectTree";
import { WorkspaceMenu } from "./WorkspaceMenu";
import { SettingsPanel, type SettingsSection } from "./SettingsPanel";
import { CommandPalette, type CommandAction } from "./CommandPalette";
import { InsertCatalog } from "../editor/InsertCatalog";
import { SidebarResize } from "./SidebarResize";
import { Toggle } from "./Toggle";
import { ProjectSearch } from "../projects/ProjectSearch";
import { QuickOpen } from "../projects/QuickOpen";
import { BuildPanel } from "../latex/BuildPanel";
import { EnvironmentPanel } from "../latex/EnvironmentPanel";
import { HistoryPanel } from "../projects/HistoryPanel";
import { ResearchPanel } from "../research/ResearchPanel";
import { planBibImport } from "../research/bibliography";
import {
  localStore as localStorage,
  validatedSettings,
  draftText,
  restoreDraft,
} from "../core/safety";
import {
  parseDiagnostics,
  resolveDiagnosticFile,
  textFile,
  type Diagnostic,
} from "./workspace";
import { planCompilerFixes, type CompilerFix } from "../latex/compilerFixes";
import {
  automaticMainDocument,
  repairFingerprint,
  runAutomaticRepairs,
} from "../latex/automaticRepairs";
import {
  compilerHelp,
  missingResource,
  type CompilerAction,
} from "../latex/compilerHelp";
import { CompilerGuidance } from "../latex/CompilerGuidance";
import {
  includeChapter,
  chapterPreviewDocument,
  isInside,
  isStandalone,
  hasDocumentClass,
  parentPath,
  remapPath,
  standaloneDocument,
  validEntryPath,
  type EntryAction,
} from "../projects/projectFiles";
const MathPalette = lazy(() =>
  import("../math/MathPalette").then((module) => ({
    default: module.MathPalette,
  })),
);
const SciencePanel = lazy(() =>
  import("../research/SciencePanel").then((module) => ({
    default: module.SciencePanel,
  })),
);
import { version as appVersion } from "../../package.json";
import {
  ensurePreamble,
  preambleDependencies,
  type ScientificInsert,
  scientificInsertionRange,
} from "../research/scientific";
import {
  escapeTex,
  outline,
  tableSnippet,
  templates,
  welcome,
  wordCount,
  type Document,
  type Project,
  type FileEntry,
  type Settings,
} from "../core/model";

type Modal =
  | "compilerFixes"
  | "environment"
  | "history"
  | "conflict"
  | "quickopen"
  | "folder"
  | "rename"
  | "trash"
  | "preview"
  | "math"
  | "science"
  | "new"
  | "insert"
  | "table"
  | "file"
  | "settings"
  | "help"
  | "export"
  | "commands"
  | null;
function IconButton({
  title,
  onClick,
  children,
  active = false,
  disabled = false,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      className={`icon-button ${active ? "active" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function ModalShell({
  title,
  subtitle,
  children,
  close,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    const initialFocus =
      el.querySelector<HTMLElement>("[data-autofocus]") ||
      el.querySelector<HTMLElement>(
        "input:not([disabled]), textarea:not([readonly])",
      ) ||
      el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ||
      el.querySelector<HTMLElement>("select:not([disabled])");
    initialFocus?.focus({ preventScroll: true });
    const cancel = (e: Event) => {
      e.preventDefault();
      close();
    };
    el.addEventListener("cancel", cancel);
    return () => {
      el.removeEventListener("cancel", cancel);
      el.close();
    };
  }, [close]);
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      className={`modal ${wide ? "wide" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton title="Schließen" onClick={close}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export default function App() {
  const [writeError, setWriteError] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [preparingTeX, setPreparingTeX] = useState(native);
  const [toolchainError, setToolchainError] = useState("");
  const [indexWarning, setIndexWarning] = useState("");
  const [conflict, setConflict] = useState<{
    path: string;
    root: string;
    disk: string | null;
    version?: string;
  } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const recoveryQueue = useRef(Promise.resolve());
  const backendBusy = useRef(false);
  const cancelRequested = useRef(false);
  const [fileKind, setFileKind] = useState<"document" | "chapter">("document");
  const [autoPreview, setAutoPreview] = useState(true),
    [autoInclude, setAutoInclude] = useState(true);
  const [fileError, setFileError] = useState(""),
    [entryTarget, setEntryTarget] = useState(""),
    [entryName, setEntryName] = useState(""),
    [previewTarget, setPreviewTarget] = useState("");
  const [lastTrash, setLastTrash] = useState<{
    path: string;
    id: string;
    root: string;
    main: string;
    active: string;
  } | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const mutationBusy = useRef(false);
  const [scienceTab, setScienceTab] = useState("literature");
  const [scientificError, setScientificError] = useState("");
  const [professionalTable, setProfessionalTable] = useState(true);
  const [sourceIndex, setSourceIndex] = useState<Record<string, string>>({});
  const [searchRequest, setSearchRequest] = useState({ query: "", id: 0 });
  const [revealCompilerLog, setRevealCompilerLog] = useState(0);
  const [missingTeXFile, setMissingTeXFile] = useState("");
  const [project, setProject] = useState<Project | null>(null),
    [docs, setDocsState] = useState<Document[]>([]),
    [active, setActive] = useState("main.tex");
  const [settings, setSettings] = useState<Settings>(() =>
    validatedSettings(localStorage.getItem("roxena-settings")),
  );
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("workspace");
  const [fileScope, setFileScope] = useState<"all" | "open">("all");
  const [sidebarWidth, setSidebarWidth] = useState<number | undefined>(() => {
    const width = Number(localStorage.getItem("roxena-sidebar-width"));
    return Number.isFinite(width) && width >= 180 && width <= 420
      ? width
      : undefined;
  });
  const sidebarElement = useRef<HTMLElement>(null);
  const tabStrip = useRef<HTMLDivElement>(null);
  const openFiles = (scope: "all" | "open" = "all") => {
    setFileScope(scope);
    setModal("quickopen");
  };
  const openSettings = (section: SettingsSection = "workspace") => {
    setSettingsSection(section);
    setModal("settings");
  };
  const [modal, setModal] = useState<Modal>(null),
    [sidebar, setSidebar] = useState(true),
    [outlineOpen, setOutlineOpen] = useState(
      () => localStorage.getItem("roxena-outline-open") !== "false",
    ),
    [sideTab, setSideTab] = useState<"files" | "search" | "research">("files"),
    [preview, setPreview] = useState(true),
    [focus, setFocus] = useState(false);
  const [live, setLive] = useState(true),
    [compiling, setCompiling] = useState(false),
    [saving, setSaving] = useState(false),
    [pdf, setPdf] = useState<Uint8Array | null>(null),
    [pages, setPages] = useState(0),
    [log, setLog] = useState(""),
    [showLog, setShowLog] = useState(false),
    [compileState, setCompileState] = useState<
      "ready" | "success" | "error" | "stale"
    >("ready"),
    [compileTime, setCompileTime] = useState(0);
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState("");
  const [autoRepairRunning, setAutoRepairRunning] = useState(false);
  const [repairProgress, setRepairProgress] = useState("");
  const autoRepairCancelled = useRef(false);
  const automaticRepairActive = useRef(false);
  const [fixPlan, setFixPlan] = useState<{
    root: string;
    main: string;
    changes: CompilerFix[];
    issues: Diagnostic[];
  } | null>(null);
  const compileReport = useRef<{
    root: string;
    main: string;
    log: string;
    success: boolean;
  } | null>(null);
  const [jump, setJump] = useState<{
    file: string;
    line: number;
    column?: number;
    length?: number;
  } | null>(null);
  const [pdfSource, setPdfSource] = useState<{
    root: string;
    main: string;
    buildDirectory: string;
    directory: string;
  } | null>(null);
  const pdfSourceRef = useRef(pdfSource);
  pdfSourceRef.current = pdfSource;
  const [cursor, setCursor] = useState({ line: 1, col: 1 }),
    [toast, setToast] = useState<{
      text: string;
      error: boolean;
      undo?: boolean;
    } | null>(null),
    [projectName, setProjectName] = useState("Mein neues Projekt"),
    [template, setTemplate] = useState("article"),
    [filename, setFilename] = useState("dokument.tex"),
    [tableRows, setTableRows] = useState(3),
    [tableCols, setTableCols] = useState(3),
    [caption, setCaption] = useState("Eine kleine Übersicht"),
    [busy, setBusy] = useState(false),
    [split, setSplit] = useState(() => {
      const saved = Number(localStorage.getItem("roxena-split"));
      return saved >= 28 && saved <= 75 ? saved : 53;
    });
  const editor = useRef<EditorHandle>(null),
    workspace = useRef<HTMLDivElement>(null),
    docsRef = useRef(docs),
    projectRef = useRef(project),
    settingsRef = useRef(settings),
    liveRef = useRef(live),
    compileBusy = useRef(false),
    saveQueue = useRef(Promise.resolve()),
    compileRef = useRef<(revealErrors?: boolean) => Promise<void>>(
      async () => {},
    ),
    initialized = useRef(false);
  docsRef.current = docs;
  const setDocs = useCallback(
    (value: Document[] | ((current: Document[]) => Document[])) => {
      const next = typeof value === "function" ? value(docsRef.current) : value;
      docsRef.current = next;
      setDocsState(next);
    },
    [],
  );
  projectRef.current = project;
  settingsRef.current = settings;
  liveRef.current = live;
  const current = docs.find((d) => d.path === active),
    content = current?.content ?? "";
  useEffect(() => {
    localStorage.setItem("roxena-split", String(split));
  }, [split]);
  useEffect(() => {
    localStorage.setItem("roxena-outline-open", String(outlineOpen));
  }, [outlineOpen]);
  useEffect(() => {
    if (sidebarWidth === undefined)
      localStorage.removeItem("roxena-sidebar-width");
    else localStorage.setItem("roxena-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);
  useEffect(() => {
    tabStrip.current
      ?.querySelector(".file-tab.active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, docs.length]);
  useEffect(() => {
    if (!project) return;
    try {
      localStorage.setItem(
        `roxena-session:${project.root}`,
        JSON.stringify({ active, tabs: docs.map((d) => d.path) }),
      );
    } catch {
      /* Saving documents remains independent of session storage. */
    }
  }, [project?.root, docs.map((d) => d.path).join("\u0000"), active]);
  useEffect(() => {
    if (jump && active === jump.file) {
      const frame = requestAnimationFrame(() => {
        editor.current?.goTo(jump.line, jump.column, jump.length);
        setJump(null);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [jump, active]);
  const notify = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  );
  const saveRecoveryNow = useCallback(async () => {
    const root = projectRef.current?.root;
    if (!root) return;
    const pending = docsRef.current.filter(
      (doc) => doc.content !== doc.saved || !!doc.conflict,
    );
    const job = recoveryQueue.current
      .catch(() => {})
      .then(async () => {
        for (const doc of pending) {
          localStorage.setItem(
            `roxena-draft:${root}:${doc.path}`,
            draftText(doc.saved, doc.content),
          );
          await api.saveRecovery(doc.path, doc.content, doc.saved, root);
        }
      });
    recoveryQueue.current = job;
    try {
      await job;
      setRecoveryError("");
    } catch (error) {
      setRecoveryError(`Entwurfssicherung fehlgeschlagen: ${String(error)}`);
      throw error;
    }
  }, []);
  const inspectConflict = useCallback(async (path: string) => {
    const root = projectRef.current?.root;
    if (!root) return;
    const next = docsRef.current.map((doc) =>
      doc.path === path ? { ...doc, conflict: true } : doc,
    );
    docsRef.current = next;
    setDocs(next);
    let disk: string | null = null;
    try {
      disk = await api.read(path);
    } catch {
      /* Missing files can still be saved under a new name. */
    }
    if (projectRef.current?.root !== root) return;
    setConflict({ path, root, disk, version: api.version(path) });
    setModal("conflict");
  }, []);
  const closeModal = useCallback(() => {
    setModal(null);
    setScientificError("");
    setFileError("");
  }, []);
  const changeSetting = <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => setToast(null),
      toast.undo ? 12000 : toast.error ? 7500 : 3500,
    );
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    localStorage.setItem("roxena-settings", JSON.stringify(settings));
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        settings.theme === "system"
          ? mq.matches
            ? "dark"
            : "light"
          : settings.theme);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings]);

  const loadProject = useCallback(
    async (info: Project) => {
      api.setRoot(info.root);
      const preferred = localStorage.getItem(`roxena-main:${info.root}`);
      if (preferred && info.files.some((f) => f.path === preferred))
        info = { ...info, main: preferred };
      let verifiedMain = "";
      const candidates = [
        ...new Set([
          info.main,
          ...info.files
            .filter((f) => !f.directory && /\.tex$/i.test(f.path))
            .map((f) => f.path),
        ]),
      ];
      for (const candidate of candidates.filter(Boolean)) {
        try {
          // Keep an intended root selectable even when its document start is
          // broken; otherwise the compiler repair action becomes unreachable.
          if (hasDocumentClass(await api.read(candidate))) {
            verifiedMain = candidate;
            break;
          }
        } catch {
          /* A different document may still be readable. */
        }
      }
      info = { ...info, main: verifiedMain };
      let path =
        info.main ||
        info.files.find((f) => f.path.toLowerCase().endsWith(".tex"))?.path ||
        info.files.find(
          (f) => !f.directory && /\.(bib|sty|cls|txt|md)$/.test(f.path),
        )?.path;
      let next: Document[] = [];
      let tabPaths = path ? [path] : [];
      try {
        const session = JSON.parse(
          localStorage.getItem(`roxena-session:${info.root}`) || "null",
        );
        if (session && Array.isArray(session.tabs)) {
          tabPaths = [
            ...new Set<string>(
              session.tabs.filter(
                (p: unknown): p is string =>
                  typeof p === "string" &&
                  textFile(p) &&
                  info.files.some((f) => !f.directory && f.path === p),
              ),
            ),
          ];
          if (tabPaths.includes(session.active)) path = session.active;
          else path = tabPaths[0];
        }
      } catch {
        /* A damaged session does not prevent opening the project. */
      }
      try {
        const recovered = await api.recoveryIndex();
        tabPaths = [
          ...new Set([
            ...tabPaths,
            ...recovered
              .filter(
                (draft) => !info.files.some((file) => file.path === draft.path),
              )
              .map((draft) => draft.path),
          ]),
        ];
      } catch (error) {
        setRecoveryError(String(error));
      }
      for (const tabPath of tabPaths) {
        let saved: string;
        try {
          saved = await api.read(tabPath);
        } catch {
          const draft = await api.recover(tabPath).catch(() => null);
          if (draft) {
            next.push({
              path: tabPath,
              content: draft.content,
              saved: draft.base,
              conflict: true,
            });
            notify(
              `Entwurf für die fehlende Datei ${tabPath} wiederhergestellt.`,
            );
          }
          continue;
        }
        let diskDraft = null;
        try {
          diskDraft = await api.recover(tabPath);
        } catch (error) {
          setRecoveryError(`Wiederherstellung prüfen: ${String(error)}`);
        }
        const restored = restoreDraft(
          saved,
          localStorage.getItem(`roxena-draft:${info.root}:${tabPath}`),
          diskDraft,
        );
        if (restored.content !== saved)
          notify(
            restored.conflict
              ? "Ein Entwurf und eine andere Dateifassung wurden gefunden. Bitte die Fassungen vergleichen."
              : "Nicht gespeicherte Änderungen wiederhergestellt.",
          );
        next.push({
          path: tabPath,
          ...restored,
          version: api.version(tabPath),
        });
      }
      setProject(info);
      projectRef.current = info;
      setDocs(next);
      docsRef.current = next;
      setActive(
        next.some((d) => d.path === path) ? path || "" : next[0]?.path || "",
      );
      setPdf(null);
      setPdfSource(null);
      setLog("");
      compileReport.current = null;
      setShowLog(false);
      setCompileState("ready");
      setPages(0);
      setLastTrash(null);
      if (native) localStorage.setItem("roxena-last-project", info.root);
    },
    [notify],
  );
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      try {
        const last = localStorage.getItem("roxena-last-project");
        if (native) {
          const { invoke } = await import("@tauri-apps/api/core");
          try {
            await invoke("prepare_toolchain", {
              directory: settings.toolchainDirectory,
            });
          } catch (error) {
            setToolchainError(String(error));
            throw error;
          }
          const startup = await invoke<Project | null>("startup_project");
          if (startup) {
            await loadProject(startup);
            return;
          }
        }
        if (native && last) {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            await loadProject(
              await invoke<Project>("open_project", { path: last }),
            );
            return;
          } catch {
            notify(
              "Das letzte Projekt ist nicht verfügbar. Der Einstieg wurde geöffnet.",
            );
          }
        }
        await loadProject(await api.initialize(welcome));
        if (
          !native &&
          projectRef.current?.main === "main.tex" &&
          (await api.read("main.tex")) === welcome
        ) {
          const response = await fetch("/welcome.pdf");
          if (
            response.ok &&
            response.headers.get("content-type")?.includes("pdf")
          )
            setPdf(new Uint8Array(await response.arrayBuffer()));
        }
      } catch (error) {
        notify(String(error), true);
      } finally {
        setPreparingTeX(false);
      }
    })();
  }, [loadProject, notify]);
  const saveAll = useCallback(
    async (silent = false, allowDuringMutation = false) => {
      if (mutationBusy.current && !allowDuringMutation) return;
      while (backendBusy.current)
        await new Promise((resolve) => setTimeout(resolve, 80));
      const pending = docsRef.current.filter(
        (doc) => doc.content !== doc.saved || !!doc.conflict,
      );
      if (!pending.length) {
        await saveQueue.current;
        if (!silent) notify("Alle Änderungen sind gespeichert.");
        return;
      }
      const blocked = pending.find((doc) => doc.conflict);
      if (blocked) {
        await inspectConflict(blocked.path);
        throw Error(
          "Speicherkonflikt: Bitte zuerst die Dateifassungen vergleichen.",
        );
      }
      const root = projectRef.current?.root;
      if (!root) return;
      setSaving(true);
      const operation = saveQueue.current
        .catch(() => {})
        .then(async () => {
          await saveRecoveryNow();
          for (const snapshot of pending) {
            if (projectRef.current?.root !== root)
              throw Error("Das aktive Projekt hat sich geändert.");
            const current = docsRef.current.find(
              (doc) => doc.path === snapshot.path,
            );
            if (!current) continue;
            try {
              await api.write(
                snapshot.path,
                snapshot.content,
                current.saved,
                root,
              );
            } catch (error) {
              setWriteError(String(error));
              if (
                String(error).includes("SAVE_CONFLICT:") ||
                String(error).includes("SAVE_UNAVAILABLE:")
              )
                await inspectConflict(snapshot.path);
              throw error;
            }
            const next = docsRef.current.map((doc) =>
              doc.path === snapshot.path
                ? {
                    ...doc,
                    saved: snapshot.content,
                    version: api.version(snapshot.path),
                    conflict: false,
                  }
                : doc,
            );
            docsRef.current = next;
            setDocs(next);
            if (
              next.find((doc) => doc.path === snapshot.path)?.content ===
              snapshot.content
            )
              localStorage.removeItem(
                "roxena-draft:" + root + ":" + snapshot.path,
              );
            await api
              .clearRecovery(snapshot.path, snapshot.content)
              .catch((error) => setRecoveryError(String(error)));
          }
          setWriteError("");
        });
      saveQueue.current = operation;
      try {
        await operation;
        if (!silent) notify("Alle Änderungen gespeichert.");
      } finally {
        setSaving(false);
      }
    },
    [notify, saveRecoveryNow, inspectConflict],
  );
  const compile = useCallback(
    async (revealErrors = true) => {
      const info = projectRef.current;
      if (!info || compileBusy.current || mutationBusy.current) return;
      if (!info.main) {
        notify("Wähle zuerst eine .tex-Datei als Hauptdokument aus.", true);
        return;
      }
      compileBusy.current = true;
      cancelRequested.current = false;
      setCompiling(true);
      const initialRevision = docsRef.current
        .map((d) => d.content)
        .join("\u0000");
      try {
        await saveAll(true);
        if (cancelRequested.current)
          throw Error("CANCELLED: Kompilierung abgebrochen.");
        backendBusy.current = true;
        const configuration = settingsRef.current;
        const result = await api.compile(
          info.main,
          configuration.engine,
          configuration.timeoutSeconds,
          configuration.toolchainDirectory,
        );
        if (
          projectRef.current?.root !== info.root ||
          projectRef.current?.main !== info.main
        )
          return;
        setLog(result.log);
        compileReport.current = {
          root: info.root,
          main: info.main,
          log: result.log,
          success: result.success,
        };
        setCompileTime(result.durationMs);
        setCompileState(
          result.success
            ? initialRevision !==
              docsRef.current.map((d) => d.content).join("\u0000")
              ? "stale"
              : "success"
            : "error",
        );
        if (result.success)
          setToast((current) => (current?.undo ? current : null));
        if (result.pdf) {
          setPdf(fromBase64(result.pdf));
          setPdfSource(
            result.sourceMap
              ? {
                  root: info.root,
                  main: info.main,
                  buildDirectory: result.buildDirectory,
                  directory: configuration.toolchainDirectory,
                }
              : null,
          );
        }
        if (!result.success && revealErrors) {
          setShowLog(true);
          notify(
            "Die Kompilierung enthält Fehler. Details findest du im Protokoll.",
            true,
          );
        }
      } catch (error) {
        if (String(error).startsWith("CANCELLED:")) {
          setCompileState("stale");
          if (revealErrors)
            notify(
              "Kompilierung abgebrochen. Die Live-Vorschau ist ausgeschaltet.",
            );
          return;
        }
        if (revealErrors && String(error).includes("nicht gefunden"))
          setModal("environment");
        setCompileState("error");
        setLog(String(error));
        compileReport.current = {
          root: info.root,
          main: info.main,
          log: String(error),
          success: false,
        };
        if (revealErrors) {
          setShowLog(true);
          notify(String(error), true);
        }
      } finally {
        setCompiling(false);
        backendBusy.current = false;
        setCancelling(false);
        compileBusy.current = false;
        if (
          native &&
          liveRef.current &&
          projectRef.current?.root === info.root &&
          initialRevision !==
            docsRef.current.map((d) => d.content).join("\u0000")
        )
          setTimeout(() => void compileRef.current(false), 500);
      }
    },
    [notify, saveAll],
  );
  compileRef.current = compile;
  const revision = docs.map((d) => d.content).join("\u0000");
  useEffect(() => {
    if (!project) return;
    const timer = setTimeout(() => void saveRecoveryNow().catch(() => {}), 350);
    return () => clearTimeout(timer);
  }, [revision, project?.root, saveRecoveryNow]);
  useEffect(() => {
    if (!native || !project?.root) return;
    let running = false,
      disposed = false;
    const check = async () => {
      if (
        running ||
        disposed ||
        compileBusy.current ||
        mutationBusy.current ||
        saving
      )
        return;
      running = true;
      const root = projectRef.current?.root;
      try {
        const versions = await api.stat(docsRef.current.map((doc) => doc.path));
        for (const version of versions) {
          if (disposed || projectRef.current?.root !== root) return;
          const original = docsRef.current.find(
            (doc) => doc.path === version.path,
          );
          if (
            !original ||
            original.version === version.version ||
            original.conflict
          )
            continue;
          let disk: string | null = null;
          try {
            disk = await api.read(version.path);
          } catch {
            /* Deleted files require conflict resolution. */
          }
          const current = docsRef.current.find(
            (doc) => doc.path === version.path,
          );
          if (!current) continue;
          const changed = current.content !== current.saved || disk === null;
          const next = docsRef.current.map((doc) =>
            doc.path !== version.path
              ? doc
              : changed
                ? { ...doc, conflict: true }
                : {
                    ...doc,
                    content: disk!,
                    saved: disk!,
                    version: api.version(version.path),
                    conflict: false,
                  },
          );
          docsRef.current = next;
          setDocs(next);
          setCompileState((state) => (state === "success" ? "stale" : state));
          if (changed)
            setWriteError(
              `${version.path} wurde außerhalb von SimpleLexEditor geändert oder entfernt. Bitte die Fassungen vergleichen.`,
            );
          else notify(`${version.path} wurde extern aktualisiert.`);
        }
      } catch {
        /* Saves still compare content if a metadata poll fails. */
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => void check(), 5000);
    const focus = () => void check();
    window.addEventListener("focus", focus);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [project?.root, saving, notify]);
  useEffect(() => {
    if (
      !settings.autoSave ||
      !project ||
      compiling ||
      docsRef.current.some((doc) => doc.conflict)
    )
      return;
    const timer = setTimeout(
      () => void saveAll(true).catch((e) => notify(String(e), true)),
      800,
    );
    return () => clearTimeout(timer);
  }, [revision, settings.autoSave, project, saveAll, notify, compiling]);
  useEffect(() => {
    if (
      !native ||
      !live ||
      !project?.main ||
      modal ||
      docsRef.current.some((doc) => doc.conflict)
    )
      return;
    const timer = setTimeout(() => {
      void compileRef.current(false);
    }, 1400);
    return () => clearTimeout(timer);
  }, [
    revision,
    live,
    project?.root,
    project?.main,
    project?.files,
    settings.engine,
    settings.timeoutSeconds,
    settings.toolchainDirectory,
    modal,
  ]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (docsRef.current.some((d) => d.saved !== d.content)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  // Native window closes are intercepted so pending writes can finish before the process exits.
  useEffect(() => {
    if (!native) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      const off = await win.onCloseRequested(async (event) => {
        event.preventDefault();
        autoRepairCancelled.current = true;
        try {
          await saveRecoveryNow();
          if (compileBusy.current) await api.cancelCompile();
          await saveAll(true);
          await win.destroy();
        } catch (e) {
          notify(`Speichern fehlgeschlagen: ${String(e)}`, true);
        }
      });
      if (disposed) off();
      else unlisten = off;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [saveAll, notify, saveRecoveryNow]);

  const changeContent = useCallback(
    (text: string) => {
      setDocs((ds) =>
        ds.map((d) => (d.path === active ? { ...d, content: text } : d)),
      );
      if (projectRef.current)
        try {
          localStorage.setItem(
            `roxena-draft:${projectRef.current.root}:${active}`,
            draftText(
              docsRef.current.find((doc) => doc.path === active)?.saved || "",
              text,
            ),
          );
        } catch {
          /* Disk save remains available. */
        }
      setCompileState((s) => (s === "success" ? "stale" : s));
    },
    [active],
  );
  const openFile = async (path: string) => {
    if (!textFile(path)) {
      notify(
        "Diese Datei ist eine Projektressource. Sie wird beim Export mitgenommen.",
      );
      return;
    }
    if (docs.some((d) => d.path === path)) {
      setActive(path);
      return;
    }
    try {
      const saved = await api.read(path);
      const diskDraft = await api.recover(path).catch((error) => {
        setRecoveryError(String(error));
        return null;
      });
      const restored = restoreDraft(
        saved,
        localStorage.getItem("roxena-draft:" + project?.root + ":" + path),
        diskDraft,
      );
      setDocs((ds) => [
        ...ds,
        { path, ...restored, version: api.version(path) },
      ]);
      setActive(path);
    } catch (e) {
      notify(String(e), true);
    }
  };
  const closeFile = async (path: string) => {
    try {
      await saveAll(true);
      const remaining = docsRef.current.filter((d) => d.path !== path);
      setDocs(remaining);
      if (active === path) setActive(remaining.at(-1)?.path || "");
    } catch (e) {
      notify(String(e), true);
    }
  };
  const openProject = useCallback(async () => {
    if (compileBusy.current || mutationBusy.current) {
      notify("Bitte warte, bis die Kompilierung abgeschlossen ist.");
      return;
    }
    try {
      await saveAll(true);
      const info = await api.openProject();
      if (info) await loadProject(info);
    } catch (e) {
      notify(String(e), true);
    }
  }, [loadProject, notify, saveAll]);
  const newProject = async () => {
    if (compileBusy.current) return;
    setBusy(true);
    try {
      await saveAll(true);
      const info = await api.createProject(
        projectName.trim(),
        templates.find((t) => t.id === template)!.content,
      );
      if (info) {
        await loadProject(info);
        closeModal();
        notify("Dein neues Projekt ist bereit.");
      }
    } catch (e) {
      notify(String(e), true);
    } finally {
      setBusy(false);
    }
  };
  const invalidatePreview = () => {
    setPdf(null);
    setPdfSource(null);
    setPages(0);
    setCompileState("ready");
    setLog("");
    setShowLog(false);
  };
  const applyFiles = (files: FileEntry[], main: string) => {
    const info = projectRef.current;
    if (!info) return;
    const next = { ...info, files, main };
    projectRef.current = next;
    setProject(next);
    if (main) localStorage.setItem(`roxena-main:${info.root}`, main);
    else localStorage.removeItem(`roxena-main:${info.root}`);
    if (info.main !== main) invalidatePreview();
  };
  const firstDocument = async (files: FileEntry[]) => {
    for (const file of [...files]
      .filter((f) => !f.directory && f.path.toLowerCase().endsWith(".tex"))
      .sort(
        (a, b) => Number(b.path === "main.tex") - Number(a.path === "main.tex"),
      )) {
      try {
        const source =
          docsRef.current.find((d) => d.path === file.path)?.content ??
          (await api.read(file.path));
        if (isStandalone(source)) return file.path;
      } catch {
        /* Other readable documents can still be selected. */
      }
    }
    return "";
  };
  const mutateFiles = async (job: () => Promise<void>) => {
    if (compileBusy.current || mutationBusy.current) {
      const message =
        "Bitte warte, bis der laufende Vorgang abgeschlossen ist.";
      setFileError(message);
      notify(message);
      return;
    }
    mutationBusy.current = true;
    setBusy(true);
    setFileError("");
    try {
      await saveAll(true, true);
      await job();
      closeModal();
    } catch (error) {
      setFileError(String(error));
      notify(String(error), true);
    } finally {
      mutationBusy.current = false;
      setBusy(false);
    }
  };
  const selectMain = (path: string) => {
    const info = projectRef.current;
    if (!info) return;
    applyFiles(info.files, path);
    setPreview(true);
    if (native) setTimeout(() => void compileRef.current(), 0);
  };
  const openNewFile = (folder = "") => {
    setFilename((folder ? folder + "/" : "") + "dokument.tex");
    setFileKind("document");
    setAutoPreview(true);
    setAutoInclude(true);
    setFileError("");
    setModal("file");
  };
  const preparePreviewHelp = async (path: string) => {
    const source = path
      ? (docsRef.current.find((d) => d.path === path)?.content ??
        (await api.read(path)))
      : "";
    setPreviewTarget(path);
    setPreviewContent(source);
    setFileError("");
    setModal("preview");
  };
  const choosePreview = async (path: string) => {
    if (compileBusy.current || mutationBusy.current) {
      notify("Bitte warte auf den laufenden Vorgang.");
      return;
    }
    try {
      const source =
        docsRef.current.find((d) => d.path === path)?.content ??
        (await api.read(path));
      if (isStandalone(source)) {
        selectMain(path);
        closeModal();
        notify(`Die Vorschau verwendet jetzt ${path}.`);
      } else await preparePreviewHelp(path);
    } catch (error) {
      notify(String(error), true);
    }
  };
  const persistText = async (path: string, text: string, expected: string) => {
    await api.write(path, text, expected, projectRef.current?.root);
    const next = docsRef.current.map((d) =>
      d.path === path
        ? {
            ...d,
            content: text,
            saved: text,
            version: api.version(path),
            conflict: false,
          }
        : d,
    );
    docsRef.current = next;
    setDocs(next);
    const root = projectRef.current?.root;
    if (root) localStorage.removeItem(`roxena-draft:${root}:${path}`);
  };
  const newFile = async () => {
    const path = filename.trim();
    if (
      !validEntryPath(path) ||
      !/\.(tex|bib|sty|cls|txt|md|csv|json)$/i.test(path)
    ) {
      setFileError(
        "Bitte einen gültigen relativen Dateinamen mit Endung angeben, zum Beispiel kapitel/einleitung.tex.",
      );
      return;
    }
    await mutateFiles(async () => {
      const info = projectRef.current;
      if (!info) throw Error("Kein Projekt geöffnet.");
      const tex = path.toLowerCase().endsWith(".tex");
      let linked: { source: string; inserted: boolean } | undefined;
      let linkedBase = "";
      if (tex && fileKind === "chapter" && autoInclude && info.main) {
        const source =
          docsRef.current.find((d) => d.path === info.main)?.content ??
          (await api.read(info.main));
        linked = includeChapter(source, path);
        linkedBase = source;
      }
      const text =
        tex && fileKind === "document"
          ? standaloneDocument(path)
          : path.endsWith(".bib")
            ? "@article{quelle,\n  author = {Nachname, Vorname},\n  title = {Titel},\n  year = {2026}\n}\n"
            : `% ${path}\n\n`;
      await api.createFile(path, text);
      if (linked?.inserted)
        await persistText(info.main, linked.source, linkedBase);
      const files = await api.list();
      const main =
        tex && fileKind === "document" && autoPreview ? path : info.main;
      applyFiles(files, main);
      await openFile(path);
      if (tex && fileKind === "document" && autoPreview) selectMain(path);
      notify(
        tex && fileKind === "document" && autoPreview
          ? `${path} ist erstellt und für die Vorschau ausgewählt.`
          : linked?.inserted
            ? `Kapitel erstellt und in ${info.main} eingebunden.`
            : "Datei erstellt.",
      );
    });
  };
  const includePreviewFile = async () =>
    mutateFiles(async () => {
      const info = projectRef.current;
      if (!info?.main || info.main === previewTarget)
        throw Error(
          "Wähle zuerst ein anderes, vollständiges Hauptdokument aus.",
        );
      const chapter =
        docsRef.current.find((d) => d.path === previewTarget)?.content ??
        (await api.read(previewTarget));
      if (isStandalone(chapter))
        throw Error(
          "Diese Datei ist bereits ein eigenständiges Dokument. Verwende sie direkt als Vorschaudokument.",
        );
      const source =
        docsRef.current.find((d) => d.path === info.main)?.content ??
        (await api.read(info.main));
      const result = includeChapter(source, previewTarget);
      if (result.inserted) await persistText(info.main, result.source, source);
      applyFiles(await api.list(), info.main);
      setPreview(true);
      if (native) setTimeout(() => void compileRef.current(), 0);
      notify(
        result.inserted
          ? `${previewTarget} ist jetzt in ${info.main} eingebunden.`
          : "Die Datei ist bereits im Hauptdokument eingebunden.",
      );
    });
  const createChapterPreview = async () =>
    mutateFiles(async () => {
      const source =
        docsRef.current.find((d) => d.path === previewTarget)?.content ??
        (await api.read(previewTarget));
      if (
        !isStandalone(source) &&
        /\\(?:documentclass|begin\s*\{document\})/.test(source)
      )
        throw Error(
          "Diese Datei enthält bereits Teile eines Dokumentgerüsts. Ergänze den Aufbau im Code, damit kein doppeltes Gerüst entsteht.",
        );
      if (isStandalone(source)) {
        selectMain(previewTarget);
        return;
      }
      const info = projectRef.current!;
      const mainSource = info.main
        ? (docsRef.current.find((d) => d.path === info.main)?.content ??
          (await api.read(info.main)))
        : "";
      const files = await api.list(),
        stem = previewTarget.replace(/\.tex$/i, "");
      let wrapper = stem + "-vorschau.tex";
      for (let number = 2; files.some((f) => f.path === wrapper); number++) {
        const existing = await api.read(wrapper);
        if (
          existing.startsWith(
            `% SimpleLexEditor-Vorschaudokument für ${previewTarget}\n`,
          ) &&
          isStandalone(existing)
        ) {
          selectMain(wrapper);
          notify(
            `Die Vorschau verwendet ${wrapper}. Deine Kapiteldatei bleibt erhalten.`,
          );
          return;
        }
        wrapper = `${stem}-vorschau-${number}.tex`;
        if (number > 100)
          throw Error(
            "Zu viele Vorschaudateien mit diesem Namen. Bitte benenne eine vorhandene Vorschaudatei um.",
          );
      }
      await api.createFile(
        wrapper,
        chapterPreviewDocument(mainSource, previewTarget, wrapper),
      );
      applyFiles(await api.list(), wrapper);
      selectMain(wrapper);
      notify(
        `Eigene Vorschau erstellt: ${wrapper}. Deine Kapiteldatei bleibt unverändert.`,
      );
    });
  const createFolder = async () => {
    const path = entryName.trim();
    if (!validEntryPath(path)) {
      setFileError("Bitte einen gültigen relativen Ordnernamen angeben.");
      return;
    }
    await mutateFiles(async () => {
      await api.createFolder(path);
      applyFiles(await api.list(), projectRef.current?.main || "");
      notify("Ordner erstellt.");
    });
  };
  const renameEntry = async () => {
    const destination = entryName.trim();
    if (!validEntryPath(destination)) {
      setFileError("Bitte einen gültigen relativen Zielpfad angeben.");
      return;
    }
    if (destination === entryTarget) {
      closeModal();
      return;
    }
    await mutateFiles(async () => {
      const info = projectRef.current!;
      await api.rename(entryTarget, destination);
      const next = docsRef.current.map((d) => {
        const path = remapPath(d.path, entryTarget, destination);
        if (path !== d.path)
          localStorage.removeItem(`roxena-draft:${info.root}:${d.path}`);
        return { ...d, path };
      });
      docsRef.current = next;
      setDocs(next);
      setActive((path) => remapPath(path, entryTarget, destination));
      const files = await api.list();
      const mappedMain = remapPath(info.main, entryTarget, destination);
      applyFiles(
        files,
        /\.tex$/i.test(mappedMain) ? mappedMain : await firstDocument(files),
      );
      setSourceIndex({});
      invalidatePreview();
      notify(
        "Eintrag umbenannt. Verweise im LaTeX-Code bitte bei Bedarf anpassen.",
      );
    });
  };
  const trashEntry = async () =>
    mutateFiles(async () => {
      const info = projectRef.current!;
      const id = await api.trash(entryTarget);
      setLastTrash({
        path: entryTarget,
        id,
        root: info.root,
        main: info.main,
        active,
      });
      const next = docsRef.current.filter(
        (d) => !isInside(d.path, entryTarget),
      );
      for (const doc of docsRef.current.filter((d) =>
        isInside(d.path, entryTarget),
      ))
        localStorage.removeItem(`roxena-draft:${info.root}:${doc.path}`);
      docsRef.current = next;
      setDocs(next);
      if (isInside(active, entryTarget)) setActive(next.at(-1)?.path || "");
      const files = await api.list(),
        main = isInside(info.main, entryTarget)
          ? await firstDocument(files)
          : info.main;
      applyFiles(files, main);
      invalidatePreview();
      if (!next.length && main) await openFile(main);
      setToast({
        text: "In den Projektpapierkorb verschoben. Die Dateien bleiben wiederherstellbar.",
        error: false,
        undo: true,
      });
    });
  const restoreEntry = async () => {
    if (!lastTrash || lastTrash.root !== projectRef.current?.root) return;
    await mutateFiles(async () => {
      await api.restore(lastTrash.path, lastTrash.id);
      const files = await api.list();
      const main = isInside(lastTrash.main, lastTrash.path)
        ? lastTrash.main
        : projectRef.current?.main || (await firstDocument(files));
      applyFiles(files, main);
      if (lastTrash.active && isInside(lastTrash.active, lastTrash.path))
        await openFile(lastTrash.active);
      setLastTrash(null);
      notify("Eintrag wiederhergestellt.");
    });
  };
  const treeAction = (
    action: EntryAction,
    path: string,
    _directory: boolean,
  ) => {
    setFileError("");
    if (action === "open") void openFile(path);
    if (action === "new-file") openNewFile(path);
    if (action === "new-folder") {
      setEntryName((path ? path + "/" : "") + "neuer-ordner");
      setModal("folder");
    }
    if (action === "rename") {
      setEntryTarget(path);
      setEntryName(path);
      setModal("rename");
    }
    if (action === "trash") {
      setEntryTarget(path);
      setModal("trash");
    }
    if (action === "restore") void restoreEntry();
    if (action === "main") void choosePreview(path);
    if (action === "include") void preparePreviewHelp(path);
    if (action === "reveal")
      void api.reveal(path).catch((error) => notify(String(error), true));
    if (action === "copy")
      void navigator.clipboard
        .writeText(path || projectRef.current?.root || "")
        .then(() => notify("Pfad kopiert."))
        .catch(() => notify(`Pfad: ${path || projectRef.current?.root}`));
    if (action === "refresh")
      void mutateFiles(async () => {
        const files = await api.list(),
          current = projectRef.current?.main || "";
        applyFiles(
          files,
          files.some((f) => f.path === current)
            ? current
            : await firstDocument(files),
        );
        notify("Dateiliste aktualisiert.");
      });
    if (action === "open-project") void openProject();
  };
  const insert = (text: string) => {
    if (!current) {
      notify("Öffne zuerst eine Textdatei.");
      return;
    }
    closeModal();
    editor.current?.insert(text);
  };
  const insertScientific = async (item: ScientificInsert) => {
    setScientificError("");
    if (!current || !active.toLowerCase().endsWith(".tex")) {
      setScientificError("Öffne zuerst eine .tex-Datei zum Einfügen.");
      return;
    }
    try {
      if (item.outsideMath) {
        const selection = editor.current?.selection();
        if (selection)
          scientificInsertionRange(
            selection.source,
            selection.from,
            selection.to,
            item,
          );
      }
      if (
        project?.main &&
        (item.packages?.length || item.declarations?.length)
      ) {
        const sources = await loadScienceSources();
        item = {
          ...item,
          preambleContext: preambleDependencies(
            sources[project.main] || "",
            sources,
            project.main,
          ),
        };
      }
      if (
        (item.packages?.length || item.declarations?.length) &&
        project?.main &&
        active !== project.main
      ) {
        const existing = docsRef.current.find((d) => d.path === project.main);
        const saved = existing?.saved ?? (await api.read(project.main));
        const original = existing?.content ?? saved;
        const prepared = ensurePreamble(original, item);
        if (prepared.added) {
          setDocs((ds) =>
            existing
              ? ds.map((d) =>
                  d.path === project.main
                    ? { ...d, content: prepared.source }
                    : d,
                )
              : [
                  ...ds,
                  { path: project.main, content: prepared.source, saved },
                ],
          );
          localStorage.setItem(
            `roxena-draft:${project.root}:${project.main}`,
            draftText(saved, prepared.source),
          );
        }
        editor.current?.insertScientific({
          ...item,
          packages: [],
          declarations: [],
        });
      } else {
        if (
          (item.packages?.length || item.declarations?.length) &&
          !project?.main
        )
          throw Error(
            "Wähle zuerst in den Einstellungen das Hauptdokument aus.",
          );
        editor.current?.insertScientific(item);
      }
      closeModal();
      notify(
        "Wissenschaftlicher Baustein eingefügt. Benötigte Pakete sind ergänzt.",
      );
    } catch (error) {
      setScientificError(String(error));
      notify(String(error), true);
    }
  };
  const loadScienceSources = useCallback(async () => {
    const files = await api.list();
    const result: Record<string, string> = {};
    let bytes = 0,
      skipped = 0;
    const readable = files.filter(
      (f) => !f.directory && /\.(tex|bib)$/.test(f.path),
    );
    for (let i = 0; i < readable.length; i += 4) {
      const batch = await Promise.allSettled(
        readable
          .slice(i, i + 4)
          .map(
            async (f) =>
              [
                f.path,
                docsRef.current.find((d) => d.path === f.path)?.content ??
                  (await api.read(f.path)),
              ] as const,
          ),
      );
      for (const item of batch) {
        if (
          item.status === "fulfilled" &&
          bytes + item.value[1].length * 2 <= 32 * 1024 * 1024
        ) {
          result[item.value[0]] = item.value[1];
          bytes += item.value[1].length * 2;
        } else skipped++;
      }
    }
    setIndexWarning(
      skipped
        ? `${skipped} Textdateien konnten wegen ihrer Größe oder eines Lesefehlers nicht in die Projektanalyse aufgenommen werden. Du kannst sie weiterhin einzeln öffnen.`
        : "",
    );
    return result;
  }, []);
  const prepareCompilerFixes = async (only?: Diagnostic) => {
    const info = projectRef.current;
    if (!info || compileBusy.current || mutationBusy.current) return;
    mutationBusy.current = true;
    setFixing(true);
    setFixError("");
    setFixPlan(null);
    setModal("compilerFixes");
    try {
      const sources = await loadScienceSources();
      if (
        projectRef.current?.root !== info.root ||
        projectRef.current?.main !== info.main
      )
        throw Error(
          "Das Vorschaudokument hat sich geändert. Starte die Fehlerbehebung erneut.",
        );
      const report = compileReport.current;
      const currentLog =
        report?.root === info.root && report.main === info.main
          ? report.log
          : log;
      const issues = parseDiagnostics(
        currentLog,
        info.main,
        info.files.filter((f) => !f.directory).map((f) => f.path),
      )
        .filter(
          (d) =>
            !only ||
            (d.message === only.message &&
              d.file === only.file &&
              d.line === only.line),
        )
        .sort(
          (a, b) =>
            Number(a.severity !== "error") - Number(b.severity !== "error") ||
            Number(!!compilerHelp(a).secondary) -
              Number(!!compilerHelp(b).secondary),
        );
      setFixPlan({
        root: info.root,
        main: info.main,
        changes: planCompilerFixes(currentLog, info.main, sources, {
          only,
          paths: info.files.filter((f) => !f.directory).map((f) => f.path),
        }),
        issues: issues.length
          ? issues
          : [
              {
                severity: "error",
                message: currentLog || "Noch keine Compilerausgabe vorhanden.",
              },
            ],
      });
    } catch (error) {
      setFixError(String(error));
    } finally {
      mutationBusy.current = false;
      setFixing(false);
    }
  };
  const applyCompilerFixes = async () => {
    if (!fixPlan?.changes.length || mutationBusy.current || compileBusy.current)
      return;
    mutationBusy.current = true;
    setFixing(true);
    setFixError("");
    let applied = false;
    try {
      if (
        projectRef.current?.root !== fixPlan.root ||
        projectRef.current?.main !== fixPlan.main
      )
        throw Error(
          "Das Vorschaudokument hat sich geändert. Starte die Fehlerbehebung erneut.",
        );
      await commitCompilerFixes(fixPlan.changes);
      setCompileState("stale");
      applied = true;
    } catch (error) {
      setFixError(String(error));
    } finally {
      mutationBusy.current = false;
      if (!applied) setFixing(false);
    }
    if (applied) {
      await compileRef.current();
      setFixing(false);
      const report = compileReport.current;
      if (report?.root === fixPlan.root && report.main === fixPlan.main) {
        if (report.success) {
          closeModal();
          notify(
            "Korrekturen übernommen. Die PDF ist aktualisiert; bisherige Fassungen liegen im Versionsverlauf.",
          );
        } else if (!docsRef.current.some((d) => d.conflict)) {
          // The compiler stops at the first fatal error. Keep the user in the
          // repair flow and analyse the next cause using the new log.
          await prepareCompilerFixes();
        }
      }
    }
  };
  const commitCompilerFixes = async (
    changes: CompilerFix[],
    originals?: Map<string, string>,
  ) => {
    const validate = async () => {
      for (const change of changes) {
        const doc = docsRef.current.find((d) => d.path === change.file);
        const source = doc?.content ?? (await api.read(change.file));
        if (doc?.conflict || source !== change.before)
          throw Error(
            `${change.file} wurde geändert. Starte die Fehlerbehebung mit der aktuellen Fassung erneut.`,
          );
      }
    };
    await validate();
    for (const change of changes) {
      if (originals) {
        if (!originals.has(change.file))
          originals.set(change.file, change.before);
        // Refresh the starting snapshot so it survives the bounded history
        // even when many successive errors in one file are repaired.
        await api.archive(change.file, originals.get(change.file)!);
      }
      if (!originals || originals.get(change.file) !== change.before)
        await api.archive(change.file, change.before);
    }
    await validate();
    if (originals && autoRepairCancelled.current) return;
    const next = docsRef.current.map((doc) => {
      const change = changes.find((c) => c.file === doc.path);
      return change ? { ...doc, content: change.after } : doc;
    });
    for (const change of changes)
      if (!next.some((d) => d.path === change.file))
        next.push({
          path: change.file,
          content: change.after,
          saved: change.before,
          version: api.version(change.file),
        });
    docsRef.current = next;
    setDocs(next);
  };
  const automaticallyFixCompilerErrors = async () => {
    const initial = projectRef.current;
    if (
      !initial ||
      fixing ||
      automaticRepairActive.current ||
      compileBusy.current ||
      mutationBusy.current
    )
      return;
    automaticRepairActive.current = true;
    autoRepairCancelled.current = false;
    setAutoRepairRunning(true);
    setFixing(true);
    setBusy(true);
    setFixError("");
    setModal("compilerFixes");
    setShowLog(false);
    const originals = new Map<string, string>();
    let main = initial.main;
    const assertSession = () => {
      if (
        projectRef.current?.root !== initial.root ||
        projectRef.current?.main !== main
      )
        throw Error(
          "Das aktive Projekt oder Vorschaudokument wurde geändert. Die automatische Reparatur wurde angehalten.",
        );
      if (docsRef.current.some((doc) => doc.conflict))
        throw Error(
          "Löse zuerst den Speicherkonflikt. Deine Dateifassungen bleiben erhalten.",
        );
    };
    try {
      const result = await runAutomaticRepairs({
        cancelled: () => autoRepairCancelled.current,
        progress: setRepairProgress,
        compile: async () => {
          assertSession();
          compileReport.current = null;
          await compileRef.current(false);
          if (autoRepairCancelled.current)
            return { root: initial.root, main, log: "", success: false };
          assertSession();
          const report = compileReport.current as {
            root: string;
            main: string;
            log: string;
            success: boolean;
          } | null;
          if (!report || report.root !== initial.root || report.main !== main)
            throw Error(
              "Es liegt kein aktuelles Compilerergebnis vor. Versuche es erneut.",
            );
          return report;
        },
        next: async (report) => {
          assertSession();
          const sources = await loadScienceSources();
          assertSession();
          const paths = projectRef
            .current!.files.filter((f) => !f.directory)
            .map((f) => f.path);
          const changes = planCompilerFixes(report.log, main, sources, {
            paths,
          });
          if (changes.length)
            return {
              id: `source:${main}:${changes.map((c) => c.file + repairFingerprint(c.after)).join("|")}`,
              description: `Fehler in ${changes.map((c) => c.file).join(", ")} werden behoben; Ausgangsfassungen werden gesichert …`,
              apply: async () => {
                assertSession();
                mutationBusy.current = true;
                try {
                  await commitCompilerFixes(changes, originals);
                } finally {
                  mutationBusy.current = false;
                }
              },
            };
          const selected = automaticMainDocument(sources, paths, main);
          if (selected)
            return {
              id: `main:${selected}`,
              description: `Zugehöriges Hauptdokument ${selected} wird für die PDF verwendet …`,
              apply: async () => {
                assertSession();
                applyFiles(projectRef.current!.files, selected);
                main = selected;
                setPreview(true);
              },
            };
          if (
            settingsRef.current.engine === "pdflatex" &&
            /fontspec[\s\S]*requires|requires either XeTeX|must be run with.*(?:Xe|Lua)/i.test(
              report.log,
            )
          ) {
            const tools = await api.tools(
              settingsRef.current.toolchainDirectory,
            );
            const engine = ["xelatex", "lualatex"].find((name) =>
              tools.some((tool) => tool.name === name && tool.available),
            );
            if (engine)
              return {
                id: `engine:${engine}`,
                description: `${engine} wird für die verwendeten Schriften aktiviert …`,
                apply: async () => {
                  assertSession();
                  settingsRef.current = { ...settingsRef.current, engine };
                  changeSetting("engine", engine);
                },
              };
          }
          return null;
        },
      });
      if (result.status === "success") {
        closeModal();
        setShowLog(false);
        notify(
          result.rounds
            ? `${result.rounds} Reparaturschritte abgeschlossen. Die PDF ist aktualisiert; Ausgangsfassungen bleiben im Versionsverlauf.`
            : "Das Dokument kompiliert bereits erfolgreich. Die PDF ist aktualisiert.",
        );
      } else {
        await prepareCompilerFixes();
        setFixError(
          result.status === "cancelled"
            ? "Automatische Reparatur angehalten. Bereits übernommene Änderungen und Ausgangsfassungen bleiben erhalten."
            : result.status === "limit"
              ? "24 Reparaturschritte sind abgeschlossen. Starte einen weiteren Durchlauf für verbleibende Fehler."
              : "Für die verbleibende Ursache ist keine sichere automatische Korrektur bekannt. Unter „Weitere Hilfe“ findest du die passende Aktion.",
        );
      }
    } catch (error) {
      setFixError(String(error));
    } finally {
      automaticRepairActive.current = false;
      setAutoRepairRunning(false);
      setFixing(false);
      setBusy(false);
      setRepairProgress("");
    }
  };
  const stopAutomaticRepairs = () => {
    autoRepairCancelled.current = true;
    setRepairProgress("Automatische Reparatur wird angehalten …");
    if (compileBusy.current)
      void api.cancelCompile().catch((error) => setFixError(String(error)));
  };
  const compilerAction = async (
    action: CompilerAction,
    diagnostic: Diagnostic,
  ) => {
    if (fixing || compileBusy.current || mutationBusy.current) return;
    try {
      if (action === "repair") {
        await prepareCompilerFixes(diagnostic);
        return;
      }
      if (action === "package") {
        const name = missingResource(diagnostic.message);
        if (name) {
          await navigator.clipboard.writeText(name);
          notify(
            `„${name}“ kopiert. Prüfe den Namen und die mitgelieferte LaTeX-Umgebung.`,
          );
        }
        return;
      }
      if (action === "source") {
        const info = projectRef.current;
        const file = resolveDiagnosticFile(
          diagnostic.file,
          info?.files.filter((f) => !f.directory).map((f) => f.path) || [],
          info?.main || "",
        );
        if (file) {
          closeModal();
          await openFile(file);
          setJump({ file, line: diagnostic.line || 1 });
        }
      } else if (action === "log") {
        closeModal();
        setShowLog(true);
        setRevealCompilerLog((v) => v + 1);
      } else if (action === "environment") {
        setMissingTeXFile(missingResource(diagnostic.message) || "");
        setModal("environment");
      } else if (action === "settings" || action === "preview") {
        openSettings("compilation");
      } else if (action === "bibliography" || action === "references") {
        setScienceTab(action === "bibliography" ? "literature" : "references");
        setModal("science");
      } else if (action === "search") {
        const query = diagnostic.command
          ? "\\" + diagnostic.command
          : missingResource(diagnostic.message)?.replace(
              /\.(?:tex|bib|sty|cls)$/i,
              "",
            ) ||
            diagnostic.message.match(/\\[a-zA-Z]+/)?.[0] ||
            diagnostic.message.match(/for package\s+([\w-]+)/i)?.[1] ||
            diagnostic.message.match(/[`'"]([^`'"]+)[`'"]/)?.[1] ||
            "";
        setSearchRequest((v) => ({ query, id: v.id + 1 }));
        setSidebar(true);
        setSideTab("search");
        closeModal();
      } else if (action === "retry") {
        closeModal();
        await compileRef.current();
      } else if (action === "unicode") {
        setBusy(true);
        const tools = await api.tools(settingsRef.current.toolchainDirectory);
        const engine = ["xelatex", "lualatex"].find((name) =>
          tools.some((t) => t.name === name && t.available),
        );
        if (engine) {
          settingsRef.current = { ...settingsRef.current, engine };
          changeSetting("engine", engine);
          closeModal();
          await compileRef.current();
        } else {
          setMissingTeXFile("");
          setModal("environment");
          notify(
            "Kein XeLaTeX oder LuaLaTeX gefunden. Prüfe die TeX-Installation.",
            true,
          );
        }
      }
    } catch (error) {
      notify(String(error), true);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    setSourceIndex({});
    void loadScienceSources()
      .then((sources) => {
        if (!cancelled) setSourceIndex(sources);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project?.root, project?.files, loadScienceSources]);
  const saveBibliography = async (path: string, entry: string) => {
    if (!validEntryPath(path) || !/\.bib$/i.test(path))
      throw Error("Bitte einen gültigen relativen .bib-Dateinamen angeben.");
    if (mutationBusy.current || compileBusy.current)
      throw Error("Bitte warte auf den laufenden Vorgang.");
    const info = projectRef.current;
    if (!info) throw Error("Öffne zuerst ein Projekt.");
    mutationBusy.current = true;
    try {
      await saveAll(true, true);
      const sources = await loadScienceSources();
      if (projectRef.current?.root !== info.root)
        throw Error("Das Projekt hat sich geändert.");
      if (
        sources[path] === undefined &&
        projectRef.current?.files.some((file) => file.path === path)
      )
        sources[path] = await api.read(path);
      const plan = planBibImport(entry, sources, path);
      if (plan.conflicts.length)
        throw Error(
          `BibTeX-Textdefinitionen widersprechen vorhandenen Definitionen: ${plan.conflicts.join(", ")}.`,
        );
      if (plan.duplicates.length)
        throw Error(
          "Ein Zitatschlüssel wurde inzwischen im Projekt ergänzt. Aktualisiere die Importvorschau, bevor du speicherst.",
        );
      if (!plan.entries.length)
        throw Error("Keine neuen Literatureinträge zum Speichern gefunden.");
      const content = (sources[path] || "") + entry;
      if (sources[path] !== undefined)
        await api.write(path, content, sources[path], info.root);
      else await api.createFile(path, content);
      setDocs((ds) =>
        ds.map((d) =>
          d.path === path
            ? {
                ...d,
                content,
                saved: content,
                version: api.version(path),
                conflict: false,
              }
            : d,
        ),
      );
      if (project)
        localStorage.removeItem(`roxena-draft:${project.root}:${path}`);
      const files = await api.list();
      setProject((p) => (p ? { ...p, files } : p));
      notify(
        `${plan.entries.length === 1 ? "Quelle" : `${plan.entries.length} Quellen`} in der Literaturdatei gespeichert.`,
      );
    } finally {
      mutationBusy.current = false;
    }
  };
  const insertImage = async () => {
    try {
      if (!current || !active.toLowerCase().endsWith(".tex"))
        throw Error(
          "Öffne zuerst eine .tex-Datei zum Einfügen einer Abbildung.",
        );
      const path = await api.importImage();
      if (!path) return;
      setProject((p) =>
        p
          ? {
              ...p,
              files: [
                ...p.files,
                { path, name: path.split("/").pop()!, directory: false },
              ],
            }
          : p,
      );
      await insertScientific({
        code: `\n\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{\\detokenize{${path}}}\n  \\caption{${escapeTex("Beschreibung der Abbildung")}}\n  \\label{fig:beispiel}\n\\end{figure}\n`,
        packages: ["graphicx"],
        outsideMath: true,
      });
    } catch (e) {
      notify(String(e), true);
    }
  };
  const exportDocument = async (format: "pdf" | "tex" | "zip" | "png") => {
    try {
      if (format !== "tex") await saveAll(true);
      let exported = false;
      const name = project?.name || "Dokument";
      if (format === "pdf") {
        if (!pdf)
          throw Error("Bitte das Projekt zuerst erfolgreich kompilieren.");
        exported = await api.exportBytes(`${name}.pdf`, pdf);
      }
      if (format === "tex") {
        if (!current) throw Error("Bitte zuerst eine Datei öffnen.");
        exported = await api.exportBytes(
          active.split("/").pop()!,
          new TextEncoder().encode(content),
        );
      }
      if (format === "zip") exported = await api.exportZip(name);
      if (format === "png") {
        const canvas =
          document.querySelector<HTMLCanvasElement>(".paper-wrap canvas");
        if (!canvas)
          throw Error(
            "Öffne die PDF-Vorschau, um eine Seite als Bild zu exportieren.",
          );
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (!blob) throw Error("Das Bild konnte nicht erstellt werden.");
        exported = await api.exportBytes(
          `${name}-seite.png`,
          new Uint8Array(await blob.arrayBuffer()),
        );
      }
      if (exported) {
        closeModal();
        notify(
          format === "pdf" && compileState === "stale"
            ? "Letzte kompilierte PDF exportiert. Neuere Änderungen sind noch nicht enthalten."
            : "Export erfolgreich. Bereit zum Teilen.",
        );
      }
    } catch (e) {
      notify(String(e), true);
    }
  };
  const cancelCompilation = async () => {
    cancelRequested.current = true;
    setLive(false);
    liveRef.current = false;
    setCancelling(true);
    try {
      await api.cancelCompile();
    } catch (error) {
      notify(String(error), true);
    } finally {
      setCancelling(false);
    }
  };
  const resolveConflict = async (mode: "mine" | "disk" | "copy") => {
    if (!conflict || projectRef.current?.root !== conflict.root || resolving)
      return;
    const doc = docsRef.current.find((doc) => doc.path === conflict.path);
    if (!doc) return;
    setResolving(true);
    try {
      if (mode === "copy") {
        const split = doc.path.lastIndexOf(".");
        const path =
          (split >= 0 ? doc.path.slice(0, split) : doc.path) +
          "-konflikt-" +
          Date.now() +
          (split >= 0 ? doc.path.slice(split) : ".tex");
        await api.createFile(path, doc.content);
        await api.read(path);
        let disk: string | null = null;
        try {
          disk = await api.read(doc.path);
        } catch {
          /* The copy preserves a deleted original. */
        }
        const next = docsRef.current
          .filter((item) => item.path !== path)
          .flatMap((item) =>
            item.path !== doc.path
              ? [item]
              : disk === null
                ? []
                : [
                    {
                      ...item,
                      content: disk,
                      saved: disk,
                      version: api.version(item.path),
                      conflict: false,
                    },
                  ],
          );
        next.push({
          path,
          content: doc.content,
          saved: doc.content,
          version: api.version(path),
        });
        docsRef.current = next;
        setDocs(next);
        setActive(path);
        const info = projectRef.current!;
        applyFiles(
          await api.list(),
          info.main === doc.path && disk === null
            ? isStandalone(doc.content)
              ? path
              : ""
            : info.main,
        );
        notify(
          `Beide Fassungen sind erhalten. Deine Fassung liegt in ${path}.`,
        );
      } else {
        if (conflict.disk === null)
          throw Error(
            "Die ursprüngliche Datei ist nicht mehr verfügbar. Sichere deine Fassung als neue Datei.",
          );
        const latest = await api.read(doc.path);
        if (latest !== conflict.disk) {
          setConflict({
            ...conflict,
            disk: latest,
            version: api.version(doc.path),
          });
          throw Error(
            "Die externe Fassung wurde erneut geändert. Bitte vergleiche die aktualisierte Fassung.",
          );
        }
        await api.archive(doc.path, doc.content);
        if (mode === "mine")
          await api.write(doc.path, doc.content, conflict.disk, conflict.root);
        const value = mode === "mine" ? doc.content : conflict.disk;
        const next = docsRef.current.map((item) =>
          item.path === doc.path
            ? {
                ...item,
                content: value,
                saved: value,
                version: api.version(doc.path),
                conflict: false,
              }
            : item,
        );
        docsRef.current = next;
        setDocs(next);
        notify(
          mode === "mine"
            ? "Deine Fassung gespeichert. Die externe Fassung bleibt im Versionsverlauf erhalten."
            : "Externe Fassung übernommen. Dein bisheriger Text bleibt im Versionsverlauf erhalten.",
        );
      }
      localStorage.removeItem(`roxena-draft:${conflict.root}:${doc.path}`);
      await api.clearRecovery(doc.path, doc.content);
      setWriteError("");
      setConflict(null);
      setModal(null);
      setCompileState("stale");
    } catch (error) {
      setWriteError(String(error));
      notify(String(error), true);
    } finally {
      setResolving(false);
    }
  };
  const restoreVersion = async (value: string) => {
    if (!current) return;
    await api.archive(active, current.content);
    changeContent(value);
    closeModal();
    notify(
      "Fassung im Editor wiederhergestellt. Deine bisherige Fassung ist gesichert.",
    );
  };
  const toggleSidebar = () => {
    setSidebar((value) => focus || !value);
    setFocus(false);
  };
  const commands: CommandAction[] = [
    {
      name: "Datei schnell öffnen",
      group: "Projekt",
      keywords: "Dateien suchen open oeffnen",
      hint: "Strg P",
      icon: FileCode2,
      run: () => openFiles(),
    },
    {
      name: "Geöffnete Dateien",
      group: "Projekt",
      keywords: "Tabs wechseln",
      icon: Columns2,
      run: () => openFiles("open"),
    },
    {
      name: "Projekt durchsuchen",
      group: "Projekt",
      keywords: "Text suchen finden",
      icon: Search,
      run: () => {
        setSidebar(true);
        setSideTab("search");
        setFocus(false);
      },
    },
    {
      name: "Projekt öffnen",
      group: "Projekt",
      keywords: "Ordner open oeffnen",
      hint: "Strg O",
      icon: FolderOpen,
      run: () => void openProject(),
    },
    {
      name: "Neues Projekt",
      group: "Projekt",
      keywords: "Vorlage erstellen",
      hint: "Strg N",
      icon: FolderPlus,
      run: () => setModal("new"),
    },
    {
      name: "Neue Datei",
      group: "Projekt",
      keywords: "TeX Dokument Kapitel erstellen",
      icon: FilePlus2,
      disabled: busy || compiling,
      run: () => openNewFile(parentPath(active)),
    },
    {
      name: "Alles speichern",
      group: "Projekt",
      keywords: "sichern save",
      hint: "Strg S",
      icon: CheckCheck,
      run: () => void saveAll().catch((error) => notify(String(error), true)),
    },
    {
      name: "Exportieren",
      group: "Projekt",
      keywords: "Download teilen",
      icon: Download,
      run: () => setModal("export"),
    },
    {
      name: "PDF exportieren",
      group: "Projekt",
      keywords: "PDF speichern herunterladen",
      icon: FileText,
      disabled: !pdf,
      disabledReason: "Zuerst eine PDF erstellen.",
      run: () => void exportDocument("pdf"),
    },
    {
      name: "Projekt als ZIP exportieren",
      group: "Projekt",
      keywords: "Archiv Backup speichern sichern",
      icon: FileArchive,
      disabled: !project,
      run: () => void exportDocument("zip"),
    },
    {
      name: "Aktuelle Quelldatei exportieren",
      group: "Projekt",
      keywords: "TeX Quellcode speichern",
      icon: FileCode2,
      disabled: !current,
      run: () => void exportDocument("tex"),
    },
    {
      name: "Element einfügen",
      group: "Schreiben",
      keywords: "Tabelle Abbildung Formatierung Fett Kursiv",
      hint: "Strg I",
      icon: Plus,
      run: () => setModal("insert"),
    },
    {
      name: "Dokument kompilieren",
      group: "Schreiben",
      keywords: "PDF erstellen bauen build",
      hint: "Strg Enter",
      icon: Zap,
      disabled: compiling || busy || !project?.main,
      run: () => void compile(),
    },
    {
      name: "Mathematik: Formeln und Symbole",
      group: "Wissenschaft",
      keywords: "Integral Matrix Gleichung",
      hint: "Strg M",
      icon: Sigma,
      run: () => setModal("math"),
    },
    {
      name: "Literatur verwalten und zitieren",
      group: "Wissenschaft",
      keywords: "BibTeX Biber Quellen Bibliografie Zitate",
      icon: BookOpen,
      run: () => {
        setScienceTab("literature");
        setModal("science");
      },
    },
    {
      name: "Querverweise einfügen",
      group: "Wissenschaft",
      keywords: "Label Referenz ref Gleichung",
      icon: Link2,
      run: () => {
        setScienceTab("references");
        setModal("science");
      },
    },
    {
      name: "Sätze, Definitionen und Beweise",
      group: "Wissenschaft",
      keywords: "Theorem Lemma Proof",
      icon: GraduationCap,
      run: () => {
        setScienceTab("theorems");
        setModal("science");
      },
    },
    {
      name: "Wissenschaftliche Projektprüfung",
      group: "Wissenschaft",
      keywords:
        "Abgabe Prüfung Formeln Gleichungen Sätze Labels Zitatschlüssel TODO Index Gliederung",
      icon: ClipboardCheck,
      run: () => {
        setSideTab("research");
        setSidebar(true);
        setFocus(false);
      },
    },
    {
      name: preview && !focus ? "Vorschau ausblenden" : "Vorschau anzeigen",
      group: "Ansicht",
      keywords: "PDF Preview split Code",
      icon: Columns2,
      run: () => {
        setFocus(false);
        setPreview((value) => (focus ? true : !value));
      },
    },
    {
      name:
        sidebar && !focus ? "Seitenleiste ausblenden" : "Seitenleiste anzeigen",
      group: "Ansicht",
      keywords: "Dateibaum Ordner",
      icon: PanelLeftOpen,
      run: toggleSidebar,
    },
    {
      name: focus ? "Fokusmodus beenden" : "Fokusmodus",
      group: "Ansicht",
      keywords: "Zen Schreiben",
      hint: "Strg ⇧ F",
      icon: Maximize2,
      run: () => setFocus((value) => !value),
    },
    {
      name: "Ansicht zurücksetzen",
      group: "Ansicht",
      keywords: "Layout Standard Breite",
      icon: RotateCcw,
      run: () => {
        setSplit(53);
        setSidebarWidth(undefined);
        setSidebar(true);
        setSideTab("files");
        setFocus(false);
        setPreview(true);
        setOutlineOpen(true);
      },
    },
    {
      name: "Darstellung wechseln",
      group: "Ansicht",
      keywords: "Theme Hell Dunkel Modus Farbe",
      icon: Sun,
      run: () =>
        changeSetting("theme", settings.theme === "dark" ? "light" : "dark"),
    },
    {
      name: "Probleme und Compilerprotokoll",
      group: "Werkzeuge",
      keywords: "Fehler Warnungen Log",
      hint: "Strg J",
      icon: Terminal,
      run: () => setShowLog((value) => !value),
    },
    {
      name: "Versionsverlauf und Wiederherstellung",
      group: "Werkzeuge",
      keywords: "History Entwurf Backup alte Fassung",
      icon: History,
      disabled: !current,
      run: () => setModal("history"),
    },
    {
      name: "TeX-Installation prüfen",
      group: "Werkzeuge",
      keywords: "Compiler BibTeX Biber MiKTeX",
      icon: ShieldCheck,
      run: () => setModal("environment"),
    },
    {
      name: "Einstellungen",
      group: "Werkzeuge",
      keywords: "Schriftgröße Zeilenumbruch automatisch speichern",
      icon: Settings2,
      run: () => openSettings(),
    },
    {
      name: "LaTeX-Compiler einstellen",
      group: "Werkzeuge",
      keywords: "Hauptdokument Zeitlimit PDF XeLaTeX LuaLaTeX",
      icon: Zap,
      run: () => openSettings("compilation"),
    },
    {
      name: "Hilfe und Tastenkürzel",
      group: "Werkzeuge",
      keywords: "Shortcuts Tastatur",
      icon: CircleHelp,
      run: () => setModal("help"),
    },
  ];
  const hotkeys = useRef({
    openProject,
    saveAll,
    preparingTeX,
    autoRepairRunning,
  });
  hotkeys.current = { openProject, saveAll, preparingTeX, autoRepairRunning };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (
        ["s", "o", "n", "k", "p", "j", "enter", "i", "m"].includes(key) ||
        (key === "f" && event.shiftKey)
      ) {
        event.preventDefault();
        if (hotkeys.current.preparingTeX || hotkeys.current.autoRepairRunning)
          return;
        if (key === "k") {
          setModal((m) => (m === "commands" ? null : "commands"));
          return;
        }
        if (document.querySelector("dialog[open]")) return;
        if (key === "p") openFiles();
        if (key === "j") setShowLog((v) => !v);
        if (key === "s")
          void hotkeys.current.saveAll().catch((e) => notify(String(e), true));
        if (key === "o") void hotkeys.current.openProject();
        if (key === "n") setModal("new");
        if (key === "enter") void compileRef.current();
        if (key === "i") setModal("insert");
        if (key === "m") setModal("math");
        if (key === "f" && event.shiftKey) setFocus((f) => !f);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [notify]);
  const dragSplit = (event: React.PointerEvent) => {
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (e: Event) => {
      const rect = workspace.current?.getBoundingClientRect();
      if (rect)
        setSplit(
          Math.min(
            75,
            Math.max(
              28,
              (((e as PointerEvent).clientX - rect.left) / rect.width) * 100,
            ),
          ),
        );
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };
  const diagnostics = useMemo(
    () => parseDiagnostics(log, project?.main || ""),
    [log, project?.main],
  );
  const tabNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of docs) {
      const name = doc.path.split("/").pop() || doc.path;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return counts;
  }, [docs]);
  const headings = outline(content),
    dirty = docs.some((d) => d.content !== d.saved),
    warningCount = diagnostics.filter((d) => d.severity === "warning").length;

  return (
    <div className={`app ${focus ? "focus-mode" : ""}`}>
      <header
        className="appbar"
        aria-label="Projekt und Aktionen"
        inert={preparingTeX}
      >
        <div className="appbar-identity">
          <div className="appbar-brand" aria-label="SimpleLexEditor">
            <img className="brand-symbol" src="/favicon.svg" alt="" />
            <span>SimpleLexEditor</span>
          </div>
          <WorkspaceMenu
            label={`Projektmenü: ${project?.name || "Dein Arbeitsbereich"}`}
            className="project-menu"
            actions={[
              {
                label: "Projekt öffnen",
                icon: FolderOpen,
                hint: "Strg O",
                run: () => void openProject(),
              },
              {
                label: "Neues Projekt",
                icon: FolderPlus,
                hint: "Strg N",
                run: () => setModal("new"),
              },
              {
                label: "Datei öffnen",
                icon: FileCode2,
                hint: "Strg P",
                separator: true,
                run: () => openFiles(),
              },
              {
                label: "Neue Datei",
                icon: FilePlus2,
                run: () => openNewFile(parentPath(active)),
              },
              {
                label: "Alles speichern",
                icon: CheckCheck,
                hint: "Strg S",
                separator: true,
                run: () =>
                  void saveAll().catch((error) => notify(String(error), true)),
              },
            ]}
          >
            <FolderOpen size={16} />
            <span title={project?.root}>
              {project?.name || "Dein Arbeitsbereich"}
            </span>
            <ChevronDown size={12} />
          </WorkspaceMenu>
        </div>
        <div className="appbar-actions">
          <button
            className="command-trigger"
            aria-label="Befehle und Werkzeuge Strg K"
            onClick={() => {
              setModal("commands");
            }}
          >
            <Search size={14} />
            <span>Befehle</span>
            <kbd>Strg K</kbd>
          </button>
          <IconButton
            title={
              settings.theme === "dark"
                ? "Hellen Modus aktivieren"
                : "Dunklen Modus aktivieren"
            }
            onClick={() =>
              changeSetting(
                "theme",
                settings.theme === "dark" ? "light" : "dark",
              )
            }
          >
            {settings.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>
          <WorkspaceMenu
            label="Ansicht und Werkzeuge"
            actions={[
              {
                label: "Nur Code",
                icon: Code2,
                selected: !preview,
                run: () => setPreview(false),
              },
              {
                label: "Code und Vorschau",
                icon: Columns2,
                selected: preview,
                run: () => {
                  setFocus(false);
                  setPreview(true);
                },
              },
              {
                label: focus ? "Fokusmodus beenden" : "Fokusmodus",
                icon: Maximize2,
                hint: "Strg ⇧ F",
                run: () => setFocus((value) => !value),
              },
              {
                label: "Versionsverlauf und Wiederherstellung",
                icon: History,
                disabled: !current,
                separator: true,
                run: () => setModal("history"),
              },
              {
                label: "TeX-Installation prüfen",
                icon: ShieldCheck,
                run: () => setModal("environment"),
              },
              {
                label: "Einstellungen",
                icon: Settings2,
                separator: true,
                run: () => openSettings(),
              },
              {
                label: "Tastenkürzel & Hilfe",
                icon: CircleHelp,
                run: () => setModal("help"),
              },
            ]}
          >
            <MoreHorizontal size={18} />
          </WorkspaceMenu>
          <span className="appbar-divider" />
          <button
            className="button appbar-export"
            onClick={() => setModal("export")}
          >
            <ArrowDownToLine size={15} />
            <span>Exportieren</span>
          </button>
          <button
            className="button primary compile-button"
            aria-busy={compiling}
            title={
              compiling ? "Kompilierung abbrechen" : "Kompilieren (Strg+Enter)"
            }
            disabled={cancelling || (!compiling && (busy || !project?.main))}
            onClick={() =>
              compiling ? void cancelCompilation() : void compile()
            }
          >
            {compiling ? <Square size={13} /> : <Play size={14} />}
            {cancelling
              ? "Wird beendet …"
              : compiling
                ? "Abbrechen"
                : "Kompilieren"}
            {!compiling && <kbd>Strg ↵</kbd>}
          </button>
        </div>
      </header>
      {preparingTeX && (
        <div className="index-warning" role="status">
          <LoaderCircle size={16} className="spin" /> LaTeX wird vorbereitet.
          Beim ersten portablen Start werden die mitgelieferten Pakete entpackt;
          das kann einige Minuten dauern. Es ist kein Download nötig.
        </div>
      )}
      {toolchainError && (
        <div className="safety-banner" role="alert">
          <AlertTriangle size={16} />
          <span>{toolchainError}</span>
          <button onClick={() => window.location.reload()}>
            Erneut versuchen
          </button>
        </div>
      )}
      {(writeError || recoveryError || docs.some((doc) => doc.conflict)) && (
        <div className="safety-banner" role="alert">
          <ShieldCheck size={16} />
          <span>
            {writeError ||
              recoveryError ||
              "Dateifassungen müssen vor dem Speichern verglichen werden."}
          </span>
          {docs.some((doc) => doc.conflict) && (
            <button
              onClick={() =>
                void inspectConflict(docs.find((doc) => doc.conflict)!.path)
              }
            >
              Fassungen vergleichen
            </button>
          )}
          <button onClick={() => void saveRecoveryNow().catch(() => {})}>
            Entwürfe erneut sichern
          </button>
          <button onClick={() => void exportDocument("tex")}>
            Aktuellen Text exportieren
          </button>
        </div>
      )}
      {indexWarning && (
        <div className="index-warning" role="status">
          {indexWarning}
        </div>
      )}
      <div className="app-body" inert={busy || preparingTeX}>
        <nav className="activity-rail" aria-label="Arbeitsbereiche">
          <div>
            <button
              type="button"
              className="icon-button sidebar-toggle"
              title={
                focus
                  ? "Fokusmodus beenden"
                  : sidebar
                    ? "Seitenleiste ausblenden"
                    : "Seitenleiste anzeigen"
              }
              aria-label={
                focus
                  ? "Fokusmodus beenden"
                  : sidebar
                    ? "Seitenleiste ausblenden"
                    : "Seitenleiste anzeigen"
              }
              aria-expanded={sidebar && !focus}
              aria-controls={sidebar && !focus ? "project-sidebar" : undefined}
              onClick={toggleSidebar}
            >
              {sidebar && !focus ? (
                <PanelLeftClose size={19} />
              ) : (
                <PanelLeftOpen size={19} />
              )}
            </button>
            {!focus && (
              <>
                <IconButton
                  title="Projektdateien"
                  active={sidebar && sideTab === "files"}
                  onClick={() => {
                    setSidebar((s) => sideTab !== "files" || !s);
                    setSideTab("files");
                  }}
                >
                  <Folder size={19} />
                </IconButton>
                <IconButton
                  title="Projekt durchsuchen"
                  active={sidebar && sideTab === "search"}
                  onClick={() => {
                    setSidebar(true);
                    setSideTab("search");
                  }}
                >
                  <Search size={19} />
                </IconButton>
                <IconButton
                  title="Wissenschaftliche Projektprüfung"
                  active={sidebar && sideTab === "research"}
                  onClick={() => {
                    setSideTab("research");
                    setSidebar(true);
                  }}
                >
                  <ClipboardCheck size={19} />
                </IconButton>
              </>
            )}
          </div>
          {!focus && (
            <div>
              <IconButton
                title="Fokusmodus (Strg+Shift+F)"
                onClick={() => setFocus(true)}
              >
                <Maximize2 size={18} />
              </IconButton>
              <IconButton title="Einstellungen" onClick={() => openSettings()}>
                <Settings2 size={19} />
              </IconButton>
            </div>
          )}
        </nav>
        {sidebar && !focus && (
          <>
            <aside
              className="sidebar"
              id="project-sidebar"
              ref={sidebarElement}
              style={
                sidebarWidth === undefined
                  ? undefined
                  : ({
                      "--sidebar-width": `${sidebarWidth}px`,
                    } as CSSProperties)
              }
            >
              <div className="sidebar-title">
                <span>
                  {sideTab === "files"
                    ? "PROJEKT"
                    : sideTab === "search"
                      ? "PROJEKTSUCHE"
                      : "PROJEKTPRÜFUNG"}
                </span>
                <div className="inline-actions">
                  {sideTab === "files" && (
                    <IconButton
                      title="Neue Datei"
                      onClick={() => openNewFile(parentPath(active))}
                    >
                      <FilePlus2 size={14} />
                    </IconButton>
                  )}
                </div>
              </div>
              {sideTab === "files" ? (
                <>
                  <ProjectTree
                    name={project?.name || "Projekt"}
                    root={project?.root || ""}
                    files={project?.files || []}
                    active={active}
                    main={project?.main || ""}
                    dirty={docs
                      .filter((d) => d.content !== d.saved)
                      .map((d) => d.path)}
                    disabled={compiling || busy}
                    canRestore={!!lastTrash && lastTrash.root === project?.root}
                    onAction={treeAction}
                  />
                  <button
                    className="add-file"
                    onClick={() => openNewFile(parentPath(active))}
                  >
                    <Plus size={13} /> Datei hinzufügen
                  </button>
                  <button
                    className="outline-heading"
                    aria-label="Dokumentstruktur"
                    aria-expanded={outlineOpen}
                    aria-controls="document-outline"
                    onClick={() => setOutlineOpen((open) => !open)}
                  >
                    <ChevronDown
                      size={12}
                      className={outlineOpen ? "" : "collapsed"}
                    />
                    <span>Dokumentstruktur</span>
                    <span className="section-count">{headings.length}</span>
                  </button>
                  <div
                    className="outline-list"
                    id="document-outline"
                    hidden={!outlineOpen}
                  >
                    {headings.length ? (
                      headings.map((h, i) => (
                        <button
                          key={`${h.line}-${h.title}`}
                          onClick={() => editor.current?.goTo(h.line)}
                          className={
                            cursor.line >= h.line &&
                            (!headings[i + 1] ||
                              cursor.line < headings[i + 1].line)
                              ? "current"
                              : ""
                          }
                          style={{
                            paddingLeft: 17 + Math.max(0, h.level - 1) * 12,
                          }}
                        >
                          <span className="outline-number">{i + 1}</span>
                          <span>{h.title}</span>
                        </button>
                      ))
                    ) : (
                      <p className="muted-help">
                        Deine Kapitel und Abschnitte erscheinen hier.
                      </p>
                    )}
                  </div>
                </>
              ) : sideTab === "search" ? (
                <ProjectSearch
                  key={`${project?.root}:${searchRequest.id}`}
                  initialQuery={searchRequest.query}
                  root={project?.root || ""}
                  files={project?.files || []}
                  documents={docs}
                  active={active}
                  onNavigate={(hit) => {
                    void openFile(hit.file)
                      .then(() => setJump(hit))
                      .catch((e) => notify(String(e), true));
                  }}
                />
              ) : (
                <ResearchPanel
                  key={project?.root}
                  main={project?.main || ""}
                  files={project?.files || []}
                  documents={docs}
                  loadSources={loadScienceSources}
                  onNavigate={(file, line) => {
                    void openFile(file)
                      .then(() => setJump({ file, line }))
                      .catch((e) => notify(String(e), true));
                  }}
                  onMath={() => setModal("math")}
                  onScience={(tab) => {
                    setScienceTab(tab);
                    setModal("science");
                  }}
                />
              )}
            </aside>
            <SidebarResize
              sidebar={sidebarElement}
              onResize={setSidebarWidth}
              onReset={() => setSidebarWidth(undefined)}
            />
          </>
        )}
        <main className="main-area">
          <div className="workspace" ref={workspace}>
            <section
              className="editor-pane"
              style={{ width: preview && !focus ? `${split}%` : "100%" }}
            >
              <div className="tabs-bar">
                <div className="file-tabs" ref={tabStrip}>
                  {docs.map((doc) => (
                    <div
                      key={doc.path}
                      className={`file-tab ${active === doc.path ? "active" : ""}`}
                    >
                      <button
                        title={doc.path}
                        aria-label={doc.path}
                        aria-current={active === doc.path ? "page" : undefined}
                        onClick={() => setActive(doc.path)}
                      >
                        <FileCode2 size={14} />
                        <span>{doc.path.split("/").pop()}</span>
                        {(tabNameCounts.get(
                          doc.path.split("/").pop() || doc.path,
                        ) || 0) > 1 && (
                          <small
                            className="tab-folder"
                            title={parentPath(doc.path) || "Projekt"}
                          >
                            {parentPath(doc.path) || "Projekt"}
                          </small>
                        )}
                        {doc.content !== doc.saved && (
                          <span className="unsaved-dot" />
                        )}
                      </button>
                      <button
                        title={`${doc.path} schließen`}
                        className="close-tab"
                        onClick={() => void closeFile(doc.path)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <IconButton
                    title="Neue Datei"
                    onClick={() => openNewFile(parentPath(active))}
                  >
                    <Plus size={15} />
                  </IconButton>
                </div>
                <div className="inline-actions">
                  <IconButton
                    title="Geöffnete Dateien"
                    onClick={() => openFiles("open")}
                  >
                    <span className="open-tabs-count">{docs.length}</span>
                    <ChevronDown size={13} />
                  </IconButton>
                  <IconButton
                    title={
                      preview ? "Vorschau ausblenden" : "Vorschau anzeigen"
                    }
                    onClick={() => {
                      setFocus(false);
                      setPreview((p) => !p);
                    }}
                  >
                    {preview ? (
                      <PanelRightClose size={15} />
                    ) : (
                      <PanelRightOpen size={15} />
                    )}
                  </IconButton>
                </div>
              </div>
              <div className="editor-toolbar">
                <div className="inline-actions">
                  <button
                    className="insert-trigger"
                    onClick={() => {
                      setModal("insert");
                    }}
                    disabled={!current}
                  >
                    <Plus size={14} />
                    <span>Einfügen</span>
                    <ChevronDown size={11} />
                  </button>
                  <button
                    className="math-toolbar-button"
                    aria-label="Mathematik öffnen (Strg+M)"
                    title="Mathematik öffnen (Strg+M)"
                    disabled={!current}
                    onClick={() => setModal("math")}
                  >
                    <Sigma size={14} /> Mathematik
                  </button>
                  <button
                    className="math-toolbar-button science-toolbar-button"
                    aria-label="Literatur, Querverweise und Beweise"
                    title="Literatur, Querverweise und Beweise"
                    onClick={() => {
                      setScienceTab("literature");
                      setModal("science");
                    }}
                  >
                    <BookOpen size={13} /> Wissenschaft
                  </button>
                </div>
                <span className="editor-language">
                  {active.endsWith(".bib")
                    ? "BibTeX"
                    : active.endsWith(".tex")
                      ? "LaTeX"
                      : "Text"}
                </span>
              </div>
              {current ? (
                <Editor
                  key={project?.root}
                  ref={editor}
                  path={active}
                  content={content}
                  settings={settings}
                  onChange={changeContent}
                  completionSources={{
                    ...sourceIndex,
                    ...Object.fromEntries(docs.map((d) => [d.path, d.content])),
                  }}
                  onCursor={(line, col) => setCursor({ line, col })}
                />
              ) : (
                <div className="editor-empty">
                  <FileCode2 size={35} strokeWidth={1} />
                  <h3>Keine Datei geöffnet</h3>
                  <p>Öffne eine Datei oder lege eine neue an.</p>
                  <button
                    className="button secondary"
                    onClick={() => openNewFile(parentPath(active))}
                  >
                    <Plus size={15} /> Neue Datei
                  </button>
                </div>
              )}
              <div className="editor-footer">
                <span className="file-location" title={active}>
                  <span className="file-type-dot" />
                  {current ? active : "Keine Datei geöffnet"}
                </span>
                {active &&
                  active.toLowerCase().endsWith(".tex") &&
                  active !== project?.main && (
                    <div className="editor-preview-link">
                      <span>
                        Vorschau:{" "}
                        <strong>{project?.main || "kein Dokument"}</strong>
                      </span>
                      <button
                        disabled={compiling || busy}
                        onClick={() => void choosePreview(active)}
                      >
                        Diese Datei anzeigen <Play size={11} />
                      </button>
                    </div>
                  )}
                <span>
                  {wordCount(content).toLocaleString("de-DE")} Wörter{" "}
                  <span className="footer-dot">·</span>{" "}
                  {content.split("\n").length} Zeilen
                </span>
              </div>
            </section>
            {preview && !focus && (
              <>
                <div
                  className="split-handle"
                  role="separator"
                  aria-label="Breite von Editor und Vorschau ändern"
                  aria-orientation="vertical"
                  aria-valuenow={Math.round(split)}
                  tabIndex={0}
                  onPointerDown={dragSplit}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft")
                      setSplit((s) => Math.max(28, s - 2));
                    if (e.key === "ArrowRight")
                      setSplit((s) => Math.min(75, s + 2));
                  }}
                />
                <PdfPreview
                  key={`${project?.root}:${project?.main}`}
                  document={project?.main || ""}
                  documents={
                    project?.files
                      .filter(
                        (f) =>
                          !f.directory && f.path.toLowerCase().endsWith(".tex"),
                      )
                      .map((f) => f.path) || []
                  }
                  onDocumentChange={(path) => void choosePreview(path)}
                  onDocumentHelp={() =>
                    void preparePreviewHelp(
                      active.toLowerCase().endsWith(".tex")
                        ? active
                        : project?.main || "",
                    )
                  }
                  bytes={pdf}
                  sourceMapAvailable={
                    !!pdfSource &&
                    pdfSource.root === project?.root &&
                    pdfSource.main === project?.main
                  }
                  onSourceLocation={
                    native
                      ? async (position) => {
                          const context = pdfSourceRef.current;
                          if (
                            !context ||
                            compileBusy.current ||
                            compileState !== "success" ||
                            docsRef.current.some(
                              (doc) =>
                                doc.conflict || doc.content !== doc.saved,
                            )
                          )
                            throw Error(
                              "Kompiliere das Dokument erneut, damit PDF und Quelltext zusammenpassen.",
                            );
                          const unchanged = () =>
                            pdfSourceRef.current === context &&
                            projectRef.current?.root === context.root &&
                            projectRef.current?.main === context.main &&
                            !compileBusy.current &&
                            !docsRef.current.some(
                              (doc) =>
                                doc.conflict || doc.content !== doc.saved,
                            );
                          const target = await api.pdfSourceLocation(
                            context.main,
                            context.buildDirectory,
                            position,
                            context.directory,
                          );
                          if (!unchanged()) return;
                          await openFile(target.file);
                          if (!unchanged()) return;
                          const doc = docsRef.current.find(
                            (doc) => doc.path === target.file,
                          );
                          if (!doc || doc.version !== target.version)
                            throw Error(
                              "Die Quelldatei hat sich geändert. Lade sie neu und kompiliere das Dokument erneut.",
                            );
                          const line =
                            doc.content.split(/\r?\n/)[target.line - 1];
                          if (line === undefined)
                            throw Error(
                              "Die Quellzeile ist nicht mehr vorhanden. Kompiliere das Dokument erneut.",
                            );
                          setJump({
                            file: target.file,
                            ...pdfSourceSelection(doc.content, target.line),
                          });
                          notify(`${target.file} · Zeile ${target.line}`);
                        }
                      : undefined
                  }
                  compiling={compiling}
                  onCompile={() => void compile()}
                  onFix={() => void prepareCompilerFixes()}
                  fixing={fixing || busy}
                  onExport={() => void exportDocument("pdf")}
                  onError={(message) => notify(message, true)}
                  onPages={setPages}
                  status={compileState}
                  onProblems={() => setShowLog(true)}
                />
              </>
            )}
          </div>
          {showLog && (
            <BuildPanel
              log={log}
              main={project?.main || ""}
              paths={
                project?.files.filter((f) => !f.directory).map((f) => f.path) ||
                []
              }
              state={compileState}
              compiling={compiling}
              fixing={fixing || busy}
              onFix={(diagnostic) => void prepareCompilerFixes(diagnostic)}
              onAction={(action, diagnostic) =>
                void compilerAction(action, diagnostic)
              }
              revealLog={revealCompilerLog}
              onClose={() => setShowLog(false)}
              onNavigate={(file, line) => {
                void openFile(file)
                  .then(() => setJump({ file, line }))
                  .catch((e) => notify(String(e), true));
              }}
            />
          )}
        </main>
      </div>
      <footer className="statusbar">
        <div className="status-left">
          <span className="save-status" role="status">
            {saving ? (
              <LoaderCircle size={11} className="spin" />
            ) : dirty ? (
              <span className="unsaved-dot" />
            ) : (
              <CheckCheck size={12} />
            )}
            <span>
              {saving
                ? "Wird gespeichert …"
                : dirty
                  ? "Ungespeicherte Änderungen"
                  : "Alle Änderungen gespeichert"}
            </span>
          </span>
          <button
            className={compileState === "error" ? "status-error" : ""}
            onClick={() => setShowLog((s) => !s)}
          >
            {compiling ? (
              <LoaderCircle size={11} className="spin" />
            ) : compileState === "success" ? (
              <Check size={12} />
            ) : (
              <Terminal size={12} />
            )}
            <span>
              {compiling
                ? "Kompilierung läuft"
                : compileState === "success"
                  ? `Erfolgreich · ${(compileTime / 1000).toFixed(1)} s${warningCount ? ` · ${warningCount} ${warningCount === 1 ? "Warnung" : "Warnungen"}` : ""}`
                  : compileState === "error"
                    ? "Compilerfehler"
                    : compileState === "stale"
                      ? "Vorschau nicht aktuell"
                      : "Bereit zum Schreiben"}
            </span>
          </button>
          {pages > 0 && (
            <span className="status-pages">
              {pages} {pages === 1 ? "Seite" : "Seiten"}
            </span>
          )}
        </div>
        <div className="status-right">
          <button
            className="live-toggle"
            onClick={() => setLive((l) => !l)}
            title="Nach Änderungen automatisch kompilieren"
          >
            <span className={`live-indicator ${live ? "" : "off"}`} />
            <span>Live-Vorschau</span>
            <span className="live-value">{live ? "An" : "Aus"}</span>
          </button>
          <span className="status-cursor">
            Z {cursor.line}, Sp {cursor.col}
          </span>
          <button onClick={() => openSettings()}>UTF-8</button>
          <button
            className="engine-status"
            onClick={() => openSettings("compilation")}
          >
            {settings.engine}
            <ChevronDown size={10} />
          </button>
        </div>
      </footer>
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`toast ${toast.error ? "error" : ""}`}
        >
          <span>
            {toast.error ? <CircleHelp size={16} /> : <Check size={16} />}
          </span>
          <p>{toast.text}</p>
          {toast.undo && lastTrash && lastTrash.root === project?.root && (
            <button
              className="toast-undo"
              onClick={() => void restoreEntry()}
              disabled={compiling || busy}
            >
              <RotateCcw size={13} /> Rückgängig
            </button>
          )}
          <IconButton title="Hinweis schließen" onClick={() => setToast(null)}>
            <X size={13} />
          </IconButton>
        </div>
      )}
      {modal === "compilerFixes" && (
        <ModalShell
          title="Compilerfehler beheben"
          subtitle="Ein Klick repariert erkennbare Ursachen und prüft anschließend die nächsten Fehler. Ausgangsfassungen werden gesichert."
          close={fixing || autoRepairRunning ? () => {} : closeModal}
          wide
        >
          {autoRepairRunning && (
            <p role="status" aria-live="polite">
              {repairProgress}
            </p>
          )}
          {fixing && !autoRepairRunning && (
            <p role="status">
              {fixPlan
                ? "Änderungen werden übernommen und die PDF wird neu kompiliert …"
                : "Compilerfehler werden geprüft …"}
            </p>
          )}
          {fixError && (
            <p role="alert" className="form-error">
              {fixError}
            </p>
          )}
          {fixPlan && !autoRepairRunning && (
            <p className="repair-explanation">
              „Alle Fehler automatisch beheben“ übernimmt sichere Korrekturen
              und kompiliert so lange erneut, bis die PDF erstellt ist oder eine
              Ursache deine Entscheidung benötigt. Du musst nicht jeden Fehler
              einzeln bestätigen.
            </p>
          )}
          {!!fixPlan?.changes.length && !autoRepairRunning && (
            <details className="compiler-more-help">
              <summary>Änderungen einzeln prüfen (optional)</summary>
              <div className="compiler-fixes">
                {!!fixPlan?.changes.length && (
                  <p className="repair-explanation">
                    {fixPlan.changes.length}{" "}
                    {fixPlan.changes.length === 1
                      ? "Datei wird"
                      : "Dateien werden"}{" "}
                    korrigiert. Prüfe die Änderungen vor dem Übernehmen.
                  </p>
                )}
                {fixPlan?.changes.map((change) => (
                  <section key={change.file}>
                    <h3>{change.file}</h3>
                    <ul>
                      {change.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <div className="compiler-fix-diff">
                      <label>
                        Vorher
                        <textarea
                          aria-label={`${change.file} vorher`}
                          readOnly
                          value={change.before}
                        />
                      </label>
                      <label>
                        Nachher
                        <textarea
                          aria-label={`${change.file} nachher`}
                          readOnly
                          value={change.after}
                        />
                      </label>
                    </div>
                  </section>
                ))}
              </div>
            </details>
          )}
          {fixPlan && !autoRepairRunning && (
            <details className="compiler-more-help">
              <summary>Weitere Hilfe</summary>
              {!fixPlan.changes.length && (
                <p>
                  Für die aktuellen Meldungen wurde keine eindeutige
                  automatische Korrektur gefunden. Der automatische Durchlauf
                  prüft zusätzlich das Hauptdokument und den passenden Compiler.
                </p>
              )}
              <CompilerGuidance
                issues={fixPlan.issues}
                main={fixPlan.main}
                paths={
                  project?.files
                    .filter((f) => !f.directory)
                    .map((f) => f.path) || []
                }
                disabled={fixing || busy}
                onAction={(action, diagnostic) =>
                  void compilerAction(action, diagnostic)
                }
              />
            </details>
          )}
          {indexWarning && <p className="export-warning">{indexWarning}</p>}
          {!!fixPlan?.changes.length && (
            <p className="repair-explanation">
              Die bisherigen Fassungen werden im Versionsverlauf gesichert.
              Weitere Fehler können nach dem nächsten Compilerlauf sichtbar
              werden.
            </p>
          )}
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={autoRepairRunning ? stopAutomaticRepairs : closeModal}
              disabled={fixing && !autoRepairRunning}
            >
              {autoRepairRunning ? "Abbrechen" : "Schließen"}
            </button>
            {!!fixPlan?.changes.length ? (
              <button
                className="button secondary"
                onClick={() => void applyCompilerFixes()}
                disabled={fixing || autoRepairRunning || !!fixError}
              >
                Übernehmen und kompilieren
              </button>
            ) : (
              <button
                className="button secondary"
                disabled={fixing}
                onClick={() => {
                  closeModal();
                  setShowLog(true);
                }}
              >
                Probleme anzeigen
              </button>
            )}
            <button
              className="button primary"
              disabled={fixing || autoRepairRunning}
              onClick={() => void automaticallyFixCompilerErrors()}
            >
              {autoRepairRunning
                ? "Fehler werden behoben …"
                : "Alle Fehler automatisch beheben"}
            </button>
          </div>
        </ModalShell>
      )}
      {modal === "environment" && (
        <ModalShell
          title="TeX-Installation prüfen"
          subtitle="Compiler und Literaturwerkzeuge für deine wissenschaftlichen Projekte."
          close={closeModal}
          wide
        >
          <EnvironmentPanel
            directory={settings.toolchainDirectory}
            engine={settings.engine}
            onEngine={(engine) => changeSetting("engine", engine)}
            missingFile={missingTeXFile}
          />
          <div className="modal-footer">
            <button className="button secondary" onClick={() => openSettings()}>
              Compilerpfad und Zeitlimit einstellen
            </button>
            <button className="button primary" onClick={closeModal}>
              Zum Arbeitsbereich
            </button>
          </div>
        </ModalShell>
      )}
      {modal === "history" && (
        <ModalShell
          title="Versionsverlauf und Wiederherstellung"
          subtitle={active || "Wähle zuerst eine Datei aus."}
          close={closeModal}
          wide
        >
          {current ? (
            <HistoryPanel path={active} onRestore={restoreVersion} />
          ) : (
            <p className="muted-help">
              Öffne die Datei, deren Sicherungen du ansehen möchtest.
            </p>
          )}
        </ModalShell>
      )}
      {modal === "conflict" && conflict && (
        <ModalShell
          title="Dateifassungen vergleichen"
          subtitle={conflict.path}
          close={closeModal}
          wide
        >
          <p className="muted-help">
            Die Datei wurde außerhalb von SimpleLexEditor geändert oder
            entfernt. Deine Fassung bleibt im Editor erhalten. Beim Übernehmen
            wird die andere Fassung im Versionsverlauf gesichert.
          </p>
          <div className="conflict-columns">
            <label>
              Deine Fassung
              <textarea
                readOnly
                aria-label="Deine Fassung"
                spellCheck={false}
                value={
                  docs.find((doc) => doc.path === conflict.path)?.content || ""
                }
              />
            </label>
            <label>
              Externe Fassung
              <textarea
                readOnly
                aria-label="Externe Fassung"
                spellCheck={false}
                value={conflict.disk ?? "Die Datei ist nicht mehr verfügbar."}
              />
            </label>
          </div>
          <div className="conflict-actions">
            <button
              className="button secondary"
              disabled={resolving || compiling || conflict.disk === null}
              onClick={() => void resolveConflict("disk")}
            >
              Externe Fassung übernehmen
            </button>
            <button
              className="button secondary"
              disabled={resolving || compiling || conflict.disk === null}
              onClick={() => void resolveConflict("mine")}
            >
              Meine Fassung speichern
            </button>
            <button
              className="button primary"
              disabled={resolving || compiling}
              onClick={() => void resolveConflict("copy")}
            >
              Meine Fassung als neue Datei sichern
            </button>
          </div>
        </ModalShell>
      )}

      {modal === "quickopen" && (
        <ModalShell
          title="Datei schnell öffnen"
          subtitle="Durchsuche die Dateien deines Projekts. Strg+P"
          close={closeModal}
        >
          <QuickOpen
            initialScope={fileScope}
            dirty={docs
              .filter((doc) => doc.content !== doc.saved)
              .map((doc) => doc.path)}
            paths={
              project?.files.filter((f) => !f.directory).map((f) => f.path) ||
              []
            }
            active={active}
            open={docs.map((d) => d.path)}
            main={project?.main || ""}
            onOpen={(path) => {
              closeModal();
              void openFile(path).catch((e) => notify(String(e), true));
            }}
          />
        </ModalShell>
      )}
      {modal === "math" && (
        <ModalShell
          title="Mathematik"
          subtitle="Ausdrücke visuell zusammensetzen, beliebig verschachteln und anschließend ins Dokument einfügen."
          close={closeModal}
          wide
        >
          {scientificError && (
            <div className="export-warning" role="alert">
              {scientificError}
            </div>
          )}
          <Suspense
            fallback={
              <div className="workspace-empty">
                <LoaderCircle size={22} className="spin" />
                <p>Mathematik wird geladen …</p>
              </div>
            }
          >
            <MathPalette
              selection={
                editor.current?.selection() || { source: "", from: 0, to: 0 }
              }
              onInsert={insertScientific}
            />
          </Suspense>
        </ModalShell>
      )}
      {modal === "science" && (
        <ModalShell
          title="Wissenschaftliche Werkzeuge"
          subtitle="Literatur, Querverweise und Dokumentbausteine aus deinem Projekt."
          close={closeModal}
          wide
        >
          {scientificError && (
            <div className="export-warning" role="alert">
              {scientificError}
            </div>
          )}
          <Suspense
            fallback={
              <div className="workspace-empty">
                <LoaderCircle size={22} className="spin" />
                <p>Werkzeuge werden geladen …</p>
              </div>
            }
          >
            <SciencePanel
              initialTab={scienceTab}
              main={project?.main || ""}
              loadSources={loadScienceSources}
              saveBib={saveBibliography}
              onInsert={insertScientific}
              onNavigate={(file, line) => {
                closeModal();
                void openFile(file)
                  .then(() => setJump({ file, line }))
                  .catch((e) => notify(String(e), true));
              }}
            />
          </Suspense>
        </ModalShell>
      )}
      {modal === "new" && (
        <ModalShell
          title="Neues Projekt"
          subtitle="Starte mit einer Vorlage für deine wissenschaftliche Arbeit."
          close={closeModal}
          wide
        >
          <div className="template-grid">
            {templates.map((t) => (
              <button
                className={`template-card ${template === t.id ? "selected" : ""}`}
                onClick={() => setTemplate(t.id)}
                key={t.id}
              >
                <div className="template-paper">
                  <span>{t.mark}</span>
                  <i />
                  <i />
                  <i />
                  {template === t.id && (
                    <b>
                      <Check size={12} />
                    </b>
                  )}
                </div>
                <strong>{t.name}</strong>
                <small>{t.subtitle}</small>
              </button>
            ))}
          </div>
          <label className="field-label">
            Projektname
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && projectName.trim()) void newProject();
              }}
            />
          </label>
          <div className="modal-footer">
            <span>
              <Folder size={13} />
              {native
                ? "Den Speicherort wählst du im nächsten Schritt."
                : "Wird in diesem Browser gespeichert."}
            </span>
            <button
              className="button primary"
              disabled={!projectName.trim() || busy || compiling}
              onClick={() => void newProject()}
            >
              {busy ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Plus size={15} />
              )}{" "}
              Projekt erstellen
            </button>
          </div>
        </ModalShell>
      )}
      {modal === "commands" && (
        <ModalShell
          title="Befehle und Werkzeuge"
          subtitle={project?.name || "Arbeitsbereich"}
          close={closeModal}
        >
          <CommandPalette actions={commands} onClose={closeModal} />
        </ModalShell>
      )}
      {modal === "insert" && (
        <ModalShell
          title="Element einfügen"
          subtitle="Struktur, Formeln und wissenschaftliche Bausteine."
          close={closeModal}
        >
          <InsertCatalog
            onBold={() => {
              closeModal();
              editor.current?.wrap("\\textbf{", "}");
            }}
            onItalic={() => {
              closeModal();
              editor.current?.wrap("\\textit{", "}");
            }}
            onMath={() => setModal("math")}
            onScience={() => {
              setScienceTab("literature");
              setModal("science");
            }}
            onTable={() => setModal("table")}
            onImage={() => void insertImage()}
            onInsert={insert}
          />
        </ModalShell>
      )}
      {modal === "table" && (
        <ModalShell
          title="Tabelle erstellen"
          subtitle="Zeilen, Spalten und Beschriftung festlegen."
          close={closeModal}
        >
          <div className="two-fields">
            <label className="field-label">
              Datenzeilen
              <input
                type="number"
                min={1}
                max={30}
                value={tableRows}
                onChange={(e) =>
                  setTableRows(Math.min(30, Math.max(1, +e.target.value)))
                }
              />
            </label>
            <label className="field-label">
              Spalten
              <input
                type="number"
                min={1}
                max={12}
                value={tableCols}
                onChange={(e) =>
                  setTableCols(Math.min(12, Math.max(1, +e.target.value)))
                }
              />
            </label>
          </div>
          <label className="field-label">
            Beschriftung
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </label>
          <div className="setting-row">
            <div>
              <strong>Wissenschaftlicher Tabellensatz</strong>
              <small>
                Klare horizontale Linien mit booktabs, ohne vertikale Linien.
              </small>
            </div>
            <Toggle
              label="Wissenschaftlicher Tabellensatz"
              checked={professionalTable}
              onChange={() => setProfessionalTable((v) => !v)}
            />
          </div>
          <div
            className="table-mini-preview"
            style={{ gridTemplateColumns: `repeat(${tableCols}, 1fr)` }}
          >
            {Array.from(
              { length: Math.min(tableRows + 1, 6) * tableCols },
              (_, i) => (
                <span className={i < tableCols ? "header-cell" : ""} key={i}>
                  {i < tableCols ? `Spalte ${i + 1}` : "…"}
                </span>
              ),
            )}
          </div>
          <div className="modal-footer">
            <button className="button ghost" onClick={() => setModal("insert")}>
              <ArrowLeft size={14} /> Zurück
            </button>
            <button
              className="button primary"
              onClick={() =>
                void insertScientific({
                  code: tableSnippet(
                    tableRows,
                    tableCols,
                    caption,
                    professionalTable,
                  ),
                  packages: professionalTable ? ["booktabs"] : [],
                })
              }
            >
              <Plus size={14} /> Tabelle einfügen
            </button>
          </div>
        </ModalShell>
      )}
      {modal === "folder" && (
        <ModalShell
          title="Neuen Ordner anlegen"
          subtitle="Ordne Kapitel, Bilder und Literatur in deinem Projekt."
          close={closeModal}
        >
          {fileError && (
            <div className="export-warning" role="alert">
              {fileError}
            </div>
          )}
          <label className="field-label">
            Ordnerpfad
            <input
              autoFocus
              value={entryName}
              onChange={(event) => setEntryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createFolder();
              }}
            />
          </label>
          <p className="muted-help">
            Der Pfad ist relativ zum Projekt, zum Beispiel kapitel oder
            material/bilder.
          </p>
          <div className="modal-footer">
            <span>Es werden keine vorhandenen Einträge überschrieben.</span>
            <button
              className="button primary"
              disabled={busy || compiling || !entryName.trim()}
              onClick={() => void createFolder()}
            >
              <FolderPlus size={14} /> Ordner erstellen
            </button>
          </div>
        </ModalShell>
      )}
      {modal === "rename" && (
        <ModalShell
          title="Umbenennen oder verschieben"
          subtitle={entryTarget}
          close={closeModal}
        >
          {fileError && (
            <div className="export-warning" role="alert">
              {fileError}
            </div>
          )}
          <label className="field-label">
            Neuer Projektpfad
            <input
              autoFocus
              value={entryName}
              onChange={(event) => setEntryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void renameEntry();
              }}
            />
          </label>
          <p className="muted-help">
            Zum Verschieben kannst du einen anderen Unterordner angeben. Offene
            Tabs und das Vorschaudokument werden mitgeführt.
          </p>
          <div className="export-warning">
            Dateiverweise wie{" "}
            <code>\input&#123;{entryTarget.replace(/\.tex$/, "")}&#125;</code>{" "}
            im LaTeX-Code werden nicht automatisch umgeschrieben. Passe sie nach
            dem Umbenennen an.
          </div>
          <div className="modal-footer">
            <span>Ungespeicherte Änderungen werden vorher gesichert.</span>
            <button
              className="button primary"
              disabled={busy || compiling || !entryName.trim()}
              onClick={() => void renameEntry()}
            >
              <Pencil size={14} /> Umbenennen
            </button>
          </div>
        </ModalShell>
      )}
      {modal === "trash" && (
        <ModalShell
          title="In den Projektpapierkorb verschieben?"
          subtitle={entryTarget}
          close={closeModal}
        >
          {fileError && (
            <div className="export-warning" role="alert">
              {fileError}
            </div>
          )}
          <p className="mutation-explanation">
            Der Eintrag und seine enthaltenen Dateien werden aus der Dateiliste
            entfernt und im Projektordner <code>.roxena/trash</code> aufbewahrt.
            Du kannst den letzten Vorgang über „Rückgängig“ wiederherstellen.
          </p>
          <p className="muted-help">
            Offene Änderungen werden vorher gespeichert. LaTeX-Verweise auf
            entfernte Dateien müssen angepasst werden.
          </p>
          <div className="modal-footer">
            <button className="button ghost" onClick={closeModal}>
              Abbrechen
            </button>
            <button
              className="button danger"
              disabled={busy || compiling}
              onClick={() => void trashEntry()}
            >
              <Trash2 size={14} /> In Projektpapierkorb verschieben
            </button>
          </div>
        </ModalShell>
      )}
      {modal === "preview" && (
        <ModalShell
          title="Welche Datei soll in die Vorschau?"
          subtitle={previewTarget || "Hauptdokument und Kapiteldateien"}
          close={closeModal}
        >
          {fileError && (
            <div className="export-warning" role="alert">
              {fileError}
            </div>
          )}
          <div className="preview-explanation">
            <p>
              <strong>Eigenständiges Dokument:</strong> Enthält{" "}
              <code>\documentclass</code> und{" "}
              <code>\begin&#123;document&#125;</code> und kann eine eigene PDF
              erzeugen.
            </p>
            <p>
              <strong>Kapitel / Teildatei:</strong> Enthält nur den Inhalt. Es
              wird mit <code>\input&#123;datei&#125;</code> in ein Hauptdokument
              eingebunden. Die Vorschau zeigt dann die gesamte Arbeit.
            </p>
            <p>
              Ein Wechsel des Dateitabs wählt die Vorschau nicht automatisch um.
              Das Vorschaudokument stellst du direkt über der PDF oder per
              Rechtsklick ein.
            </p>
          </div>
          {previewTarget && (
            <div className="preview-help-actions">
              {isStandalone(previewContent) ? (
                <button
                  className="preview-help-card"
                  disabled={busy || compiling}
                  onClick={() => void choosePreview(previewTarget)}
                >
                  <Play size={20} />
                  <span>
                    <strong>Diese Datei als Vorschaudokument verwenden</strong>
                    <small>
                      {previewTarget} wird zu einer eigenen PDF kompiliert.
                    </small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              ) : (
                <>
                  <button
                    className="preview-help-card"
                    disabled={
                      busy ||
                      compiling ||
                      !project?.main ||
                      project.main === previewTarget
                    }
                    onClick={() => void includePreviewFile()}
                  >
                    <Link2 size={20} />
                    <span>
                      <strong>
                        In {project?.main || "ein Hauptdokument"} einbinden
                      </strong>
                      <small>
                        \input wird vor dem Dokumentende ergänzt. Dein
                        Kapitelinhalt bleibt erhalten.
                      </small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                  <button
                    className="preview-help-card"
                    disabled={busy || compiling}
                    onClick={() => void createChapterPreview()}
                  >
                    <FileCode2 size={20} />
                    <span>
                      <strong>Eigenständige Vorschau-Datei erstellen</strong>
                      <small>
                        Eine separate LaTeX-Datei lädt dein Kapitel und
                        übernimmt die Präambel des Hauptdokuments. Dein Kapitel
                        bleibt weiterhin einbindbar.
                      </small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                </>
              )}
            </div>
          )}
          <div className="modal-footer">
            <span>
              Aktuelle Vorschau:{" "}
              <strong>{project?.main || "kein Hauptdokument"}</strong>
            </span>
            <button
              className="button secondary"
              onClick={() => openNewFile("")}
            >
              <FilePlus2 size={14} /> Neues Dokument
            </button>
          </div>
        </ModalShell>
      )}
      {modal === "file" && (
        <ModalShell
          title="Neue Datei"
          subtitle="Wähle, ob die Datei eine eigene PDF oder einen Teil deiner Arbeit enthält."
          close={closeModal}
        >
          {fileError && (
            <div className="export-warning" role="alert">
              {fileError}
            </div>
          )}
          <label className="field-label">
            Dateiname
            <input
              autoFocus
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void newFile();
              }}
            />
          </label>
          {filename.toLowerCase().endsWith(".tex") && (
            <>
              <div
                className="file-kind-options"
                role="radiogroup"
                aria-label="LaTeX-Dateityp"
              >
                <button
                  role="radio"
                  aria-checked={fileKind === "document"}
                  onClick={() => setFileKind("document")}
                >
                  <FileCode2 size={21} />
                  <strong>Eigenständiges Dokument</strong>
                  <small>
                    Vollständiges LaTeX-Gerüst mit eigener PDF-Vorschau.
                  </small>
                </button>
                <button
                  role="radio"
                  aria-checked={fileKind === "chapter"}
                  onClick={() => setFileKind("chapter")}
                >
                  <Link2 size={21} />
                  <strong>Kapitel / Teildatei</strong>
                  <small>
                    Nur Inhalt, der in ein Hauptdokument eingebunden wird.
                  </small>
                </button>
              </div>
              {fileKind === "document" ? (
                <div className="setting-row">
                  <div>
                    <strong>Direkt in der Vorschau anzeigen</strong>
                    <small>Diese Datei wird zum aktuellen Hauptdokument.</small>
                  </div>
                  <Toggle
                    label="Direkt in der Vorschau anzeigen"
                    checked={autoPreview}
                    onChange={() => setAutoPreview((v) => !v)}
                  />
                </div>
              ) : (
                <div className="setting-row">
                  <div>
                    <strong>In das Hauptdokument einbinden</strong>
                    <small>
                      {project?.main
                        ? `\\input wird in ${project.main} ergänzt.`
                        : "Noch kein Hauptdokument vorhanden. Du kannst die Datei später einbinden."}
                    </small>
                  </div>
                  <Toggle
                    label="In das Hauptdokument einbinden"
                    checked={autoInclude && !!project?.main}
                    onChange={() => setAutoInclude((v) => !v)}
                  />
                </div>
              )}
            </>
          )}
          <p className="muted-help">
            Auch Unterordner sind möglich: kapitel/einleitung.tex. Mit
            \input&#123;kapitel/einleitung&#125; bindest du sie ein.
          </p>
          <div className="modal-footer">
            <span>LaTeX, BibTeX und Textdateien</span>
            <button
              className="button primary"
              onClick={() => void newFile()}
              disabled={!filename.trim() || busy || compiling}
            >
              <Plus size={14} /> Datei erstellen
            </button>
          </div>
        </ModalShell>
      )}
      {modal === "export" && (
        <ModalShell
          title="Exportieren"
          subtitle="Format und Umfang des Exports wählen."
          close={closeModal}
        >
          <div className="export-list">
            {[
              {
                format: "pdf" as const,
                name: "PDF-Dokument",
                detail: pdf
                  ? "Die letzte kompilierte Version, druckfertig."
                  : "Zuerst das Dokument kompilieren.",
                icon: FileText,
                badge: "PDF",
                disabled: !pdf,
              },
              {
                format: "zip" as const,
                name: "Gesamtes Projekt",
                detail: "Quellcode und Ressourcen in einem Archiv.",
                icon: FileArchive,
                badge: "ZIP",
                disabled: false,
              },
              {
                format: "tex" as const,
                name: "Aktuelle Quelldatei",
                detail: "Die geöffnete Datei im Originalformat.",
                icon: FileCode2,
                badge: active.split(".").pop()?.toUpperCase() || "TEX",
                disabled: !current,
              },
              {
                format: "png" as const,
                name: "Sichtbare PDF-Seite",
                detail: "Die angezeigte Seite als PNG-Bild.",
                icon: Image,
                badge: "PNG",
                disabled: !pdf || !preview || focus,
              },
            ].map((item) => (
              <button
                key={item.format}
                disabled={item.disabled}
                onClick={() => void exportDocument(item.format)}
              >
                <div className="export-icon">
                  <item.icon size={22} />
                </div>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.detail}</small>
                </span>
                <span className="format-badge">{item.badge}</span>
                <ArrowDownToLine size={16} />
              </button>
            ))}
          </div>
          {compileState === "stale" && (
            <p className="export-warning">
              Neuere Änderungen sind noch nicht in der PDF enthalten. Kompiliere
              vor dem Export erneut.
            </p>
          )}
          <div className="export-note">
            <CheckCheck size={14} /> Deine Dateien bleiben auf deinem Computer.
          </div>
        </ModalShell>
      )}
      {modal === "settings" && (
        <ModalShell
          title="Einstellungen"
          subtitle="Arbeitsbereich und PDF-Erstellung."
          close={closeModal}
          wide
        >
          <SettingsPanel
            settings={settings}
            project={project}
            version={appVersion}
            initialSection={settingsSection}
            disabled={compiling || busy}
            onChange={changeSetting}
            onMain={(path) => void choosePreview(path)}
            onInspect={() => setModal("environment")}
          />
        </ModalShell>
      )}
      {modal === "help" && (
        <ModalShell
          title="Hilfe und Tastenkürzel"
          subtitle="SimpleLexEditor – wissenschaftlicher LaTeX-Editor"
          close={closeModal}
        >
          <div className="help-intro">
            <img className="brand-symbol large" src="/favicon.svg" alt="" />
            <p>
              Öffne ein bestehendes Projekt oder lege ein neues an. Mathematik,
              Literatur und Querverweise findest du direkt am Editor.
            </p>
          </div>
          <div className="shortcut-list">
            {[
              ["Befehlsmenü", "Strg K"],
              ["Datei schnell öffnen", "Strg P"],
              ["Probleme / Protokoll", "Strg J"],
              ["Alles speichern", "Strg S"],
              ["Projekt öffnen", "Strg O"],
              ["Neues Projekt", "Strg N"],
              ["Kompilieren", "Strg Enter"],
              ["Element einfügen", "Strg I"],
              ["Mathematik-Palette", "Strg M"],
              ["Suchen / Ersetzen", "Strg F / Strg H"],
              ["Fokusmodus", "Strg Shift F"],
              ["Rückgängig / Wiederholen", "Strg Z / Strg Shift Z"],
            ].map(([label, keys]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{keys}</kbd>
              </div>
            ))}
          </div>
          <div className="help-note">
            <BookOpen size={16} />
            <p>
              SimpleLexEditor bringt LaTeX, Schriften und wissenschaftliche
              Pakete mit. Eine separate TeX-Installation ist nicht nötig.
              LaTeX-Dateien werden mit deaktiviertem Shell-Escape kompiliert.
              Für Literaturverzeichnisse kannst du eine{" "}
              <code>thebibliography</code>
              -Umgebung oder eine .bib-Datei verwenden. BibTeX und Biber werden
              bei Bedarf automatisch ausgeführt.
            </p>
          </div>
          {!native && (
            <p className="export-warning">
              Browser-Vorschau: Projekte werden lokal im Browser gespeichert.
              Für Kompilierung, Bildimport und direkten Dateizugriff starte die
              Desktop-App.
            </p>
          )}
        </ModalShell>
      )}
    </div>
  );
}
