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

## Download

Installers for Windows (`.exe`), macOS (`.dmg`, Apple Silicon and Intel) and Linux (`.AppImage`) are on the [Releases page](https://github.com/PSum/pdf-rename/releases).

The builds are not code-signed, so the first launch shows a warning:
- **Windows:** before installing, right-click the installer → Properties → tick **Unblock**. Or click **More info → Run anyway** on the SmartScreen dialog.
- **macOS:** right-click the app → **Open** → **Open**. If macOS says the app is damaged, run `xattr -cr "/Applications/PDF Rename.app"`.
- **Linux:** `chmod +x PDF*.AppImage` and start it.

## Develop

```bash
npm install
npm run dev        # run with hot reload
npm test           # unit tests
npm run typecheck
npm run build && npm run e2e   # drive the built app end to end (Linux: xvfb-run -a npm run e2e)
```

On WSL/Ubuntu, Electron needs `sudo apt-get install -y libnss3 libasound2t64`.

## Release

```bash
npm version minor          # bumps package.json and creates tag v0.x.0
git push --follow-tags
```

GitHub Actions then builds on Windows, macOS and Linux and attaches the installers to a **draft** release. Check the draft and click *Publish*.

Local builds: `npm run build:linux`, `npm run build:win` (on Windows, or on Linux with Wine and wine32), `npm run build:mac` (macOS only).

## Layout

- `src/main/files.ts`: file access. Opens folders, reads and renames files, and only allows files the user chose.
- `src/renderer/src/session.ts`: the batch session. Handles the cursor, undo, the overwrite question and the summary. It has no DOM code.
- `src/renderer/src/preview.ts`: the pdf.js preview: `show(path)`, `scroll`, `zoom`.
- `src/renderer/src/main.ts`: DOM wiring. Renders the session state and maps keys to session calls.
- `src/main/windowState.ts`: remembers the window size and position.
- `src/shared/filename.ts`: filename rules shared by main and renderer.
- `scripts/e2e.mjs`: end-to-end test with real keystrokes and real drops.
