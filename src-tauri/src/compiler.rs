use crate::{err, resolve, storage};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

#[derive(Clone)]
pub struct Control {
    pub cancelled: Arc<AtomicBool>,
    pub timeout: Duration,
    pub directory: String,
}
impl Default for Control {
    fn default() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
            timeout: Duration::from_secs(180),
            directory: String::new(),
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tool {
    name: String,
    available: bool,
    path: Option<String>,
    version: Option<String>,
}
pub const TOOLS: [&str; 6] = [
    "pdflatex", "xelatex", "lualatex", "tectonic", "bibtex", "biber",
];
pub fn find(name: &str, directory: &str, project: Option<&Path>) -> Option<PathBuf> {
    if !TOOLS.contains(&name) && name != "synctex" {
        return None;
    }
    let filename = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    };
    if !directory.trim().is_empty() {
        let dir = PathBuf::from(directory);
        return dir
            .is_absolute()
            .then(|| dir.join(&filename))
            .filter(|path| path.is_file())
            .and_then(|path| path.canonicalize().ok());
    }
    let mut dirs = Vec::new();
    if cfg!(windows) {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            dirs.push(PathBuf::from(local).join("Programs/MiKTeX/miktex/bin/x64"));
        }
    }
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    dirs.into_iter()
        .filter(|dir| dir.is_absolute())
        .filter_map(|dir| dir.join(&filename).canonicalize().ok())
        .find(|path| path.is_file() && !project.is_some_and(|base| path.starts_with(base)))
}

