import { useMemo, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  ArrowRight,
  Braces,
  Check,
  Grid2X2,
  Plus,
  PencilLine,
  Search,
  Sigma,
} from "lucide-react";
import { mathCatalog, mathCategories } from "./mathCatalog";
import {
  inMath,
  matrixCode,
  type ScientificInsert,
} from "../research/scientific";
import { FormulaEditor, formulaSlotCount } from "./FormulaEditor";
export function MathView({
  code,
  display = false,
}: {
  code: string;
  display?: boolean;
}) {
  const rendered = useMemo(() => {
    try {
      return {
        html: katex.renderToString(code, {
          displayMode: display,
          throwOnError: true,
          trust: false,
          strict: "ignore",
          maxExpand: 500,
          output: "htmlAndMathml",
        }),
        error: "",
      };
    } catch (error) {
      return {
        html: "",
        error:
          error instanceof Error
            ? error.message.replace(/^KaTeX parse error: /, "")
            : "Keine Schnellvorschau verfügbar.",
      };
    }
  }, [code, display]);
  return rendered.html ? (
    <span
      className="math-render"
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  ) : (
    <span className="math-render-error" title={rendered.error}>
      {display ? "Diese Formel benötigt die LaTeX-PDF-Vorschau." : code}
    </span>
  );
}
const builders = [
  {
    name: "Bruch",
    fields: ["Zähler", "Nenner"],
    defaults: ["a+b", "c"],
    build: (v: string[]) => `\\frac{${v[0]}}{${v[1]}}`,
  },
  {
    name: "Wurzel",
    fields: ["Radikand", "Wurzelexponent"],
    defaults: ["x", "2"],
    build: (v: string[]) => `\\sqrt[${v[1]}]{${v[0]}}`,
  },
  {
    name: "Integral",
    fields: ["Integrand", "Untere Grenze", "Obere Grenze", "Variable"],
    defaults: ["f(x)", "a", "b", "x"],
    build: (v: string[]) =>
      `\\int_{${v[1]}}^{${v[2]}} ${v[0]}\\,\\mathrm{d}${v[3]}`,
  },
  {
    name: "Summe",
    fields: ["Summand", "Untere Grenze", "Obere Grenze"],
    defaults: ["a_k", "k=1", "n"],
    build: (v: string[]) => `\\sum_{${v[1]}}^{${v[2]}} ${v[0]}`,
  },
  {
    name: "Grenzwert",
    fields: ["Ausdruck", "Variable", "Grenze"],
    defaults: ["f(x)", "x", "\\infty"],
    build: (v: string[]) => `\\lim_{${v[1]}\\to ${v[2]}} ${v[0]}`,
  },
  {
    name: "Ableitung",
    fields: ["Funktion", "Variable", "Ordnung"],
    defaults: ["f", "x", "1"],
    build: (v: string[]) =>
      v[2] === "1"
        ? `\\frac{\\mathrm{d}${v[0]}}{\\mathrm{d}${v[1]}}`
        : `\\frac{\\mathrm{d}^{${v[2]}}${v[0]}}{\\mathrm{d}${v[1]}^{${v[2]}}}`,
  },
  {
    name: "Partielle Ableitung",
    fields: ["Funktion", "Variable", "Ordnung"],
    defaults: ["f", "x", "1"],
    build: (v: string[]) =>
      v[2] === "1"
        ? `\\frac{\\partial ${v[0]}}{\\partial ${v[1]}}`
        : `\\frac{\\partial^{${v[2]}}${v[0]}}{\\partial ${v[1]}^{${v[2]}}`,
  },
];
type Props = {
  selection: { source: string; from: number; to: number };
  onInsert: (item: ScientificInsert) => Promise<void>;
};
export function MathPalette({ selection, onInsert }: Props) {
  const selected = selection.source
    .slice(selection.from, selection.to)
    .trim()
    .replace(/^\$\$([\s\S]*?)\$\$$/, "$1")
    .replace(/^\$([^]*?)\$$/, "$1")
    .replace(/^\\\[([\s\S]*?)\\\]$/, "$1")
    .replace(/^\\\(([\s\S]*?)\\\)$/, "$1");
  const [tab, setTab] = useState("Formeleditor"),
    [category, setCategory] = useState("Bausteine"),
    [query, setQuery] = useState(""),
    [expression, setExpression] = useState(selected);
  const [mode, setMode] = useState<"inline" | "display" | "numbered" | "raw">(
      "display",
    ),
    [label, setLabel] = useState(""),
    [builder, setBuilder] = useState(0),
    [values, setValues] = useState(builders[0].defaults),
    [rows, setRows] = useState(2),
    [cols, setCols] = useState(2),
    [bracket, setBracket] = useState("pmatrix"),
    [cells, setCells] = useState<Record<string, string>>({
      "0:0": "a",
      "0:1": "b",
      "1:0": "c",
      "1:1": "d",
    }),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const inside = inMath(selection.source, selection.from);
  const entries = mathCatalog.filter(
    (e) =>
      (query.trim() || category === "Alle" || e.category === category) &&
      `${e.name} ${e.code} ${e.category} ${e.keywords || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const append = (code: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? expression.length,
      end = el?.selectionEnd ?? start;
    setExpression(expression.slice(0, start) + code + expression.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + code.length, start + code.length);
    });
  };
  const updateMatrix = (
    r: number,
    c: number,
    b: string,
    next: Record<string, string>,
  ) =>
    setExpression(
      matrixCode(
        r,
        c,
        b,
        Array.from(
          { length: r * c },
          (_, i) => next[`${Math.floor(i / c)}:${i % c}`] || "0",
        ),
      ),
    );
  const invalidLabel = label !== "" && !/^[A-Za-z0-9_:.-]+$/.test(label);
  const openSlots = formulaSlotCount(expression);
  const previewExpression = expression.replace(
    /\\placeholder(?:\[[^\]]*\])?\{[^}]*\}/g,
    "\\square",
  );
  const insert = async () => {
    if (!expression.trim() || openSlots || invalidLabel || busy) return;
    setBusy(true);
    try {
      await onInsert({
        code: expression.trim(),
        math: true,
        mode,
        label: mode === "numbered" ? label.trim() : undefined,
        packages: [
          "amsmath",
          "amssymb",
          ...(expression.includes("\\coloneqq") ? ["mathtools"] : []),
        ],
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="math-workbench">
      <div
        className="workbench-tabs"
        role="tablist"
        aria-label="Mathematik-Werkzeuge"
      >
        {[
          { name: "Formeleditor", icon: PencilLine },
          { name: "Bibliothek", icon: Sigma },
          { name: "Formelbaukasten", icon: Braces },
          { name: "Matrix", icon: Grid2X2 },
        ].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t.name}
            key={t.name}
            onClick={() => {
              setTab(t.name);
            }}
          >
            <t.icon size={15} />
            {t.name}
          </button>
        ))}
      </div>
      <div className="math-workspace">
        <section className="math-browser">
          <div hidden={tab !== "Formeleditor"}>
            <FormulaEditor value={expression} onChange={setExpression} />
          </div>
          {tab === "Bibliothek" && (
            <>
              <label className="search-input large">
                <Search size={16} />
                <input
                  autoFocus
                  placeholder="Symbol, Formel oder LaTeX-Befehl suchen …"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="math-category-list">
                {mathCategories.map((c) => (
                  <button
                    className={c === category ? "selected" : ""}
                    onClick={() => {
                      setCategory(c);
                      setQuery("");
                    }}
                    key={c}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="math-result-count">
                {entries.length} Bausteine · Symbole werden an der
                Formelposition ergänzt
              </div>
              <div className="math-symbol-grid">
                {entries.map((e) => (
                  <button
                    key={`${e.category}:${e.name}`}
                    title={`${e.name} — ${e.code}`}
                    onClick={() =>
                      e.kind === "symbol"
                        ? append(e.code + " ")
                        : setExpression(e.code)
                    }
                  >
                    <MathView code={e.code} />
                    <span>{e.name}</span>
                  </button>
                ))}
              </div>
              {entries.length === 0 && (
                <p className="muted-help">
                  Keine Treffer. Suche beispielsweise nach Integral, Matrix,
                  alpha oder Wahrscheinlichkeit.
                </p>
              )}
            </>
          )}
          {tab === "Formelbaukasten" && (
            <>
              <label className="field-label">
                Baustein
                <select
                  aria-label="Formeltyp"
                  value={builder}
                  onChange={(e) => {
                    const index = +e.target.value;
                    setBuilder(index);
                    setValues(builders[index].defaults);
                    setExpression(
                      builders[index].build(builders[index].defaults),
                    );
                  }}
                >
                  {builders.map((b, i) => (
                    <option key={b.name} value={i}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="builder-fields">
                {builders[builder].fields.map((name, i) => (
                  <label className="field-label" key={`${builder}:${name}`}>
                    {name}
                    <input
                      value={values[i]}
                      onChange={(e) => {
                        const next = values.map((v, n) =>
                          n === i ? e.target.value : v,
                        );
                        setValues(next);
                        setExpression(builders[builder].build(next));
                      }}
                    />
                  </label>
                ))}
              </div>
              <p className="muted-help">
                Alle Felder verstehen LaTeX: beispielsweise x^2, \\alpha oder
                \\infty. Den vollständigen Ausdruck kannst du rechts weiter
                bearbeiten.
              </p>
              <button
                className="button"
                onClick={() => setExpression(builders[builder].build(values))}
              >
                Ausdruck aus Feldern übernehmen
              </button>
            </>
          )}
          {tab === "Matrix" && (
            <>
              <div className="matrix-settings">
                <label className="field-label">
                  Zeilen
                  <input
                    type="number"
                    aria-label="Matrixzeilen"
                    min={1}
                    max={10}
                    value={rows}
                    onChange={(e) => {
                      const n = Math.max(1, Math.min(10, +e.target.value || 1));
                      setRows(n);
                      updateMatrix(n, cols, bracket, cells);
                    }}
                  />
                </label>
                <label className="field-label">
                  Spalten
                  <input
                    type="number"
                    aria-label="Matrixspalten"
                    min={1}
                    max={10}
                    value={cols}
                    onChange={(e) => {
                      const n = Math.max(1, Math.min(10, +e.target.value || 1));
                      setCols(n);
                      updateMatrix(rows, n, bracket, cells);
                    }}
                  />
                </label>
                <label className="field-label">
                  Klammern
                  <select
                    aria-label="Matrixklammern"
                    value={bracket}
                    onChange={(e) => {
                      setBracket(e.target.value);
                      updateMatrix(rows, cols, e.target.value, cells);
                    }}
                  >
                    {[
                      ["pmatrix", "( Rund )"],
                      ["bmatrix", "[ Eckig ]"],
                      ["Bmatrix", "{ Geschweift }"],
                      ["vmatrix", "| Determinante |"],
                      ["Vmatrix", "‖ Norm ‖"],
                      ["matrix", "Ohne Klammern"],
                    ].map(([v, name]) => (
                      <option value={v} key={v}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="matrix-input-scroll">
                <div
                  className="matrix-input-grid"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(60px,1fr))`,
                  }}
                >
                  {Array.from({ length: rows * cols }, (_, i) => {
                    const row = Math.floor(i / cols),
                      col = i % cols,
                      key = `${row}:${col}`;
                    return (
                      <input
                        key={key}
                        aria-label={`Matrix Z${row + 1} S${col + 1}`}
                        value={cells[key] || ""}
                        placeholder="0"
                        onChange={(e) => {
                          const next = { ...cells, [key]: e.target.value };
                          setCells(next);
                          updateMatrix(rows, cols, bracket, next);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
              <p className="muted-help">
                Bis zu 10 × 10 Einträge. Auch Formeln und symbolische Einträge
                sind möglich.
              </p>
              <button
                className="button"
                onClick={() => updateMatrix(rows, cols, bracket, cells)}
              >
                Matrix übernehmen
              </button>
            </>
          )}
        </section>
        <section className="formula-composer">
          <div className="formula-preview">
            <span className="eyebrow">FORMELVORSCHAU</span>
            <div className="formula-preview-scroll">
              <MathView code={previewExpression || "\\phantom{x}"} display />
            </div>
            <small>
              Schnellvorschau · Die PDF-Kompilierung ist maßgeblich.
            </small>
          </div>
          <details className="formula-code-details">
            <summary>LaTeX-Code bearbeiten (optional)</summary>
            <label className="field-label">
              LaTeX-Ausdruck
              <textarea
                ref={input}
                aria-label="Formel-LaTeX"
                rows={5}
                value={expression}
                spellCheck={false}
                onChange={(e) => setExpression(e.target.value)}
              />
            </label>
          </details>
          {openSlots > 0 && (
            <p className="formula-slots-notice" role="status">
              {openSlots === 1
                ? "Noch ein Kästchen ausfüllen"
                : `Noch ${openSlots} Kästchen ausfüllen`}{" "}
              – dann ist die Formel bereit zum Einfügen.
            </p>
          )}
          <label className="field-label">
            Einfügen als
            <select
              aria-label="Formelmodus"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="inline">Im Text · $ … $</option>
              <option value="display">Abgesetzt · ohne Nummer</option>
              <option value="numbered">Nummerierte Gleichung</option>
              <option value="raw">Nur LaTeX-Code</option>
            </select>
          </label>
          {mode === "numbered" && (
            <label className="field-label">
              Label für Querverweise (optional)
              <input
                placeholder="eq:energie"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              {invalidLabel && (
                <small className="validation-error">
                  Verwende Buchstaben, Zahlen, : . _ oder -.
                </small>
              )}
            </label>
          )}
          <div className="formula-context">
            <Check size={14} />
            <span>
              {inside
                ? "Der Cursor steht bereits in einer Mathematikumgebung. Zusätzliche Formelklammern werden weggelassen."
                : "Benötigte Mathematikpakete werden im Hauptdokument ergänzt."}
            </span>
          </div>
          <button
            className="button primary math-insert-button"
            disabled={
              busy || !expression.trim() || invalidLabel || openSlots > 0
            }
            onClick={() => void insert()}
          >
            <Plus size={16} />{" "}
            {busy ? "Wird eingefügt …" : "Formel in Dokument einfügen"}
            <ArrowRight size={15} />
          </button>
        </section>
      </div>
    </div>
  );
}
