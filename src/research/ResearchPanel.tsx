import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCheck,
  Copy,
  GraduationCap,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  Sigma,
} from "lucide-react";
import type { Document, FileEntry } from "../core/model";
import {
  inspectResearchProject,
  researchReportText,
  type ResearchItem,
} from "./research";

export function ResearchPanel({
  main,
  files,
  documents,
  loadSources,
  onNavigate,
  onMath,
  onScience,
}: {
  main: string;
  files: FileEntry[];
  documents: Document[];
  loadSources: () => Promise<Record<string, string>>;
  onNavigate: (file: string, line: number) => void;
  onMath: () => void;
  onScience: (tab: string) => void;
}) {
  const [sources, setSources] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0),
    [tab, setTab] = useState("issues"),
    [filter, setFilter] = useState("relevant");
  const [kind, setKind] = useState("all"),
    [query, setQuery] = useState(""),
    [copied, setCopied] = useState(false);
  const [limit, setLimit] = useState(200);
  useEffect(() => setLimit(200), [tab, kind, query, filter]);
  const paths = files
    .filter((file) => !file.directory)
    .map((file) => file.path);
  const pathRevision = paths.join("\u0000");
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setCopied(false);
    void loadSources()
      .then((next) => {
        if (!cancelled) setSources(next);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSources, refresh, files]);
  const report = useMemo(
    () =>
      inspectResearchProject(
        main,
        {
          ...sources,
          ...Object.fromEntries(documents.map((d) => [d.path, d.content])),
        },
        paths,
      ),
    [main, sources, documents, pathRevision],
  );
  const errors = report.issues.filter((i) => i.severity === "error").length;
  const warnings = report.issues.filter((i) => i.severity === "warning").length;
  const filtered = report.issues.filter(
    (i) =>
      filter === "all" ||
      (filter === "relevant" ? i.severity !== "info" : i.severity === filter),
  );
  const index = report.structure.filter(
    (i) =>
      (kind === "all" || kind === i.kind) &&
      `${i.title} ${i.label || ""} ${i.file}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const showIndex = (value: ResearchItem["kind"] | "all") => {
    setTab("index");
    setKind(value);
  };
  return (
    <section
      className="research-panel"
      aria-label="Wissenschaftliche Projektprüfung"
    >
      <div className="research-document">
        <span>Hauptdokument</span>
        <code title={main}>{main || "Noch nicht gewählt"}</code>
        <button
          className="icon-button"
          title="Projektprüfung aktualisieren"
          disabled={loading}
          onClick={() => setRefresh((v) => v + 1)}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
        </button>
      </div>
      {error && (
        <p className="research-notice" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <div className="research-loading" role="status">
          <LoaderCircle size={19} className="spin" /> Projektquellen prüfen …
        </div>
      ) : (
        <>
          <div className="research-metrics">
            {[
              ["equation", report.counts.equations, "Gleichungen"],
              ["theorem", report.counts.statements, "Aussagen"],
              ["references", report.counts.labels, "Labels"],
            ].map(([value, count, label]) => (
              <button
                key={value}
                onClick={() =>
                  value === "references"
                    ? onScience("references")
                    : showIndex(value as ResearchItem["kind"] | "all")
                }
              >
                <strong>{count}</strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <p className="research-scope">
            {report.files.length} Quelldateien · {report.counts.citations}{" "}
            zitierte Quellen
            <br />
            {documents.some((d) => d.content !== d.saved)
              ? "Offene Änderungen berücksichtigt"
              : "Quelltext des gewählten Dokuments"}
          </p>
          <div
            role="tablist"
            aria-label="Projektprüfung und wissenschaftlicher Index"
            className="research-tabs"
          >
            <button
              role="tab"
              aria-selected={tab === "issues"}
              onClick={() => setTab("issues")}
            >
              Prüfung{errors + warnings > 0 && <span>{errors + warnings}</span>}
            </button>
            <button
              role="tab"
              aria-selected={tab === "index"}
              onClick={() => setTab("index")}
            >
              Formeln & Struktur
            </button>
          </div>
          {tab === "issues" ? (
            <div
              role="tabpanel"
              aria-label="Projektprüfung"
              className="research-content"
            >
              <div
                className={`research-summary ${errors ? "error" : warnings ? "warning" : "clear"}`}
                role="status"
              >
                {errors ? (
                  <AlertCircle size={16} />
                ) : warnings ? (
                  <AlertTriangle size={16} />
                ) : (
                  <CheckCheck size={16} />
                )}
                <span>
                  {errors || warnings
                    ? `${errors} Fehler · ${warnings} zu prüfen`
                    : "Keine Auffälligkeiten gefunden"}
                </span>
              </div>
              <select
                aria-label="Prüffilter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="relevant">Fehler und offene Prüfungen</option>
                <option value="error">Nur Fehler</option>
                <option value="warning">Zu prüfen</option>
                <option value="all">Alle, einschließlich Hinweisen</option>
              </select>
              <div className="research-issues">
                {filtered.slice(0, limit).map((issue) => {
                  const Icon =
                    issue.severity === "error"
                      ? AlertCircle
                      : issue.severity === "warning"
                        ? AlertTriangle
                        : Info;
                  return (
                    <button
                      key={issue.id}
                      className={`research-issue ${issue.severity}`}
                      disabled={!issue.file}
                      onClick={() => onNavigate(issue.file, issue.line)}
                    >
                      <Icon size={14} />
                      <span>
                        <strong>{issue.title}</strong>
                        <small>{issue.detail}</small>
                        <code>
                          {issue.file}:{issue.line}
                        </code>
                      </span>
                    </button>
                  );
                })}
                {filtered.length > limit && (
                  <button
                    className="research-more"
                    onClick={() => setLimit((count) => count + 200)}
                  >
                    Weitere Meldungen anzeigen ({filtered.length - limit})
                  </button>
                )}
                {!filtered.length && (
                  <p className="research-empty">
                    {report.issues.length
                      ? "Keine Meldungen in diesem Filter."
                      : "Verweise, Quellen und offene Aufgaben im Quelltext geprüft."}
                  </p>
                )}
              </div>
              <button
                className="research-copy"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(researchReportText(report))
                    .then(
                      () => setCopied(true),
                      () =>
                        setError(
                          "Der Prüfbericht konnte nicht kopiert werden.",
                        ),
                    )
                }
              >
                <Copy size={13} />
                {copied ? "Bericht kopiert" : "Prüfbericht kopieren"}
              </button>
            </div>
          ) : (
            <div
              role="tabpanel"
              aria-label="Wissenschaftlicher Index"
              className="research-content"
            >
              <label className="research-search">
                <Search size={13} />
                <input
                  aria-label="Im wissenschaftlichen Index suchen"
                  placeholder="Label, Titel, Datei …"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select
                aria-label="Indexfilter"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="all">Gesamtes Dokument</option>
                <option value="section">Gliederung</option>
                <option value="equation">Gleichungen</option>
                <option value="theorem">Sätze und Beweise</option>
                <option value="figure">Abbildungen</option>
                <option value="table">Tabellen</option>
              </select>
              <div className="research-index">
                {index.slice(0, limit).map((item, i) => (
                  <button
                    key={`${item.file}:${item.line}:${i}`}
                    onClick={() => onNavigate(item.file, item.line)}
                    style={{
                      paddingLeft:
                        8 +
                        (item.kind === "section"
                          ? Math.max(0, item.level - 1) * 8
                          : 0),
                    }}
                  >
                    <span className={`research-index-kind ${item.kind}`}>
                      {item.kind === "equation"
                        ? "Σ"
                        : item.kind === "theorem"
                          ? "§"
                          : item.kind === "figure"
                            ? "Abb."
                            : item.kind === "table"
                              ? "Tab."
                              : "#"}
                    </span>
                    <span>
                      <strong>{item.label || item.title}</strong>
                      {item.label && <small>{item.title}</small>}
                      <code>
                        {item.file}:{item.line}
                      </code>
                    </span>
                  </button>
                ))}
                {index.length > limit && (
                  <button
                    className="research-more"
                    onClick={() => setLimit((count) => count + 200)}
                  >
                    Weitere Einträge anzeigen ({index.length - limit})
                  </button>
                )}
                {!index.length && (
                  <p className="research-empty">
                    Keine passenden Einträge. Beschriftete Gleichungen und
                    Aussagen erscheinen hier projektweit.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
      <div className="research-shortcuts">
        <button onClick={onMath}>
          <Sigma size={14} /> Formel
        </button>
        <button onClick={() => onScience("theorems")}>
          <GraduationCap size={14} /> Aussage
        </button>
        <button onClick={() => onScience("literature")}>
          <BookOpen size={14} /> Literatur
        </button>
      </div>
    </section>
  );
}
