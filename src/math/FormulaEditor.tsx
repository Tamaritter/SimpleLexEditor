import { useEffect, useRef } from "react";
import { MathfieldElement, type Selector } from "mathlive";
import { ChevronLeft, ChevronRight, Eraser, Redo2, Undo2 } from "lucide-react";
import "./formulaEditor.css";

// All editing, fonts and rendering stay local, including in the desktop app.
MathfieldElement.fontsDirectory = "/mathlive/fonts";
MathfieldElement.soundsDirectory = null;
MathfieldElement.computeEngine = null;
MathfieldElement.locale = "de";

const structures = [
  { name: "Bruch", symbol: "a⁄b", code: "\\frac{#0}{#?}" },
  { name: "Wurzel", symbol: "√x", code: "\\sqrt{#0}" },
  { name: "n-te Wurzel", symbol: "ⁿ√x", code: "\\sqrt[#?]{#0}" },
  { name: "Potenz", symbol: "xⁿ", code: "{#0}^{#?}" },
  { name: "Tiefstellung", symbol: "xₙ", code: "{#0}_{#?}" },
  { name: "Runde Klammern", symbol: "( x )", code: "\\left(#0\\right)" },
  { name: "Betrag", symbol: "| x |", code: "\\left|#0\\right|" },
  { name: "Summe", symbol: "∑", code: "\\sum_{#?}^{#?}{#0}" },
  { name: "Produkt", symbol: "∏", code: "\\prod_{#?}^{#?}{#0}" },
  {
    name: "Integral",
    symbol: "∫",
    code: "\\int_{#?}^{#?}{#0}\\,\\mathrm{d}#?",
  },
  { name: "Grenzwert", symbol: "lim", code: "\\lim_{#?\\to #?}{#0}" },
  {
    name: "Ableitung",
    symbol: "d⁄dx",
    code: "\\frac{\\mathrm{d}}{\\mathrm{d}#?}{#0}",
  },
  {
    name: "Partielle Ableitung",
    symbol: "∂⁄∂x",
    code: "\\frac{\\partial}{\\partial #?}{#0}",
  },
  { name: "Vektor", symbol: "v →", code: "\\vec{#0}" },
  {
    name: "Matrix",
    symbol: "[ ⋮ ]",
    code: "\\begin{pmatrix}#0&#?\\\\#?&#?\\end{pmatrix}",
  },
  {
    name: "Fallunterscheidung",
    symbol: "{ ⋮",
    code: "\\begin{cases}#0&#?\\\\#?&#?\\end{cases}",
  },
];
const symbols = [
  ["Plus", "+", "+"],
  ["Minus", "−", "-"],
  ["Mal", "·", "\\cdot"],
  ["Gleich", "=", "="],
  ["Kleiner gleich", "≤", "\\leq"],
  ["Plusminus", "±", "\\pm"],
  ["Unendlich", "∞", "\\infty"],
  ["Pi", "π", "\\pi"],
  ["Alpha", "α", "\\alpha"],
  ["Theta", "θ", "\\theta"],
  ["Lambda", "λ", "\\lambda"],
  ["Reelle Zahlen", "ℝ", "\\mathbb{R}"],
];
const examples = [
  {
    name: "Bruch in einer Wurzel",
    code: "\\sqrt{\\frac{1+x^2}{1+\\frac{1}{x}}}",
  },
  {
    name: "Integral mit verschachteltem Bruch",
    code: "\\int_0^1\\frac{x^2}{\\sqrt{1+x^2}}\\,\\mathrm{d}x",
  },
  {
    name: "Summe mit Potenz und Wurzel",
    code: "\\sum_{k=1}^{n}\\frac{(-1)^k}{\\sqrt{k^2+1}}",
  },
];

export function formulaSlotCount(expression: string) {
  return [...expression.matchAll(/\\placeholder\b/g)].length;
}

const primaryStructures = new Set([
  "Bruch",
  "Wurzel",
  "Potenz",
  "Tiefstellung",
  "Runde Klammern",
  "Summe",
  "Integral",
  "Grenzwert",
]);

