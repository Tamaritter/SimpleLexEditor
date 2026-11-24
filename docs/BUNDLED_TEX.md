# Mitgelieferte LaTeX-Umgebung

SimpleLexEditor liefert LaTeX als Bestandteil des Produkts aus. Der Nutzer installiert ausschließlich SimpleLexEditor und kann anschließend offline schreiben, kompilieren und Literaturverzeichnisse erzeugen.

## Enthaltene Komponenten

- TeX Live über das unveränderte TinyTeX-2-Windows-Archiv mit `scheme-full`.
- pdfLaTeX, XeLaTeX, LuaLaTeX, BibTeX und Biber sowie TeX-Live-Pakete und mitgelieferte Schriften.
- WebView2-Offline-Installer im SimpleLexEditor-Setup; PDF-Renderer und App-Schriften sind ebenfalls lokal enthalten.

`src-tauri/resources/WebView2Loader.dll` entspricht dem x64-Loader aus `webview2-com-sys`, dessen Version `src-tauri/Cargo.lock` festlegt. Die portable Ausgabe legt die DLL neben `simplelexeditor.exe` ab.

Eigene Dokumentklassen, kostenpflichtige oder persönliche Schriften, Bilder und Daten bleiben Bestandteil des jeweiligen Projekts. Externe Generatoren mit Shell-Escape sowie Tectonic sind keine Voraussetzung für den SimpleLexEditor-Standardablauf.

## Installation und Laufzeit

Der NSIS-Installer entpackt das TeX-Archiv unter `tex/TinyTeX` im SimpleLexEditor-Installationsordner. Er markiert die fertige Umgebung mit der festgelegten Archiv-SHA-256 und entfernt das komprimierte Archiv nach erfolgreichem Entpacken. Der Uninstaller entfernt nur die verwalteten TeX-Ressourcen im Installationsordner; Projektordner werden nicht angerührt.

Die portable Ausgabe behält `tex-runtime.exe` neben der Anwendung. Beim ersten Kompilieren wird das Archiv auf Größe und SHA-256 geprüft und in einem eindeutigen Zwischenordner unter den lokalen SimpleLexEditor-Benutzerdaten entpackt. Erst nach erfolgreicher Prüfung der notwendigen Werkzeuge wird der Ordner als aktive Umgebung übernommen. Eine Dateisperre verhindert gleichzeitige Installationen durch mehrere Instanzen. Abgebrochene Zwischenordner werden nicht als fertige Umgebung akzeptiert.

Der erste portable Start kann beim Entpacken mehrere Minuten benötigen. Der vollständige Installer führt diesen Schritt schon während des Setups aus. Die TeX-Umgebung benötigt mehrere GB freien Speicherplatz; zusätzlich wird während des Setups Platz für das komprimierte Archiv und gegebenenfalls eine vorherige Version benötigt.

Die festgelegte Windows-Distribution umfasst rund 1,71 GB komprimiert und 4,68 GB entpackt. Der vollständige SimpleLexEditor-Installer ist einschließlich WebView2 rund 1,94 GB groß. Die Dauer der ersten Einrichtung hängt insbesondere von Datenträger und Virenscanner ab, weil knapp 200.000 Dateien entpackt werden.

Generierte Formate und Schriftindizes werden je Distributionsversion und Installationspfad getrennt gespeichert. Windows-Pfade bleiben für die internen Dateiprüfungen kanonisch; an die TeX-Werkzeuge werden sie ohne erweitertes Win32-Präfix übergeben, damit insbesondere LuaLaTeX seine Hilfsdateien wieder einlesen kann.

Compiler werden mit absolutem Pfad gestartet. Für die integrierte Umgebung werden deren Programmordner vorangestellt und private, beschreibbare Konfigurations- und Cacheordner verwendet. Externe TeX-Umgebungsvariablen werden für diese Prozesse bereinigt. Die globale Windows-PATH-Variable, Dateizuordnungen und bestehende MiKTeX-/TeX-Live-Installationen werden nicht verändert.

## Wiederholbare Builds

`scripts/build/tex-runtime.lock.json` legt Quelle, Version, Größe und SHA-256 fest. `scripts/build/prepare-tex.ps1` lädt das Archiv nur auf dem Buildrechner, prüft es und legt es unter `src-tauri/resources/tex-runtime.exe` ab. Alternativ kann `SIMPLELEXEDITOR_TEX_ARCHIVE` auf ein bereits gesichertes, passendes Archiv zeigen. Diese große Binärdatei wird nicht in Git eingecheckt.

`npm run build:desktop` lädt die Tauri-Konfiguration `src-tauri/tauri.offline.conf.json` für das vollständige Paket. Ohne das Archiv lässt sich die Desktop-App mit einer lokalen TeX-Installation entwickeln. [Entwicklungsumgebung einrichten](../CONTRIBUTING.md#desktop-app-starten).

Der Upstream veröffentlicht TinyTeX-2 als täglich ersetzten Build. Für reproduzierbare spätere Veröffentlichungen muss das freigegebene Archiv daher zusammen mit den Build-Artefakten aufbewahrt werden. Ein neuer Tagesbuild wird nicht stillschweigend akzeptiert. Bei einem bewussten Update müssen Lock, SHA-256 im Installer-Hook und native Prüfung gemeinsam aktualisiert werden.

`verify-release.mjs` prüft die TeX-SHA-256, den Offline-WebView2-Modus, die Installer-Vorlage und das portable Archiv einschließlich aller Ressourcen. Große Dateien werden dabei gestreamt. Die native Abnahme muss nachweisen, dass alle Standardwerkzeuge aus der integrierten Umgebung stammen und Vorlagen, BibTeX sowie Biber ohne externe Installation funktionieren. Ein frisches Windows-System ohne WebView2 bleibt die zusätzliche Abnahme für den vollständigen Setup-Ablauf.

## Drittanbieterhinweise

Die originalen TeX-Live-Lizenzdateien und Paketmetadaten bleiben erhalten. `THIRD_PARTY_NOTICES.txt` nennt die Distribution und deren Quellen. Grundlagen: [TinyTeX-Distribution](https://github.com/rstudio/tinytex-releases), [TeX-Live-Lizenzen](https://tug.org/texlive/copying.html), [Tauri-WebView2-Installationsoptionen](https://v2.tauri.app/distribute/windows-installer/#webview2-installation-options).
