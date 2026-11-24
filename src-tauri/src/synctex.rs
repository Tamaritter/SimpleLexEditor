use crate::{compiler, entry_path, err, storage};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::Path,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceLocation {
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub version: String,
}

pub fn source_file(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| {
            ["tex", "sty", "cls", "tikz", "ltx"]
                .iter()
                .any(|ext| e.eq_ignore_ascii_case(ext))
        })
}

#[derive(Default)]
struct Candidate {
    input: String,
    line: u32,
    column: u32,
}

fn candidates(output: &str) -> Vec<Candidate> {
    let mut result = Vec::new();
    let mut current = Candidate::default();
    for line in output.lines() {
        if let Some(input) = line.strip_prefix("Input:") {
            if current.line > 0 {
                result.push(current);
            }
            current = Candidate {
                input: input.trim().to_string(),
                ..Candidate::default()
            };
        } else if let Some(value) = line.strip_prefix("Line:") {
            current.line = value.trim().parse().unwrap_or(0);
        } else if let Some(value) = line.strip_prefix("Column:") {
            current.column = value
                .trim()
                .parse::<i64>()
                .ok()
                .filter(|c| *c > 0 && *c <= u32::MAX as i64)
                .unwrap_or(1) as u32;
        }
    }
    if current.line > 0 {
        result.push(current);
    }
    result
}

fn decode_output(bytes: &[u8]) -> Result<String, String> {
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Ok(text.into());
    }
    // TeX Live's Windows SyncTeX writes filenames in the system ANSI code page.
    // Lossy UTF-8 decoding would make paths containing umlauts impossible to open.
    #[cfg(windows)]
    {
        use windows_sys::Win32::Globalization::{
            MultiByteToWideChar, CP_ACP, MB_ERR_INVALID_CHARS,
        };
        unsafe {
            let count = MultiByteToWideChar(
                CP_ACP,
                MB_ERR_INVALID_CHARS,
                bytes.as_ptr(),
                bytes.len() as i32,
                std::ptr::null_mut(),
                0,
            );
            if count > 0 {
                let mut wide = vec![0u16; count as usize];
                if MultiByteToWideChar(
                    CP_ACP,
                    MB_ERR_INVALID_CHARS,
                    bytes.as_ptr(),
                    bytes.len() as i32,
                    wide.as_mut_ptr(),
                    count,
                ) == count
                {
                    return String::from_utf16(&wide).map_err(err);
                }
            }
        }
    }
    Err("Die Dateinamen in der PDF-Zuordnung konnten nicht gelesen werden.".into())
}

fn query(mut command: Command) -> Result<String, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        // SyncTeX otherwise executes this environment variable as an editor.
        .env_remove("SYNCTEX_EDITOR");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(err)?;
    let stdout = child.stdout.take().ok_or("SyncTeX-Ausgabe fehlt.")?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(1024 * 1024)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if start.elapsed() < Duration::from_secs(5) => {
                std::thread::sleep(Duration::from_millis(10))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
        }
    };
    let bytes = reader
        .join()
        .map_err(|_| "SyncTeX-Ausgabe konnte nicht gelesen werden.")?
        .map_err(err)?;
    if !status.is_some_and(|status| status.success()) {
        return Err(
            "Die PDF-Zuordnung konnte nicht gelesen werden. Kompiliere das Dokument erneut.".into(),
        );
    }
    decode_output(&bytes)
}

#[derive(Deserialize)]
pub struct Position {
    pub page: u32,
    pub x: f64,
    pub y: f64,
}

