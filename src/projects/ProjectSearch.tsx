import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  CaseSensitive,
  WholeWord,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  LoaderCircle,
} from "lucide-react";
import { api } from "../core/api";
import type { Document, FileEntry } from "../core/model";
import { searchSources, textFile, type SearchHit } from "../app/workspace";

export function ProjectSearch({
  root,
  files,
  documents,
  active,
  onNavigate,
  initialQuery = "",
}: {
  root: string;
  files: FileEntry[];
  documents: Document[];
  active: string;
  onNavigate: (hit: SearchHit) => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const deferred = useDeferredValue(query);
  const [scope, setScope] = useState("project");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [collapsed, setCollapsed] = useState(new Set<string>());
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSources({});
    setFailed(0);
    void (async () => {
      const result: Record<string, string> = {};
      let errors = 0;
      let bytes = 0;
      const readable = files.filter((f) => !f.directory && textFile(f.path));
      for (let i = 0; i < readable.length; i += 8) {
        if (cancelled) return;
        const batch = await Promise.allSettled(
          readable
            .slice(i, i + 8)
            .map(async (f) => [f.path, await api.read(f.path)] as const),
        );
        for (const entry of batch) {
          if (
            entry.status === "fulfilled" &&
            bytes + entry.value[1].length * 2 <= 32 * 1024 * 1024
          ) {
            result[entry.value[0]] = entry.value[1];
            bytes += entry.value[1].length * 2;
          } else errors++;
        }
      }
      if (!cancelled) {
        setSources(result);
        setFailed(errors);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, files, refresh]);
  const result = useMemo(() => {
    const merged = {
      ...sources,
      ...Object.fromEntries(documents.map((d) => [d.path, d.content])),
    };
    return searchSources(
      scope === "project" ? merged : { [active]: merged[active] || "" },
      deferred,
      { caseSensitive, wholeWord },
    );
  }, [sources, documents, active, scope, deferred, caseSensitive, wholeWord]);
  const groups = new Map<string, SearchHit[]>();
  for (const hit of result.hits)
    groups.set(hit.file, [...(groups.get(hit.file) || []), hit]);
  return (
    <div className="project-search">
      <label className="search-input">
        <Search size={15} />
        <input
          autoFocus
          aria-label="Suchbegriff"
          placeholder="Im Projekt suchen …"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCollapsed(new Set());
          }}
        />
      </label>
      <div className="search-options">
        <select
          aria-label="Suchbereich"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="project">Gesamtes Projekt</option>
          <option value="file">Aktuelle Datei</option>
        </select>
        <button
          className="icon-button"
          title="Groß-/Kleinschreibung beachten"
          aria-pressed={caseSensitive}
          onClick={() => setCaseSensitive((v) => !v)}
        >
          <CaseSensitive size={17} />
        </button>
        <button
          className="icon-button"
          title="Nur ganze Wörter"
          aria-pressed={wholeWord}
          onClick={() => setWholeWord((v) => !v)}
        >
          <WholeWord size={16} />
        </button>
        <button
          className="icon-button"
          title="Suchindex aktualisieren"
          onClick={() => setRefresh((v) => v + 1)}
          disabled={loading}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="search-summary" role="status">
        {loading ? (
          <>
            <LoaderCircle size={12} className="spin" /> Dateien werden gelesen …
          </>
        ) : query ? (
          `${result.hits.length}${result.truncated ? "+" : ""} Treffer in ${groups.size} ${groups.size === 1 ? "Datei" : "Dateien"}`
        ) : (
          `${Object.keys(sources).length} Textdateien durchsuchbar`
        )}
      </div>
      {failed > 0 && (
        <p className="search-warning">
          {failed} Dateien wurden wegen ihrer Größe oder eines Lesefehlers nicht
          indiziert. Öffne sie einzeln oder aktualisiere den Index.
        </p>
      )}
      <div className="project-search-results">
        {[...groups].map(([file, hits]) => (
          <div key={file} className="search-group">
            <button
              className="search-file-heading"
              title={file}
              aria-expanded={!collapsed.has(file)}
              onClick={() =>
                setCollapsed((previous) => {
                  const next = new Set(previous);
                  if (next.has(file)) next.delete(file);
                  else next.add(file);
                  return next;
                })
              }
            >
              {collapsed.has(file) ? (
                <ChevronRight size={12} />
              ) : (
                <ChevronDown size={12} />
              )}
              <FileText size={13} />
              <span>{file}</span>
              <small>{hits.length}</small>
            </button>
            {!collapsed.has(file) &&
              hits.map((hit) => {
                const at = hit.column - 1,
                  start = Math.max(0, at - 32),
                  end = Math.min(hit.text.length, at + hit.length + 85);
                return (
                  <button
                    key={`${hit.line}:${hit.column}`}
                    className="search-result"
                    title={`${file}:${hit.line}:${hit.column}`}
                    onClick={() => onNavigate(hit)}
                  >
                    <span>{hit.line}</span>
                    <code>
                      {start ? "…" : ""}
                      {hit.text.slice(start, at)}
                      <mark>{hit.text.slice(at, at + hit.length)}</mark>
                      {hit.text.slice(at + hit.length, end)}
                      {end < hit.text.length ? "…" : ""}
                    </code>
                  </button>
                );
              })}
          </div>
        ))}
        {query && !loading && !result.hits.length && (
          <div className="workspace-empty">
            <Search size={24} />
            <strong>Keine Treffer</strong>
            <p>Ändere den Suchbegriff oder die Suchoptionen.</p>
          </div>
        )}
        {!query && (
          <p className="search-explanation">
            Durchsucht LaTeX, Literatur und weitere Textdateien. Offene
            Änderungen werden berücksichtigt. Mit Strg+H ersetzt du Text im
            Editor.
          </p>
        )}
        {result.truncated && (
          <p className="search-explanation">
            Die ersten 500 Treffer werden angezeigt. Grenze deine Suche weiter
            ein.
          </p>
        )}
      </div>
    </div>
  );
}
