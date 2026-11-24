import type { Diagnostic } from "../app/workspace";

export type CompilerAction =
  | "repair"
  | "source"
  | "environment"
  | "settings"
  | "unicode"
  | "bibliography"
  | "references"
  | "preview"
  | "retry"
  | "log"
  | "package"
  | "search";
export type CompilerHelp = {
  kind: string;
  title: string;
  explanation: string;
  actions: CompilerAction[];
  secondary?: boolean;
};
export const compilerActionLabels: Record<CompilerAction, string> = {
  repair: "Korrektur ansehen",
  source: "Fehlerstelle öffnen",
  environment: "TeX-Installation prüfen",
  settings: "Compiler-Einstellungen",
  unicode: "Unicode-Compiler wählen",
  bibliography: "Literatur verwalten",
  references: "Verweise prüfen",
  preview: "Vorschaudokument wählen",
  retry: "Erneut kompilieren",
  log: "Protokoll ansehen",
  package: "Fehlenden Dateinamen kopieren",
  search: "Im Projekt suchen",
};

export function missingResource(message: string) {
  return (
    message.match(
      /(?:File|file)\s+[`'"‘“]?([^`'"’”\r\n]+?)[`'"’”]?\s+(?:not found|not readable)/i,
    )?.[1] ||
    message.match(/Cannot find\s+[`'"]([^`'"]+)[`'"]/i)?.[1] ||
    message
      .match(
        /I (?:couldn't|could not) open (?:database|style) file\s+(.+)/i,
      )?.[1]
      ?.trim()
  );
}

/** A useful next step for every diagnostic, including failures without a TeX line. */
export function compilerHelp(
  d: Pick<Diagnostic, "message" | "command">,
): CompilerHelp {
  const m = d.message;
  const help = (
    kind: string,
    title: string,
    explanation: string,
    actions: CompilerAction[],
  ): CompilerHelp => ({ kind, title, explanation, actions });
  if (
    /fatal error occurred|emergency stop|no output pdf file produced|^==>/i.test(
      m,
    )
  )
    return {
      ...help(
        "consequence",
        "PDF-Erstellung abgebrochen",
        "Dies ist meist die Folge einer vorherigen Fehlermeldung. Behebe zuerst die erste Ursache; diese Meldung verschwindet danach häufig mit.",
        ["log"],
      ),
      secondary: true,
    };
  if (/Zeitlimit|time.?out|timed out/i.test(m))
    return help(
      "timeout",
      "Kompilierung dauert zu lange",
      "Prüfe die TeX-Installation und fehlende Pakete. Bei großen Dokumenten kannst du das Zeitlimit unter LaTeX & PDF erhöhen und erneut kompilieren.",
      ["settings", "environment", "retry"],
    );
  if (/CANCELLED:|Kompilierung abgebrochen/i.test(m))
    return help(
      "cancelled",
      "Kompilierung abgebrochen",
      "Starte die Kompilierung erneut, sobald du bereit bist. Die letzte erfolgreiche PDF bleibt verfügbar.",
      ["retry"],
    );
  if (
    /nicht gefunden|not found|not recognized|command not found|could not be found/i.test(
      m,
    ) &&
    /pdflatex|xelatex|lualatex|tectonic|bibtex|biber/i.test(m) &&
    !/File\s+[`'"]/i.test(m)
  )
    return help(
      "tool",
      "Benötigtes TeX-Werkzeug fehlt",
      "SimpleLexEditor enthält die LaTeX-Compiler, BibTeX und Biber. Prüfe die mitgelieferte Umgebung und führe bei beschädigten Dateien den vollständigen SimpleLexEditor-Installer erneut aus. Ein selbst gewählter TeX-Ordner muss die benötigten Werkzeuge enthalten.",
      ["environment", "settings"],
    );
  if (
    /Compilerpfad|Binärordner|konnte nicht gestartet|permission denied|access is denied|Zugriff.*verweigert|I can't write on file/i.test(
      m,
    )
  )
    return help(
      "access",
      "Compiler oder Datei nicht zugänglich",
      "Prüfe den Compilerpfad, Schreibrechte und ob die Ausgabedatei in einem anderen Programm gesperrt ist. Schließe gegebenenfalls die externe PDF-Ansicht.",
      ["settings", "environment", "retry"],
    );
  if (/andere[nr]? (?:SimpleLexEditor|Roxena)-Instanz|already.*compil/i.test(m))
    return help(
      "busy",
      "Projekt wird bereits kompiliert",
      "Warte auf den laufenden Compiler in der anderen SimpleLexEditor-Instanz und versuche es anschließend erneut.",
      ["retry"],
    );
  if (
    /fontspec.*(?:requires|error)|requires either XeTeX|must be run with.*(?:Xe|Lua)|Unicode character|inputenc Error|Invalid UTF-8|Missing character: There is no|font .*not loadable|font .*cannot be found/i.test(
      m,
    )
  )
    return help(
      "unicode",
      "Zeichen oder Schrift wird nicht unterstützt",
      "Für bekannte mathematische Unicode-Zeichen kann SimpleLexEditor LaTeX-Befehle vorschlagen. Bei anderen Schriften und Zeichen wähle einen installierten XeLaTeX- oder LuaLaTeX-Compiler. Prüfe bei ungültigem UTF-8 außerdem die Dateikodierung.",
      ["repair", "unicode", "source"],
    );
  const resource = missingResource(m);
  if (resource && /\.bib$/i.test(resource))
    return help(
      "bibliography-file",
      "Literaturdatei wurde nicht gefunden",
      `Prüfe den Pfad zu „${resource}“. SimpleLexEditor sucht nach einer eindeutig passenden .bib-Datei im Projekt; über die Literaturverwaltung kannst du vorhandene Quellen ansehen.`,
      ["repair", "bibliography", "source"],
    );
  if (resource && /\.(?:sty|cls|def|fd|bst)$/i.test(resource))
    return help(
      "package",
      "LaTeX-Paket oder Dokumentklasse fehlt",
      `„${resource}“ wurde nicht gefunden. Prüfe den Dateinamen und eigene Klassen im Projekt. SimpleLexEditor enthält die TeX-Live-Paketsammlung; fehlen deren Dateien, starte den vollständigen SimpleLexEditor-Installer erneut. Bei einem selbst gewählten TeX-Ordner prüfe dessen Pakete.`,
      ["repair", "package", "environment", "source"],
    );
  if (
    resource ||
    /couldn't open.*file|cannot find.*file|Cannot determine size.*graphic|Unknown graphics extension/i.test(
      m,
    )
  )
    return help(
      "file",
      "Eingebundene Datei fehlt oder ist ungeeignet",
      resource
        ? `„${resource}“ ist nicht erreichbar. SimpleLexEditor prüft vorhandene Projektdateien auf einen eindeutigen passenden Pfad. Kontrolliere sonst Schreibweise, Unterordner und Dateiformat.`
        : "Prüfe den Dateipfad und das Bildformat. PDF, PNG und JPEG eignen sich für die PDF-Compiler; EPS kann eine vorherige Konvertierung benötigen.",
      ["repair", "source"],
    );
  if (/undefined control sequence/i.test(m))
    return help(
      "command",
      "LaTeX-Befehl ist unbekannt",
      `${d.command ? `\\${d.command} ist unbekannt. ` : ""}SimpleLexEditor prüft häufige Schreibfehler und fehlende Pakete bekannter Befehle. Bei eigenen Makros prüfe auch deren Definition; die Ursache kann vor der gemeldeten Zeile liegen.`,
      ["repair", "source", "log"],
    );
  if (/Environment .+ undefined/i.test(m))
    return help(
      "environment",
      "Umgebung ist nicht definiert",
      "SimpleLexEditor kann Pakete für bekannte Umgebungen sowie Satz- und Beweisdefinitionen ergänzen. Prüfe bei eigenen Umgebungen den Namen und die Definition in der Präambel.",
      ["repair", "source"],
    );
  if (/\\begin.*ended by \\end|ended by.*\\end/i.test(m))
    return help(
      "mismatch",
      "Umgebungen passen nicht zusammen",
      "Jedes \\begin{Name} braucht ein passendes \\end{Name} in umgekehrter Reihenfolge. SimpleLexEditor prüft eindeutige falsch geschriebene Abschlussnamen; bei verschachtelten Blöcken öffne die Fehlerstelle.",
      ["repair", "source"],
    );
  if (
    /Missing \$|Bad math environment delimiter|Display math should end|Erroneous nesting of equation|Double superscript|Double subscript|Extra.*\\right|Missing.*\\right/i.test(
      m,
    )
  )
    return help(
      "math",
      "Mathematikmodus ist nicht korrekt begrenzt",
      "Prüfe $…$, \\(…\\) und \\[…\\]. Gleichungsumgebungen brauchen keine zusätzlichen Mathematikklammern. Definitionen und Beweise stehen außerhalb des Mathematikmodus. Indizes und Exponenten werden mit {…} gruppiert.",
      ["repair", "source"],
    );
  if (
    /Misplaced alignment tab|Extra alignment tab|Missing.*\\cr|Illegal pream-token|Misplaced.*\\(?:noalign|omit)/i.test(
      m,
    )
  )
    return help(
      "alignment",
      "Tabelle oder Ausrichtung stimmt nicht",
      "In Tabellen und align trennen & die Spalten; die Anzahl muss zur Definition passen. Für ein kaufmännisches Und im Fließtext verwende \\&. Zeilen einer Tabelle enden mit \\\\.",
      ["repair", "source"],
    );
  if (
    /Runaway argument|File ended while scanning|Paragraph ended before|Missing.*\} inserted|Extra \}|extra \}|Too many \}|Missing.*\{ inserted|Argument of .* extra/i.test(
      m,
    )
  )
    return help(
      "braces",
      "Klammer oder Befehlsargument ist unvollständig",
      "Prüfe zusammengehörige {…} und […] sowie die Zeilen vor der Fehlerstelle. Ein % kann einen benötigten Abschluss auskommentieren. SimpleLexEditor ergänzt hier keine Klammern auf Verdacht.",
      ["source", "log"],
    );
  if (/Missing \\begin\{document\}/i.test(m))
    return help(
      "document",
      "Dokumentbeginn oder Inhalt vor dem Dokument prüfen",
      "Text, Verweise wie \\ref{…} sowie Abbildungen (figure) und Tabellen (table) gehören hinter \\begin{document}. SimpleLexEditor kann eindeutig erkennbaren Inhalt und vollständig geschlossene Abbildungs- und Tabellenblöcke dorthin verschieben oder einen fehlenden Dokumentbeginn ergänzen. Pakete und Definitionen bleiben in der Präambel.",
      ["repair", "source", "preview"],
    );
  if (
    /no legal \\end|kein.*\\end\{document\}|Missing \\begin\{document\}|Hauptdokument muss|documentclass|Teildatei|Dokumentgerüst/i.test(
      m,
    )
  )
    return help(
      "document",
      "Dokumentgerüst oder Vorschaudokument prüfen",
      "Kompiliert wird das gewählte Hauptdokument mit \\documentclass, \\begin{document} und \\end{document}. Kapitel werden darin eingebunden. SimpleLexEditor kann einen eindeutig fehlenden Dokumentabschluss ergänzen.",
      ["repair", "preview", "source"],
    );
  if (/keine PDF-Seiten|No pages of output/i.test(m))
    return help(
      "empty",
      "Das Dokument erzeugt noch keine Seite",
      "Füge Text ein. Für ein bewusst leeres Dokument kann SimpleLexEditor \\null ergänzen, damit eine leere PDF-Seite entsteht.",
      ["repair", "source"],
    );
  if (/There's no line here to end/i.test(m))
    return help(
      "linebreak",
      "Zeilenumbruch ohne vorherigen Text",
      "Verwende für einen neuen Absatz eine Leerzeile oder \\par. Ein alleinstehendes \\\\ nach einer Leerzeile kann SimpleLexEditor ersetzen.",
      ["repair", "source"],
    );
  if (/Missing number|Illegal unit of measure|Dimension too large/i.test(m))
    return help(
      "dimension",
      "Zahl oder Längeneinheit fehlt",
      "Längen brauchen eine Zahl und eine gültige Einheit, beispielsweise 2cm, 12pt oder 0.8\\linewidth. Prüfe auch die Argumente von Abständen, Bildern und Tabellen.",
      ["source"],
    );
  if (/Lonely \\item|missing \\item|Something's wrong--perhaps/i.test(m))
    return help(
      "list",
      "Aufzählung ist unvollständig",
      "Ein \\item gehört in itemize, enumerate oder description. Jede Liste braucht mindestens einen Eintrag und einen passenden Abschluss.",
      ["source"],
    );
  if (/Can be used only in preamble/i.test(m))
    return help(
      "preamble",
      "Befehl gehört vor den Dokumentbeginn",
      "Verschiebe \\usepackage, Dokumentklassen und andere Präambelbefehle vor \\begin{document} im Hauptdokument oder in eine dort eingebundene Präambeldatei.",
      ["source", "settings"],
    );
  if (
    /Not in outer par mode|Float\(s\) lost|Too many unprocessed floats/i.test(m)
  )
    return help(
      "float-placement",
      "Abbildung oder Tabelle kann hier nicht schweben",
      "Setze figure und table außerhalb von verschachtelten Tabellen, minipage und anderen Gleitumgebungen. Prüfe bei vielen aufgestauten Abbildungen ihre Platzierungsoptionen und passende Seitenumbrüche.",
      ["source"],
    );
  if (
    /Option clash|Command .*already defined|already defined|already loaded/i.test(
      m,
    )
  )
    return help(
      "conflict",
      "Pakete oder Definitionen widersprechen sich",
      "Lade ein Paket möglichst nur einmal und bündele seine Optionen. Prüfe auch Dokumentklasse und eingebundene Präambeln. Entferne eigene Definitionen erst, wenn klar ist, welche Fassung verwendet werden soll.",
      ["source", "log"],
    );
  if (
    /undefined.*citation|citation.*undefined|Empty bibliography|Please.*(?:Biber|BibTeX)|Literaturverzeichnis|^ERROR\s+-|^WARN\s+-|^Warning--|^I (?:couldn't|could not) open|^I found no|^I was expecting|^Repeated entry|^Illegal, another|---line\s+\d+\s+of file/i.test(
      m,
    )
  )
    return help(
      "bibliography",
      "Literaturverzeichnis oder Zitatschlüssel prüfen",
      "Prüfe den Schlüssel und die eingebundene .bib-Datei. SimpleLexEditor führt benötigte BibTeX-/Biber-Läufe automatisch aus. Fehlende Werkzeuge findest du in der Installationsprüfung; Schreibfehler in der Datenbank an der Fehlerstelle.",
      ["repair", "bibliography", "environment", "source"],
    );
  if (
    /undefined.*reference|reference.*undefined|multiply.defined|multiply defined|Label .*multiply|Label\(s\).*changed|Rerun to get|rerunfilecheck/i.test(
      m,
    )
  )
    return help(
      "references",
      "Querverweise prüfen",
      "Jedes Ziel benötigt ein eindeutiges \\label{Schlüssel}. Prüfe den Verweisschlüssel, Groß-/Kleinschreibung und doppelte Labels. SimpleLexEditor führt mehrere LaTeX-Läufe aus; bleibt die Meldung bestehen, korrigiere den Schlüssel oder das Ziel.",
      ["repair", "references", "source", "retry"],
    );
  if (
    /shell.escape|write18|runsystem|minted.*(?:pygment|executable)|epstopdf/i.test(
      m,
    )
  )
    return help(
      "external",
      "Externe Konvertierung wird benötigt",
      "SimpleLexEditor kompiliert ohne Shell-Escape. Verwende für Bilder möglichst PDF, PNG oder JPEG. Für Quellcode ist listings eine Alternative zu Werkzeugen mit externen Programmen. Eine reine epstopdf-Warnung verhindert häufig keine PDF.",
      ["source", "log"],
    );
  if (
    /TeX capacity exceeded|20 MB Konsolenausgabe|Infinite glue|input stack size|recurs/i.test(
      m,
    )
  )
    return help(
      "capacity",
      "Rekursion oder Kapazitätsgrenze",
      "Prüfe sich selbst aufrufende Makros, zyklische \\input-Verweise und sehr große Inhalte. Ein höheres Zeitlimit behebt eine Endlosschleife nicht.",
      ["source", "log"],
    );
  if (/Unknown float option/i.test(m))
    return help(
      "float",
      "Platzierungsoption ist unbekannt",
      "Für [H] benötigt eine Abbildung oder Tabelle das Paket float. Andere Platzierungsoptionen sind beispielsweise h, t, b und p.",
      ["repair", "source"],
    );
  if (/Overfull/i.test(m))
    return help(
      "overfull",
      "Inhalt ragt über den Seitenrand",
      "Prüfe lange Wörter, Formeln und Tabellen. Kürze oder umbreche den Inhalt; passe bei Bildern die Breite an \\linewidth an. Die PDF kann trotzdem erstellt werden.",
      ["source"],
    );
  if (/Underfull/i.test(m))
    return help(
      "underfull",
      "Abstände lassen sich nicht gut verteilen",
      "Prüfe kurze Absätze und erzwungene Zeilenumbrüche. Dieser Satzhinweis verhindert keine PDF und muss nicht immer geändert werden.",
      ["source"],
    );
  if (/SAVE_CONFLICT|SAVE_UNAVAILABLE|Speicherkonflikt/i.test(m))
    return help(
      "save",
      "Dateifassungen zuerst vergleichen",
      "Löse den angezeigten Speicherkonflikt, bevor du erneut kompilierst. Deine Änderungen bleiben im Editor und in der Wiederherstellung erhalten.",
      ["retry"],
    );
  return help(
    "unknown",
    d.message.includes("Warning")
      ? "Hinweis des LaTeX-Pakets"
      : "Compiler-Meldung prüfen",
    "Öffne die Fehlerstelle und die Meldungen unmittelbar davor. Das vollständige Protokoll enthält zusätzlichen Kontext. Bei eigenen Makros kann die Ursache in deren Definition liegen.",
    ["source", "log"],
  );
}