pub fn locate(
    base: &Path,
    main: &str,
    build_directory: &str,
    position: &Position,
    directory: &str,
) -> Result<SourceLocation, String> {
    if position.page == 0
        || position.page > 1_000_000
        || !position.x.is_finite()
        || !position.y.is_finite()
        || !(0.0..=1_000_000.0).contains(&position.x)
        || !(0.0..=1_000_000.0).contains(&position.y)
    {
        return Err("Ungültige PDF-Position.".into());
    }
    let base = base.canonicalize().map_err(err)?;
    let input = entry_path(&base, main)?;
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Ungültiges Hauptdokument.")?;
    let build_root = base.join(".roxena/build").canonicalize().map_err(err)?;
    let output = Path::new(build_directory)
        .canonicalize()
        .map_err(|_| "Die PDF-Zuordnung ist nicht mehr vorhanden. Kompiliere erneut.")?;
    let relative = output
        .strip_prefix(&build_root)
        .map_err(|_| "Ungültiger PDF-Build-Pfad.")?;
    if relative.components().count() != 2 || !output.is_dir() {
        return Err("Ungültiger PDF-Build-Pfad.".into());
    }
    let pdf = output.join(format!("{stem}.pdf"));
    if !pdf.is_file()
        || ![format!("{stem}.synctex.gz"), format!("{stem}.synctex")]
            .iter()
            .any(|name| output.join(name).is_file())
    {
        return Err("Für diese PDF fehlt die Quelltextzuordnung. Kompiliere mit pdfLaTeX, XeLaTeX oder LuaLaTeX erneut.".into());
    }
    let versions: HashMap<String, String> = serde_json::from_slice(
        &fs::read(output.join("source-versions.json"))
            .map_err(|_| "Die PDF-Zuordnung ist veraltet. Kompiliere das Dokument erneut.")?,
    )
    .map_err(err)?;
    let executable = compiler::find("synctex", directory, Some(&base)).ok_or("SyncTeX wurde nicht gefunden. Prüfe die TeX-Installation oder den gewählten TeX-Binärordner.")?;
    let mut command = Command::new(compiler::tex_path(&executable));
    if let Some(bin) = executable.parent() {
        crate::runtime::environment(&mut command, bin)?;
    }
    command
        .current_dir(compiler::tex_path(&base))
        .args(["edit", "-o"])
        .arg(format!(
            "{}:{:.6}:{:.6}:{}",
            position.page,
            position.x,
            position.y,
            compiler::tex_path(&pdf).display()
        ));
    let output = query(command)?;
    locate_output(&base, &versions, &output)
}