#[cfg(windows)]
pub(crate) struct ProcessGroup(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
impl ProcessGroup {
    pub(crate) fn attach(child: &std::process::Child) -> Result<Self, String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(err(std::io::Error::last_os_error()));
            }
            let group = Self(handle);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of_val(&limits) as u32,
            ) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle().cast()) == 0
            {
                return Err(format!(
                    "Die Compiler-Prozessgruppe konnte nicht eingerichtet werden: {}",
                    std::io::Error::last_os_error()
                ));
            }
            Ok(group)
        }
    }
    fn terminate(&self) {
        unsafe {
            windows_sys::Win32::System::JobObjects::TerminateJobObject(self.0, 1);
        }
    }
}
#[cfg(windows)]
impl Drop for ProcessGroup {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

fn wait(
    mut command: Command,
    name: &str,
    start: Instant,
    control: &Control,
    output: Option<&Path>,
) -> Result<bool, String> {
    if control.cancelled.load(Ordering::SeqCst) {
        return Err("CANCELLED: Kompilierung abgebrochen.".into());
    }
    command.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child=command.spawn().map_err(|error|format!("{name} konnte nicht gestartet werden: {error}. Prüfe unter Einstellungen → TeX-Installation den Compilerpfad."))?;
    #[cfg(windows)]
    let group = match ProcessGroup::attach(&child) {
        Ok(group) => group,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    loop {
        if let Some(status) = child.try_wait().map_err(err)? {
            return Ok(status.success());
        }
        let cancelled = control.cancelled.load(Ordering::SeqCst);
        let too_large = output.is_some_and(|dir| {
            [
                "compiler.stdout.log",
                "compiler.stderr.log",
                "bibliography.stdout.log",
                "bibliography.stderr.log",
            ]
            .iter()
            .filter_map(|file| fs::metadata(dir.join(file)).ok())
            .map(|m| m.len())
            .sum::<u64>()
                > 20 * 1024 * 1024
        });
        if cancelled || start.elapsed() > control.timeout || too_large {
            #[cfg(windows)]
            group.terminate();
            let _ = child.kill();
            let _ = child.wait();
            return Err(if cancelled {
                "CANCELLED: Kompilierung abgebrochen.".into()
            } else if too_large {
                "Der Compiler hat mehr als 20 MB Konsolenausgabe erzeugt und wurde beendet. Prüfe rekursive Makros und das Protokoll.".into()
            } else {
                format!("Zeitlimit von {} Sekunden erreicht. Prüfe fehlende Pakete oder erhöhe das Zeitlimit in den Einstellungen.",control.timeout.as_secs())
            });
        }
        std::thread::sleep(Duration::from_millis(40));
    }
}
pub fn tools(directory: &str) -> Result<Vec<Tool>, String> {
    if !directory.trim().is_empty()
        && (!Path::new(directory).is_absolute() || !Path::new(directory).is_dir())
    {
        return Err("Bitte einen absoluten, vorhandenen TeX-Binärordner angeben oder das Feld für automatische Erkennung leeren.".into());
    }
    let mut result = Vec::new();
    for name in TOOLS {
        let path = find(name, directory, None);
        let mut version = None;
        if let Some(ref executable) = path {
            let mut command = Command::new(tex_path(executable));
            if let Some(bin) = executable.parent() {
                crate::runtime::environment(&mut command, bin)?;
            }
            command
                .arg("--version")
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .stdin(Stdio::null());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            if let Ok(mut child) = command.spawn() {
                let start = Instant::now();
                while start.elapsed() < Duration::from_secs(2) {
                    if child.try_wait().ok().flatten().is_some() {
                        let mut bytes = Vec::new();
                        if let Some(stdout) = child.stdout.take() {
                            let _ = stdout.take(8192).read_to_end(&mut bytes);
                        }
                        version = String::from_utf8_lossy(&bytes)
                            .lines()
                            .find(|line| !line.trim().is_empty())
                            .map(|line| line.chars().take(240).collect());
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(30));
                }
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        result.push(Tool {
            name: name.into(),
            available: path.is_some(),
            path: path.map(|p| p.to_string_lossy().into()),
            version,
        });
    }
    Ok(result)
}
pub fn output_path(base: &Path, main: &str, engine: &str) -> Result<PathBuf, String> {
    resolve(
        base,
        &format!(".roxena/build/{engine}-{}", storage::key(main)),
    )
}
// Rust's canonical paths use the Win32 extended prefix. LuaTeX cannot read
// auxiliary files through it, and BibTeX cannot locate its own installation.
// Keep native paths for validation and normalize all paths passed to TeX.
pub(crate) fn tex_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let text = path.to_string_lossy();
        let native = if let Some(unc) = text.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{unc}")
        } else {
            text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
        };
        PathBuf::from(native.replace('\\', "/"))
    }
    #[cfg(not(windows))]
    path.to_path_buf()
}
fn project_search_path(
    base: &Path,
    output: &Path,
    relative: bool,
) -> Result<std::ffi::OsString, String> {
    let mut entries = Vec::new();
    crate::entries(base, base, &mut entries, 0)?;
    // Recursive base// searches also enter .roxena and can load another build's
    // aux/bbl files. Search this output first, then only visible project folders.
    let project_root = if relative { Path::new(".") } else { base };
    let mut paths = vec![output.to_path_buf(), project_root.to_path_buf()];
    paths.extend(
        entries
            .into_iter()
            .filter(|entry| entry.directory)
            .map(|entry| project_root.join(entry.path)),
    );
    let mut search = std::env::join_paths(paths.iter().map(|path| tex_path(path))).map_err(err)?;
    // An empty final element keeps the TeX distribution's standard search path.
    search.push(if cfg!(windows) { ";" } else { ":" });
    Ok(search)
}
pub fn engine(
    engine: &str,
    base: &Path,
    main: &str,
    output: &Path,
    start: Instant,
    control: &Control,
) -> Result<bool, String> {
    let path=find(engine,&control.directory,Some(base)).ok_or_else(||format!("{engine} wurde nicht gefunden. Prüfe die mitgelieferte LaTeX-Umgebung unter Einstellungen → TeX-Installation. Bei beschädigten Programmdateien den vollständigen SimpleLexEditor-Installer erneut ausführen."))?;
    let mut command = Command::new(tex_path(&path));
    if let Some(bin) = path.parent() {
        crate::runtime::environment(&mut command, bin)?;
    }
    let miktex = path.to_string_lossy().to_lowercase().contains("miktex");
    if miktex {
        command.arg("--disable-installer");
    }
    if miktex && ["pdflatex", "xelatex"].contains(&engine) {
        command.arg("-max-print-line=1000");
    }
    if engine == "tectonic" {
        command
            .args(["--keep-logs", "--outdir"])
            .arg(tex_path(output))
            .arg(main);
    } else {
        command
            .args([
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-file-line-error",
                "-no-shell-escape",
                "-synctex=1",
                "-recorder",
            ])
            .arg(format!("-output-directory={}", tex_path(output).display()))
            .arg(main);
    }
    command
        .current_dir(tex_path(base))
        .env("max_print_line", "1000")
        .env("TEXINPUTS", project_search_path(base, output, true)?)
        .stdout(Stdio::from(
            fs::File::create(output.join("compiler.stdout.log")).map_err(err)?,
        ))
        .stderr(Stdio::from(
            fs::File::create(output.join("compiler.stderr.log")).map_err(err)?,
        ));
    wait(command, engine, start, control, Some(output))
}
pub fn bibliography_control(
    base: &Path,
    output: &Path,
    stem: &str,
    start: Instant,
    control: &Control,
) -> Result<bool, String> {
    let aux = fs::read_to_string(output.join(format!("{stem}.aux"))).unwrap_or_default();
    let engine = if output.join(format!("{stem}.bcf")).exists() {
        "biber"
    } else if aux.contains("\\bibdata{") {
        "bibtex"
    } else {
        return Ok(true);
    };
    let path=find(engine,&control.directory,Some(base)).ok_or_else(||format!("{engine} ist für dieses Literaturverzeichnis erforderlich, wurde aber nicht gefunden. Prüfe die TeX-Installation."))?;
    let search = project_search_path(base, output, false)?;
    let mut command = Command::new(tex_path(&path));
    if let Some(bin) = path.parent() {
        crate::runtime::environment(&mut command, bin)?;
    }
    command
        .arg(stem)
        .current_dir(tex_path(output))
        .env("BIBINPUTS", &search)
        .env("BSTINPUTS", &search)
        .stdout(Stdio::from(
            fs::File::create(output.join("bibliography.stdout.log")).map_err(err)?,
        ))
        .stderr(Stdio::from(
            fs::File::create(output.join("bibliography.stderr.log")).map_err(err)?,
        ));
    wait(command, engine, start, control, Some(output))
}
pub fn log(path: &Path) -> String {
    let Ok(mut file) = fs::File::open(path) else {
        return String::new();
    };
    let length = file.metadata().map(|m| m.len()).unwrap_or(0);
    if length > 4 * 1024 * 1024 {
        use std::io::{Seek, SeekFrom};
        let _ = file.seek(SeekFrom::End(-4 * 1024 * 1024));
    }
    let mut bytes = Vec::new();
    let _ = file.take(4 * 1024 * 1024).read_to_end(&mut bytes);
    format!(
        "{}{}",
        if length > 4 * 1024 * 1024 {
            "[Protokoll gekürzt; die vollständige Datei liegt im Build-Ordner.]\n"
        } else {
            ""
        },
        String::from_utf8_lossy(&bytes)
    )
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Compilation {
    pub success: bool,
    pub pdf: Option<String>,
    pub log: String,
    pub duration_ms: u128,
    pub build_directory: String,
    pub source_map: bool,
}
pub fn build(
    base: &Path,
    main: &str,
    engine_name: &str,
    control: &Control,
) -> Result<Compilation, String> {
    let start = Instant::now();
    let input = crate::entry_path(base, main)?;
    if !input.is_file()
        || !input
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("tex"))
    {
        return Err("Das Hauptdokument muss eine vorhandene .tex-Datei sein.".into());
    }
    let lock = resolve(base, ".roxena/compiler.lock")?;
    fs::create_dir_all(lock.parent().ok_or("Ungültiger Projektpfad.")?).map_err(err)?;
    let lease = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(lock)
        .map_err(err)?;
    lease.try_lock().map_err(|_| {
        "Dieses Projekt wird bereits in einer anderen SimpleLexEditor-Instanz kompiliert."
            .to_string()
    })?;
    let output = output_path(base, main, engine_name)?;
    // A fresh job directory prevents stale BCF/auxiliary files from selecting a
    // bibliography processor that the current document no longer uses.
    let output = output.join(storage::key(&format!(
        "{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(err)?
            .as_nanos()
    )));
    fs::create_dir_all(&output).map_err(err)?;
    let mut entries = Vec::new();
    crate::entries(base, base, &mut entries, 0)?;
    for directory in entries.iter().filter(|e| e.directory) {
        fs::create_dir_all(output.join(&directory.path)).map_err(err)?;
    }
    let source_versions: std::collections::HashMap<String, String> = entries
        .iter()
        .filter(|entry| !entry.directory && crate::synctex::source_file(&entry.path))
        .filter_map(|entry| {
            storage::version(&base.join(&entry.path))
                .ok()
                .map(|version| (entry.path.clone(), version))
        })
        .collect();
    let stem = input
        .file_stem()
        .ok_or("Ungültiger Dateiname.")?
        .to_string_lossy();
    let mut success = engine(engine_name, base, main, &output, start, control)?;
    let mut bib_failed = false;
    if success && engine_name != "tectonic" {
        if !bibliography_control(base, &output, &stem, start, control)? {
            success = false;
            bib_failed = true;
        }
        for _ in 0..2 {
            if success {
                success = engine(engine_name, base, main, &output, start, control)?;
            }
        }
    }
    let mut report = log(&output.join(format!("{stem}.log")));
    if report.is_empty() {
        report = log(&output.join("compiler.stdout.log"));
    }
    if !success {
        report.push_str(&log(&output.join("compiler.stderr.log")));
        report.push_str(&log(&output.join("compiler.stdout.log")));
    }
    if bib_failed {
        report.push_str("\n! Das Literaturverzeichnis konnte nicht erstellt werden.\n");
        report.push_str(&log(&output.join(format!("{stem}.blg"))));
        report.push_str(&log(&output.join("bibliography.stdout.log")));
        report.push_str(&log(&output.join("bibliography.stderr.log")));
    }
    let pdf_path = output.join(format!("{stem}.pdf"));
    let pdf = if success && pdf_path.exists() {
        if fs::metadata(&pdf_path).map_err(err)?.len() > 100 * 1024 * 1024 {
            return Err("Die PDF ist größer als 100 MB. Reduziere die Bildgrößen; die erzeugte PDF liegt weiterhin im Build-Ordner.".into());
        }
        Some(STANDARD.encode(fs::read(pdf_path).map_err(err)?))
    } else {
        if success {
            success = false;
            report.push_str("\n! Das Dokument hat keine PDF-Seiten erzeugt. Füge Text oder \\null in das Dokument ein.\n");
        }
        None
    };
    // Retain only the three most recent complete jobs for this document/engine.
    // Abandoned/incomplete jobs remain until a successful next build can clean up.
    let parent = output.parent().ok_or("Ungültiger Build-Pfad.")?;
    let canonical_parent = parent.canonicalize().map_err(err)?;
    let mut jobs = fs::read_dir(parent)
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    jobs.sort_by_key(|entry| std::cmp::Reverse(entry.metadata().and_then(|m| m.modified()).ok()));
    for job in jobs.into_iter().skip(3) {
        let path = job.path();
        if path.is_dir()
            && !job.file_type().map_err(err)?.is_symlink()
            && path.parent() == Some(parent)
            && path
                .canonicalize()
                .ok()
                .is_some_and(|checked| checked.parent() == Some(canonical_parent.as_path()))
            && path.file_name().is_some_and(|name| {
                name.to_string_lossy().len() == 16
                    && name
                        .to_string_lossy()
                        .bytes()
                        .all(|b| b.is_ascii_hexdigit())
            })
        {
            let _ = fs::remove_dir_all(path);
        }
    }
    let source_map = pdf.is_some()
        && [format!("{stem}.synctex.gz"), format!("{stem}.synctex")]
            .iter()
            .any(|name| output.join(name).is_file());
    if source_map {
        fs::write(
            output.join("source-versions.json"),
            serde_json::to_vec(&source_versions).map_err(err)?,
        )
        .map_err(err)?;
    }
    Ok(Compilation {
        success,
        pdf,
        log: report,
        duration_ms: start.elapsed().as_millis(),
        build_directory: output.to_string_lossy().into(),
        source_map,
    })
}
#[cfg(test)]
pub fn run_engine(
    engine_name: &str,
    base: &Path,
    main: &str,
    output: &Path,
    start: Instant,
) -> Result<bool, String> {
    engine(engine_name, base, main, output, start, &Control::default())
}
#[cfg(test)]
pub fn bibliography(
    base: &Path,
    output: &Path,
    stem: &str,
    start: Instant,
) -> Result<bool, String> {
    bibliography_control(base, output, stem, start, &Control::default())
}
#[cfg(test)]
pub fn executable(name: &str) -> PathBuf {
    find(name, "", None).unwrap_or_else(|| PathBuf::from(name))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn passes_readable_windows_paths_to_tex_engines() {
        assert_eq!(
            tex_path(Path::new(r"\\?\C:\Projekt mit Leerzeichen\.roxena\build")),
            PathBuf::from("C:/Projekt mit Leerzeichen/.roxena/build")
        );
        assert_eq!(
            tex_path(Path::new(r"\\?\UNC\server\share\Projekt\build")),
            PathBuf::from("//server/share/Projekt/build")
        );
        assert_eq!(
            tex_path(Path::new("chapters/one.tex")),
            PathBuf::from("chapters/one.tex")
        );
    }
    fn fixture(name: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "roxena-build-{}-{}-{name}",
            std::process::id(),
            Instant::now().elapsed().as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        base
    }
    #[test]
    fn isolates_identical_main_names_and_builds_nested_includes() {
        if find("pdflatex", "", None).is_none() {
            return;
        }
        let base = fixture("includes");
        fs::create_dir_all(base.join("chapters")).unwrap();
        fs::write(
            base.join("chapters/intro.tex"),
            "\\chapter{Introduction} A nested include.",
        )
        .unwrap();
        fs::write(base.join("main.tex"),"\\documentclass{report}\n\\begin{document}\n\\include{chapters/intro}\n\\end{document}\n").unwrap();
        let first = build(&base, "main.tex", "pdflatex", &Control::default()).unwrap();
        assert!(first.success, "{}", first.log);
        fs::write(
            base.join("chapters/main.tex"),
            "\\documentclass{article}\n\\begin{document}Separate main.\\end{document}",
        )
        .unwrap();
        let second = build(&base, "chapters/main.tex", "pdflatex", &Control::default()).unwrap();
        assert!(second.success, "{}", second.log);
        assert_ne!(
            Path::new(&first.build_directory).parent(),
            Path::new(&second.build_directory).parent()
        );
        assert!(Path::new(&first.build_directory)
            .join("chapters/intro.aux")
            .exists());
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn repeated_bibliography_builds_ignore_stale_auxiliary_files() {
        if find("pdflatex", "", None).is_none() || find("bibtex", "", None).is_none() {
            return;
        }
        let base = fixture("bibliography");
        let stale = base.join(".roxena/build/0000-stale");
        fs::create_dir_all(&stale).unwrap();
        fs::write(
            stale.join("main.aux"),
            "\\SIMPLELEXEDITORStaleAuxMustNotLoad",
        )
        .unwrap();
        fs::write(stale.join("main.bbl"), "STALE BIBLIOGRAPHY").unwrap();
        fs::create_dir_all(base.join("literature")).unwrap();
        fs::write(
            base.join("literature/references.bib"),
            "@book{Old, author={Doe, Jane}, title={Original}, year={2025}, publisher={Press}}\n",
        )
        .unwrap();
        let document = |keys: &str| {
            format!("\\documentclass{{article}}\n\\begin{{document}}\\cite{{{keys}}}\\bibliographystyle{{plain}}\\bibliography{{references}}\\end{{document}}\n")
        };
        fs::write(base.join("main.tex"), document("Old")).unwrap();
        let first = build(&base, "main.tex", "pdflatex", &Control::default()).unwrap();
        assert!(first.success, "{}", first.log);
        fs::write(base.join("literature/references.bib"), "@book{Old, author={Doe, Jane}, title={Original}, year={2025}, publisher={Press}}\n@book{New, author={Roe, Richard}, title={New research}, year={2026}, publisher={Press}}\n").unwrap();
        fs::write(base.join("main.tex"), document("Old,New")).unwrap();
        let second = build(&base, "main.tex", "pdflatex", &Control::default()).unwrap();
        assert!(second.success, "{}", second.log);
        assert!(!second.log.contains("undefined"), "{}", second.log);
        let output = Path::new(&second.build_directory);
        let aux = fs::read_to_string(output.join("main.aux")).unwrap();
        assert!(aux.contains("\\bibcite{Old}"), "{aux}");
        assert!(aux.contains("\\bibcite{New}"), "{aux}");
        let recorder = fs::read_to_string(output.join("main.fls"))
            .unwrap()
            .replace('\\', "/");
        assert!(!recorder.contains("0000-stale"), "{recorder}");
        let previous = first.build_directory.replace('\\', "/");
        assert!(!recorder.contains(&previous), "{recorder}");
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn interrupts_a_running_engine_and_can_compile_again() {
        if find("pdflatex", "", None).is_none() {
            return;
        }
        let base = fixture("cancel");
        let output = base.join("out");
        fs::create_dir_all(&output).unwrap();
        fs::write(
            base.join("main.tex"),
            "\\documentclass{article}\n\\begin{document}\n\\loop\\iftrue\\repeat\n\\end{document}",
        )
        .unwrap();
        let control = Control::default();
        let signal = control.cancelled.clone();
        let cancel = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(350));
            signal.store(true, Ordering::SeqCst);
        });
        let start = Instant::now();
        let result = engine("pdflatex", &base, "main.tex", &output, start, &control);
        cancel.join().unwrap();
        assert!(result.unwrap_err().starts_with("CANCELLED:"));
        assert!(start.elapsed() < Duration::from_secs(5));
        fs::write(
            base.join("main.tex"),
            "\\documentclass{article}\\begin{document}Recovered.\\end{document}",
        )
        .unwrap();
        assert!(engine(
            "pdflatex",
            &base,
            "main.tex",
            &output,
            Instant::now(),
            &Control::default()
        )
        .unwrap());
        fs::remove_dir_all(base).unwrap();
    }
}
