# An SimpleLexEditor mitarbeiten

## Ordner im Repository

| Ordner       | Inhalt                                                                                |
| ------------ | ------------------------------------------------------------------------------------- |
| `src/`       | Oberfläche und Logik, nach Funktionsbereichen wie Editor, Projekte und PDF gegliedert |
| `src-tauri/` | Rust-Backend, Windows-Konfiguration und App-Symbole                                   |
| `scripts/`   | Entwicklung und Build, zusätzliche Prüfungen und Windows-Paketierung                  |
| `tests/`     | Unit-Tests, Browser-Tests und Prüfungen der Desktop-App                               |
| `docs/`      | Handbuch, Screenshots, Auslieferung und frühere Prüfberichte                          |
| `examples/`  | LaTeX-Beispielprojekte                                                                |

## Browseransicht starten

Installiere eine aktuelle Version von Node.js 22 oder 24 und führe im Projektordner `npm ci` und `npm run dev` aus. Die Oberfläche läuft unter [localhost auf Port 1420](http://127.0.0.1:1420).

## Desktop-App starten

Für die Desktop-Entwicklung brauchst du Windows 10 oder 11 (x64), Rust stable, die MSVC Build Tools mit C++-Unterstützung und die WebView2 Runtime. Die Einrichtung ist in den [Tauri-Voraussetzungen](https://v2.tauri.app/start/prerequisites/#windows) beschrieben.

```powershell
npm ci
npm run desktop
```

Für echte Kompilierung kannst du TeX Live oder MiKTeX verwenden. Lege den TeX-Binärordner in den `PATH` oder wähle ihn unter **Einstellungen → LaTeX & PDF → Erweiterte Compiler-Einstellungen**. Liegt das festgeschriebene Archiv bereits unter `src-tauri/resources/tex-runtime.exe`, startet das Skript mit der mitgelieferten Umgebung.

Alternativ lässt sich die App mit Rust für GNU und einer vollständigen MinGW-w64-POSIX-Toolchain bauen. Eine lokale WinLibs-Installation unter `.tools/winlibs/mingw64/bin` wird von den PowerShell-Skripten eingebunden. Bei WinLibs 16 kann `default-manifest.o` aus `mingw64/x86_64-w64-mingw32/lib` mit dem Anwendungsmanifest kollidieren. Benenne die Datei in diesem Fall etwa in `default-manifest.o.disabled` um.

## Tests ausführen

```powershell
npm test
npx playwright install chromium
npm run test:e2e
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Die Browsertests prüfen die Oberfläche mit Beispieldaten. Die Rust-Tests prüfen Dateizugriffe und nutzen vorhandene TeX-Werkzeuge für die Kompilierungstests. Die Checks laufen auch bei Pushes und Pull Requests in GitHub Actions.

```powershell
npx prettier --check src tests
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Mit TeX-Werkzeugen im `PATH` lassen sich auch die LaTeX-Vorlagen und Wissenschaftsfunktionen direkt prüfen.

```powershell
node scripts/checks/check-templates.mjs
node scripts/checks/check-science.mts
```

Die Desktop-Prüfungen für das Windows-Paket stehen unter [Auslieferung](docs/RELEASE.md#wiederholbare-prüfung).

## Windows-Paket bauen

`npm run build:desktop` erzeugt den Offline-Installer. `powershell -ExecutionPolicy Bypass -File scripts/release/release.ps1` erstellt zusätzlich eine portable ZIP-Datei und SHA-256-Prüfsummen unter `release/`. Das dafür festgeschriebene TinyTeX-Archiv lässt sich über `SIMPLELEXEDITOR_TEX_ARCHIVE` als lokale Datei bereitstellen. Größe und Prüfsumme stehen im [TeX-Lock](scripts/build/tex-runtime.lock.json). Einzelheiten zum Paket und zur Abnahme stehen unter [Auslieferung](docs/RELEASE.md).

## Änderungen einreichen

Öffne auf GitHub unter **Issues** einen Fehlerbericht oder einen Verbesserungsvorschlag. Bei Compilerfehlern hilft ein kleines LaTeX-Beispiel, mit dem sich der Fehler nachstellen lässt.

Beschreibe im Pull Request, was sich ändert und welche Tests du ausgeführt hast.
