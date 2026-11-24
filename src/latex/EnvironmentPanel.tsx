import { useEffect, useState } from "react";
import { Check, AlertTriangle, RefreshCw, LoaderCircle } from "lucide-react";
import { api, native, type ToolStatus } from "../core/api";
export function EnvironmentPanel({
  directory,
  engine,
  onEngine,
  missingFile = "",
}: {
  directory: string;
  engine: string;
  onEngine: (engine: string) => void;
  missingFile?: string;
}) {
  const [tools, setTools] = useState<ToolStatus[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void api
      .tools(directory)
      .then((result) => {
        if (!cancelled) setTools(result);
      })
      .catch((error) => {
        if (!cancelled) setError(String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [directory, refresh]);
  const installed = tools.filter(
    (tool) => tool.available && !["bibtex", "biber"].includes(tool.name),
  );
  return (
    <div className="environment-panel">
      {missingFile && (
        <div className="missing-package-guide">
          <h3>Benötigt: {missingFile}</h3>
          <p>
            SimpleLexEditor bringt die TeX-Live-Paketsammlung mit. Prüfe
            zunächst den Dateinamen und ob eine eigene Dokumentklasse zum
            Projekt gehört. Falls eine mitgelieferte Datei fehlt, führe den
            vollständigen SimpleLexEditor-Installer erneut aus. Bei einem selbst
            gewählten TeX-Ordner prüfe stattdessen dessen Pakete.
          </p>
          <button
            className="button secondary"
            onClick={() =>
              void navigator.clipboard
                .writeText(missingFile)
                .catch((e) => setError(String(e)))
            }
          >
            Dateinamen kopieren
          </button>
        </div>
      )}
      <div className="environment-summary">
        <div>
          {loading ? (
            <LoaderCircle className="spin" size={23} />
          ) : installed.length ? (
            <Check size={23} />
          ) : (
            <AlertTriangle size={23} />
          )}
        </div>
        <span>
          <strong>
            {loading
              ? "TeX-Installation wird geprüft …"
              : installed.length
                ? `${installed.length} PDF-Compiler gefunden`
                : native
                  ? "Mitgelieferte LaTeX-Umgebung nicht verfügbar"
                  : "Browsermodus ohne lokale Kompilierung"}
          </strong>
          <p>
            {native
              ? directory.trim()
                ? "Du verwendest einen eigenen TeX-Ordner. Leere ihn in den erweiterten Einstellungen, um die mitgelieferte Umgebung zu verwenden."
                : "LaTeX, Schriften, Pakete, BibTeX und Biber sind in SimpleLexEditor enthalten. Kompilierung und PDF-Vorschau funktionieren lokal und ohne weitere Installation."
              : "Öffne die Desktop-App für Compilerprüfung und direkten Dateizugriff."}
          </p>
        </span>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => setRefresh((v) => v + 1)}
        >
          <RefreshCw size={14} />
          Erneut prüfen
        </button>
      </div>
      {error && (
        <p className="export-warning" role="alert">
          {error}
        </p>
      )}
      <div className="toolchain-tools">
        {tools.map((tool) => (
          <div key={tool.name} className="toolchain-tool">
            <span>
              {tool.available ? (
                <Check size={15} />
              ) : (
                <AlertTriangle size={15} />
              )}
            </span>
            <div>
              <strong>{tool.name}</strong>
              <small>
                {tool.available
                  ? tool.version ||
                    "Installiert; Versionsausgabe nicht verfügbar"
                  : "Nicht gefunden"}
              </small>
              {tool.path && <code title={tool.path}>{tool.path}</code>}
            </div>
            {tool.available && !["bibtex", "biber"].includes(tool.name) && (
              <button
                className="button secondary"
                disabled={engine === tool.name}
                onClick={() => onEngine(tool.name)}
              >
                {engine === tool.name ? "Ausgewählt" : "Verwenden"}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="environment-guides">
        <h3>Einmal installieren. Alles dabei.</h3>
        <p>
          Der vollständige SimpleLexEditor-Installer richtet pdfLaTeX, XeLaTeX,
          LuaLaTeX, BibTeX, Biber und die TeX-Live-Paketsammlung automatisch
          ein. Du brauchst weder eine separate TeX-Installation noch ein
          Benutzerkonto. Die portable Ausgabe entpackt ihre mitgelieferte
          Umgebung beim ersten Start; dafür ist kein Download nötig.
        </p>
        <p>
          Falls die Umgebung beschädigt wurde, starte den vollständigen
          SimpleLexEditor-Installer erneut. Eigene TeX-Installationen bleiben
          über die erweiterten Compiler-Einstellungen optional verwendbar.
          Tectonic ist ein optionaler externer Compiler und gehört nicht zur
          mitgelieferten Umgebung.
        </p>
      </div>
    </div>
  );
}
