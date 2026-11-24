import { useState } from "react";
import {
  ArrowRight,
  Bold,
  BookOpen,
  Braces,
  Image,
  Italic,
  Search,
  Sigma,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { snippets } from "../core/model";
import { normalizeSearch } from "../app/workspace";

export function InsertCatalog({
  onBold,
  onItalic,
  onMath,
  onScience,
  onTable,
  onImage,
  onInsert,
}: {
  onBold: () => void;
  onItalic: () => void;
  onMath: () => void;
  onScience: () => void;
  onTable: () => void;
  onImage: () => void;
  onInsert: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Alle");
  const entries: {
    name: string;
    description: string;
    category: string;
    icon: LucideIcon;
    run: () => void;
  }[] = [
    {
      name: "Fett",
      description: "Ausgewählten Text fett setzen",
      category: "Text",
      icon: Bold,
      run: onBold,
    },
    {
      name: "Kursiv",
      description: "Ausgewählten Text hervorheben",
      category: "Text",
      icon: Italic,
      run: onItalic,
    },
    {
      name: "Mathematik: Formeln & Symbole",
      description: "Bibliothek, Formelbaukasten und Matrix-Editor",
      category: "Mathematik",
      icon: Sigma,
      run: onMath,
    },
    {
      name: "Literatur, Verweise & Beweise",
      description: "Wissenschaftliche Werkzeuge für dein Projekt",
      category: "Wissenschaft",
      icon: BookOpen,
      run: onScience,
    },
    {
      name: "Tabelle",
      description: "Zeilen und Spalten selbst bestimmen",
      category: "Struktur",
      icon: Table2,
      run: onTable,
    },
    {
      name: "Abbildung",
      description: "Ein Bild in dein Projekt importieren",
      category: "Struktur",
      icon: Image,
      run: onImage,
    },
    ...snippets.map((snippet) => ({
      ...snippet,
      icon: Braces,
      run: () => onInsert(snippet.code),
    })),
  ];
  const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  const results = entries.filter(
    (item) =>
      (category === "Alle" || category === item.category) &&
      terms.every((term) =>
        normalizeSearch(
          `${item.name} ${item.description} ${item.category}`,
        ).includes(term),
      ),
  );
  return (
    <div className="insertion-picker">
      <label className="search-input large">
        <Search size={17} />
        <input
          autoFocus
          data-autofocus=""
          aria-label="Element suchen"
          placeholder="Element suchen …"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd>Esc</kbd>
      </label>
      <div
        className="insertion-filters"
        role="group"
        aria-label="Elementkategorien"
      >
        {["Alle", "Text", "Struktur", "Mathematik", "Wissenschaft"].map(
          (name) => (
            <button
              key={name}
              aria-pressed={category === name}
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ),
        )}
      </div>
      <div
        className="insert-list insert-catalog"
        role="group"
        aria-label="Einfügeelemente"
      >
        {results.map((item) => (
          <button key={item.name} onClick={item.run}>
            <item.icon size={17} />
            <span>
              <strong>{item.name}</strong>
              <small>{item.description}</small>
            </span>
            <ArrowRight size={13} />
          </button>
        ))}
      </div>
      {!results.length && (
        <div className="workspace-empty" role="status">
          <strong>Keine passenden Elemente</strong>
          <p>Wähle eine andere Kategorie oder ändere den Suchbegriff.</p>
          <button
            className="button secondary"
            onClick={() => {
              setQuery("");
              setCategory("Alle");
            }}
          >
            Alle Elemente anzeigen
          </button>
        </div>
      )}
      <div className="palette-footer">
        <small>{results.length} Elemente</small>
        <span>Der LaTeX-Code bleibt bearbeitbar.</span>
      </div>
    </div>
  );
}
