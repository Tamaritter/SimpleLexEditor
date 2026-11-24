import { useEffect, useRef, useState } from "react";
import { FileCode2, Search, CornerDownLeft } from "lucide-react";
import { rankFiles, textFile } from "../app/workspace";

export function QuickOpen({
  paths,
  active,
  open,
  main,
  onOpen,
  initialScope = "all",
  dirty = [],
}: {
  paths: string[];
  active: string;
  open: string[];
  main: string;
  onOpen: (path: string) => void;
  initialScope?: "all" | "open";
  dirty?: string[];
}) {
  const [scope, setScope] = useState(initialScope);
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const matches = rankFiles(
    scope === "open" ? open : paths,
    query,
    active,
    open,
  );
  const current = Math.max(0, Math.min(selected, matches.length - 1));
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [current, scope]);
  return (
    <div className="quick-open">
      <div
        className="file-picker-scopes"
        role="group"
        aria-label="Dateiauswahl filtern"
      >
        {(
          [
            ["all", "Alle Dateien", paths.filter(textFile).length],
            ["open", "Geöffnet", open.length],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            aria-label={label}
            aria-pressed={scope === value}
            onClick={() => {
              setScope(value);
              setSelected(0);
              input.current?.focus();
            }}
          >
            {label}
            <span aria-hidden="true">{count}</span>
          </button>
        ))}
      </div>
      <label className="search-input large">
        <Search size={17} />
        <input
          autoFocus
          data-autofocus=""
          ref={input}
          role="combobox"
          aria-label="Datei suchen"
          aria-controls="quick-open-list"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-activedescendant={
            matches[current] ? `quick-file-${current}` : undefined
          }
          placeholder="Dateiname oder Pfad eingeben …"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              setSelected(
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? Math.max(0, matches.length - 1)
                    : Math.max(
                        0,
                        Math.min(
                          matches.length - 1,
                          current + (e.key === "ArrowDown" ? 1 : -1),
                        ),
                      ),
              );
            }
            if (e.key === "Enter" && matches[current]) {
              e.preventDefault();
              onOpen(matches[current]);
            }
          }}
        />
        <kbd>Esc</kbd>
      </label>
      <div
        className="quick-file-list"
        role="listbox"
        id="quick-open-list"
        ref={list}
        aria-label="Projektdateien"
      >
        {matches.map((path, index) => (
          <button
            key={path}
            id={`quick-file-${index}`}
            role="option"
            aria-selected={current === index}
            tabIndex={-1}
            className="quick-file"
            onClick={() => onOpen(path)}
            onMouseMove={() => setSelected(index)}
          >
            <FileCode2 size={18} />
            <span>
              <strong>{path.split("/").pop()}</strong>
              <small>{path}</small>
            </span>
            {path === main && <em>Vorschau</em>}
            {dirty.includes(path) && (
              <span className="unsaved-dot" title="Ungespeicherte Änderungen" />
            )}
            {open.includes(path) && (
              <i className="open-file-dot" title="Geöffnet" />
            )}
          </button>
        ))}
        {!matches.length && (
          <div className="workspace-empty">
            <strong>Keine passende Datei</strong>
            <p>Suche nach einem anderen Namen oder Pfad.</p>
          </div>
        )}
      </div>
      <div className="palette-footer">
        <span>
          <kbd>↑ ↓</kbd> auswählen
        </span>
        <span>
          <CornerDownLeft size={12} /> öffnen
        </span>
        <small>{matches.length} Dateien</small>
      </div>
    </div>
  );
}
