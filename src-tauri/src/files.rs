//! File access for the UI: opening files and folders, reading and renaming PDFs.
//! The UI can read and rename only files the user opened (and what they were renamed to).

use crate::names::{is_pdf, natural_cmp, to_pdf_name, validate_name};
use serde::Serialize;
use std::collections::{BTreeSet, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Serialize, PartialEq)]
pub struct ExpandResult {
    pub files: Vec<String>,
    pub ignored: usize,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(untagged)]
pub enum RenameResult {
    Ok { ok: bool, path: String },
    Err { ok: bool, reason: Reason, message: String },
}

#[derive(Debug, Serialize, PartialEq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum Reason {
    Invalid,
    Exists,
    Missing,
    Error,
}

impl RenameResult {
    fn ok(path: &Path) -> Self {
        RenameResult::Ok { ok: true, path: path.to_string_lossy().into_owned() }
    }
    fn err(reason: Reason, message: impl Into<String>) -> Self {
        RenameResult::Err { ok: false, reason, message: message.into() }
    }
}

pub const NOT_OPENED: &str = "File was not opened by the user";

#[derive(Default)]
pub struct FileAccess {
    granted: Mutex<HashSet<PathBuf>>,
}

impl FileAccess {
    /// Turns dropped/picked files and folders into a sorted list of PDFs and grants access to them.
    pub fn open(&self, paths: &[String]) -> ExpandResult {
        let result = expand_paths(paths);
        self.granted.lock().unwrap().extend(result.files.iter().map(PathBuf::from));
        result
    }

    pub fn read(&self, path: &str) -> Result<Vec<u8>, String> {
        self.check(path)?;
        fs::read(path).map_err(|e| describe_io_error(&e, file_name(Path::new(path))))
    }

    /// Renames within the same folder; never overwrites unless `overwrite` is true.
    pub fn rename(&self, from: &str, new_base: &str, overwrite: bool) -> Result<RenameResult, String> {
        self.check(from)?;
        let result = rename_file(Path::new(from), new_base, overwrite);
        if let RenameResult::Ok { path, .. } = &result {
            self.granted.lock().unwrap().insert(PathBuf::from(path));
        }
        Ok(result)
    }

    fn check(&self, path: &str) -> Result<(), String> {
        if self.granted.lock().unwrap().contains(Path::new(path)) { Ok(()) } else { Err(NOT_OPENED.into()) }
    }
}

