import { useMemo, useRef, useState } from "react";
import { FileUp, LoaderCircle, RefreshCw } from "lucide-react";
import { decodeBibFile, planBibImport } from "./bibliography";
import { validEntryPath } from "../projects/projectFiles";

export function BibImportPanel({
  sources,
  target,
  onTarget,
  onSave,
  onBack,
  onDone,
  onRefresh,
}: {
  sources: Record<string, string>;
  target: string;
  onTarget: (path: string) => void;
  onSave: (path: string, entries: string) => Promise<void>;
  onBack: () => void;
  onDone: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filename, setFilename] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const analysis = useMemo(() => {
    if (!text.trim()) return { plan: null, error: "" };
    try {
      return { plan: planBibImport(text, sources, target), error: "" };
    } catch (e) {
      return { plan: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [text, sources, target]);
  const plan = analysis.plan;
  const loadFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setText("");
    setFilename(file.name);
    setError("");
    try {
      if (file.size > 4 * 1024 * 1024)
        throw Error("Bitte eine BibTeX-Datei mit höchstens 4 MB wählen.");
      setText(decodeBibFile(new Uint8Array(await file.arrayBuffer())));
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!plan?.additions) return;
    setBusy(true);
    setError("");
    try {
      await onSave(target, plan.additions);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="bib-import" aria-label="BibTeX importieren">
      <div className="bib-import-heading">
        <div>
          <h3>Literatur übernehmen</h3>
          <p>
            BibTeX aus deiner Literaturverwaltung als Datei öffnen oder
            einfügen.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <FileUp size={14} /> BibTeX-Datei öffnen
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".bib,.bibtex,text/plain"
        aria-label="BibTeX-Datei importieren"
        hidden
        disabled={busy}
        onChange={(e) => {
          void loadFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {filename && <p className="bib-import-filename">{filename}</p>}
      <label className="field-label">
        BibTeX-Text
        <textarea
          aria-label="BibTeX-Text"
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
          placeholder={
            "@article{schluessel,\n  title = {Titel},\n  author = {Nachname, Vorname},\n  year = {2026}\n}"
          }
          disabled={busy}
        />
      </label>
      <label className="field-label">
        In Literaturdatei speichern
        <input
          aria-label="Import-Zieldatei"
          list="bib-import-targets"
          value={target}
          onChange={(e) => onTarget(e.target.value)}
          disabled={busy}
        />
      </label>
      <datalist id="bib-import-targets">
        {Object.keys(sources)
          .filter((path) => /\.bib$/i.test(path))
          .map((path) => (
            <option key={path} value={path} />
          ))}
      </datalist>
      {(error || analysis.error) && (
        <p className="export-warning" role="alert">
          {error || analysis.error}
        </p>
      )}
      {plan && (
        <div className="bib-import-preview" aria-live="polite">
          <p>
            <strong>
              {plan.entries.length} neue{" "}
              {plan.entries.length === 1 ? "Quelle" : "Quellen"}
            </strong>{" "}
            · {plan.duplicates.length}{" "}
            {plan.duplicates.length === 1
              ? "vorhandener Schlüssel wird"
              : "vorhandene Schlüssel werden"}{" "}
            übersprungen
          </p>
          {!!plan.duplicates.length && (
            <p className="bib-import-duplicates">
              Bereits vorhanden: {plan.duplicates.slice(0, 15).join(", ")}
              {plan.duplicates.length > 15 ? " …" : ""}
            </p>
          )}
          {!!plan.conflicts.length && (
            <p className="export-warning" role="alert">
              Textdefinitionen mit unterschiedlichen Werten:{" "}
              {plan.conflicts.join(", ")}. Passe diese Definitionen im
              Importtext an.
            </p>
          )}
          <ul>
            {plan.preview.slice(0, 20).map((entry) => (
              <li key={entry.key}>
                <code>{entry.key}</code>
                <span>{entry.title}</span>
              </li>
            ))}
            {plan.entries.length > 20 && (
              <li>… und {plan.entries.length - 20} weitere Quellen</li>
            )}
          </ul>
        </div>
      )}
      <div className="modal-footer">
        <div className="inline-actions">
          <button className="button ghost" onClick={onBack} disabled={busy}>
            Zurück
          </button>
          <button
            className="button secondary"
            onClick={() => {
              setBusy(true);
              void onRefresh()
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
            }}
            disabled={busy}
          >
            <RefreshCw size={13} /> Vorschau aktualisieren
          </button>
        </div>
        <button
          className="button primary"
          onClick={() => void save()}
          disabled={
            busy ||
            !plan?.additions ||
            !validEntryPath(target) ||
            !/\.bib$/i.test(target)
          }
        >
          {busy && <LoaderCircle size={14} className="spin" />}
          {plan?.entries.length || 0}{" "}
          {plan?.entries.length === 1 ? "Quelle" : "Quellen"} importieren
        </button>
      </div>
    </section>
  );
}
