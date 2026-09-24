# PDF Rename

Drop PDFs (or a folder), type a new name, press **Shift+Enter**, next file. Runs on Windows, macOS and Linux.

## Keys

| Key | Action |
|---|---|
| Shift+Enter or Ctrl/⌘+Enter | Rename and go to the next file |
| Alt+→ (Mac: ⌘+⌥+→) | Skip (keep the name) |
| Alt+← (Mac: ⌘+⌥+←) | Go back to the previous file |
| Ctrl/⌘+Alt/⌥+Z | Undo the last rename |
| PageUp / PageDown | Scroll the preview |
| Ctrl/⌘ + `+` / `-` / `0`, Ctrl/⌘+wheel | Zoom the preview in / out / back to page width |
| Esc | Finish (or cancel the overwrite question) |

The `.pdf` extension is added automatically. If the name already exists, the app asks: press Enter to overwrite or Esc to cancel.

## Develop

```bash
npm install
npm run dev        # run with hot reload
npm test           # unit tests
npm run typecheck
```

On WSL/Ubuntu, Electron needs `sudo apt-get install -y libnss3 libasound2t64`.

## Package

```bash
npm run build:linux   # AppImage   -> dist/
npm run build:win     # NSIS .exe  (build on Windows)
npm run build:mac     # .dmg       (must be built on macOS)
```

The builds are unsigned. The first time you open the app, Windows SmartScreen or macOS Gatekeeper will warn you.

## Layout

- `src/main/files.ts`: file access. Opens folders, reads and renames files, and only allows files the user chose.
- `src/renderer/src/session.ts`: the batch session. Handles the cursor, undo, the overwrite question and the summary. It has no DOM code.
- `src/renderer/src/preview.ts`: the pdf.js preview, `show(path)`.
- `src/renderer/src/main.ts`: DOM wiring. Renders the session state and maps keys to session calls.
- `src/shared/filename.ts`: filename rules shared by main and renderer.