fn file_name(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

fn expand_paths(paths: &[String]) -> ExpandResult {
    let mut found = BTreeSet::new();
    let mut ignored = 0;
    for p in paths {
        let abs = std::path::absolute(p).unwrap_or_else(|_| PathBuf::from(p));
        match fs::metadata(&abs) {
            Ok(m) if m.is_dir() => match fs::read_dir(&abs) {
                Ok(entries) => {
                    for e in entries.flatten() {
                        let is_file = e.file_type().map(|t| t.is_file()).unwrap_or(false);
                        if is_file && is_pdf(&e.file_name().to_string_lossy()) {
                            found.insert(e.path());
                        } else {
                            ignored += 1;
                        }
                    }
                }
                Err(_) => ignored += 1,
            },
            Ok(m) if m.is_file() && is_pdf(&abs.to_string_lossy()) => {
                found.insert(abs);
            }
            _ => ignored += 1,
        }
    }
    let mut files: Vec<String> = found.into_iter().map(|p| p.to_string_lossy().into_owned()).collect();
    files.sort_by(|a, b| {
        natural_cmp(&file_name(Path::new(a)), &file_name(Path::new(b))).then_with(|| natural_cmp(a, b))
    });
    ExpandResult { files, ignored }
}

/// Turns I/O errors into something a user can act on.
pub fn describe_io_error(err: &io::Error, file_name: String) -> String {
    use io::ErrorKind::*;
    // Windows: ERROR_SHARING_VIOLATION (32) / ERROR_LOCK_VIOLATION (33) when another program has it open.
    let busy = cfg!(windows) && matches!(err.raw_os_error(), Some(32 | 33));
    match err.kind() {
        _ if busy => format!("{file_name} is open in another program or you don't have permission. Close it and try again."),
        PermissionDenied | ResourceBusy => {
            format!("{file_name} is open in another program or you don't have permission. Close it and try again.")
        }
        NotFound => format!("{file_name} no longer exists"),
        InvalidFilename => "Name is too long for this folder".into(),
        StorageFull => "The disk is full".into(),
        ReadOnlyFilesystem => "This folder is read-only".into(),
        _ => err.to_string(),
    }
}

/// True if both paths are the same file, e.g. a case-only change on a case-insensitive filesystem.
#[cfg(unix)]
fn same_file(a: &Path, b: &Path) -> bool {
    // canonicalize keeps the caller's spelling on Unix, so compare the file identity instead.
    use std::os::unix::fs::MetadataExt;
    match (fs::metadata(a), fs::metadata(b)) {
        (Ok(x), Ok(y)) => x.dev() == y.dev() && x.ino() == y.ino(),
        _ => false,
    }
}

/// True if both paths are the same file, e.g. a case-only change on a case-insensitive filesystem.
#[cfg(windows)]
fn same_file(a: &Path, b: &Path) -> bool {
    // On Windows canonicalize resolves to the name as stored on disk.
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

fn rename_file(from: &Path, new_base: &str, overwrite: bool) -> RenameResult {
    if let Some(error) = validate_name(new_base) {
        return RenameResult::err(Reason::Invalid, error);
    }
    let dir = from.parent().unwrap_or(Path::new("."));
    let target = dir.join(to_pdf_name(new_base));
    if target == from {
        return RenameResult::ok(from);
    }
    if fs::symlink_metadata(from).is_err() {
        return RenameResult::err(Reason::Missing, format!("{} no longer exists", file_name(from)));
    }

    let attempt = || -> io::Result<Option<RenameResult>> {
        if fs::symlink_metadata(&target).is_ok() {
            if same_file(from, &target) {
                // Case-only rename on a case-insensitive filesystem: go through a temp name.
                let tmp = dir.join(format!(".{}.{}.tmp", file_name(from), std::process::id()));
                fs::rename(from, &tmp)?;
                fs::rename(&tmp, &target)?;
                return Ok(Some(RenameResult::ok(&target)));
            }
            if !overwrite {
                return Ok(Some(RenameResult::err(Reason::Exists, format!("{} exists", file_name(&target)))));
            }
        }
        fs::rename(from, &target)?;
        Ok(None)
    };
    match attempt() {
        Ok(Some(result)) => result,
        Ok(None) => RenameResult::ok(&target),
        Err(e) => {
            let reason = if e.kind() == io::ErrorKind::NotFound { Reason::Missing } else { Reason::Error };
            RenameResult::err(reason, describe_io_error(&e, file_name(from)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Dir(PathBuf);
    impl Dir {
        fn new() -> Self {
            let p = std::env::temp_dir().join(format!("pdfrename-test-{}-{}", std::process::id(), rand_suffix()));
            fs::create_dir_all(&p).unwrap();
            Dir(p)
        }
        fn p(&self, name: &str) -> String {
            self.0.join(name).to_string_lossy().into_owned()
        }
        fn touch(&self, name: &str) {
            fs::write(self.0.join(name), name).unwrap();
        }
        fn read(&self, name: &str) -> String {
            fs::read_to_string(self.0.join(name)).unwrap()
        }
        fn list(&self) -> Vec<String> {
            let mut v: Vec<String> = fs::read_dir(&self.0).unwrap().map(|e| file_name(&e.unwrap().path())).collect();
            v.sort();
            v
        }
    }
    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn rand_suffix() -> u128 {
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
    }
    fn ok_path(r: &RenameResult) -> &str {
        match r {
            RenameResult::Ok { path, .. } => path,
            other => panic!("expected ok, got {other:?}"),
        }
    }
    fn reason(r: &RenameResult) -> Reason {
        match r {
            RenameResult::Err { reason, .. } => *reason,
            other => panic!("expected error, got {other:?}"),
        }
    }

    #[test]
    fn open_expands_folders_top_level_filters_and_sorts_naturally() {
        let d = Dir::new();
        fs::create_dir(d.0.join("sub")).unwrap();
        for n in ["b10.pdf", "b2.PDF", "a.txt", "sub/deep.pdf"] {
            d.touch(n);
        }
        let fa = FileAccess::default();
        let res = fa.open(&[d.p(""), d.p("b2.PDF"), d.p("missing.pdf")]);
        assert_eq!(res.files, vec![d.p("b2.PDF"), d.p("b10.pdf")]);
        assert_eq!(res.ignored, 3); // a.txt, sub/, missing.pdf
    }

    #[test]
    fn refuses_files_that_were_not_opened() {
        let d = Dir::new();
        d.touch("secret.pdf");
        let fa = FileAccess::default();
        assert_eq!(fa.read(&d.p("secret.pdf")).unwrap_err(), NOT_OPENED);
        assert_eq!(fa.rename(&d.p("secret.pdf"), "x", false).unwrap_err(), NOT_OPENED);
    }

    #[test]
    fn grants_opened_files_and_their_new_names() {
        let d = Dir::new();
        d.touch("a.pdf");
        let fa = FileAccess::default();
        fa.open(&[d.p("")]);
        assert_eq!(fa.read(&d.p("a.pdf")).unwrap(), b"a.pdf");
        fa.rename(&d.p("a.pdf"), "b", false).unwrap();
        assert_eq!(fa.read(&d.p("b.pdf")).unwrap(), b"a.pdf");
    }

    #[test]
    fn renames_and_adds_pdf() {
        let d = Dir::new();
        d.touch("old.pdf");
        let fa = FileAccess::default();
        fa.open(&[d.p("old.pdf")]);
        let r = fa.rename(&d.p("old.pdf"), "New Name", false).unwrap();
        assert_eq!(ok_path(&r), d.p("New Name.pdf"));
        assert_eq!(d.read("New Name.pdf"), "old.pdf");
    }

    #[test]
    fn rejects_invalid_names_without_touching_the_file() {
        let d = Dir::new();
        d.touch("old.pdf");
        let fa = FileAccess::default();
        fa.open(&[d.p("old.pdf")]);
        assert_eq!(reason(&fa.rename(&d.p("old.pdf"), "a:b", false).unwrap()), Reason::Invalid);
        assert_eq!(d.read("old.pdf"), "old.pdf");
    }

    #[test]
    fn reports_conflicts_and_only_overwrites_when_asked() {
        let d = Dir::new();
        d.touch("a.pdf");
        d.touch("b.pdf");
        let fa = FileAccess::default();
        fa.open(&[d.p("")]);
        assert_eq!(reason(&fa.rename(&d.p("a.pdf"), "b", false).unwrap()), Reason::Exists);
        assert_eq!(d.read("b.pdf"), "b.pdf");
        assert_eq!(ok_path(&fa.rename(&d.p("a.pdf"), "b", true).unwrap()), d.p("b.pdf"));
        assert_eq!(d.read("b.pdf"), "a.pdf");
    }

    #[test]
    fn handles_case_only_renames() {
        let d = Dir::new();
        d.touch("invoice.pdf");
        let fa = FileAccess::default();
        fa.open(&[d.p("invoice.pdf")]);
        assert_eq!(ok_path(&fa.rename(&d.p("invoice.pdf"), "Invoice", false).unwrap()), d.p("Invoice.pdf"));
        assert_eq!(d.list(), vec!["Invoice.pdf"]);
    }

    #[test]
    fn reports_files_deleted_after_opening() {
        let d = Dir::new();
        d.touch("gone.pdf");
        let fa = FileAccess::default();
        fa.open(&[d.p("gone.pdf")]);
        fs::remove_file(d.0.join("gone.pdf")).unwrap();
        assert_eq!(reason(&fa.rename(&d.p("gone.pdf"), "x", false).unwrap()), Reason::Missing);
    }

    #[test]
    fn undo_by_renaming_back_refuses_if_old_name_reused() {
        let d = Dir::new();
        d.touch("orig.pdf");
        let fa = FileAccess::default();
        fa.open(&[d.p("orig.pdf")]);
        fa.rename(&d.p("orig.pdf"), "renamed", false).unwrap();
        fs::write(d.0.join("orig.pdf"), "other").unwrap();
        assert_eq!(reason(&fa.rename(&d.p("renamed.pdf"), "orig", false).unwrap()), Reason::Exists);
        fs::remove_file(d.0.join("orig.pdf")).unwrap();
        assert_eq!(ok_path(&fa.rename(&d.p("renamed.pdf"), "orig", false).unwrap()), d.p("orig.pdf"));
    }

    #[cfg(unix)]
    #[test]
    fn explains_a_rename_blocked_by_permissions() {
        use std::os::unix::fs::PermissionsExt;
        if unsafe { libc_geteuid() } == 0 {
            return; // root ignores permissions
        }
        let d = Dir::new();
        d.touch("locked.pdf");
        let fa = FileAccess::default();
        fa.open(&[d.p("")]);
        fs::set_permissions(&d.0, fs::Permissions::from_mode(0o555)).unwrap();
        let r = fa.rename(&d.p("locked.pdf"), "x", false).unwrap();
        fs::set_permissions(&d.0, fs::Permissions::from_mode(0o755)).unwrap();
        match r {
            RenameResult::Err { reason: Reason::Error, message, .. } => {
                assert!(message.contains("open in another program or you don't have permission"), "{message}")
            }
            other => panic!("{other:?}"),
        }
    }

    #[cfg(unix)]
    unsafe fn libc_geteuid() -> u32 {
        unsafe extern "C" {
            fn geteuid() -> u32;
        }
        unsafe { geteuid() }
    }

    #[test]
    fn serializes_like_the_typescript_contract() {
        let ok = serde_json::to_value(RenameResult::ok(Path::new("/d/a.pdf"))).unwrap();
        assert_eq!(ok, serde_json::json!({ "ok": true, "path": "/d/a.pdf" }));
        let err = serde_json::to_value(RenameResult::err(Reason::Exists, "a.pdf exists")).unwrap();
        assert_eq!(err, serde_json::json!({ "ok": false, "reason": "exists", "message": "a.pdf exists" }));
    }
}
