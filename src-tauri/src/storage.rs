use crate::{entry_path, err, resolve};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub const MAX_TEXT: u64 = 10 * 1024 * 1024;
pub fn key(text: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in text.as_bytes() {
        hash = (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}
pub fn version(path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(err)?;
    Ok(format!(
        "{}:{}",
        metadata
            .modified()
            .map_err(err)?
            .duration_since(UNIX_EPOCH)
            .map_err(err)?
            .as_nanos(),
        metadata.len()
    ))
}
pub fn snapshot(path: &Path) -> Result<(String, String), String> {
    for _ in 0..2 {
        let before = version(path)?;
        let content = text(path)?;
        let after = version(path)?;
        if before == after {
            return Ok((content, after));
        }
    }
    Err("Die Datei wird gerade extern geändert. Bitte erneut öffnen.".into())
}
fn stamp() -> Result<String, String> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(err)?
        .as_nanos()
        .to_string())
}
pub fn text(path: &Path) -> Result<String, String> {
    capped_text(path, MAX_TEXT)
}
fn capped_text(path: &Path, limit: u64) -> Result<String, String> {
    if fs::metadata(path).map_err(err)?.len() > limit {
        return Err(
            "Diese Textdatei ist größer als 10 MB. Öffne sie in einem dafür geeigneten Editor."
                .into(),
        );
    }
    fs::read_to_string(path).map_err(|error| format!("Die Textdatei konnte nicht als UTF-8 gelesen werden: {error}. Konvertiere ältere LaTeX-Dateien zuerst nach UTF-8."))
}
pub fn lock(base: &Path) -> Result<fs::File, String> {
    let path = resolve(base, ".roxena/write.lock")?;
    fs::create_dir_all(path.parent().ok_or("Ungültiger Projektpfad.")?).map_err(err)?;
    let file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(err)?;
    file.lock().map_err(err)?;
    Ok(file)
}
// The temporary file shares the destination filesystem. An unsuccessful write
// never truncates the existing destination. sync_all completes before rename.
pub fn atomic_write(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = target.parent().ok_or("Ungültiger Zielpfad.")?;
    let temp = parent.join(format!(".roxena-{}.tmp", stamp()?));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(err)?;
        file.write_all(bytes).map_err(err)?;
        file.sync_all().map_err(err)?;
        drop(file);
        fs::rename(&temp, target).map_err(err)?;
        #[cfg(unix)]
        {
            fs::File::open(parent)
                .and_then(|file| file.sync_all())
                .map_err(err)?;
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub path: String,
    pub base: String,
    pub content: String,
    pub updated: String,
}
fn draft_path(base: &Path, path: &str) -> Result<PathBuf, String> {
    resolve(
        base,
        &format!(".roxena/recovery/{}-{}.json", key(path), std::process::id()),
    )
}
fn drafts(base: &Path, path: &str) -> Result<Vec<(PathBuf, Draft)>, String> {
    entry_path(base, path)?;
    let directory = resolve(base, ".roxena/recovery")?;
    if !directory.exists() {
        return Ok(vec![]);
    }
    let mut result = Vec::new();
    for entry in fs::read_dir(directory).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with(&key(path))
            || !name.ends_with(".json")
            || !entry.file_type().map_err(err)?.is_file()
        {
            continue;
        }
        let draft: Draft =
            serde_json::from_str(&capped_text(&entry.path(), 64 * 1024 * 1024)?).map_err(err)?;
        if draft.path == path {
            result.push((entry.path(), draft));
        }
    }
    result.sort_by(|a, b| b.1.updated.cmp(&a.1.updated));
    Ok(result)
}
pub fn read_draft(base: &Path, path: &str) -> Result<Option<Draft>, String> {
    Ok(drafts(base, path)?
        .into_iter()
        .next()
        .map(|(_, draft)| draft))
}
pub fn save_draft(base: &Path, path: &str, original: &str, content: &str) -> Result<(), String> {
    entry_path(base, path)?;
    if content.len() as u64 > MAX_TEXT || original.len() as u64 > MAX_TEXT {
        return Err("Der Entwurf ist zu groß.".into());
    }
    let _lock = lock(base)?;
    let file = draft_path(base, path)?;
    fs::create_dir_all(file.parent().ok_or("Ungültiger Entwurfspfad.")?).map_err(err)?;
    let draft = Draft {
        path: path.into(),
        base: original.into(),
        content: content.into(),
        updated: stamp()?,
    };
    atomic_write(&file, &serde_json::to_vec(&draft).map_err(err)?)
}
pub fn clear_draft(base: &Path, path: &str, content: &str) -> Result<(), String> {
    let _lock = lock(base)?;
    for (file, draft) in drafts(base, path)? {
        if draft.content == content {
            fs::remove_file(file).map_err(err)?;
        }
    }
    Ok(())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub id: String,
    pub bytes: u64,
    pub modified_ms: u128,
}
fn history_path(base: &Path, path: &str) -> Result<PathBuf, String> {
    resolve(base, &format!(".roxena/history/{}", key(path)))
}
pub fn archive(base: &Path, path: &str, content: &str) -> Result<(), String> {
    entry_path(base, path)?;
    if content.len() as u64 > MAX_TEXT {
        return Err("Der Entwurf ist zu groß.".into());
    }
    let _lock = lock(base)?;
    let directory = history_path(base, path)?;
    fs::create_dir_all(&directory).map_err(err)?;
    atomic_write(
        &directory.join(format!("{}.txt", stamp()?)),
        content.as_bytes(),
    )?;
    for backup in backups(base, path)?.into_iter().skip(20) {
        fs::remove_file(directory.join(format!("{}.txt", backup.id))).map_err(err)?;
    }
    Ok(())
}
#[derive(Serialize)]
pub struct RecoveryEntry {
    pub path: String,
    pub updated: String,
}
pub fn recovery_index(base: &Path) -> Result<Vec<RecoveryEntry>, String> {
    let dir = resolve(base, ".roxena/recovery")?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut index = std::collections::BTreeMap::<String, String>::new();
    for entry in fs::read_dir(dir).map_err(err)? {
        let entry = entry.map_err(err)?;
        if !entry.file_type().map_err(err)?.is_file()
            || entry.path().extension().and_then(|e| e.to_str()) != Some("json")
        {
            continue;
        }
        let draft: Draft =
            serde_json::from_str(&capped_text(&entry.path(), 64 * 1024 * 1024)?).map_err(err)?;
        entry_path(base, &draft.path)?;
        if index
            .get(&draft.path)
            .is_none_or(|updated| updated < &draft.updated)
        {
            index.insert(draft.path, draft.updated);
        }
    }
    Ok(index
        .into_iter()
        .map(|(path, updated)| RecoveryEntry { path, updated })
        .collect())
}
pub fn copy_history(base: &Path, from: &str, to: &str) -> Result<(), String> {
    let old = history_path(base, from)?;
    let new = history_path(base, to)?;
    if !old.exists() {
        return Ok(());
    }
    fs::create_dir_all(&new).map_err(err)?;
    for item in backups(base, from)? {
        let target = new.join(format!("{}.txt", item.id));
        if target.exists() {
            continue;
        }
        let data = fs::read(old.join(format!("{}.txt", item.id))).map_err(err)?;
        atomic_write(&target, &data)?;
    }
    Ok(())
}
pub fn backups(base: &Path, path: &str) -> Result<Vec<Backup>, String> {
    entry_path(base, path)?;
    let dir = history_path(base, path)?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut result = Vec::new();
    for entry in fs::read_dir(dir).map_err(err)? {
        let entry = entry.map_err(err)?;
        if !entry.file_type().map_err(err)?.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(id) = name.strip_suffix(".txt") else {
            continue;
        };
        if !id.bytes().all(|b| b.is_ascii_digit()) {
            continue;
        }
        let metadata = entry.metadata().map_err(err)?;
        result.push(Backup {
            id: id.into(),
            bytes: metadata.len(),
            modified_ms: metadata
                .modified()
                .map_err(err)?
                .duration_since(UNIX_EPOCH)
                .map_err(err)?
                .as_millis(),
        });
    }
    result.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(result)
}
pub fn read_backup(base: &Path, path: &str, id: &str) -> Result<String, String> {
    entry_path(base, path)?;
    if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit()) {
        return Err("Ungültige Sicherung.".into());
    }
    text(&history_path(base, path)?.join(format!("{id}.txt")))
}
pub fn write(base: &Path, path: &str, content: &str, expected: &str) -> Result<(), String> {
    if content.len() as u64 > MAX_TEXT {
        return Err("Textdateien über 10 MB können nicht gespeichert werden.".into());
    }
    let _lock = lock(base)?;
    let target = entry_path(base, path)?;
    let current = text(&target).map_err(|error| format!("SAVE_UNAVAILABLE: {path}: {error}"))?;
    if current == content {
        return Ok(());
    }
    if current != expected {
        return Err(format!("SAVE_CONFLICT: {path} wurde außerhalb von SimpleLexEditor geändert. Deine Fassung wurde nicht überschrieben."));
    }
    let directory = history_path(base, path)?;
    fs::create_dir_all(&directory).map_err(err)?;
    atomic_write(
        &directory.join(format!("{}.txt", stamp()?)),
        current.as_bytes(),
    )?;
    // Retain the previous-version location used by older SimpleLexEditor releases.
    let latest = resolve(base, &format!(".roxena/backups/{path}"))?;
    fs::create_dir_all(latest.parent().ok_or("Ungültiger Sicherungspfad.")?).map_err(err)?;
    atomic_write(&latest, current.as_bytes())?;
    if text(&target)? != expected {
        return Err(format!(
            "SAVE_CONFLICT: {path} wurde während des Speicherns extern geändert."
        ));
    }
    atomic_write(&target, content.as_bytes())?;
    for backup in backups(base, path)?.into_iter().skip(20) {
        fs::remove_file(directory.join(format!("{}.txt", backup.id))).map_err(err)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "roxena-storage-{}-{}-{name}",
            std::process::id(),
            stamp().unwrap()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }
    #[test]
    fn rejects_external_edits_and_retains_versions() {
        let dir = fixture("conflict");
        fs::write(dir.join("main.tex"), "original").unwrap();
        write(&dir, "main.tex", "first", "original").unwrap();
        fs::write(dir.join("main.tex"), "external").unwrap();
        assert!(write(&dir, "main.tex", "second", "first")
            .unwrap_err()
            .starts_with("SAVE_CONFLICT:"));
        assert_eq!(text(&dir.join("main.tex")).unwrap(), "external");
        let saved = backups(&dir, "main.tex").unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(
            read_backup(&dir, "main.tex", &saved[0].id).unwrap(),
            "original"
        );
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn keeps_newer_recovery_and_bounds_history() {
        let dir = fixture("recovery");
        fs::write(dir.join("main.tex"), "0").unwrap();
        save_draft(&dir, "main.tex", "0", "newer").unwrap();
        clear_draft(&dir, "main.tex", "older").unwrap();
        assert_eq!(
            read_draft(&dir, "main.tex").unwrap().unwrap().content,
            "newer"
        );
        clear_draft(&dir, "main.tex", "newer").unwrap();
        assert!(read_draft(&dir, "main.tex").unwrap().is_none());
        for i in 0..25 {
            write(&dir, "main.tex", &(i + 1).to_string(), &i.to_string()).unwrap();
        }
        assert_eq!(backups(&dir, "main.tex").unwrap().len(), 20);
        assert!(read_backup(&dir, "main.tex", "../../x").is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn atomic_failure_preserves_destination_and_rejects_hidden_data() {
        let dir = fixture("atomic");
        fs::write(dir.join("main.tex"), "keep").unwrap();
        assert!(atomic_write(&dir.join("missing/file"), b"fail").is_err());
        assert_eq!(text(&dir.join("main.tex")).unwrap(), "keep");
        assert!(write(&dir, ".roxena/write.lock", "bad", "").is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn serializes_competing_writers_and_recovers_deleted_files() {
        let dir = fixture("writers");
        fs::write(dir.join("main.tex"), "base").unwrap();
        let first = dir.clone();
        let second = dir.clone();
        let a = std::thread::spawn(move || write(&first, "main.tex", "writer A", "base"));
        let b = std::thread::spawn(move || write(&second, "main.tex", "writer B", "base"));
        let outcomes = [a.join().unwrap(), b.join().unwrap()];
        assert_eq!(outcomes.iter().filter(|result| result.is_ok()).count(), 1);
        save_draft(&dir, "deleted.tex", "old", "recover me").unwrap();
        assert!(recovery_index(&dir)
            .unwrap()
            .iter()
            .any(|draft| draft.path == "deleted.tex"));
        assert_eq!(
            read_draft(&dir, "deleted.tex").unwrap().unwrap().content,
            "recover me"
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
