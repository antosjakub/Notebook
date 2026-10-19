# Fieldnotes

Fieldnotes is a portable project Markdown notebook. Open `index.html` in a modern browser, or serve this directory with `python3 -m http.server 8000`. Notes stay in that browser's localStorage: they are not synced or encrypted. CodeMirror 5.65.20 and its Vim keymap match MindGraph and are bundled locally, so editing works offline.

Create, rename, and delete projects and notes. Select a project name to make it the destination for the next note. Use Edit, Split, or Preview; the selected view and Vim toggle are remembered locally. Import creates a note if none is open, otherwise it replaces the open note's content. Export downloads the current note as Markdown. Deletions require confirmation.

Use the caret beside a project such as `Imported` to collapse its note list. Use `☰ Notes` in the header to hide or show the entire sidebar; this gives the editor and preview the full window width, and is remembered locally.

## Terminal import

After installing the launcher, run `ks-notebook diplom.md` from any folder. It resolves the file relative to the current folder, opens the notebook at `http://127.0.0.1:43117`, and creates a new note in the `Imported` project using the complete filename, such as `diplom.md`. Run `ks-notebook` without a file to open the notebook. `ks-notebook --no-open diplom.md` prints the local URL instead.

Run `ks-notebook-live diplom.md` for a one-way live preview. Saving the file in Neovim updates the notebook preview within about a second. Live notes always open in Preview, and their Edit and Split controls are disabled; the terminal file remains the source of truth.

Vim mode is enabled by default and uses CodeMirror's full Vim keymap. Normal mode uses a block cursor, Insert mode uses a line cursor, and the badge above the editor reports the current mode. The toggle remembers your choice. The renderer supports headings, paragraphs, tables, lists, fenced code, Mermaid diagrams, emphasis, inline code, LaTeX, and HTTP(S) links; it escapes raw HTML.

Writes use candidate-state transactions. If local storage rejects a write, committed data is left unchanged and the text remains in the editor with an unsaved-status message. A later edit retries the save.

LaTeX uses KaTeX 0.16.22, as in MindGraph: write `$E=mc^2$` for inline math and `$$...$$` for display equations (including multiple lines). Math inside code examples stays literal. The renderer and fonts are bundled locally for offline use; imports and exports retain the original TeX source.

Mermaid diagrams use the standard fenced form, for example ` ```mermaid\nflowchart LR\n  A[Start] --> B[Finish]\n``` `. They render in Preview while the original Mermaid source remains unchanged in the editor and in exports. The Mermaid browser bundle is included locally, so diagrams do not require a network connection.

## Checks and limitations

Run `python3 verify.py` for source and asset checks. `regression.html` is a self-contained browser regression page. It loads the real app in an iframe and uses only `fieldnotes.regression.test.v1`; it never reads or overwrites the production `fieldnotes.v1` key.

The browser suite covers storage-write failure and recovery, deletion cancellation, reload persistence, live preview, import/export, and CodeMirror Vim editing and cursor modes.
