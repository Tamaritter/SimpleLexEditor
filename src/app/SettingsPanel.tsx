import { useId, useState, type ReactNode } from "react";
import {
  Check,
  Code2,
  Monitor,
  Moon,
  Settings2,
  ShieldCheck,
  Sun,
  Zap,
} from "lucide-react";
import { Toggle } from "./Toggle";
import type { Project, Settings } from "../core/model";

export type SettingsSection = "workspace" | "compilation";
function Row({
  name,
  detail,
  children,
}: {
  name: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{name}</strong>
        <small>{detail}</small>
      </div>
      {children}
    </div>
  );
}
export function SettingsPanel({
  settings,
  project,
  disabled,
  version,
  initialSection,
  onChange,
  onMain,
  onInspect,
}: {
  settings: Settings;
  project: Project | null;
  disabled: boolean;
  version: string;
  initialSection: SettingsSection;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onMain: (path: string) => void;
  onInspect: () => void;
}) {
  const [section, setSection] = useState(initialSection);
  const id = useId();
  const sections = [
    { id: "workspace" as const, name: "Arbeitsbereich", icon: Settings2 },
    { id: "compilation" as const, name: "LaTeX & PDF", icon: Zap },
  ];
  return (
    <div className="settings-layout">
      <div className="settings-navigation">
        <div
          role="tablist"
          aria-label="Einstellungsbereiche"
          aria-orientation="vertical"
          onKeyDown={(event) => {
            if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? "workspace"
                : event.key === "End"
                  ? "compilation"
                  : section === "workspace"
                    ? "compilation"
                    : "workspace";
            setSection(next);
            document.getElementById(`${id}-${next}`)?.focus();
          }}
        >
          {sections.map((item) => (
            <button
              key={item.id}
              role="tab"
              id={`${id}-${item.id}`}
              aria-controls={`${id}-panel`}
              aria-selected={section === item.id}
              data-autofocus={section === item.id ? "" : undefined}
              tabIndex={section === item.id ? 0 : -1}
              onClick={() => setSection(item.id)}
            >
              <item.icon size={16} />
              {item.name}
            </button>
          ))}
        </div>
        <div className="settings-identity">
          <span className="brand-dot">SimpleLexEditor</span>
          <small>Version {version}</small>
        </div>
      </div>
      <section
        className="settings-content"
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${section}`}
        tabIndex={0}
      >
        {section === "workspace" ? (
          <>
            <div className="settings-section-heading">
              <h3>Arbeitsbereich</h3>
              <p>Darstellung und Verhalten beim Schreiben.</p>
            </div>
            <h4>Darstellung</h4>
            <div className="theme-options" aria-label="Farbschema">
              {[
                { value: "light" as const, label: "Hell", icon: Sun },
                { value: "dark" as const, label: "Dunkel", icon: Moon },
                { value: "system" as const, label: "System", icon: Monitor },
              ].map((theme) => (
                <button
                  key={theme.value}
                  aria-pressed={settings.theme === theme.value}
                  className={settings.theme === theme.value ? "selected" : ""}
                  onClick={() => onChange("theme", theme.value)}
                >
                  <theme.icon size={17} />
                  <span>{theme.label}</span>
                  {settings.theme === theme.value && <Check size={12} />}
                </button>
              ))}
            </div>
            <Row
              name="Schriftgröße"
              detail="Größe des Texts im Quelltexteditor."
            >
              <select
                aria-label="Schriftgröße"
                value={settings.fontSize}
                onChange={(event) =>
                  onChange("fontSize", Number(event.target.value))
                }
              >
                {[11, 12, 13, 14, 15, 16, 18, 20].map((size) => (
                  <option key={size} value={size}>
                    {size} px
                  </option>
                ))}
              </select>
            </Row>
            <Row
              name="Zeilenumbruch"
              detail="Lange Zeilen an die Editorbreite anpassen."
            >
              <Toggle
                label="Zeilenumbruch"
                checked={settings.lineWrap}
                onChange={() => onChange("lineWrap", !settings.lineWrap)}
              />
            </Row>
            <Row
              name="Automatisch speichern"
              detail="Änderungen nach einer kurzen Schreibpause sichern."
            >
              <Toggle
                label="Automatisch speichern"
                checked={settings.autoSave}
                onChange={() => onChange("autoSave", !settings.autoSave)}
              />
            </Row>
            <p className="settings-applied">
              <Check size={13} />
              Änderungen werden sofort angewendet.
            </p>
          </>
        ) : (
          <>
            <div className="settings-section-heading">
              <h3>LaTeX & PDF</h3>
              <p>Compiler und Hauptdokument für dieses Projekt.</p>
            </div>
            <Row
              name="LaTeX-Compiler"
              detail="LaTeX ist bereits in SimpleLexEditor enthalten."
            >
              <select
                aria-label="LaTeX-Compiler"
                value={settings.engine}
                onChange={(event) => onChange("engine", event.target.value)}
              >
                {["pdflatex", "xelatex", "lualatex", "tectonic"].map(
                  (engine) => (
                    <option key={engine} value={engine}>
                      {engine === "tectonic"
                        ? "tectonic (extern, optional)"
                        : engine}
                    </option>
                  ),
                )}
              </select>
            </Row>
            <Row
              name="Hauptdokument"
              detail="Diese Datei wird für die Vorschau kompiliert."
            >
              <select
                aria-label="Hauptdokument"
                title={project?.main}
                value={project?.main || ""}
                disabled={disabled}
                onChange={(event) => onMain(event.target.value)}
              >
                <option value="" disabled>
                  Auswählen …
                </option>
                {project?.files
                  .filter(
                    (file) =>
                      !file.directory &&
                      file.path.toLowerCase().endsWith(".tex"),
                  )
                  .map((file) => (
                    <option key={file.path} value={file.path}>
                      {file.path}
                    </option>
                  ))}
              </select>
            </Row>
            <Row
              name="Compiler-Zeitlimit"
              detail="Inklusive Literatur und Wiederholungsläufen."
            >
              <select
                aria-label="Compiler-Zeitlimit"
                value={settings.timeoutSeconds}
                onChange={(event) =>
                  onChange("timeoutSeconds", Number(event.target.value))
                }
              >
                {[30, 60, 90, 180, 300, 600, 900, 1800].map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds < 60
                      ? `${seconds} Sekunden`
                      : `${seconds / 60} Minuten`}
                  </option>
                ))}
              </select>
            </Row>
            <div className="settings-toolchain">
              <ShieldCheck size={19} />
              <div>
                <strong>TeX-Installation</strong>
                <p>Mitgelieferte Compiler, BibTeX und Biber prüfen.</p>
              </div>
              <button className="button secondary" onClick={onInspect}>
                Installation prüfen
              </button>
            </div>
            <details className="settings-advanced">
              <summary>
                <Code2 size={14} />
                Erweiterte Compiler-Einstellungen
              </summary>
              <label className="field-label">
                TeX-Binärordner (optional)
                <input
                  placeholder="Mitgelieferte SimpleLexEditor-Umgebung verwenden"
                  value={settings.toolchainDirectory}
                  onChange={(event) =>
                    onChange("toolchainDirectory", event.target.value)
                  }
                />
              </label>
              <p className="muted-help">
                Nur für eine eigene TeX-Installation: absoluter Ordner der
                Compilerprogramme. Leer lassen, um die mitgelieferte
                SimpleLexEditor-Umgebung zu verwenden. Tectonic benötigt einen
                eigenen Ordner.
              </p>
            </details>
          </>
        )}
      </section>
    </div>
  );
}
