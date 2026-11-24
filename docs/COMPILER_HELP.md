# Compilerhilfe

SimpleLexEditor bietet im Problempanel und bei fehlgeschlagener PDF-Erstellung **Compilerfehler beheben** an. Warnungen lassen sich über **Hinweise prüfen** bearbeiten. Jede Meldung erhält eine verständliche Erklärung und passende Aktionen. Die erste Ursache steht vor Folgefehlern wie „Emergency stop“; deren zusätzliche Quellposition wird bei fehlenden Dateien der eigentlichen Ursache zugeordnet.

## Alle Fehler automatisch beheben

Der gleichnamige Hauptknopf startet eine vollständige Reparaturrunde: SimpleLexEditor kompiliert, behebt erkannte eindeutige Ursachen und kompiliert erneut, bis die PDF erfolgreich erstellt ist. Ein Durchlauf umfasst bis zu 24 Reparaturschritte. Fortschritt und **Abbrechen** bleiben im Dialog sichtbar. Wiederholte wirkungslose Korrekturen werden angehalten.

Vor Änderungen werden Fassungen im Versionsverlauf gesichert. Auch bei vielen aufeinanderfolgenden Reparaturen bleibt die Ausgangsfassung jeder geänderten Datei erhalten. Offene Änderungen werden berücksichtigt; Speicherkonflikte halten die Reparatur an. **Änderungen einzeln prüfen (optional)** bietet weiterhin die Vorschau und die manuelle Übernahme einzelner Vorschläge. Meldungsdetails und zusätzliche Aktionen stehen unter **Weitere Hilfe**.

SimpleLexEditor kann bei einem separat kompilierten Kapitel ein eindeutig zugehöriges Hauptdokument auswählen. Benötigt fontspec einen anderen Compiler, wählt die Reparatur einen verfügbaren XeLaTeX- oder LuaLaTeX-Compiler. Bei einer unbekannten oder uneindeutigen Ursache hält der Ablauf mit einer Erklärung an.

## Unterstützte Quelltextkorrekturen

| Problem | Verhalten |
| --- | --- |
| Satz, Definition oder Beweis in `\[ … \]` | Textumgebung herauslösen; Formeln und Kommentare erhalten. |
| Vollständige Gleichungsumgebung zusätzlich in `\[ … \]` | Überflüssige äußere Mathematikklammern entfernen. |
| Bekannter unbekannter Befehl | Benötigtes Paket ergänzen, beispielsweise amsmath, amssymb, graphicx, hyperref, booktabs, xcolor oder siunitx. Der tatsächlich unbekannte Befehl wird aus dem Fehlerkontext ermittelt. |
| Häufiger eindeutiger Befehlsfehler | Beispielsweise `\textbold` zu `\textbf` oder `\includegraphic` zu `\includegraphics` korrigieren. Eigene unbekannte Makros werden nicht umbenannt. |
| Bekannte undefinierte Umgebung | Paket oder Satzdefinition ergänzen, einschließlich align, cases, Matrizen, tikzpicture, lstlisting, longtable und multicols. |
| Fehlende Projektdatei | Bei genau einer passenden vorhandenen Datei ihren Pfad vorschlagen. Bei mehreren gleichnamigen Dateien bleibt die Wahl beim Nutzer. |
| Mathematisches Unicode-Zeichen | Bekannte griechische Buchstaben, Relationszeichen, Mengen, Pfeile und Operatoren als LaTeX-Befehl mit `\ensuremath` setzen. |
| Falscher Umgebungsabschluss | Eindeutigen falschen Abschlussnamen korrigieren. Fehlende verschachtelte Umgebungen werden nicht auf Verdacht ergänzt. |
| Einzelnes ungeschütztes `&` im Fließtext | Als `\&` setzen; Mathematik und Tabellen bleiben ausgenommen. |
| Alleinstehendes `\\` nach Leerzeile | Im normalen Dokumenttext durch `\par` ersetzen. |
| Fehlendes `\begin{document}` | Nach einer eindeutig erkannten, vollständig gelesenen Präambel ergänzen. Bei unklaren eigenen Präambelbefehlen bleibt die Wahl beim Nutzer. |
| Versehentlich vor `\begin{document}` geschriebener Text oder Verweis | Eindeutig erkannte Absätze und vollständige Verweise in den Dokumentteil verschieben und ihren Inhalt erhalten. |
| `figure` oder `table` vor `\begin{document}` | Vollständige, ausgewogen geschlossene Blöcke einschließlich verschachtelter Umgebungen, Bildpfaden, Beschriftungen und Labels in ihrer Reihenfolge in den Dokumentteil verschieben. Offene Blöcke und dynamische Abschlüsse bleiben zur manuellen Bearbeitung. |
| Fehlendes `\end{document}` | Nur ergänzen, wenn das übrige Dokumentgerüst, die Umgebungen und die Klammerbilanz dazu passen. |
| Bewusst leeres Dokument ohne PDF-Seite | `\null` ergänzen. |
| Unbekannte Platzierungsoption `[H]` | Paket float ergänzen. |
| Groß-/Kleinschreibung in Zitaten oder Verweisen | Nur an einen tatsächlich vorhandenen eindeutigen Schlüssel anpassen. |

Korrekturen berücksichtigen offene, ungespeicherte Dateien und eingebundene Präambeln. Kommentare, `\verb` und wörtliche Quellcodebeispiele werden von der Textanalyse ausgenommen. Vor dem Übernehmen werden die Quelldateien nochmals geprüft und bisherige Fassungen im Versionsverlauf gesichert. Externe Änderungen lösen weiterhin die Speicherkonfliktprüfung aus.

