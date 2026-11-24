import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCheck,
  Terminal,
  X,
  ArrowRight,
  Copy,
  Check,
  WandSparkles,
} from "lucide-react";
import { parseDiagnostics, resolveDiagnosticFile } from "../app/workspace";
import { compilerHelp, type CompilerAction } from "./compilerHelp";
import { CompilerActions } from "./CompilerGuidance";
import type { Diagnostic } from "../app/workspace";

export function BuildPanel({
  log,
  main,
  paths,
  state,
  compiling,
  onClose,
  onNavigate,
  onFix,
  fixing,
  onAction,
  revealLog,
}: {
  log: string;
  main: string;
  paths: string[];
  state: string;
  compiling: boolean;
  onClose: () => void;
  onNavigate: (file: string, line: number) => void;
  onFix: (diagnostic?: Diagnostic) => void;
  fixing: boolean;
  onAction: (action: CompilerAction, diagnostic: Diagnostic) => void;
  revealLog: number;
}) {
  const [tab, setTab] = useState("problems"),
    [filter, setFilter] = useState("all"),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(false);
  const [showConsequences, setShowConsequences] = useState(false);
  useEffect(() => {
    if (revealLog) setTab("log");
  }, [revealLog]);
  const diagnostics = useMemo(() => {
    const priority = { error: 0, warning: 1, info: 2 };
    return parseDiagnostics(log, main, paths)
      .filter(
        (d, i, all) =>
          all.findIndex(
            (other) =>
              other.message === d.message &&
              other.line === d.line &&
              resolveDiagnosticFile(other.file, paths, main) ===
                resolveDiagnosticFile(d.file, paths, main),
          ) === i,
      )
      .sort(
        (a, b) =>
          priority[a.severity] - priority[b.severity] ||
          Number(!!compilerHelp(a).secondary) -
            Number(!!compilerHelp(b).secondary),
      );
  }, [log, main, paths]);
  const consequences = diagnostics.filter((d) => compilerHelp(d).secondary);
  const firstCause = diagnostics.find(
    (d) => d.severity === "error" && !compilerHelp(d).secondary,
  );
  const counts = {
    error: diagnostics.filter((d) => d.severity === "error").length,
    warning: diagnostics.filter((d) => d.severity === "warning").length,
    info: diagnostics.filter((d) => d.severity === "info").length,
  };
  return (
    <section className="build-panel" aria-label="Kompilierung und Probleme">
      <div className="build-heading">
        <div role="tablist" aria-label="Compileransicht">
          <button
            role="tab"
            aria-selected={tab === "problems"}
            onClick={() => setTab("problems")}
          >
            <AlertCircle size={14} /> Probleme <span>{diagnostics.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === "log"}
            onClick={() => setTab("log")}
          >
            <Terminal size={14} /> Protokoll
          </button>
        </div>
        <div className="inline-actions">
          {(diagnostics.length > 0 || state === "error") && (
            <button
              className="button secondary compiler-fix-button"
              disabled={compiling || fixing}
              onClick={() => onFix()}
            >
              <WandSparkles size={14} />{" "}
              {counts.error || state === "error"
                ? "Compilerfehler beheben"
                : "Hinweise prüfen"}
            </button>
          )}
          <button
            className="icon-button"
            title="Protokoll schließen"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
      </div>
      {tab === "problems" ? (
        <>
          <div className="build-filters">
            {[
              ["all", "Alle", diagnostics.length],
              ["error", "Fehler", counts.error],
              ["warning", "Warnungen", counts.warning],
              ["info", "Satzhinweise", counts.info],
            ].map(([value, label, count]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(String(value))}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
          {(firstCause || consequences.length > 0) && (
            <div className="compiler-cause-summary">
              <span>
                {firstCause
                  ? `Zuerst: ${compilerHelp(firstCause).title}`
                  : "Weitere Details stehen im Protokoll."}
              </span>
              {consequences.length > 0 && (
                <button
                  aria-expanded={showConsequences}
                  onClick={() => setShowConsequences((v) => !v)}
                >
                  {showConsequences
                    ? "Folgemeldungen ausblenden"
                    : `${consequences.length} Folgemeldung${consequences.length === 1 ? "" : "en"} anzeigen`}
                </button>
              )}
            </div>
          )}
          <div
            className="diagnostic-list"
            role="tabpanel"
            aria-label="Probleme"
          >
            {diagnostics
              .filter((item) => filter === "all" || item.severity === filter)
              .filter(
                (item) =>
                  showConsequences ||
                  !compilerHelp(item).secondary ||
                  !firstCause,
              )
              .map((item, index) => {
                const file = resolveDiagnosticFile(item.file, paths, main);
                const Icon =
                  item.severity === "error"
                    ? AlertCircle
                    : item.severity === "warning"
                      ? AlertTriangle
                      : Info;
                return (
                  <div
                    className={`diagnostic ${item.severity}`}
                    key={index}
                    onClick={(event) => {
                      if (
                        file &&
                        item.line &&
                        !(event.target as HTMLElement).closest(
                          "button, details",
                        )
                      )
                        onNavigate(file, item.line);
                    }}
                  >
                    <Icon size={16} />
                    <span>
                      <strong>{item.message}</strong>
                      {item.advice && <small>{item.advice}</small>}
                      <button
                        className="diagnostic-location"
                        disabled={!file || !item.line}
                        onClick={() =>
                          file && item.line && onNavigate(file, item.line)
                        }
                      >
                        <code>
                          {file || item.file || main}
                          {item.line ? ` · Zeile ${item.line}` : ""}
                        </code>
                        {file && item.line && <ArrowRight size={12} />}
                      </button>
                      <CompilerActions
                        diagnostic={item}
                        paths={paths}
                        main={main}
                        disabled={compiling || fixing}
                        onAction={(action, d) =>
                          action === "repair"
                            ? onFix(d)
                            : action === "log"
                              ? setTab("log")
                              : onAction(action, d)
                        }
                      />
                      {item.context && (
                        <details className="diagnostic-context">
                          <summary>Fehlerkontext</summary>
                          <pre>{item.context}</pre>
                        </details>
                      )}
                    </span>
                  </div>
                );
              })}
            {!diagnostics.length && (
              <div className="build-empty">
                <CheckCheck size={22} />
                <span>
                  <strong>
                    {compiling
                      ? "Kompilierung läuft …"
                      : state === "error"
                        ? "Kompilierung fehlgeschlagen"
                        : log
                          ? "Keine Probleme gefunden"
                          : "Noch keine Kompilierung"}
                  </strong>
                  <small>
                    {state === "error"
                      ? "Weitere Informationen findest du im Protokoll."
                      : log
                        ? "Der Compiler hat keine Fehler oder Warnungen gemeldet."
                        : "Starte die Kompilierung mit Strg+Enter."}
                  </small>
                </span>
                {state === "error" && (
                  <button
                    className="button secondary"
                    onClick={() => setTab("log")}
                  >
                    Protokoll anzeigen
                  </button>
                )}
              </div>
            )}
            {diagnostics.length > 0 &&
              !diagnostics.some(
                (item) => filter === "all" || item.severity === filter,
              ) && (
                <p className="search-explanation">
                  Keine Einträge für diesen Filter.
                </p>
              )}
          </div>
        </>
      ) : (
        <>
          <div className="build-log-actions">
            <span>{main} · vollständige Compilerausgabe</span>
            <button
              disabled={!log}
              onClick={() => {
                void navigator.clipboard.writeText(log).then(
                  () => {
                    setCopied(true);
                    setCopyError(false);
                  },
                  () => {
                    setCopyError(true);
                  },
                );
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}{" "}
              {copyError
                ? "Kopieren nicht möglich"
                : copied
                  ? "Kopiert"
                  : "Protokoll kopieren"}
            </button>
          </div>
          <pre role="tabpanel" aria-label="Compilerprotokoll">
            {log || "Noch keine Compilerausgabe vorhanden."}
          </pre>
        </>
      )}
    </section>
  );
}
