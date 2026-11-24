# SimpleLexEditor 1.6 – Auslieferung und Freigabe

SimpleLexEditor 1.6 wird als vollständiger Offline-Installer für lokale wissenschaftliche LaTeX-Arbeiten unter Windows x64 gebaut. Ein lokal gebauter, unsignierter Kandidat ist **keine bestätigte öffentliche Produktionsfreigabe**. Die konkrete Paketart, Signaturen und der Prüfstatus stehen in `release/release-manifest.json`.

## Technischer Umfang

- Windows 10/11 x64, Microsoft Edge WebView2 Runtime ab Version 125. Der Installer prüft die Mindestversion. Die PDF-Anzeige verwendet die kompatiblere PDF.js-Variante; Schriften, CMaps und Bilddecoder werden lokal mitgeliefert.
- UTF-8-Projekte mit sichtbarem Quellcode, mehreren Dateien, Mathematik, Literatur, Querverweisen und echten lokalen PDFs. pdfLaTeX, XeLaTeX und LuaLaTeX werden mit vorhandenen TeX-Installationen getestet; Tectonic ist eine optionale, gesondert zu validierende Konfiguration.
- Der Installer enthält die Offline-Installation von WebView2 und die vollständige TeX-Live-Paketsammlung aus TinyTeX-2, einschließlich pdfLaTeX, XeLaTeX, LuaLaTeX, BibTeX und Biber. Das Setup entpackt diese Ressourcen automatisch. Die portable Ausgabe entpackt das mitgelieferte, vor Ausführung auf SHA-256 geprüfte TeX-Archiv beim ersten Start. Keine separate TeX-Installation und kein Nachladen von Paketen auf dem Nutzerrechner erforderlich. Ein ausdrücklich gewählter eigener TeX-Ordner bleibt optional; Tectonic gehört nicht zum eingebauten Umfang.
- Quelltextspeicherung prüft die vorher gelesene Fassung. Externe Änderungen werden verglichen; eine neue Datei kann beide Fassungen erhalten. Gleichzeitige SimpleLexEditor-Schreibzugriffe werden über eine Dateisperre serialisiert.
- Ungespeicherte Entwürfe werden nach einer kurzen Schreibpause zusätzlich im Projekt unter `.roxena/recovery/` gesichert. Versionsverlauf und Wiederherstellung bewahren bis zu 20 Fassungen je Dateipfad auf. Das Erstellen einer zweiten externen Sicherung bleibt sinnvoll; die interne Sicherung schützt nicht vor dem Verlust des gesamten Datenträgers.
- Neue PDF-Daten ersetzen die sichtbare Seite erst nach erfolgreichem Rendern. Fehlerhafte Kompilierungen behalten die letzte erfolgreiche PDF; die Oberfläche kennzeichnet veraltete Ansichten.
- Compilerprozesse lassen sich abbrechen. Unter Windows gehören die gestarteten Prozesse zu einer Job-Gruppe und werden beim Abbruch, Zeitlimit oder Prozessende beendet. Standardzeitlimit: 180 Sekunden, einstellbar bis 30 Minuten.
- Build-Dateien sind nach Hauptdokument und Compiler getrennt. Jeder Lauf verwendet ein eigenes Arbeitsverzeichnis, damit alte Bibliografiedateien und gleichnamige Hauptdokumente keine falschen Ergebnisse verursachen. Die drei jüngsten abgeschlossenen Arbeitsverzeichnisse je Kombination bleiben erhalten.
- ZIP-Export wird auf Datenträger aufgebaut und erst nach Fertigstellung übernommen. Komprimierte Forschungsressourcen wie `dataset.csv.gz` sind enthalten; `.roxena/` und das Zielarchiv selbst sind ausgeschlossen.

## Transparente Grenzen

- Lokaler Editor ohne Cloud-Zusammenarbeit, Benutzerkonten oder automatische Online-Updates. Aktualisierungen erfolgen über einen neueren Installer aus derselben vertrauenswürdigen Bezugsquelle.
- Bidirektionales SyncTeX, anklickbare PDF-Links, PDF-interne Volltextsuche sowie automatische Index-/Glossarprozessoren sind nicht enthalten. Projektweite Quelltextsuche, direkte PDF-Seiteneingabe und PDF-Textauswahl sind vorhanden.
- LaTeX-Ausführung ist kein Sandbox-Verfahren. Shell-Escape ist deaktiviert; Projekte mit externen Generatoren müssen ihre Ressourcen außerhalb von SimpleLexEditor erstellen. Öffne vertrauenswürdige Projekte.
- Einzelne Textdateien: maximal 10 MB. PDF-Anzeige: maximal 100 MB PDF-Daten, begrenzte Rasterauflösung. Projektstruktur: maximal 10.000 Einträge und 16 Unterordnerebenen. ZIP-Quelldaten: maximal 4 GB. Der automatisch geladene Textindex ist begrenzt; ausgelassene Dateien werden angezeigt und bleiben einzeln bearbeitbar.
- Ältere Latin-1-/Windows-1252-Dateien müssen vor dem Bearbeiten nach UTF-8 konvertiert werden. SimpleLexEditor nimmt keine stille Zeichensatzumwandlung vor.
- Dateiverweise im LaTeX-Code werden bei Umbenennungen nicht automatisch umgeschrieben.

