mod files;
mod names;

use files::{ExpandResult, FileAccess, RenameResult};
use tauri::{Emitter, Manager};

#[tauri::command]
fn open_paths(paths: Vec<String>, files: tauri::State<FileAccess>) -> ExpandResult {
    files.open(&paths)
}

/// Raw bytes (not a JSON array of numbers), so large PDFs cross over quickly.
#[tauri::command]
fn read_file(path: String, files: tauri::State<FileAccess>) -> Result<tauri::ipc::Response, String> {
    files.read(&path).map(tauri::ipc::Response::new)
}

#[tauri::command]
fn rename_file(
    from: String,
    new_base: String,
    overwrite: bool,
    files: tauri::State<FileAccess>,
) -> Result<RenameResult, String> {
    files.rename(&from, &new_base, overwrite)
}

/// Files/folders given on the command line: "Open with…", dropping onto the app icon, tests.
#[tauri::command]
fn launch_paths() -> Vec<String> {
    paths_from_args(std::env::args())
}

fn paths_from_args(args: impl IntoIterator<Item = String>) -> Vec<String> {
    args.into_iter().skip(1).filter(|a| !a.starts_with('-')).collect()
}

pub fn run() {
    tauri::Builder::default()
        // Must come first: a second launch hands its paths to this instance and exits.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
            let paths = paths_from_args(args);
            if !paths.is_empty() {
                let _ = app.emit("open-paths", paths);
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(FileAccess::default())
        .invoke_handler(tauri::generate_handler![open_paths, read_file, rename_file, launch_paths])
        .run(tauri::generate_context!())
        .expect("error while running PDF Rename");
}
