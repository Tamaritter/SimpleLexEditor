# Roxena 1.5.0 – geprüfter Windows-Kandidat

Prüfdatum: **15. November 2026**. Plattform: Windows x64, lokale MiKTeX-Installation. Die native Prüfung der optimierten Programmdatei wurde am `2026-11-15T19:29:16.9832177Z` erfolgreich abgeschlossen.

SHA-256 der geprüften `roxena.exe`:

```text
b4e1d08a4c6fd97115f47107520eda6229eb4c83f3ca40929f78761c2f3e5a73
```

| Prüfung | Ergebnis |
| --- | --- |
| Browserabläufe | 25 bestanden; gegliederte Einstellungen, Befehlsuche nach mehreren Begriffen, Tastatursteuerung und Dialogfokus, geöffnete Dateien, automatisch sichtbare Tabs, Seitenleistenbreite per Maus und Tastatur, kleine Fenster sowie Projekt- und Wissenschaftsabläufe |
| Frontend-Unit-Tests | 32 bestanden, einschließlich Befehlsuche und bestehender Wissenschafts- und Speicherhelfer |
| Formatierung | Prettier bestanden; Rust-Implementierung unverändert |
| Reale Desktop-Arbeitsabläufe | Bestanden: PDF-Wechsel, Textauswahl, zurückhaltende Live-Fehleranzeige, explizite Fehlerberichte, Wiederherstellung ohne vorherige PDF, Suche, Tastaturbedienung und Sitzungswiederherstellung |
| Schutz von Projektänderungen | Bestanden: dauerhafte Entwürfe, externe Konflikte, Fassungsvergleich, separate Kopie, Versionsverlauf und Wiederherstellung gelöschter Dateien |
| Belastungs- und Fehlerfälle | Bestanden: 1.000 Projektdateien, gesperrter Web-Speicher, Compilerabbruch mit anschließend erfolgreichem Lauf, Pfadschutz und ZIP mit Forschungsdaten |
| Wissenschaftliche Projekte | Bestanden: Formeln, Sätze, Querverweise, mehrteilige Projekte, separate Kapitelvorschau, BibTeX und Biber |
| Compiler | pdfLaTeX, XeLaTeX und LuaLaTeX erfolgreich; Tectonic nicht vorhanden und nicht bestätigt |
| Abhängigkeitsmeldungen | Unveränderte Abhängigkeiten gegenüber 1.4.0; dort am selben Tag npm: 0 und OSV: 0 Treffer für 233 Windows-Rust-Abhängigkeiten |
| Auslieferungsdateien | Versionsgleichheit, CSP, Desktop-Berechtigungen, ZIP-Inhalte, Übereinstimmung mit Build-Dateien und SHA-256 geprüft |
| Freigabesperre | Fehlende Herausgeber-Signaturen verhindern `release.ps1 -Production` |

Der Prüfbericht `.tools/release-verification.json` bindet den nativen Durchlauf an die obige Programmdatei. Im Paketverzeichnis stehen `release-manifest.json` und `SHA256SUMS.txt`. Ein späterer Neubau oder eine Signierung erfordert eine neue passende Prüfung.

## Oberfläche

Eine 52 Pixel hohe Kopfzeile ersetzt die beiden bisherigen Leisten. Projektaktionen liegen im Projektmenü; Ansicht, Verlauf und Hilfe im Drei-Punkte-Menü. Einfügen, Mathematik und Wissenschaft bleiben am Editor erreichbar. Dateipfad und Kapitelzuordnung benötigen keine eigenen Zeilen über dem Code. Die Vorschau bündelt PDF-Dateiauswahl und Aktionen in einer Zeile. Gleichnamige Tabs erhalten eine Ordnerangabe. Die Dokumentstruktur ist einklappbar; die Auswahl bleibt beim Neustart erhalten. Einfügehilfen stehen in durchsuchbaren Karten, Kontraste und Abstände sind auf beide Farbmodi abgestimmt. Live-LaTeX-Fehler öffnen keine zusätzlichen Panels oder Meldungen. Ein manueller fehlerhafter Lauf öffnet den Bericht; Fehler stehen dort vor Warnungen. Ohne vorherige PDF bietet die Fehleransicht direkt „Probleme anzeigen“ an.

## Bedienung in Version 1.5

Die Einstellungen sind in „Arbeitsbereich“ und „LaTeX & PDF“ gegliedert. Das Befehlsmenü unterstützt mehrere Suchbegriffe, alternative Bezeichnungen und nicht verfügbare Aktionen. Die Dateiauswahl kann auf geöffnete Tabs begrenzt werden. Seitenleistenbreite, eingeklappte Dokumentstruktur und Dateisitzung werden gespeichert; die Breite passt sich an kleinere Fenster an.

## Installer-Paketierung

Die Programmdatei wurde erfolgreich gebaut und nativ geprüft. Der feste temporäre NSIS-Ausgabename war auf dem Entwicklungsrechner nicht beschreibbar. `scripts/bundle.ps1` verwendet in diesem Fehlerfall eine identische generierte Tauri-Vorlage mit einem eindeutigen temporären Ausgabenamen. Dabei werden keine Windows-Schutzeinstellungen verändert. `-PreserveBinary` hat die SHA-256 der geprüften Programmdatei unverändert erhalten.

Die Paketierung ergänzt für die installierte Tauri-CLI auch den älteren NSIS-Konfigurationsschlüssel für WebView2. Die erzeugte Installer-Vorlage enthält dadurch die Mindestversion `125.0.0.0`; die Paketprüfung kontrolliert diese Angabe. Der Installer-Bericht unter `.tools/installer-verification.json` hält Version und SHA-256 fest. `build.ps1` verwendet für reguläre Release-Builds die getrennten Schritte Programm bauen und Installer verpacken. Die CI-Konfiguration ist entsprechend vorbereitet.

## Noch ausstehende öffentliche Abnahme

Programm und Installer sind **unsigniert**. Ein Code-Signing-Zertifikat oder Signierdienst ist noch nicht vorhanden. Die GitHub-Actions-Konfiguration ist vorbereitet, wurde hier jedoch nicht auf GitHub ausgeführt. Installation, Upgrade und Deinstallation auf einem frischen Windows-System sowie unabhängige Tests mit wissenschaftlichen Nutzerprojekten sind noch nicht bestätigt.

Dieser Bericht dokumentiert einen geprüften Testkandidaten. Der unterstützte Umfang, die technischen Grenzen und die Freigabeschritte stehen unter [Auslieferung und Freigabe](../RELEASE.md).