Mit **Übernehmen und kompilieren** lässt sich alternativ ein einzelner geprüfter Vorschlag übernehmen. Bei weiteren Ursachen bietet der Dialog erneut Vorschläge an. Bei Erfolg wird die PDF geöffnet.

## Direkte Hilfe bei weiteren Ursachen

| Bereich | Passende Aktionen und Hinweise |
| --- | --- |
| Fehlender Compiler, BibTeX oder Biber | TeX-Installation prüfen, installierten Compiler auswählen, Werkzeugordner einstellen. |
| Fehlende Pakete oder Dokumentklassen | Dateinamen und projektspezifische Klassen prüfen; mitgelieferte LaTeX-Umgebung prüfen und bei beschädigten Ressourcen den vollständigen SimpleLexEditor-Installer erneut ausführen. |
| fontspec, Schrift- oder Unicode-Probleme | Einen gefundenen XeLaTeX- oder LuaLaTeX-Compiler auswählen und direkt erneut kompilieren; ohne passenden Compiler die Installationsprüfung öffnen. |
| Zeitlimit, Rechte, blockierte Ausgabe, zweite App-Instanz | Compiler-Einstellungen öffnen, Installation prüfen oder erneut kompilieren. |
| Unvollständige Argumente, Klammern, Längen oder Listen | Fehlerstelle und Fehlerkontext öffnen; nach dem betroffenen Befehl im Projekt suchen. |
| Paketoptionen, doppelte Definitionen oder Präambelbefehle im Text | Fehlerstelle, Projektanalyse und vollständiges Protokoll öffnen. |
| Fehlende oder doppelte Labels und Zitate | Direkt zu Querverweisen oder Literaturverwaltung wechseln. |
| Falsches Hauptdokument oder separat kompiliertes Kapitel | Vorschaudokument in den Compiler-Einstellungen auswählen. |
| Bilder, EPS und Shell-Escape | Dateiformat und Konvertierungsbedarf erklären. Shell-Escape wird nicht automatisch eingeschaltet. |
| Tabellen, Gleitumgebungen und überstehende Inhalte | Konkrete Hinweise zu Spalten, Platzierungsoptionen, Breiten und Zeilenumbrüchen anzeigen. |
| Rekursion, Kapazitätsüberschreitung oder unbekannte Paketfehler | Quellposition, Kontext und vollständiges kopierbares Protokoll bereitstellen. |

Ein beliebiges LaTeX-Makroprogramm lässt sich nicht zuverlässig allgemein reparieren. Bei uneindeutigen Fällen bleiben Dokumentinhalt, Paketoptionen und fachliche Aussagen unverändert; der Dialog führt zur passenden Bearbeitungsstelle. Pakete werden nicht ohne Nutzeraktion installiert.

Auch die Einfügehilfe beugt Fehlern vor: Sätze, Definitionen und Beweise werden hinter einer umgebenden abgeschlossenen Formel eingefügt. Fehlt deren Abschluss, erklärt SimpleLexEditor zuerst das Problem, bevor Text oder Präambel geändert werden.

Importierte Abbildungen werden ebenfalls im Dokumentteil außerhalb einer vorhandenen Formel eingefügt. Steht der Cursor in der Präambel, wird die Abbildung vor dem Dokumentabschluss eingesetzt. Das benötigte Paket `graphicx` wird automatisch im Hauptdokument ergänzt.

## Prüfung und Referenzen

Unit-Tests prüfen Erkennung, Vorschläge, Quelldateizuordnung, den automatischen Ablauf und unveränderte uneindeutige Fälle. Der native Test `tests/native/check-compiler-fixes.ps1` prüft manuelle Übernahme, ungespeicherte Änderungen, Sicherungen, externe Änderungen, Paketinstallationshilfe und Unicode-Compilerwechsel. `tests/native/native-automatic-repairs.mjs` prüft die Ein-Klick-Reparatur mit echten Compilern: fehlenden Dokumentbeginn, mehrere verschiedene Fehler, zwölf aufeinanderfolgende Fehler samt Erhalt der Ausgangsfassung, verschobenen Präambeltext, Compiler- und Hauptdokumentwahl, unbekannte Makros und Abbruch.

`tests/native/check-compiler-fixes.ps1 -Binary src-tauri/target/debug/simplelexeditor.exe -Script native-figure-repairs.mjs` prüft zusätzlich den Fehler an `main.tex:13` mit einem echten Bild, gesicherter Ausgangsfassung und erzeugter PDF. Der Test deckt einen tatsächlich fehlenden Dokumentbeginn, unveränderte offene Abbildungsblöcke sowie den Bildimport bei Cursorpositionen in der Präambel und im Mathematikmodus ab. Nur die Betriebssystem-Dateiauswahl wird dabei ersetzt; Import und Kompilierung verwenden das echte Desktop-Backend.

Die Erklärungen orientieren sich an [Learn LaTeX: Fehlermeldungen](https://www.learnlatex.org/en/lesson-15), der [LaTeX-Dokumentation](https://www.latex-project.org/help/documentation/), [AMS math auf CTAN](https://ctan.org/pkg/amsmath), [Zitaten und Literaturverzeichnissen](https://www.learnlatex.org/en/lesson-12) und der [MiKTeX-Console-Anleitung](https://miktex.org/howto/miktex-console).
