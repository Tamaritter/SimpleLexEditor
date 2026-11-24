use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Manager, State};
mod compiler;
mod runtime;
mod storage;
mod synctex;
#[cfg(test)]
use compiler::{bibliography, executable, run_engine};

#[derive(Default)]
struct Workspace {
    startup_used: AtomicBool,
    root: Mutex<Option<PathBuf>>,
    compiling: std::sync::Arc<AtomicBool>,
    cancelled: std::sync::Arc<AtomicBool>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    path: String,
    name: String,
    directory: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    name: String,
    root: String,
    files: Vec<Entry>,
    main: String,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn root(ws: &Workspace) -> Result<PathBuf, String> {
    ws.root
        .lock()
        .map_err(err)?
        .clone()
        .ok_or("Kein Projekt geöffnet.".into())
}
fn resolve(base: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    if relative.is_empty() || rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err("Ungültiger Projektpfad.".into());
    }
    let target = base.join(rel);
    let mut ancestor = target.as_path();
    while !ancestor.exists() {
        ancestor = ancestor.parent().ok_or("Ungültiger Pfad.")?;
    }
    if !ancestor
        .canonicalize()
        .map_err(err)?
        .starts_with(base.canonicalize().map_err(err)?)
    {
        return Err("Der Pfad liegt außerhalb des Projekts.".into());
    }
    Ok(target)
}
fn entries(base: &Path, dir: &Path, result: &mut Vec<Entry>, depth: usize) -> Result<(), String> {
    if depth > 16 || result.len() > 10000 {
        return Err("Das Projekt enthält zu viele Dateien oder Verzeichnisebenen.".into());
    }
    let mut children = fs::read_dir(dir)
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    children.sort_by_key(|e| {
        (
            !e.path().is_dir(),
            e.file_name().to_string_lossy().to_lowercase(),
        )
    });
    for entry in children {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.')
            || ["node_modules", "target", "dist"].contains(&name.as_str())
            || entry.file_type().map_err(err)?.is_symlink()
        {
            continue;
        }
        let path = entry.path();
        if path.is_file()
            && ["aux", "log", "out", "toc", "fls", "fdb_latexmk", "synctex"]
                .contains(&path.extension().unwrap_or_default().to_str().unwrap_or(""))
            || name.ends_with(".synctex.gz")
        {
            continue;
        }
        result.push(Entry {
            path: path
                .strip_prefix(base)
                .map_err(err)?
                .to_string_lossy()
                .replace('\\', "/"),
            name,
            directory: path.is_dir(),
        });
        if path.is_dir() {
            entries(base, &path, result, depth + 1)?;
        }
    }
    Ok(())
}
fn project(base: PathBuf, ws: &Workspace) -> Result<Project, String> {
    let base = base.canonicalize().map_err(err)?;
    if !base.is_dir() {
        return Err("Bitte einen Projektordner auswählen.".into());
    }
    let mut files = Vec::new();
    entries(&base, &base, &mut files, 0)?;
    let main = files
        .iter()
        .find(|f| f.path == "main.tex")
        .or_else(|| {
            files.iter().find(|f| {
                f.path.ends_with(".tex")
                    && fs::read_to_string(base.join(&f.path))
                        .map(|s| s.contains("\\documentclass"))
                        .unwrap_or(false)
            })
        })
        .map(|f| f.path.clone())
        .unwrap_or_default();
    let name = base
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    *ws.root.lock().map_err(err)? = Some(base.clone());
    Ok(Project {
        name,
        root: base.to_string_lossy().to_string(),
        files,
        main,
    })
}
#[tauri::command]
fn open_project(path: String, ws: State<Workspace>) -> Result<Project, String> {
    project(PathBuf::from(path), &ws)
}
#[tauri::command]
fn startup_project(ws: State<Workspace>) -> Result<Option<Project>, String> {
    if ws.startup_used.swap(true, Ordering::SeqCst) {
        return Ok(None);
    }
    let args: Vec<String> = std::env::args().collect();
    if let Some(index) = args.iter().position(|arg| arg == "--project") {
        let path = args
            .get(index + 1)
            .ok_or("Nach --project muss ein Projektordner folgen.")?;
        return project(PathBuf::from(path), &ws).map(Some);
    }
    Ok(None)
}
#[tauri::command]
fn list_files(ws: State<Workspace>) -> Result<Vec<Entry>, String> {
    let base = root(&ws)?;
    let mut files = vec![];
    entries(&base, &base, &mut files, 0)?;
    Ok(files)
}
#[tauri::command]
fn read_file(path: String, ws: State<Workspace>) -> Result<String, String> {
    storage::text(&entry_path(&root(&ws)?, &path)?)
}
#[tauri::command]
fn write_file(
    path: String,
    content: String,
    expected: String,
    project_root: String,
    ws: State<Workspace>,
) -> Result<String, String> {
    let base = root(&ws)?;
    if ws.compiling.load(Ordering::SeqCst) {
        return Err("Bitte die Kompilierung vor dem Speichern beenden.".into());
    }
    if base != PathBuf::from(project_root) {
        return Err("Das aktive Projekt hat sich geändert. Es wurde nichts gespeichert.".into());
    }
    storage::write(&base, &path, &content, &expected)?;
    storage::version(&entry_path(&base, &path)?)
}
#[derive(Serialize)]
struct Snapshot {
    content: String,
    version: String,
}
#[tauri::command]
async fn read_snapshot(path: String, ws: State<'_, Workspace>) -> Result<Snapshot, String> {
    let path = entry_path(&root(&ws)?, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (content, version) = storage::snapshot(&path)?;
        Ok(Snapshot { content, version })
    })
    .await
    .map_err(err)?
}
#[derive(Serialize)]
struct Version {
    path: String,
    version: Option<String>,
}
#[tauri::command]
fn file_versions(paths: Vec<String>, ws: State<Workspace>) -> Result<Vec<Version>, String> {
    if paths.len() > 500 {
        return Err("Zu viele gleichzeitig geöffnete Dateien.".into());
    }
    let base = root(&ws)?;
    paths
        .into_iter()
        .map(|path| {
            let file = entry_path(&base, &path)?;
            Ok(Version {
                path,
                version: storage::version(&file).ok(),
            })
        })
        .collect()
}
#[tauri::command]
fn archive_snapshot(path: String, content: String, ws: State<Workspace>) -> Result<(), String> {
    storage::archive(&root(&ws)?, &path, &content)
}
#[tauri::command]
fn open_help(topic: String) -> Result<(), String> {
    let url = match topic.as_str() {
        "miktex" => "https://miktex.org/download",
        "texlive" => "https://www.tug.org/texlive/acquire-netinstall.html",
        "tectonic" => "https://tectonic-typesetting.github.io/",
        _ => return Err("Unbekannte Hilfeseite.".into()),
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let system =
            std::env::var_os("SystemRoot").ok_or("Windows-Systemverzeichnis nicht verfügbar.")?;
        Command::new(PathBuf::from(system).join("System32/rundll32.exe"))
            .args(["url.dll,FileProtocolHandler", url])
            .creation_flags(0x08000000)
            .spawn()
            .map_err(err)?;
    }
    #[cfg(not(windows))]
    {
        Command::new(if cfg!(target_os = "macos") {
            "open"
        } else {
            "xdg-open"
        })
        .arg(url)
        .spawn()
        .map_err(err)?;
    }
    Ok(())
}
#[tauri::command]
fn create_file(path: String, content: String, ws: State<Workspace>) -> Result<(), String> {
    let base = root(&ws)?;
    let _lock = storage::lock(&base)?;
    let target = entry_path(&base, &path)?;
    if content.len() as u64 > storage::MAX_TEXT {
        return Err("Die Textdatei ist größer als 10 MB.".into());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(err)?;
    file.write_all(content.as_bytes()).map_err(err)?;
    file.sync_all().map_err(err)
}
#[tauri::command]
fn recovery_draft(path: String, ws: State<Workspace>) -> Result<Option<storage::Draft>, String> {
    storage::read_draft(&root(&ws)?, &path)
}
#[tauri::command]
async fn recovery_index(ws: State<'_, Workspace>) -> Result<Vec<storage::RecoveryEntry>, String> {
    let base = root(&ws)?;
    tauri::async_runtime::spawn_blocking(move || storage::recovery_index(&base))
        .await
        .map_err(err)?
}
#[tauri::command]
fn save_recovery(
    path: String,
    content: String,
    expected: String,
    project_root: String,
    ws: State<Workspace>,
) -> Result<(), String> {
    let base = root(&ws)?;
    if base != PathBuf::from(project_root) {
        return Err("Das aktive Projekt hat sich geändert.".into());
    }
    storage::save_draft(&base, &path, &expected, &content)
}
#[tauri::command]
fn clear_recovery(path: String, content: String, ws: State<Workspace>) -> Result<(), String> {
    storage::clear_draft(&root(&ws)?, &path, &content)
}
#[tauri::command]
fn list_backups(path: String, ws: State<Workspace>) -> Result<Vec<storage::Backup>, String> {
    storage::backups(&root(&ws)?, &path)
}
#[tauri::command]
fn read_backup(path: String, id: String, ws: State<Workspace>) -> Result<String, String> {
    storage::read_backup(&root(&ws)?, &path, &id)
}
fn entry_path(base: &Path, path: &str) -> Result<PathBuf, String> {
    for part in Path::new(path).components() {
        if let Component::Normal(name) = part {
            let name = name.to_string_lossy();
            let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
            if name.contains([':', '*', '?', '"', '<', '>', '|'])
                || name.ends_with(['.', ' '])
                || name.chars().any(char::is_control)
                || [
                    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6",
                    "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7",
                    "LPT8", "LPT9",
                ]
                .contains(&stem.as_str())
            {
                return Err("Dieser Dateiname ist auf Windows nicht zulässig.".into());
            }
        }
    }
    if Path::new(path).components().any(
        |part| matches!(part, Component::Normal(name) if name.to_string_lossy().starts_with('.')),
    ) {
        return Err("Versteckte Projekt- und Sicherungsdateien sind geschützt.".into());
    }
    resolve(base, path)
}
fn mutation_root(ws: &Workspace) -> Result<PathBuf, String> {
    if ws.compiling.load(Ordering::SeqCst) {
        return Err("Bitte warte, bis die Kompilierung abgeschlossen ist.".into());
    }
    root(ws)
}
fn rename_project_entry(base: &Path, path: &str, destination: &str) -> Result<(), String> {
    let _lock = storage::lock(base)?;
    let source = entry_path(base, path)?;
    let target = entry_path(base, destination)?;
    if !source.exists() {
        return Err("Die Datei oder der Ordner existiert nicht mehr.".into());
    }
    if target.exists() {
        return Err("Am Ziel existiert bereits eine Datei oder ein Ordner.".into());
    }
    if source.is_dir() && target.starts_with(&source) {
        return Err("Ein Ordner kann nicht in sich selbst verschoben werden.".into());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    if source.is_dir() {
        let mut files = Vec::new();
        entries(base, &source, &mut files, 0)?;
        for file in files.into_iter().filter(|file| !file.directory) {
            storage::copy_history(
                base,
                &file.path,
                &format!("{destination}{}", &file.path[path.len()..]),
            )?;
        }
    } else {
        storage::copy_history(base, path, destination)?;
    }
    fs::rename(source, target).map_err(err)
}
fn trash_project_entry(base: &Path, path: &str) -> Result<String, String> {
    let source = entry_path(base, path)?;
    if !source.exists() {
        return Err("Die Datei oder der Ordner existiert nicht mehr.".into());
    }
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(err)?
        .as_nanos()
        .to_string();
    let target = resolve(base, &format!(".roxena/trash/{id}/{path}"))?;
    fs::create_dir_all(target.parent().ok_or("Ungültiger Papierkorbpfad.")?).map_err(err)?;
    fs::rename(source, target).map_err(err)?;
    Ok(id)
}
fn restore_project_entry(base: &Path, path: &str, id: &str) -> Result<(), String> {
    if id.is_empty() || !id.bytes().all(|c| c.is_ascii_digit()) {
        return Err("Ungültige Papierkorbkennung.".into());
    }
    let source = resolve(base, &format!(".roxena/trash/{id}/{path}"))?;
    let target = entry_path(base, path)?;
    if target.exists() {
        return Err(
            "Am ursprünglichen Ort existiert bereits ein Eintrag. Es wurde nichts überschrieben."
                .into(),
        );
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::rename(source, target).map_err(err)
}
#[tauri::command]
fn create_folder(path: String, ws: State<Workspace>) -> Result<(), String> {
    let target = entry_path(&mutation_root(&ws)?, &path)?;
    if target.exists() {
        return Err("Dieser Ordner oder Dateiname existiert bereits.".into());
    }
    fs::create_dir_all(target).map_err(err)
}
#[tauri::command]
fn rename_entry(path: String, destination: String, ws: State<Workspace>) -> Result<(), String> {
    rename_project_entry(&mutation_root(&ws)?, &path, &destination)
}
#[tauri::command]
fn trash_entry(path: String, ws: State<Workspace>) -> Result<String, String> {
    trash_project_entry(&mutation_root(&ws)?, &path)
}
#[tauri::command]
fn restore_entry(path: String, id: String, ws: State<Workspace>) -> Result<(), String> {
    restore_project_entry(&mutation_root(&ws)?, &path, &id)
}
#[tauri::command]
fn reveal_entry(path: String, ws: State<Workspace>) -> Result<(), String> {
    let base = root(&ws)?;
    let target = if path.is_empty() {
        base
    } else {
        entry_path(&base, &path)?
    };
    if !target.exists() {
        return Err("Der Eintrag existiert nicht mehr.".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let display = target.to_string_lossy();
        let display = if let Some(network) = display.strip_prefix("\\\\?\\UNC\\") {
            format!("\\\\{network}")
        } else {
            display
                .strip_prefix("\\\\?\\")
                .unwrap_or(&display)
                .to_string()
        };
        let mut command = Command::new("explorer.exe");
        if target.is_file() {
            command.arg("/select,");
        }
        command
            .arg(display)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(err)?;
    }
    #[cfg(not(windows))]
    {
        Command::new(if cfg!(target_os = "macos") {
            "open"
        } else {
            "xdg-open"
        })
        .arg(if target.is_dir() {
            target.clone()
        } else {
            target.parent().ok_or("Ungültiger Pfad.")?.to_path_buf()
        })
        .spawn()
        .map_err(err)?;
    }
    Ok(())
}
#[tauri::command]
fn create_project(
    parent: String,
    name: String,
    content: String,
    ws: State<Workspace>,
) -> Result<Project, String> {
    if name.trim().is_empty() || name.contains(['/', '\\', ':']) || name == "." || name == ".." {
        return Err("Bitte einen gültigen Projektnamen eingeben.".into());
    }
    let base = PathBuf::from(parent).join(name.trim());
    fs::create_dir(&base).map_err(err)?;
    fs::write(base.join("main.tex"), content).map_err(err)?;
    project(base, &ws)
}
fn default_project_directory(documents: &Path) -> PathBuf {
    let current = documents.join("SimpleLexEditor/Erste Gedanken");
    let previous = documents.join("Roxena/Erste Gedanken");
    if !current.exists() && previous.is_dir() {
        return previous;
    }
    current
}

#[tauri::command]
fn initialize(
    app: tauri::AppHandle,
    content: String,
    ws: State<Workspace>,
) -> Result<Project, String> {
    if let Ok(existing) = root(&ws) {
        return project(existing, &ws);
    }
    let base = default_project_directory(&app.path().document_dir().map_err(err)?);
    fs::create_dir_all(&base).map_err(err)?;
    if !base.join("main.tex").exists() {
        fs::write(base.join("main.tex"), content).map_err(err)?;
    }
    project(base, &ws)
}
#[tauri::command]
fn import_asset(source: String, ws: State<Workspace>) -> Result<String, String> {
    let source = PathBuf::from(source);
    let name = source
        .file_name()
        .ok_or("Ungültiger Dateiname.")?
        .to_string_lossy()
        .to_string();
    let relative = format!("assets/{name}");
    let target = resolve(&root(&ws)?, &relative)?;
    fs::create_dir_all(target.parent().ok_or("Ungültiger Zielpfad.")?).map_err(err)?;
    let mut destination = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(err)?;
    std::io::copy(&mut fs::File::open(source).map_err(err)?, &mut destination).map_err(err)?;
    Ok(relative)
}

#[tauri::command]
async fn prepare_toolchain(directory: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || runtime::directory(&directory).map(|_| ()))
        .await
        .map_err(err)?
}
#[tauri::command]
async fn inspect_toolchain(directory: String) -> Result<Vec<compiler::Tool>, String> {
    tauri::async_runtime::spawn_blocking(move || compiler::tools(&runtime::directory(&directory)?))
        .await
        .map_err(err)?
}
#[tauri::command]
async fn cancel_compile(ws: State<'_, Workspace>) -> Result<(), String> {
    ws.cancelled.store(true, Ordering::SeqCst);
    let compiling = ws.compiling.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let start = Instant::now();
        while compiling.load(Ordering::SeqCst) && start.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(30));
        }
        if compiling.load(Ordering::SeqCst) {
            Err("Der Compiler wird noch beendet. Bitte warte einen Moment.".into())
        } else {
            Ok(())
        }
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn compile_project(
    main: String,
    engine: String,
    timeout_seconds: Option<u64>,
    directory: Option<String>,
    ws: State<'_, Workspace>,
) -> Result<compiler::Compilation, String> {
    if !["pdflatex", "xelatex", "lualatex", "tectonic"].contains(&engine.as_str()) {
        return Err("Unbekannter Compiler.".into());
    }
    let timeout = timeout_seconds.unwrap_or(180);
    if !(30..=1800).contains(&timeout) {
        return Err("Das Zeitlimit muss zwischen 30 und 1800 Sekunden liegen.".into());
    }
    let base = root(&ws)?;
    if ws
        .compiling
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Eine Kompilierung läuft bereits.".into());
    }
    ws.cancelled.store(false, Ordering::SeqCst);
    let control = compiler::Control {
        cancelled: ws.cancelled.clone(),
        timeout: Duration::from_secs(timeout),
        directory: directory.unwrap_or_default(),
    };
    let result = tauri::async_runtime::spawn_blocking(move || {
        let control = compiler::Control {
            directory: runtime::directory(&control.directory)?,
            ..control
        };
        compiler::build(&base, &main, &engine, &control)
    })
    .await
    .map_err(err);
    ws.compiling.store(false, Ordering::SeqCst);
    result?
}
#[tauri::command]
async fn pdf_source_location(
    main: String,
    build_directory: String,
    position: synctex::Position,
    directory: Option<String>,
    ws: State<'_, Workspace>,
) -> Result<synctex::SourceLocation, String> {
    if ws.compiling.load(Ordering::SeqCst) {
        return Err("Die PDF wird gerade aktualisiert. Bitte warte auf die neue Vorschau.".into());
    }
    let base = root(&ws)?;
    tauri::async_runtime::spawn_blocking(move || {
        synctex::locate(
            &base,
            &main,
            &build_directory,
            &position,
            &runtime::directory(&directory.unwrap_or_default())?,
        )
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn export_file(destination: String, data: String, extension: String) -> Result<(), String> {
    if ![
        "pdf",
        "png",
        "tex",
        "bib",
        "sty",
        "cls",
        "txt",
        "md",
        "csv",
        "json",
        "tikz",
        "cfg",
        "def",
        "bst",
        "latexmkrc",
    ]
    .contains(&extension.as_str())
    {
        return Err("Unbekanntes Exportformat.".into());
    }
    let destination = PathBuf::from(destination);
    if !destination
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case(&extension))
    {
        return Err(format!("Bitte die Dateiendung .{extension} verwenden, damit keine andere Datei versehentlich ersetzt wird."));
    }
    if data.len() > 160 * 1024 * 1024 {
        return Err("Der Export ist zu groß.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = STANDARD.decode(data).map_err(err)?;
        storage::atomic_write(&destination, &bytes)
    })
    .await
    .map_err(err)?
}
fn write_zip(base: &Path, destination: &Path) -> Result<(), String> {
    if !destination
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("zip"))
    {
        return Err("Für ein Projektarchiv bitte die Endung .zip verwenden.".into());
    }
    let _lock = storage::lock(base)?;
    let mut files = Vec::new();
    entries(base, base, &mut files, 0)?;
    let parent = destination.parent().ok_or("Ungültiger Exportpfad.")?;
    let temporary = parent.join(format!(
        ".roxena-export-{}.tmp",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(err)?
            .as_nanos()
    ));
    let result = (|| {
        let target = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(err)?;
        let mut archive = zip::ZipWriter::new(target);
        let mut total = 0u64;
        for file in files.iter().filter(|file| !file.directory) {
            let path = resolve(base, &file.path)?;
            if path == destination
                || destination.exists()
                    && path.canonicalize().ok() == destination.canonicalize().ok()
            {
                continue;
            }
            let before = storage::version(&path)?;
            let size = fs::metadata(&path).map_err(err)?.len();
            total = total.saturating_add(size);
            if total > 4 * 1024 * 1024 * 1024 {
                return Err(
                    "Das Projektarchiv überschreitet 4 GB. Sichere umfangreiche Rohdaten separat."
                        .into(),
                );
            }
            archive
                .start_file(
                    &file.path,
                    zip::write::SimpleFileOptions::default()
                        .compression_method(zip::CompressionMethod::Deflated)
                        .large_file(size > u32::MAX as u64),
                )
                .map_err(err)?;
            std::io::copy(&mut fs::File::open(&path).map_err(err)?, &mut archive).map_err(err)?;
            if storage::version(&path)? != before {
                return Err(format!("{} wurde während des Exports extern geändert. Das bisherige Archiv blieb erhalten; bitte erneut exportieren.",file.path));
            }
        }
        archive.finish().map_err(err)?.sync_all().map_err(err)?;
        fs::rename(&temporary, destination).map_err(err)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
#[tauri::command]
async fn export_zip(destination: String, ws: State<'_, Workspace>) -> Result<(), String> {
    let base = root(&ws)?;
    tauri::async_runtime::spawn_blocking(move || write_zip(&base, &PathBuf::from(destination)))
        .await
        .map_err(err)?
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(feature = "bundled-tex") {
                runtime::configure(
                    app.path().resource_dir()?,
                    app.path().app_local_data_dir()?.join("tex-runtime"),
                );
            }
            Ok(())
        })
        .manage(Workspace::default())
        .invoke_handler(tauri::generate_handler![
            initialize,
            open_project,
            startup_project,
            list_files,
            read_file,
            read_snapshot,
            file_versions,
            archive_snapshot,
            open_help,
            write_file,
            recovery_draft,
            recovery_index,
            save_recovery,
            clear_recovery,
            list_backups,
            read_backup,
            create_file,
            create_folder,
            rename_entry,
            trash_entry,
            restore_entry,
            reveal_entry,
            create_project,
            import_asset,
            compile_project,
            pdf_source_location,
            cancel_compile,
            inspect_toolchain,
            prepare_toolchain,
            export_file,
            export_zip
        ])
        .run(tauri::generate_context!())
        .expect("SimpleLexEditor konnte nicht gestartet werden");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn keeps_the_previous_default_project_until_a_new_one_exists() {
        let documents = std::env::temp_dir().join(format!(
            "simplelexeditor-default-project-test-{}",
            std::process::id()
        ));
        let current = documents.join("SimpleLexEditor/Erste Gedanken");
        let previous = documents.join("Roxena/Erste Gedanken");
        assert_eq!(default_project_directory(&documents), current);
        fs::create_dir_all(&previous).unwrap();
        assert_eq!(default_project_directory(&documents), previous);
        fs::create_dir_all(&current).unwrap();
        assert_eq!(default_project_directory(&documents), current);
        fs::remove_dir_all(documents).unwrap();
    }

    #[test]
    fn archives_compressed_research_data_and_rejects_source_destinations() {
        let base = std::env::temp_dir().join(format!("roxena-export-test-{}", std::process::id()));
        fs::create_dir_all(&base).unwrap();
        fs::write(base.join("main.tex"), "source").unwrap();
        fs::write(base.join("dataset.csv.gz"), b"compressed data").unwrap();
        assert!(write_zip(&base, &base.join("main.tex")).is_err());
        assert_eq!(fs::read_to_string(base.join("main.tex")).unwrap(), "source");
        let destination = base.join("project.zip");
        write_zip(&base, &destination).unwrap();
        let mut archive = zip::ZipArchive::new(fs::File::open(destination).unwrap()).unwrap();
        assert!(archive.by_name("dataset.csv.gz").is_ok());
        assert!(archive.by_name("project.zip").is_err());
        drop(archive);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn renames_and_restores_project_entries_without_overwriting() {
        let base = std::env::temp_dir().join(format!("roxena-entry-test-{}", std::process::id()));
        fs::create_dir_all(base.join("chapters")).unwrap();
        fs::write(base.join("chapters/one.tex"), "unsaved data has been saved").unwrap();
        rename_project_entry(&base, "chapters", "sections").unwrap();
        assert_eq!(
            fs::read_to_string(base.join("sections/one.tex")).unwrap(),
            "unsaved data has been saved"
        );
        assert!(rename_project_entry(&base, "sections", "sections/child").is_err());
        fs::write(base.join("other.tex"), "keep me").unwrap();
        assert!(rename_project_entry(&base, "sections/one.tex", "other.tex").is_err());
        let id = trash_project_entry(&base, "sections").unwrap();
        assert!(!base.join("sections").exists());
        fs::create_dir(base.join("sections")).unwrap();
        assert!(restore_project_entry(&base, "sections", &id).is_err());
        fs::remove_dir(base.join("sections")).unwrap();
        restore_project_entry(&base, "sections", &id).unwrap();
        assert_eq!(
            fs::read_to_string(base.join("sections/one.tex")).unwrap(),
            "unsaved data has been saved"
        );
        assert!(entry_path(&base, ".roxena/trash").is_err());
        assert!(entry_path(&base, "../outside").is_err());
        assert!(restore_project_entry(&base, "x.tex", "../../elsewhere").is_err());
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn prevents_traversal() {
        let base = std::env::temp_dir();
        for path in [
            "../secret",
            "a/../../secret",
            "C:\\Windows\\system.ini",
            "/etc/passwd",
            "",
        ] {
            assert!(resolve(&base, path).is_err(), "{path}");
        }
        assert!(resolve(&base, "roxena-test/main.tex").is_ok());
    }
    #[test]
    fn discovers_main_document() {
        let base = std::env::temp_dir().join(format!("roxena-test-{}", std::process::id()));
        fs::create_dir_all(&base).unwrap();
        fs::write(base.join("paper.tex"), "\\documentclass{article}").unwrap();
        let ws = Workspace::default();
        let found = project(base.clone(), &ws).unwrap();
        assert_eq!(found.main, "paper.tex");
        assert_eq!(found.files.len(), 1);
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn compiles_real_multifile_latex_and_detects_errors() {
        if !executable("pdflatex").exists()
            && Command::new("pdflatex").arg("--version").output().is_err()
        {
            return;
        }
        let base = std::env::temp_dir().join(format!("roxena-tex-test-{}", std::process::id()));
        fs::create_dir_all(base.join("chapters")).unwrap();
        let output = base.join("build");
        fs::create_dir_all(&output).unwrap();
        fs::write(
            base.join("main.tex"),
            "\\documentclass{article}\n\\begin{document}\n\\input{chapters/intro}\n\\end{document}",
        )
        .unwrap();
        fs::write(
            base.join("chapters/intro.tex"),
            "Hello from SimpleLexEditor. $e^{i\\pi}+1=0$",
        )
        .unwrap();
        assert!(run_engine("pdflatex", &base, "main.tex", &output, Instant::now()).unwrap());
        assert!(fs::read(output.join("main.pdf"))
            .unwrap()
            .starts_with(b"%PDF"));
        fs::write(base.join("chapters/intro.tex"), "\\thiscommanddoesnotexist").unwrap();
        assert!(!run_engine("pdflatex", &base, "main.tex", &output, Instant::now()).unwrap());
        assert!(fs::read_to_string(output.join("main.log"))
            .unwrap()
            .contains("Undefined control sequence"));
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn builds_bibtex_references() {
        if !executable("pdflatex").exists() || !executable("bibtex").exists() {
            return;
        }
        let base = std::env::temp_dir().join(format!("roxena-bib-test-{}", std::process::id()));
        let output = base.join("build");
        fs::create_dir_all(&output).unwrap();
        fs::write(base.join("main.tex"), "\\documentclass{article}\n\\begin{document}\nReference \\cite{knuth}.\n\\bibliographystyle{plain}\n\\bibliography{references}\n\\end{document}\n").unwrap();
        fs::write(base.join("references.bib"), "@book{knuth, author={Donald Knuth}, title={The TeXbook}, year={1984}, publisher={Addison-Wesley}}\n").unwrap();
        let start = Instant::now();
        assert!(run_engine("pdflatex", &base, "main.tex", &output, start).unwrap());
        assert!(bibliography(&base, &output, "main", start).unwrap());
        assert!(fs::read_to_string(output.join("main.bbl"))
            .unwrap()
            .contains("Knuth"));
        assert!(run_engine("pdflatex", &base, "main.tex", &output, start).unwrap());
        assert!(run_engine("pdflatex", &base, "main.tex", &output, start).unwrap());
        assert!(!fs::read_to_string(output.join("main.log"))
            .unwrap()
            .contains("undefined references"));
        fs::remove_dir_all(base).unwrap();
    }
}