export function FormulaEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  useEffect(() => {
    const mf = new MathfieldElement({
      mathVirtualKeyboardPolicy: "manual",
      smartFence: true,
    });
    mf.setAttribute("aria-label", "Visueller Formeleditor");
    mf.setAttribute("aria-describedby", "formula-editor-help");
    mf.setAttribute("placeholder", "x^2 + …");
    mf.value = latest.current.value;
    const update = () => latest.current.onChange(mf.value);
    mf.addEventListener("input", update);
    host.current!.append(mf);
    field.current = mf;
    return () => {
      mf.removeEventListener("input", update);
      mf.remove();
      field.current = null;
    };
  }, []);

  useEffect(() => {
    const mf = field.current;
    if (mf && mf.value !== value)
      mf.setValue(value, { silenceNotifications: true });
  }, [value]);

  const insert = (code: string) => {
    const mf = field.current;
    if (!mf) return;
    mf.insert(code, {
      format: "latex",
      selectionMode: "placeholder",
      focus: true,
    });
    onChange(mf.value);
  };
  const command = (selector: Selector) => {
    const mf = field.current;
    if (!mf) return;
    mf.focus();
    mf.executeCommand(selector);
    onChange(mf.value);
  };
  const structureButton = (item: (typeof structures)[number]) => (
    <button
      key={item.name}
      type="button"
      aria-label={`${item.name} einsetzen`}
      title={`${item.name}: an der Formelposition einsetzen oder die Auswahl einbetten`}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => insert(item.code)}
    >
      <span aria-hidden="true">{item.symbol}</span>
      <small>{item.name}</small>
    </button>
  );
  return (
    <div className="visual-formula-editor">
      <div className="formula-editor-heading">
        <div>
          <h3>Formel zusammensetzen</h3>
        </div>
        <span className="formula-editor-badge">Visuell</span>
      </div>
      <p className="muted-help" id="formula-editor-help">
        Baustein wählen, in ein Kästchen klicken und weiterschreiben. In jedes
        Kästchen passt auch ein weiterer Bruch, eine Wurzel oder ein Integral.
      </p>
      <div
        className="formula-structure-grid"
        role="group"
        aria-label="Formelbausteine"
      >
        {structures
          .filter((item) => primaryStructures.has(item.name))
          .map(structureButton)}
      </div>
      <details className="formula-more-structures">
        <summary>Weitere Bausteine: Ableitungen, Vektoren, Matrizen …</summary>
        <div
          className="formula-structure-grid"
          role="group"
          aria-label="Weitere Formelbausteine"
        >
          {structures
            .filter((item) => !primaryStructures.has(item.name))
            .map(structureButton)}
        </div>
      </details>
      <div className="formula-canvas" ref={host} />
      <div
        className="formula-edit-actions"
        role="group"
        aria-label="Formel bearbeiten"
      >
        <button
          type="button"
          title="Rückgängig"
          aria-label="Formel rückgängig"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => command("undo")}
        >
          <Undo2 size={15} />
        </button>
        <button
          type="button"
          title="Wiederholen"
          aria-label="Formel wiederholen"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => command("redo")}
        >
          <Redo2 size={15} />
        </button>
        <span />
        <button
          type="button"
          title="Vorheriges Kästchen"
          aria-label="Vorheriges Formelfeld"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => command("moveToPreviousPlaceholder")}
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => command("moveToNextPlaceholder")}
        >
          Nächstes Kästchen <ChevronRight size={15} />
        </button>
        <span />
        <button
          type="button"
          title="Formel leeren (mit Rückgängig wiederherstellbar)"
          aria-label="Formel leeren"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            command("selectAll");
            command("deleteBackward");
          }}
        >
          <Eraser size={15} />
        </button>
      </div>
      <div
        className="formula-quick-symbols"
        role="group"
        aria-label="Häufige Mathematikzeichen"
      >
        {symbols.map(([name, label, code]) => (
          <button
            type="button"
            key={name}
            aria-label={`${name} einsetzen`}
            title={name}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => insert(code)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="formula-editor-tip">
        Tipp: Markiere einen Teilausdruck und wähle z. B. „Wurzel“, um ihn
        einzubetten. Mit den Pfeiltasten bewegst du dich durch die Formel.
      </p>
      <label className="field-label formula-examples">
        Mit einem Beispiel starten
        <select
          aria-label="Formelbeispiel"
          value=""
          onChange={(e) => {
            const example = examples.find(
              (item) => item.name === e.target.value,
            );
            if (!example) return;
            field.current?.select();
            insert(example.code);
          }}
        >
          <option value="">Beispiel auswählen …</option>
          {examples.map((example) => (
            <option key={example.name}>{example.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
