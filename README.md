# Fieldnotes

Fieldnotes is a portable, dependency-free project Markdown notebook. Open `index.html` in a modern browser, or serve this directory with `python3 -m http.server 8000`. Notes stay in that browser's localStorage: they are not synced or encrypted.

Create, rename, and delete projects and notes. Select a project name to make it the destination for the next note. Use Edit, Split, or Preview; the selected view and Vim toggle are remembered locally. Import creates a note if none is open, otherwise it replaces the open note's content. Export downloads the current note as Markdown. Deletions require confirmation.

The Vim checkbox provides a small, explicit subset: `i`, `a`, Escape, `h`, `j`, `k`, `l`, `0`, `$`, `x`, and Ctrl-d. It is a textarea key handler, not a full Vim emulator. The renderer supports headings, paragraphs, lists, fenced code, emphasis, inline code, and HTTP(S) links; it escapes raw HTML.

Writes use candidate-state transactions. If local storage rejects a write, committed data is left unchanged and the text remains in the editor with an unsaved-status message. A later edit retries the save.

## Checks and limitations

Run `python3 verify.py` for nine offline source and asset checks. `regression.html` is a self-contained browser regression page. It loads the real app in an iframe and uses only `fieldnotes.regression.test.v1`; it never reads or overwrites the production `fieldnotes.v1` key.

The browser suite covers storage-write failure and recovery, deletion cancellation, reload persistence, live preview, import/export, and Vim boundaries. This machine has Firefox, but its headless renderer crashes before it can load the page, and it has no alternative JavaScript runtime. The browser suite therefore still needs to be opened in an ordinary local browser. No third-party runtime dependencies or remote assets are used.
