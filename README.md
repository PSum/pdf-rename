# PDF Rename

[![CI](https://github.com/PSum/pdf-rename/actions/workflows/ci.yml/badge.svg)](https://github.com/PSum/pdf-rename/actions/workflows/ci.yml)

Rename a pile of PDFs without touching the mouse. Drop the files, read the preview, type a name, press **Shift+Enter**, and the next PDF is ready with the cursor already in the name field. Runs on Windows, macOS and Linux.

## Features

- **Drop PDFs or a whole folder** onto the window, or click it to pick files. Folders add the PDFs directly inside them (not subfolders). Other files are ignored. The order is natural-alphabetical, so `scan2` comes before `scan10`.
- **Full PDF preview** next to the name field. Pages load as you scroll, and you can zoom.
- **Name field pre-filled and selected.** Type to replace the name, or use the arrow keys to edit it. `.pdf` is added for you.
- **Safe renaming:**
  - nothing is overwritten without asking
  - names that don't work on Windows are blocked on every OS
  - changing only the capitalisation (`invoice` → `Invoice`) works on Windows and macOS too
  - the last renames can be undone
- **Add more files while renaming.** Just drop them on the window and they go to the end of the list (duplicates are skipped).
- **Clear error messages:** for example "is open in another program" when a PDF is still open in Acrobat.
- **Summary at the end** ("Renamed 12 of 14 files"). Then press any key for the next batch.
- Follows the system light/dark theme, remembers its window size and position, and runs only one instance.

## Keyboard

The cursor always stays in the name field. Normal text editing keeps working, including Ctrl+←/→ to jump by word and Ctrl+Shift+←/→ to select by word.

| Key | Action |
|---|---|
| **Shift+Enter** or **Ctrl+Enter** (Mac: ⌘+Enter) | Rename and go to the next file |
| **Alt+→** (Mac: ⌘+⌥+→) | Next file, keep its name |
| **Alt+←** (Mac: ⌘+⌥+←) | Previous file (you can rename it again) |
| **Ctrl+Alt+Z** (Mac: ⌘+⌥+Z) | Undo the last rename, repeatable, also from the summary screen |
| **PageUp / PageDown** | Scroll the preview |
| **Ctrl + `+` / `-` / `0`**, Ctrl+mouse wheel | Zoom the preview in / out / back to page width |
| **Esc** | Finish the batch and show the summary |

If the new name already exists, the app asks first: **Enter** overwrites (this cannot be undone), **Esc** cancels.

### Name rules

These are blocked with a hint under the field:
- the characters `/ \ : * ? " < > |` and control characters
- empty names
- names ending in a dot or space
- Windows reserved names (`CON`, `NUL`, `COM1`, …)
- names that are too long

The same rules apply on every OS, so renamed files can be copied anywhere.

## Download and install

Installers are on the **[Releases page](https://github.com/PSum/pdf-rename/releases)**:

| System | File |
|---|---|
| Windows | `PDF Rename Setup x.y.z.exe`. The installer creates Start menu and desktop shortcuts and can be removed via *Apps & features*. |
| macOS | `PDF Rename-x.y.z-arm64.dmg` (Apple Silicon) or `PDF Rename-x.y.z-x64.dmg` (Intel) |
| Linux | `PDF Rename-x.y.z.AppImage` |

The builds are **not code-signed**, so the first launch shows a warning:
- **Windows:** before installing, right-click the installer → *Properties* → tick **Unblock** → OK. Or click *More info* → *Run anyway* on the SmartScreen dialog. The installed app then starts without warnings.
- **macOS:** right-click the app → *Open* → *Open*. If macOS says the app "is damaged", run `xattr -cr "/Applications/PDF Rename.app"`.
- **Linux:** `chmod +x "PDF Rename-"*.AppImage`, then start it.

To update, install the new version over the old one.

## Development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev          # start with hot reload
npm test             # unit tests (vitest)
npm run typecheck
npm run build        # bundle into out/
npm run e2e          # drive the built app end to end (headless Linux: xvfb-run -a npm run e2e)
```

On WSL/Ubuntu, Electron also needs `sudo apt-get install -y libnss3 libasound2t64`.

### Tests

- **Unit tests** (`tests/`) cover the filename rules, the file access module (including the permission checks and case-only renames), the batch session and the key bindings.
- **End-to-end test** (`scripts/e2e.mjs`) starts the real app. It drops a folder the way Explorer or Finder would, types, renames, undoes, zooms, checks that only one instance runs, and restarts the app to check the saved window size. It uses a throwaway profile and temp files.
- **CI** runs the typecheck, the unit tests and the end-to-end test on every push to `main`.

## Releases

```bash
npm version minor        # bumps the version in package.json, commits, tags v0.x.0
git push --follow-tags
```

The tag starts the *Release* workflow. It builds the Windows, macOS and Linux installers on GitHub's runners and attaches them to a **draft** release. Open the [Releases page](https://github.com/PSum/pdf-rename/releases), check the draft, and click *Publish release*.

Local builds go to `dist/`:

```bash
npm run build:linux     # AppImage
npm run build:win       # .exe, on Windows, or on Linux with Wine + wine32
npm run build:mac       # .dmg, macOS only
```

## Project layout

| Path | What it does |
|---|---|
| `src/main/index.ts` | Window, menu and single-instance setup, IPC wiring, `app://` protocol for the bundled UI |
| `src/main/files.ts` | File access: opens files and folders, reads, renames, turns error codes into plain text, and only touches files the user chose |
| `src/main/windowState.ts` | Remembers the window size and position |
| `src/preload/index.ts` | The small `window.api` bridge between the UI and main |
| `src/renderer/src/session.ts` | The batch session: cursor, undo history, overwrite question, appending files, summary. Contains no DOM code. |
| `src/renderer/src/preview.ts` | pdf.js preview: `show(path)`, `scroll`, `zoom` |
| `src/renderer/src/keys.ts` | Maps key presses to actions |
| `src/renderer/src/main.ts` | Renders the session state and routes keys and drops to it |
| `src/shared/filename.ts` | Filename rules shared by main and the UI |
| `scripts/e2e.mjs` | End-to-end test |
| `.github/workflows/` | `ci.yml` (tests) and `release.yml` (installers) |

Built with Electron, electron-vite, TypeScript and pdf.js.

## License

MIT
