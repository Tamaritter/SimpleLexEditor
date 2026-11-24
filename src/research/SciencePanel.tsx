import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  FilePlus2,
  GraduationCap,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  FileUp,
  X,
  FileCode2,
} from "lucide-react";
import {
  bibEntryCode,
  parseBib,
  parseLabels,
  theoremBlocks,
  type ScientificInsert,
} from "./scientific";
import {
  bibliographyWorkflow,
  citationCode,
  readBibRecords,
} from "./bibliography";
import { BibImportPanel } from "./BibImportPanel";
type Props = {
  initialTab: string;
  main: string;
  loadSources: () => Promise<Record<string, string>>;
  saveBib: (path: string, entry: string) => Promise<void>;
  onInsert: (item: ScientificInsert) => Promise<void>;
  onNavigate: (file: string, line: number) => void;
};
const documentBlocks = [
  {
    name: "Abstract / Zusammenfassung",
    code: "\n\\begin{abstract}\n  Fragestellung, Methode und zentrale Ergebnisse.\n\\end{abstract}\n",
  },
  { name: "Inhaltsverzeichnis", code: "\n\\tableofcontents\n" },
  { name: "Abbildungsverzeichnis", code: "\n\\listoffigures\n" },
  { name: "Tabellenverzeichnis", code: "\n\\listoftables\n" },
  {
    name: "Anhang",
    code: "\n\\appendix\n\\section{Ergänzende Materialien}\n\\label{app:material}\n",
  },
  { name: "Fußnote", code: "\\footnote{Ergänzende Anmerkung.}" },
  {
    name: "Beschriftetes Kapitel",
    code: "\n\\section{Überschrift}\n\\label{sec:abschnitt}\n",
  },
  {
    name: "Quellcode / Pseudocode",
    code: "\n\\begin{verbatim}\nfunction example(x):\n    return x * x\n\\end{verbatim}\n",
  },
  {
    name: "Manuelles Literaturverzeichnis",
    code: "\n\\begin{thebibliography}{99}\n  \\bibitem{quelle} Autor. \\textit{Titel}. Verlag, Jahr.\n\\end{thebibliography}\n",
  },
  {
    name: "Wissenschaftliche Einheiten (SI)",
    code: "\\qty{9.81}{\\metre\\per\\second\\squared}",
    packages: ["siunitx"],
  },
];
export function SciencePanel({
  initialTab,
  main,
  loadSources,
  saveBib,
  onInsert,
  onNavigate,
}: Props) {
  const [tab, setTab] = useState(initialTab),
    [sources, setSources] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [refresh, setRefresh] = useState(0),
    [adding, setAdding] = useState(false),
    [importing, setImporting] = useState(false),
    [busy, setBusy] = useState(false);
  const [citeCommand, setCiteCommand] = useState("cite"),
    [refCommand, setRefCommand] = useState("ref"),
    [bibFile, setBibFile] = useState("references.bib"),
    [style, setStyle] = useState("plain");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]),
    [prenote, setPrenote] = useState(""),
    [postnote, setPostnote] = useState("");
  const [visibleSources, setVisibleSources] = useState(200);
  useEffect(() => setVisibleSources(200), [search]);
  const [fields, setFields] = useState({
    type: "article",
    key: "",
    title: "",
    author: "",
    year: "",
    venue: "",
    doi: "",
    url: "",
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadSources()
      .then((next) => {
        if (!cancelled) {
          setSources(next);
          setBibFile((current) =>
            next[current] !== undefined
              ? current
              : Object.keys(next).find((p) => p.endsWith(".bib")) ||
                "references.bib",
          );
          setError("");
        }
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
  }, [loadSources, refresh]);
  const bibs = useMemo(
    () =>
      Object.entries(sources)
        .filter(([path]) => path.endsWith(".bib"))
        .flatMap(([file, content]) => parseBib(content, file)),
    [sources],
  );
  const keyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of bibs)
      counts.set(entry.key, (counts.get(entry.key) || 0) + 1);
    return counts;
  }, [bibs]);
  const labels = useMemo(
    () =>
      Object.entries(sources)
        .filter(([path]) => path.endsWith(".tex"))
        .flatMap(([file, content]) => parseLabels(content, file)),
    [sources],
  );
  const mainSource = sources[main] || "",
    workflow = bibliographyWorkflow(main, sources),
    biblatex = workflow === "biblatex";
  const selected = selectedKeys.filter((key) => keyCounts.get(key) === 1);
  const commands = biblatex
    ? ["cite", "parencite", "textcite", "autocite"]
    : ["cite", "citep", "citet"];
  const command = commands.includes(citeCommand) ? citeCommand : "cite";
  let preview = "",
    citationError = "";
  try {
    if (selected.length)
      preview = citationCode(selected, command, workflow, prenote, postnote);
  } catch (e) {
    citationError = String(e);
  }
  const insertCitation = (keys: string[]) => {
    try {
      void onInsert({
        code: citationCode(keys, command, workflow, prenote, postnote),
        packages:
          !biblatex && ["citep", "citet"].includes(command) ? ["natbib"] : [],
      });
    } catch (e) {
      setError(String(e));
    }
  };
  const openBibEntry = (file: string, key: string) => {
    let line = 1;
    try {
      line =
        readBibRecords(sources[file] || "").find((r) => r.key === key)?.line ||
        1;
    } catch {
      /* Open the source even if it needs repair. */
    }
    onNavigate(file, line);
  };
  const filteredBibs = bibs.filter((e) =>
    `${e.key} ${e.title} ${e.author} ${e.year}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const filteredLabels = labels.filter((e) =>
    `${e.key} ${e.file}`.toLowerCase().includes(search.toLowerCase()),
  );
  const submitBib = async () => {
    setBusy(true);
    try {
      if (bibs.some((e) => e.key === fields.key))
        throw Error("Dieser Zitatschlüssel ist bereits im Projekt vorhanden.");
      if (
        !/^[\w./ -]+\.bib$/i.test(bibFile) ||
        bibFile.includes("..") ||
        bibFile.startsWith("/")
      )
        throw Error("Bitte einen relativen .bib-Dateinamen angeben.");
      await saveBib(bibFile, bibEntryCode(fields));
      setAdding(false);
      setRefresh((n) => n + 1);
      setFields({ ...fields, key: "", title: "" });
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const insertBibliography = () => {
    if (biblatex)
      void onInsert({
        code: "\n\\printbibliography\n",
        packages: [],
        declarations: mainSource.includes(`\\addbibresource{${bibFile}}`)
          ? []
          : [`\\addbibresource{${bibFile}}`],
      });
    else
      void onInsert({
        code: `\n\\bibliographystyle{${workflow === "natbib" ? style + "nat" : style}}\n\\bibliography{${bibFile.replace(/\.bib$/, "")}}\n`,
      });
  };
  return (
    <div className="science-panel">
      <div
        className="workbench-tabs"
        role="tablist"
        aria-label="Wissenschaftliche Werkzeuge"
      >
        {[
          { id: "literature", name: "Literatur", icon: BookOpen },
          { id: "references", name: "Querverweise", icon: Link2 },
          { id: "theorems", name: "Sätze & Beweise", icon: GraduationCap },
          { id: "document", name: "Dokument", icon: FilePlus2 },
        ].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t.id}
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setSearch("");
              setAdding(false);
              setImporting(false);
            }}
          >
            <t.icon size={15} />
            {t.name}
          </button>
        ))}
      </div>
      {error && (
        <div className="export-warning" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="science-loading">
          <LoaderCircle className="spin" size={22} /> Projektquellen werden
          gelesen …
        </div>
      ) : (
        <>
          {(tab === "literature" || tab === "references") &&
            !adding &&
            !importing && (
              <div className="science-searchbar">
                <label className="search-input large">
                  <Search size={16} />
                  <input
                    autoFocus
                    placeholder={
                      tab === "literature"
                        ? "Titel, Autor, Jahr oder Zitatschlüssel …"
                        : "Label oder Dateiname suchen …"
                    }
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <button
                  className="icon-button"
                  title="Projektquellen aktualisieren"
                  onClick={() => setRefresh((n) => n + 1)}
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            )}
          {tab === "literature" && (
            <>
              {importing ? (
                <BibImportPanel
                  sources={sources}
                  target={bibFile}
                  onTarget={setBibFile}
                  onSave={saveBib}
                  onBack={() => setImporting(false)}
                  onDone={() => {
                    setImporting(false);
                    setRefresh((v) => v + 1);
                  }}
                  onRefresh={async () => setSources(await loadSources())}
                />
              ) : adding ? (
                <div className="bib-form">
                  <div className="two-fields">
                    <label className="field-label">
                      Eintragstyp
                      <select
                        value={fields.type}
                        onChange={(e) =>
                          setFields({ ...fields, type: e.target.value })
                        }
                      >
                        <option value="article">Zeitschriftenartikel</option>
                        <option value="book">Buch</option>
                        <option value="inproceedings">Konferenzbeitrag</option>
                        <option value="misc">Sonstige Quelle / Website</option>
                      </select>
                    </label>
                    <label className="field-label">
                      Zitatschlüssel
                      <input
                        autoFocus
                        placeholder="mueller2026"
                        value={fields.key}
                        onChange={(e) =>
                          setFields({ ...fields, key: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label className="field-label">
                    Titel
                    <input
                      value={fields.title}
                      onChange={(e) =>
                        setFields({ ...fields, title: e.target.value })
                      }
                    />
                  </label>
                  <label className="field-label">
                    Autor(en)
                    <input
                      placeholder="Müller, Anna and Schmidt, Max"
                      value={fields.author}
                      onChange={(e) =>
                        setFields({ ...fields, author: e.target.value })
                      }
                    />
                  </label>
                  <div className="two-fields">
                    <label className="field-label">
                      Jahr
                      <input
                        inputMode="numeric"
                        placeholder="2026"
                        value={fields.year}
                        onChange={(e) =>
                          setFields({ ...fields, year: e.target.value })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Zeitschrift / Verlag / Konferenz
                      <input
                        value={fields.venue}
                        onChange={(e) =>
                          setFields({ ...fields, venue: e.target.value })
                        }
                      />
                    </label>
                    <label className="field-label">
                      DOI
                      <input
                        placeholder="10.1234/beispiel"
                        value={fields.doi}
                        onChange={(e) =>
                          setFields({ ...fields, doi: e.target.value })
                        }
                      />
                    </label>
                    <label className="field-label">
                      URL
                      <input
                        placeholder="https://…"
                        value={fields.url}
                        onChange={(e) =>
                          setFields({ ...fields, url: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label className="field-label">
                    Literaturdatei
                    <input
                      value={bibFile}
                      onChange={(e) => setBibFile(e.target.value)}
                    />
                  </label>
                  <div className="modal-footer">
                    <button
                      className="button ghost"
                      onClick={() => setAdding(false)}
                    >
                      Zurück
                    </button>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => void submitBib()}
                    >
                      <Plus size={14} /> Quelle speichern
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="science-actions">
                    <span>{bibs.length} Quellen im Projekt</span>
                    <div className="inline-actions">
                      <select
                        aria-label="Zitierbefehl"
                        value={command}
                        onChange={(e) => setCiteCommand(e.target.value)}
                      >
                        {commands.map((c) => (
                          <option value={c} key={c}>
                            \{c}
                          </option>
                        ))}
                      </select>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setError("");
                          setImporting(true);
                        }}
                      >
                        <FileUp size={14} /> BibTeX importieren
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => setAdding(true)}
                      >
                        <Plus size={14} /> Quelle hinzufügen
                      </button>
                    </div>
                  </div>
                  <div className="citation-composer">
                    <div className="citation-composer-heading">
                      <strong>Zitat zusammenstellen</strong>
                      <span>
                        {workflow === "biblatex"
                          ? "biblatex / Biber"
                          : workflow === "natbib"
                            ? "natbib / BibTeX"
                            : "LaTeX / BibTeX"}
                      </span>
                    </div>
                    <div className="two-fields">
                      <label className="field-label">
                        Text davor
                        <input
                          aria-label="Text vor dem Zitat"
                          value={prenote}
                          onChange={(e) => setPrenote(e.target.value)}
                          placeholder="z. B. vgl."
                        />
                      </label>
                      <label className="field-label">
                        Seiten / Text danach
                        <input
                          aria-label="Seitenangabe zum Zitat"
                          value={postnote}
                          onChange={(e) => setPostnote(e.target.value)}
                          placeholder={
                            biblatex ? "z. B. 12–15" : "z. B. S. 12–15"
                          }
                        />
                      </label>
                    </div>
                    {!!selected.length && (
                      <>
                        <div className="citation-selection">
                          {selected.map((key) => (
                            <button
                              key={key}
                              onClick={() =>
                                setSelectedKeys((keys) =>
                                  keys.filter((k) => k !== key),
                                )
                              }
                              aria-label={`${key} aus Zitat entfernen`}
                            >
                              <code>{key}</code>
                              <X size={11} />
                            </button>
                          ))}
                        </div>
                        <div className="citation-preview">
                          <code>{preview}</code>
                          <button
                            className="button primary"
                            disabled={!!citationError}
                            onClick={() => insertCitation(selected)}
                          >
                            {selected.length}{" "}
                            {selected.length === 1 ? "Quelle" : "Quellen"}{" "}
                            zitieren
                          </button>
                        </div>
                      </>
                    )}
                    {!selected.length && (
                      <small>
                        Quellen links vormerken, um sie gemeinsam zu zitieren.
                        Ein Klick auf einen Titel fügt ein einzelnes Zitat ein.
                      </small>
                    )}
                    {citationError && (
                      <p role="alert" className="validation-error">
                        {citationError}
                      </p>
                    )}
                  </div>
                  <div className="science-result-list citation-results">
                    {filteredBibs
                      .slice(0, visibleSources)
                      .map((entry, index) => (
                        <div
                          className="citation-source"
                          key={`${entry.file}:${entry.key}:${index}`}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Quelle ${entry.key} vormerken`}
                            disabled={keyCounts.get(entry.key)! > 1}
                            checked={selected.includes(entry.key)}
                            onChange={(e) =>
                              setSelectedKeys((keys) =>
                                e.target.checked
                                  ? [...keys, entry.key]
                                  : keys.filter((k) => k !== entry.key),
                              )
                            }
                          />
                          <button
                            className="citation-source-main"
                            disabled={keyCounts.get(entry.key)! > 1}
                            onClick={() => insertCitation([entry.key])}
                          >
                            <BookOpen size={19} />
                            <span>
                              <strong>{entry.title}</strong>
                              <small>
                                {entry.author}
                                {entry.year ? ` · ${entry.year}` : ""}
                              </small>
                              <code>
                                {entry.key} <span>· {entry.file}</span>
                              </code>
                              {keyCounts.get(entry.key)! > 1 && (
                                <small className="validation-error">
                                  Zitatschlüssel mehrfach definiert
                                </small>
                              )}
                            </span>
                            <span className="reference-action">Zitieren →</span>
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`BibTeX-Eintrag ${entry.key} öffnen`}
                            title="Eintrag im Quelltext bearbeiten"
                            onClick={() => openBibEntry(entry.file, entry.key)}
                          >
                            <FileCode2 size={14} />
                          </button>
                        </div>
                      ))}
                    {filteredBibs.length > visibleSources && (
                      <button
                        className="citation-more"
                        onClick={() =>
                          setVisibleSources((count) => count + 200)
                        }
                      >
                        Weitere Quellen anzeigen (
                        {filteredBibs.length - visibleSources})
                      </button>
                    )}
                    {!filteredBibs.length && (
                      <div className="science-empty">
                        <BookOpen size={29} strokeWidth={1} />
                        <h3>
                          {bibs.length
                            ? "Keine passenden Quellen"
                            : "Eine gute Arbeit nennt ihre Quellen."}
                        </h3>
                        <p>
                          {bibs.length
                            ? "Passe deine Suchbegriffe an."
                            : "Füge einen BibTeX-Eintrag hinzu oder lege eine vorhandene .bib-Datei in deinen Projektordner."}
                        </p>
                        <button
                          className="button secondary"
                          onClick={() => setAdding(true)}
                        >
                          <Plus size={14} /> Erste Quelle hinzufügen
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="bibliography-footer">
                    <div>
                      <strong>Literaturverzeichnis einfügen</strong>
                      <small>
                        Am Cursor einfügen, üblicherweise vor dem Anhang oder
                        Dokumentende.
                      </small>
                    </div>
                    <div className="inline-actions">
                      <select
                        aria-label="Literaturdatei"
                        value={bibFile}
                        onChange={(e) => setBibFile(e.target.value)}
                      >
                        {[
                          ...new Set([
                            bibFile,
                            ...Object.keys(sources).filter((p) =>
                              p.endsWith(".bib"),
                            ),
                          ]),
                        ].map((path) => (
                          <option key={path}>{path}</option>
                        ))}
                      </select>
                      {!biblatex && (
                        <select
                          aria-label="Literaturstil"
                          value={style}
                          onChange={(e) => setStyle(e.target.value)}
                        >
                          <option value="plain">Alphabetisch</option>
                          <option value="unsrt">Zitierreihenfolge</option>
                          <option value="abbrv">Abgekürzt</option>
                        </select>
                      )}
                      <button
                        className="button secondary"
                        disabled={!sources[bibFile]}
                        onClick={insertBibliography}
                      >
                        Einfügen
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
          {tab === "references" && (
            <>
              <div className="science-actions">
                <span>{labels.length} Labels im Projekt</span>
                <select
                  aria-label="Querverweistyp"
                  value={refCommand}
                  onChange={(e) => setRefCommand(e.target.value)}
                >
                  <option value="ref">Nummer · \ref</option>
                  <option value="eqref">Gleichung · \eqref</option>
                  <option value="pageref">Seite · \pageref</option>
                  <option value="autoref">Mit Typ · \autoref</option>
                </select>
              </div>
              <div className="science-result-list">
                {filteredLabels.map((entry, i) => (
                  <button
                    key={`${entry.file}:${entry.key}:${i}`}
                    onClick={() =>
                      void onInsert({
                        code: `\\${refCommand}{${entry.key}}`,
                        packages:
                          refCommand === "eqref"
                            ? ["amsmath"]
                            : refCommand === "autoref"
                              ? ["hyperref"]
                              : [],
                      })
                    }
                  >
                    <Link2 size={17} />
                    <span>
                      <strong>{entry.key}</strong>
                      <small>
                        {entry.file} · Zeile {entry.line}
                      </small>
                      {labels.filter((e) => e.key === entry.key).length > 1 && (
                        <small className="validation-error">
                          Label mehrfach definiert — bitte im Code korrigieren
                        </small>
                      )}
                    </span>
                    <span className="reference-action">Verweisen →</span>
                  </button>
                ))}
                {!filteredLabels.length && (
                  <div className="science-empty">
                    <Link2 size={28} />
                    <h3>
                      {labels.length
                        ? "Kein passendes Label"
                        : "Zusammenhänge sichtbar machen."}
                    </h3>
                    <p>
                      Setze beispielsweise \label&#123;eq:energie&#125; in einer
                      Gleichung oder \label&#123;sec:methodik&#125; nach einer
                      Überschrift.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
          {tab === "theorems" && (
            <>
              <p className="science-explanation">
                Nummerierung und benötigte amsthm-Definitionen werden im
                Hauptdokument ergänzt. Vorhandene Definitionen bleiben erhalten.
              </p>
              <div className="science-result-list theorem-list">
                {theoremBlocks.map((block) => (
                  <button
                    key={block.id}
                    onClick={() =>
                      void onInsert({
                        code: block.code,
                        outsideMath: true,
                        packages: ["amsmath", "amsthm"],
                        declarations: block.declaration
                          ? [
                              theoremBlocks[0].declaration,
                              ...(block.id === "theorem"
                                ? []
                                : [block.declaration]),
                            ]
                          : [],
                      })
                    }
                  >
                    <GraduationCap size={19} />
                    <span>
                      <strong>{block.name}</strong>
                      <small>{block.description}</small>
                      <code>\begin&#123;{block.id}&#125;</code>
                    </span>
                    <Plus size={16} />
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === "document" && (
            <>
              <p className="science-explanation">
                Bausteine für Aufbau, Nachweise und Anhänge. Der eingefügte
                LaTeX-Code bleibt frei bearbeitbar.
              </p>
              <div className="science-result-list">
                {documentBlocks.map((block) => (
                  <button key={block.name} onClick={() => void onInsert(block)}>
                    <FilePlus2 size={18} />
                    <span>
                      <strong>{block.name}</strong>
                      <small>
                        {block.packages?.length
                          ? `Paket ${block.packages.join(", ")} wird ergänzt.`
                          : "Direkt an der Cursorposition einfügen."}
                      </small>
                    </span>
                    <Plus size={15} />
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
