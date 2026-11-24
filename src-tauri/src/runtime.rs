//! The release carries its own offline TeX distribution. Never silently mix it
//! with tools from a user's existing TeX installation.
use crate::err;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

const LOCK: &str = include_str!("../../scripts/build/tex-runtime.lock.json");
const REQUIRED: [&str; 5] = ["pdflatex", "xelatex", "lualatex", "bibtex", "biber"];
struct Runtime {
    resources: PathBuf,
    cache: PathBuf,
    bin: Mutex<Option<PathBuf>>,
}
static RUNTIME: OnceLock<Runtime> = OnceLock::new();

pub fn configure(resources: PathBuf, cache: PathBuf) {
    let _ = RUNTIME.set(Runtime {
        resources,
        cache,
        bin: Mutex::new(None),
    });
}
fn complete(root: &Path) -> Option<PathBuf> {
    let bin = root.join("TinyTeX/bin/windows");
    (REQUIRED
        .iter()
        .all(|name| bin.join(format!("{name}.exe")).is_file())
        && root
            .join("TinyTeX/texmf-dist/tex/latex/base/article.cls")
            .is_file()
        && root.join("TinyTeX/tlpkg/texlive.tlpdb").is_file())
    .then_some(bin)
}
fn repair() -> String {
    "Die mitgelieferte LaTeX-Umgebung fehlt oder ist beschädigt. Starte den vollständigen SimpleLexEditor-Installer erneut. Eine separate TeX-Installation ist nicht erforderlich.".into()
}

pub fn directory(custom: &str) -> Result<String, String> {
    if !custom.trim().is_empty() {
        return Ok(custom.into());
    }
    // Development builds and tests can use an installed TeX toolchain.
    let Some(runtime) = RUNTIME.get() else {
        return Ok(String::new());
    };
    let mut ready = runtime.bin.lock().map_err(err)?;
    if let Some(bin) = ready.as_ref() {
        return Ok(bin.to_string_lossy().into());
    }
    let lock: serde_json::Value = serde_json::from_str(LOCK).map_err(err)?;
    let digest = lock["sha256"].as_str().ok_or_else(repair)?;
    let installed = runtime.resources.join("tex");
    if fs::read_to_string(installed.join("roxena-runtime.sha256"))
        .ok()
        .as_deref()
        .map(str::trim)
        == Some(digest)
    {
        if let Some(bin) = complete(&installed) {
            *ready = Some(bin.clone());
            return Ok(bin.to_string_lossy().into());
        }
    }
    // Portable archives extract into a versioned, user-writable cache on first
    // use. The installed application has already done this in the setup wizard.
    fs::create_dir_all(&runtime.cache).map_err(err)?;
    let file_lock = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(runtime.cache.join("installation.lock"))
        .map_err(err)?;
    file_lock.lock().map_err(err)?;
    let destination = runtime.cache.join(digest);
    if let Some(bin) = complete(&destination) {
        *ready = Some(bin.clone());
        return Ok(bin.to_string_lossy().into());
    }
    let archive = runtime.resources.join("tex-runtime.exe");
    let mut file = fs::File::open(&archive).map_err(|_| repair())?;
    if file.metadata().map_err(err)?.len() != lock["size"].as_u64().ok_or_else(repair)? {
        return Err(repair());
    }
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 128 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(err)?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    if format!("{:x}", hash.finalize()) != digest {
        return Err(repair());
    }
    drop(file);
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(err)?
        .as_nanos();
    let stage = runtime
        .cache
        .join(format!("extract-{}-{stamp}", std::process::id()));
    fs::create_dir(&stage).map_err(err)?;
    let result = (|| {
        let mut command = Command::new(&archive);
        command
            .arg("-y")
            .arg(format!("-o{}", stage.display()))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(err)?;
        #[cfg(windows)]
        let _group = match crate::compiler::ProcessGroup::attach(&child) {
            Ok(group) => group,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };
        if !child.wait().map_err(err)?.success() || complete(&stage).is_none() {
            return Err(repair());
        }
        // Only publish a completed tree; a killed extraction is never accepted.
        fs::rename(&stage, &destination).map_err(err)?;
        complete(&destination).ok_or_else(repair)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&stage);
    }
    let bin = result?;
    *ready = Some(bin.clone());
    Ok(bin.to_string_lossy().into())
}

pub fn environment(command: &mut Command, bin: &Path) -> Result<(), String> {
    let Some(runtime) = RUNTIME.get() else {
        return Ok(());
    };
    let ready = runtime.bin.lock().map_err(err)?;
    if ready
        .as_ref()
        .and_then(|p| p.canonicalize().ok())
        .as_deref()
        != Some(bin)
    {
        return Ok(());
    }
    for name in [
        "TEXMFCNF",
        "TEXMF",
        "TEXMFROOT",
        "TEXMFSYSVAR",
        "TEXMFSYSCONFIG",
        "TEXFORMATS",
        "TEXINPUTS",
        "BIBINPUTS",
        "BSTINPUTS",
    ] {
        command.env_remove(name);
    }
    // Font databases and generated formats contain distribution-specific paths.
    // Keep them separate when switching from portable to installed SimpleLexEditor, or
    // when a release upgrades the bundled TeX distribution.
    let state = runtime
        .cache
        .join("state")
        .join(crate::storage::key(&format!("{LOCK}:{}", bin.display())));
    for (key, folder) in [
        ("TEXMFVAR", "var"),
        ("TEXMFCONFIG", "config"),
        ("TEXMFHOME", "home"),
    ] {
        let path = state.join(folder);
        fs::create_dir_all(&path).map_err(err)?;
        command.env(key, path);
    }
    let mut paths = vec![crate::compiler::tex_path(bin)];
    if let Some(existing) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&existing));
    }
    command
        .env("PATH", std::env::join_paths(paths).map_err(err)?)
        .env("TEXLIVE_WINDOWS_TRY_EXTERNAL_PERL", "0");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn does_not_accept_partial_runtime() {
        let root = std::env::temp_dir().join(format!("roxena-runtime-test-{}", std::process::id()));
        fs::create_dir_all(root.join("TinyTeX/bin/windows")).unwrap();
        for name in REQUIRED {
            fs::write(root.join(format!("TinyTeX/bin/windows/{name}.exe")), []).unwrap();
        }
        assert!(complete(&root).is_none());
        fs::create_dir_all(root.join("TinyTeX/texmf-dist/tex/latex/base")).unwrap();
        fs::create_dir_all(root.join("TinyTeX/tlpkg")).unwrap();
        fs::write(
            root.join("TinyTeX/texmf-dist/tex/latex/base/article.cls"),
            "test",
        )
        .unwrap();
        fs::write(root.join("TinyTeX/tlpkg/texlive.tlpdb"), "test").unwrap();
        assert!(complete(&root).is_some());
        fs::remove_file(root.join("TinyTeX/bin/windows/biber.exe")).unwrap();
        assert!(complete(&root).is_none());
        fs::remove_dir_all(root).unwrap();
    }
}
