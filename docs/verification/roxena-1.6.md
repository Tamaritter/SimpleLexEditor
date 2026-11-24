# Roxena 1.6 – mitgelieferte LaTeX-Umgebung und automatische Reparatur

Prüfdatum: **17. November 2026**, Windows x64. Die vollständige native Prüfung endete um `2026-11-17T16:23:14.6774078Z` erfolgreich. Die Programmdatei war während der Prüfung unverändert.

SHA-256 der geprüften `roxena.exe`:

```text
b4fe2fb29213ae722e1bcfa130795df35201b2656eb6c13246916ce36a5b280a
```

## Umfang und Ergebnisse

| Prüfung | Ergebnis |
| --- | --- |
| Frontend-Unit-Tests | 163 bestanden; einschließlich automatischer Reparaturrunden, Dokumentbeginn, Hauptdokumentwahl und TeX-Live-Metadaten |
| Browserabläufe | 34 bestanden; einschließlich blockierter Projektaktionen und Tastenkürzel während der Ersteinrichtung |
| Rust-Tests | 15 bestanden; einschließlich Windows-Pfadnormalisierung, Speicher- und Prozessschutz |
| Mitgelieferte Werkzeuge | pdfLaTeX, XeLaTeX, LuaLaTeX, BibTeX und Biber aus `TinyTeX/bin/windows` bestätigt |
| Vorlagen | Alle sieben Vorlagen mit dem enthaltenen pdfLaTeX; Beispieldokument zusätzlich mit XeLaTeX und LuaLaTeX kompiliert |
| PDF und Arbeitsbereich | Mehrseitige PDF mit Textauswahl, wiederholte Aktualisierung, letzte erfolgreiche PDF bei Fehlern, Quellenpositionen, Suche und Sitzungswiederherstellung bestanden |
| Datensicherheit | Dauerhafte Entwürfe, externe Konflikte, getrennte Kopien, Versionsverlauf, gelöschte Dateien, Compilerabbruch, Pfadschutz und 1.000-Dateien-Projekt bestanden |
| Compilerhilfe | Sechs aufeinanderfolgende echte Fehler, Sicherungen, veraltete Korrekturvorschau, fehlende Pakete und Unicode-Compilerwechsel bestanden |
| Automatische Reparatur | Ein Klick für fehlenden Dokumentbeginn und mehrere unterschiedliche Fehler; zwölf aufeinanderfolgende Fehler samt Erhalt der Ausgangsfassung; Präambeltext erhalten; eindeutige Hauptdokumentwahl und Unicode-Compilerwechsel; Stopp bei unbekannten Makros und Abbruch bestanden |
| Projektdateien | Anlegen, Umbenennen, reversibler Papierkorb, Hauptdokumentwahl und separate Kapitelvorschau bestanden |
| Wissenschaft | Formeln, Sätze, Labels, echte BibTeX- und Biber-Literaturverzeichnisse sowie erzeugte PDFs bestanden |
| Forschungsabläufe | Projektprüfung, Formelindex, lokaler BibTeX-Import, Duplikaterhalt und Mehrfachzitate mit Seitenangabe bestanden |
| Installer | Offline-WebView2, TeX-Payload und NSIS-Hooks vorhanden; Archivprüfung erfolgreich |

Die native Testinstanz erhielt ausschließlich Windows-Systemordner im `PATH` und eine absichtlich ungültige fremde `TEXMFCNF`-Einstellung. Alle Standardwerkzeuge mussten aus der integrierten Umgebung stammen. Eine vorhandene Entwicklerinstallation wurde damit nicht als Compilerquelle verwendet. Testprojekte und WebView-Profil waren getrennt von Benutzerprojekten.

Ein erster Durchlauf endete in einem Test zur Dateiwiederherstellung, weil dieser die Datei unmittelbar nach dem Klick auf „Rückgängig“ las. Die Wiederherstellung selbst war erfolgreich. Nach Ergänzung einer Wartebedingung auf den tatsächlichen Dateiinhalt bestand die vollständige Suite mit unveränderter Programmdatei.

Das automatische Entpacken des vollständigen TeX-Archivs wurde zuvor in einer separaten portablen Testinstanz geprüft. Die abschließende native Abnahme nutzte die bereits eingerichtete Umgebung im gleichen Verzeichnisaufbau wie der Installer. Ein end-to-end ausgeführtes Setup auf einem frischen Windows-System wird dadurch nicht ersetzt.

## Auslieferung

Der Installer enthält WebView2 und das unveränderte TinyTeX-2-Archiv mit der vollständigen TeX-Live-Paketsammlung. Das TeX-Archiv hat die SHA-256 `bc87b62b6875d6dbfd39026e5adabe47b54fe97d74b3550d00e6cd156e0c22eb` und umfasst rund 1,71 GB komprimiert beziehungsweise 4,68 GB entpackt. Das gesamte Setup umfasst rund 1,94 GB.

Der Bericht `.tools/release-verification.json` bindet die native Prüfung an die oben genannte Programmdatei. `release/release-manifest.json` und `release/SHA256SUMS.txt` beschreiben das daraus verpackte Paket. `scripts/verify-release.mjs` prüft Versionsgleichheit, TeX-Prüfsumme, WebView2-Offline-Modus, Installer und das portable Archiv mit gestreamten Dateivergleichen.

## Noch ausstehende öffentliche Abnahme

Programm und Installer sind unsigniert. Installation, Upgrade und Deinstallation auf einem frischen Windows-System ohne vorhandene TeX- und WebView2-Installation bleiben unabhängig zu prüfen. Die aktualisierte GitHub-Actions-Konfiguration wurde lokal vorbereitet, aber in dieser Sitzung nicht auf GitHub ausgeführt. Der Stand ist ein lokal geprüfter Testkandidat und keine öffentliche Produktionsfreigabe.

Details zur Paketierung stehen unter [Mitgelieferte LaTeX-Umgebung](../BUNDLED_TEX.md). Die Freigabeschritte stehen unter [Auslieferung und Freigabe](../RELEASE.md). Der frühere Stand ist im [Prüfbericht für 1.5](roxena-1.5.md) dokumentiert.
