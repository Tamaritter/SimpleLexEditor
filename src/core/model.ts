export type FileEntry = { path: string; name: string; directory: boolean };
export type Project = {
  name: string;
  root: string;
  main: string;
  files: FileEntry[];
};
export type Document = {
  path: string;
  content: string;
  saved: string;
  version?: string;
  conflict?: boolean;
};
export type Settings = {
  theme: "light" | "dark" | "system";
  fontSize: number;
  autoSave: boolean;
  lineWrap: boolean;
  engine: string;
  timeoutSeconds: number;
  toolchainDirectory: string;
};
export const defaultSettings: Settings = {
  theme: "dark",
  fontSize: 14,
  autoSave: true,
  lineWrap: true,
  engine: "pdflatex",
  timeoutSeconds: 180,
  toolchainDirectory: "",
};
export const welcome = String.raw`\documentclass[11pt,a4paper]{article}

% Ein ruhiger Ort für große Gedanken.
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[ngerman]{babel}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage[margin=2.6cm]{geometry}
\usepackage{hyperref}

\title{Notizen zur Unendlichkeit}
\author{Dein Name}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
Jede große Idee beginnt mit einem leeren Blatt.
Dies ist dein Raum, um Gedanken zu ordnen,
Zusammenhänge zu entdecken und Neues zu schreiben.
\end{abstract}

\section{Ein Anfang}
Willkommen in \textbf{SimpleLexEditor}. Hier treffen klare
Gedanken auf schönen Satz. Konzentriere dich auf
deine Ideen -- wir kümmern uns um den Rest.

Ein gutes Dokument braucht nicht viel: einen
Gedanken, eine Struktur und die Freiheit,
einfach anzufangen.

\section{Die Schönheit der Mathematik}
Manche Ideen lassen sich am besten in einer
einzigen Zeile ausdrücken. Die Eulersche Identität
verbindet fünf fundamentale Konstanten:

\begin{equation}
  e^{i\pi} + 1 = 0
\end{equation}

Und manchmal eröffnet eine Summe eine ganz
neue Perspektive auf das Unendliche:

\[
  \sum_{n=1}^{\infty} \frac{1}{n^2}
  = \frac{\pi^2}{6}
\]

\section{Was als Nächstes kommt}
\begin{itemize}
  \item Gib deinen Gedanken eine Struktur.
  \item Ergänze Formeln, Tabellen und Abbildungen.
  \item Teile dein fertiges Werk als PDF.
\end{itemize}

\bigskip
\noindent\textit{Der beste Moment anzufangen ist jetzt.}

\end{document}
`;
export const templates = [
  {
    id: "research",
    name: "Forschungsartikel",
    subtitle: "Abstract, Methodik & Literatur",
    mark: "§",
    content: String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[ngerman]{babel}
\usepackage{amsmath,amssymb,amsthm,graphicx,booktabs}
\usepackage[margin=2.5cm]{geometry}
\usepackage{hyperref}
\newtheorem{theorem}{Satz}[section]
\newtheorem{lemma}[theorem]{Lemma}
\theoremstyle{definition}
\newtheorem{definition}[theorem]{Definition}
\title{Titel des Forschungsartikels}
\author{Vorname Nachname\\Institut / Universität}
\date{\today}
\begin{document}
\maketitle
\begin{abstract}
Fragestellung, Methode, zentrale Ergebnisse und deren Bedeutung.
\end{abstract}
\noindent\textbf{Schlüsselwörter:} Forschung, Methode, Ergebnis
\section{Einleitung}\label{sec:einleitung}
Motivation und Forschungsfrage.
\section{Verwandte Arbeiten}\label{sec:verwandt}
Stand der Forschung und Einordnung der eigenen Arbeit.
\section{Methodik}\label{sec:methodik}
Datengrundlage, Annahmen und Vorgehensweise.
\begin{equation}\label{eq:modell}
  y = \beta_0 + \beta_1 x + \varepsilon
\end{equation}
\section{Ergebnisse}\label{sec:ergebnisse}
Darstellung und Analyse der Ergebnisse aus Abschnitt~\ref{sec:methodik}.
\section{Diskussion und Grenzen}
Interpretation, Einschränkungen und Reproduzierbarkeit.
\section{Fazit und Ausblick}
Zusammenfassung und offene Forschungsfragen.
% Literatur über Wissenschaft > Literatur einfügen.
\end{document}
`,
  },
  {
    id: "lecture",
    name: "Vorlesungsskript",
    subtitle: "Definitionen, Sätze & Übungen",
    mark: "∑",
    content: String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[ngerman]{babel}
\usepackage{amsmath,amssymb,amsthm,graphicx}
\usepackage[margin=2.6cm]{geometry}
\usepackage{hyperref}
\newtheorem{theorem}{Satz}[section]
\newtheorem{lemma}[theorem]{Lemma}
\theoremstyle{definition}
\newtheorem{definition}[theorem]{Definition}
\newtheorem{example}[theorem]{Beispiel}
\newtheorem{exercise}{Aufgabe}[section]
\title{Vorlesungstitel}
\author{Dozentin / Dozent\\Universität}
\date{Semester / Jahr}
\begin{document}
\maketitle
\tableofcontents
\newpage
\section{Grundlagen}\label{sec:grundlagen}
\subsection{Lernziele}
Nach dieser Einheit können Sie die zentralen Begriffe erklären und anwenden.
\begin{definition}[Beispielbegriff]
Hier steht die Definition.
\end{definition}
\begin{theorem}\label{thm:beispiel}
Hier steht eine zentrale Aussage.
\end{theorem}
\begin{proof}
Hier steht die Argumentation.
\end{proof}
\begin{example}
Ein ausgearbeitetes Beispiel zur Veranschaulichung.
\end{example}
\begin{exercise}
Wenden Sie Satz~\ref{thm:beispiel} auf ein eigenes Beispiel an.
\end{exercise}
\section{Vertiefung}
Hier beginnt die nächste Einheit.
\end{document}
`,
  },
  {
    id: "exercises",
    name: "Übungs- / Prüfungsblatt",
    subtitle: "Aufgaben, Punkte & Lösungen",
    mark: "✓",
    content: String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[ngerman]{babel}
\usepackage{amsmath,amssymb,graphicx}
\usepackage[margin=2.5cm]{geometry}
\newif\ifsolutions
\solutionsfalse % Für das Lösungsblatt durch \solutionstrue ersetzen.
\title{Veranstaltung -- Übungsblatt 1}
\author{Institut / Universität}
\date{Abgabe: Datum eintragen}
\begin{document}
\maketitle
\noindent Name: \hrulefill\quad Matrikelnummer: \hrulefill
\bigskip
\noindent\textbf{Hinweise:} Begründen Sie Ihre Antworten und geben Sie Rechenwege an.
\begin{enumerate}
  \item \textbf{Grundlagen (5 Punkte)}\\
  Erläutern Sie die zentralen Begriffe der letzten Vorlesung.
  \ifsolutions\par\textit{Lösung:} Hier steht die Musterlösung.\fi
  \vspace{2cm}
  \item \textbf{Anwendung (10 Punkte)}\\
  Berechnen Sie das Integral
  \[
    \int_0^1 x^2\,\mathrm{d}x.
  \]
  \ifsolutions\par\textit{Lösung:} $[x^3/3]_0^1=1/3$.\fi
  \vspace{2cm}
  \item \textbf{Transfer (5 Punkte)}\\
  Entwickeln Sie ein eigenes Anwendungsbeispiel.
  \ifsolutions\par\textit{Lösung:} Individuelle Begründung.\fi
\end{enumerate}
\end{document}
`,
  },
  {
    id: "article",
    name: "Artikel",
    subtitle: "Für Ideen, Notizen & Paper",
    mark: "Aa",
    content: welcome,
  },
  {
    id: "report",
    name: "Wissenschaftliche Arbeit",
    subtitle: "Mit Kapiteln & Inhaltsverzeichnis",
    mark: "01",
    content: String.raw`\documentclass[11pt,a4paper]{report}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[ngerman]{babel}
\usepackage{amsmath,graphicx,hyperref}
\usepackage[margin=2.5cm]{geometry}
\title{Titel der Arbeit}
\author{Dein Name}
\date{\today}
\begin{document}
\maketitle
\tableofcontents
\chapter{Einleitung}
Hier beginnt deine Arbeit.
\chapter{Grundlagen}
\chapter{Ergebnisse}
\chapter{Fazit}
\end{document}
`,
  },
  {
    id: "letter",
    name: "Brief",
    subtitle: "Persönlich & auf den Punkt",
    mark: "↗",
    content: String.raw`\documentclass[11pt,a4paper]{letter}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[ngerman]{babel}
\usepackage[margin=2.5cm]{geometry}
\signature{Dein Name}
\address{Dein Name\\Deine Straße 1\\12345 Deine Stadt}
\begin{document}
\begin{letter}{Empfänger\\Straße 2\\12345 Stadt}
\opening{Sehr geehrte Damen und Herren,}
hier ist Platz für deine Nachricht.
\closing{Mit freundlichen Grüßen}
\end{letter}
\end{document}
`,
  },
  {
    id: "blank",
    name: "Leeres Dokument",
    subtitle: "Alles beginnt mit dir",
    mark: "+",
    content:
      "\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n\\usepackage{amsmath,graphicx}\n\n\\begin{document}\n\n% Dein Text beginnt hier.\n\\null\n\n\\end{document}\n",
  },
];
export const snippets = [
  {
    name: "Überschrift",
    category: "Struktur",
    code: "\\section{Überschrift}\n",
    description: "Einen neuen Abschnitt beginnen",
  },
  {
    name: "Unterüberschrift",
    category: "Struktur",
    code: "\\subsection{Unterüberschrift}\n",
    description: "Gedanken weiter gliedern",
  },
  {
    name: "Formel",
    category: "Mathematik",
    code: "\n\\begin{equation}\n  E = mc^2\n\\end{equation}\n",
    description: "Eine nummerierte Gleichung",
  },
  {
    name: "Inline-Formel",
    category: "Mathematik",
    code: "$x^2 + y^2 = z^2$",
    description: "Mathematik direkt im Text",
  },
  {
    name: "Matrix",
    category: "Mathematik",
    code: "\n\\[\n  \\begin{pmatrix}\n    a & b \\\\\n    c & d\n  \\end{pmatrix}\n\\]\n",
    description: "Eine Matrix mit runden Klammern",
  },
  {
    name: "Aufzählung",
    category: "Text",
    code: "\n\\begin{itemize}\n  \\item Erster Punkt\n  \\item Zweiter Punkt\n\\end{itemize}\n",
    description: "Eine übersichtliche Liste",
  },
  {
    name: "Nummerierte Liste",
    category: "Text",
    code: "\n\\begin{enumerate}\n  \\item Erster Schritt\n  \\item Zweiter Schritt\n\\end{enumerate}\n",
    description: "Schritt für Schritt",
  },
  {
    name: "Zitat",
    category: "Text",
    code: "\n\\begin{quote}\n  Ein Gedanke, der bleibt.\n\\end{quote}\n",
    description: "Ein Zitat hervorheben",
  },
  {
    name: "Link",
    category: "Text",
    code: "\\href{https://example.com}{Linktext}",
    description: "Benötigt das Paket hyperref",
  },
  {
    name: "Querverweis",
    category: "Text",
    code: "\\ref{sec:beispiel}",
    description: "Auf ein Label im Dokument verweisen",
  },
  {
    name: "Literaturverweis",
    category: "Text",
    code: "\\cite{quelle}",
    description: "Eintrag aus deinem Literaturverzeichnis",
  },
  {
    name: "Seitenumbruch",
    category: "Struktur",
    code: "\n\\newpage\n",
    description: "Auf einer neuen Seite fortfahren",
  },
];
export function outline(source: string) {
  return source.split("\n").flatMap((text, index) => {
    if (text.trimStart().startsWith("%")) return [];
    const match = text.match(
      /\\(chapter|section|subsection|subsubsection)\*?(?:\[[^\]]*\])?\{([^}]+)\}/,
    );
    return match
      ? [
          {
            title: match[2],
            level: [
              "chapter",
              "section",
              "subsection",
              "subsubsection",
            ].indexOf(match[1]),
            line: index + 1,
          },
        ]
      : [];
  });
}
export function wordCount(source: string) {
  const text = source
    .replace(/(?<!\\)%.*$/gm, "")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, " ")
    .replace(/[{}$&\\^_~]/g, " ");
  return text.trim().split(/\s+/).filter(Boolean).length;
}
export function tableSnippet(
  rows: number,
  cols: number,
  caption: string,
  professional = false,
) {
  const cells = (row: number) =>
    Array.from({ length: cols }, (_, col) =>
      row === 0 ? `Spalte ${col + 1}` : `Wert ${row}.${col + 1}`,
    ).join(" & ") + " \\\\";
  const code = `\n\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{${"l".repeat(cols)}}\n    \\hline\n    ${cells(0)}\n    \\hline\n${Array.from({ length: rows }, (_, i) => "    " + cells(i + 1)).join("\n")}\n    \\hline\n  \\end{tabular}\n  \\caption{${escapeTex(caption)}}\n  \\label{tab:beispiel}\n\\end{table}\n`;
  return professional
    ? code
        .replace("\\hline", "\\toprule")
        .replace("\\hline", "\\midrule")
        .replace("\\hline", "\\bottomrule")
    : code;
}
export function escapeTex(text: string) {
  return text.replace(
    /[\\{}%&#_$~^]/g,
    (ch) =>
      ({
        "\\": "\\textbackslash{}",
        "~": "\\textasciitilde{}",
        "^": "\\textasciicircum{}",
      })[ch] ?? "\\" + ch,
  );
}
export function parseErrors(log: string) {
  const result: { message: string; line?: number; file?: string }[] = [];
  const lines = log.split("\n");
  lines.forEach((line, index) => {
    const location = line.match(/([^\r\n]*?\.tex):(\d+):\s*(.+)/);
    if (location)
      result.push({
        message: location[3],
        line: Number(location[2]),
        file: location[1].trim().replaceAll("\\", "/").replace(/^\.\//, ""),
      });
    else if (line.startsWith("!")) {
      const next = lines
        .slice(index + 1, index + 7)
        .join("\n")
        .match(/l\.(\d+)/);
      result.push({
        message: line.slice(1).trim(),
        line: next ? Number(next[1]) : undefined,
      });
    }
  });
  return result.filter(
    (error, index) =>
      result.findIndex(
        (other) =>
          other.message === error.message &&
          other.line === error.line &&
          other.file === error.file,
      ) === index,
  );
}