## Wiederholbare Prüfung

```powershell
npm ci
npm test
npx playwright install chromium
npm run test:e2e
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm audit
node scripts/checks/audit-rust.mjs
node scripts/release/generate-notices.mjs
npm run build:desktop
powershell -ExecutionPolicy Bypass -File tests/native/native-check.ps1 -IncludeScientific
powershell -ExecutionPolicy Bypass -File scripts/release/release.ps1 -SkipBuild
node scripts/release/verify-release.mjs
```

Für die Paketierung brauchst du das in `scripts/build/tex-runtime.lock.json` festgelegte Archiv. Wenn der tägliche Upstream-Build inzwischen ersetzt wurde, setze `SIMPLELEXEDITOR_TEX_ARCHIVE` vor `npm run build:desktop` auf den Pfad einer archivierten Kopie. Das Skript prüft Größe und SHA-256. Details stehen unter [Mitgelieferte LaTeX-Umgebung](BUNDLED_TEX.md#wiederholbare-builds).

Die native Prüfung startet eine eigene versteckte SimpleLexEditor-Instanz mit separatem WebView-Profil, Testprojekt und Debug-Port. Sie verändert keine Benutzerprojekte. Die Prüfungen umfassen reale PDFs, wiederholten PDF-Wechsel, Speicherkonflikte, Versionswiederherstellung, gelöschte Dateien, gesperrten Web-Speicher, Compilerabbruch, Werkzeugerkennung, mehrteilige Dokumente, BibTeX/Biber, drei Compiler und ein Projekt mit 1.000 Dateien. Das Ergebnis bindet sich über SHA-256 an genau die geprüfte ausführbare Datei.

GitHub Actions prüft bei Pushes und Pull Requests den Quellcode, die Browserabläufe, Rust und die Abhängigkeiten. Aktiviere beim manuellen Start des Workflows `offline_package`, um zusätzlich das Windows-Paket zu bauen und zu prüfen. Wenn das festgelegte Archiv im Actions-Cache fehlt, kannst du über `tex_archive_url` eine HTTPS-Downloadadresse für die passende Kopie angeben.

## Öffentliche Windows-Freigabe

1. Einen passenden Herausgeber und einen funktionierenden Supportkanal festlegen. Nutzungsbedingungen und Veröffentlichungsunterlagen für das eigene Produkt vor dem öffentlichen Download prüfen.
2. Mit dem vorhandenen Code-Signing-Zertifikat oder Signierdienst **Programm und Installer** signieren. Tauri unterstützt dafür unter anderem `bundle.windows.certificateThumbprint`, `digestAlgorithm` und `timestampUrl`. Die privaten Schlüssel bleiben beim Herausgeber. Sie gehören weder in das Repository noch in einen Chat. [Tauri: Windows-Signierung](https://v2.tauri.app/distribute/sign/windows/)
3. Die native Prüfung mit der signierten Programmdatei erneut ausführen. Danach `release.ps1 -SkipBuild -Production` verwenden. Dieser Modus verweigert ungültige oder fehlende Signaturen, fehlende passende native Prüfungen und bekannte Abhängigkeitsmeldungen.
4. Installation, Upgrade mit vorhandenen Dokumenten, Deinstallation ohne Dokumentverlust und den ersten Start ohne vorhandene TeX-Installation auf einem frischen Windows-System prüfen. Anschließend eine kleine Pilotgruppe mit eigenen wissenschaftlichen Projekten testen lassen. Diese unabhängigen Abnahmen können auf dem Entwicklungsrechner nicht bestätigt werden.

Der Freigabestatus muss zur tatsächlich durchgeführten Prüfung passen. Der Installer und das portable ZIP enthalten SimpleLexEditors MIT-Lizenz in `LICENSE` sowie Hinweise und Quellenverweise zu eingebundenen Komponenten in `THIRD_PARTY_NOTICES.txt`.