fn locate_output(
    base: &Path,
    versions: &HashMap<String, String>,
    output: &str,
) -> Result<SourceLocation, String> {
    for candidate in candidates(output) {
        let path = Path::new(&candidate.input);
        let Ok(path) = (if path.is_absolute() {
            path.to_path_buf()
        } else {
            base.join(path)
        })
        .canonicalize() else {
            continue;
        };
        let Ok(relative) = path.strip_prefix(&base) else {
            continue;
        };
        let file = relative.to_string_lossy().replace('\\', "/");
        if !source_file(&file) || entry_path(&base, &file).is_err() {
            continue;
        }
        let Some(version) = versions.get(&file) else {
            continue;
        };
        if storage::version(&path)? != *version {
            return Err(format!("{file} wurde seit der PDF-Erstellung geändert. Kompiliere erneut, damit die Quellzeile stimmt."));
        }
        return Ok(SourceLocation {
            file,
            line: candidate.line,
            column: candidate.column.max(1),
            version: version.clone(),
        });
    }
    Err("Für diese PDF-Stelle wurde keine bearbeitbare Quellzeile im Projekt gefunden. Klicke direkt auf Text oder eine Formel.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_multiple_results_and_windows_paths_without_splitting_drive_letters() {
        let values = candidates("SyncTeX result begin\nOutput:C:/Project/main.pdf\nInput:C:/Project with spaces/chapters/one.tex\nLine:17\nColumn:-1\nInput:./main.tex\nLine:4\nColumn:3\nSyncTeX result end\n");
        assert_eq!(values.len(), 2);
        assert_eq!(values[0].input, "C:/Project with spaces/chapters/one.tex");
        assert_eq!((values[0].line, values[0].column), (17, 1));
        assert_eq!((values[1].line, values[1].column), (4, 3));
        assert!(candidates("Input:main.tex\nLine:invalid\n").is_empty());
    }
    #[test]
    fn rejects_invalid_coordinates_before_accessing_files() {
        for (page, x, y) in [
            (0, 1.0, 1.0),
            (1, f64::NAN, 0.0),
            (1, 0.0, f64::INFINITY),
            (1, -1.0, 0.0),
        ] {
            assert_eq!(
                locate(
                    Path::new("missing"),
                    "main.tex",
                    "missing",
                    &Position { page, x, y },
                    ""
                )
                .unwrap_err(),
                "Ungültige PDF-Position."
            );
        }
    }
    fn fixture(name: &str) -> std::path::PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!(
            "roxena-synctex-{}-{unique}-{name}",
            std::process::id()
        ));
        fs::create_dir_all(&base).unwrap();
        base.canonicalize().unwrap()
    }
    #[test]
    fn rejects_external_and_hidden_files_and_detects_source_changes() {
        let base = fixture("paths");
        fs::create_dir_all(base.join(".roxena")).unwrap();
        fs::write(base.join("main.tex"), "original").unwrap();
        fs::write(base.join(".roxena/private.tex"), "private").unwrap();
        let versions = HashMap::from([(
            "main.tex".into(),
            storage::version(&base.join("main.tex")).unwrap(),
        )]);
        assert!(locate_output(&base, &versions, "Input:../outside.tex\nLine:1").is_err());
        assert!(locate_output(&base, &versions, "Input:.roxena/private.tex\nLine:1").is_err());
        assert_eq!(
            locate_output(&base, &versions, "Input:./main.tex\nLine:1\nColumn:-1")
                .unwrap()
                .file,
            "main.tex"
        );
        fs::write(base.join("main.tex"), "changed content").unwrap();
        assert!(locate_output(&base, &versions, "Input:main.tex\nLine:1")
            .unwrap_err()
            .contains("seit der PDF-Erstellung geändert"));
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn round_trips_a_real_chapter_through_the_matching_pdf_build() {
        let (Some(_), Some(executable)) = (
            compiler::find("pdflatex", "", None),
            compiler::find("synctex", "", None),
        ) else {
            return;
        };
        let base = fixture("Projekt mit Räumen");
        fs::create_dir_all(base.join("chapters")).unwrap();
        fs::write(base.join("main.tex"), "\\documentclass{article}\n\\begin{document}\nMain body.\n\\input{chapters/one}\n\\end{document}\n").unwrap();
        fs::write(
            base.join("chapters/one.tex"),
            "\\section{Chapter}\nA uniquely located chapter sentence.\n\\[x^2+1\\]\n",
        )
        .unwrap();
        let result =
            compiler::build(&base, "main.tex", "pdflatex", &compiler::Control::default()).unwrap();
        assert!(result.success, "{}", result.log);
        assert!(result.source_map);
        let pdf = Path::new(&result.build_directory).join("main.pdf");
        let mut command = Command::new(compiler::tex_path(&executable));
        command
            .current_dir(compiler::tex_path(&base))
            .args(["view", "-i"])
            .arg(format!(
                "2:0:{}",
                compiler::tex_path(&base.join("chapters/one.tex")).display()
            ))
            .arg("-o")
            .arg(compiler::tex_path(&pdf));
        let output = query(command).unwrap();
        let value = |key: &str| {
            output
                .lines()
                .find_map(|line| {
                    line.strip_prefix(key)
                        .and_then(|v| v.trim().parse::<f64>().ok())
                })
                .unwrap_or_else(|| panic!("Missing {key}: {output}"))
        };
        let position = Position {
            page: value("Page:") as u32,
            x: value("x:"),
            y: value("y:"),
        };
        let hit = locate(&base, "main.tex", &result.build_directory, &position, "").unwrap();
        assert_eq!(hit.file, "chapters/one.tex");
        assert_eq!(hit.line, 2);
        assert!(locate(&base, "main.tex", base.to_str().unwrap(), &position, "").is_err());
        fs::write(
            base.join("chapters/one.tex"),
            "Changed externally, no longer the compiled chapter.",
        )
        .unwrap();
        assert!(
            locate(&base, "main.tex", &result.build_directory, &position, "")
                .unwrap_err()
                .contains("seit der PDF-Erstellung geändert")
        );
        fs::remove_dir_all(base).unwrap();
    }
}
