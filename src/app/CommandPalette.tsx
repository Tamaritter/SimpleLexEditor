import { Fragment, useId, useMemo, useRef, useState, useEffect } from "react";
import { ArrowRight, Search, type LucideIcon } from "lucide-react";
import { rankActions } from "./workspace";

export type CommandAction = {
  name: string;
  group: string;
  keywords?: string;
  hint?: string;
  disabled?: boolean;
  disabledReason?: string;
  icon: LucideIcon;
  run: () => void;
};
export function CommandPalette({
  actions,
  onClose,
}: {
  actions: CommandAction[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const results = useMemo(() => rankActions(actions, query), [actions, query]);
  const enabled = results
    .map((action, index) => (action.disabled ? -1 : index))
    .filter((index) => index >= 0);
  const selected = enabled.includes(selection) ? selection : (enabled[0] ?? -1);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, query]);
  const run = (action: CommandAction) => {
    if (!action.disabled) {
      onClose();
      action.run();
    }
  };
  return (
    <div className="command-palette">
      <label className="search-input large">
        <Search size={17} />
        <input
          autoFocus
          data-autofocus=""
          placeholder="Befehl suchen …"
          aria-label="Befehl suchen"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-activedescendant={
            selected >= 0 ? `${id}-${selected}` : undefined
          }
          aria-autocomplete="list"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelection(0);
          }}
          onKeyDown={(event) => {
            if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const at = enabled.indexOf(selected);
              setSelection(
                event.key === "Home"
                  ? (enabled[0] ?? 0)
                  : event.key === "End"
                    ? (enabled.at(-1) ?? 0)
                    : (enabled[
                        Math.max(
                          0,
                          Math.min(
                            enabled.length - 1,
                            at + (event.key === "ArrowDown" ? 1 : -1),
                          ),
                        )
                      ] ?? 0),
              );
            }
            if (event.key === "Enter" && results[selected]) {
              event.preventDefault();
              run(results[selected]);
            }
          }}
        />
        <kbd>Esc</kbd>
      </label>
      <div
        className="command-results"
        ref={list}
        role="listbox"
        id={`${id}-list`}
        aria-label="Befehle"
      >
        {results.map((action, index) => (
          <Fragment key={action.name}>
            {!query.trim() &&
              (index === 0 || results[index - 1].group !== action.group) && (
                <div className="command-group" role="presentation">
                  {action.group}
                </div>
              )}
            <button
              role="option"
              aria-label={action.name}
              aria-selected={selected === index}
              aria-disabled={!!action.disabled}
              tabIndex={-1}
              id={`${id}-${index}`}
              className="command-option"
              onMouseDown={(event) => {
                if (event.button === 0) event.preventDefault();
              }}
              onMouseMove={() => {
                if (!action.disabled) setSelection(index);
              }}
              onClick={() => run(action)}
            >
              <action.icon size={17} />
              <span>
                <strong>{action.name}</strong>
                {action.disabledReason && action.disabled && (
                  <small>{action.disabledReason}</small>
                )}
              </span>
              {query.trim() && <em>{action.group}</em>}
              {action.hint ? (
                <kbd>{action.hint}</kbd>
              ) : (
                <ArrowRight size={13} />
              )}
            </button>
          </Fragment>
        ))}
      </div>
      {!results.length && (
        <div className="workspace-empty" role="status">
          <strong>Kein passender Befehl</strong>
          <p>Suche nach einer Aktion, einem Werkzeug oder einem Format.</p>
        </div>
      )}
      <div className="palette-footer">
        <span>
          <kbd>↑ ↓</kbd> auswählen
        </span>
        <span>
          <kbd>Enter</kbd> ausführen
        </span>
        <small>{results.length} Befehle</small>
      </div>
    </div>
  );
}
