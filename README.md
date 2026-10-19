# Fieldnotes

Fieldnotes is a portable project Markdown notebook. Open `index.html` in a modern browser, or serve this directory with `python3 -m http.server 8000`. Notes stay in that browser's localStorage: they are not synced or encrypted. CodeMirror 5.65.20 and its Vim keymap match MindGraph and are bundled locally, so editing works offline.

Create, rename, and delete projects and notes. Select a project name to make it the destination for the next note. Use Edit, Split, or Preview; the selected view and Vim toggle are remembered locally. Import creates a note if none is open, otherwise it replaces the open note's content. Export downloads the current note as Markdown. Deletions require confirmation.

The Vim checkbox enables CodeMirror's full Vim keymap. Normal mode uses a block cursor, Insert mode uses a line cursor, and the badge above the editor reports the current mode. The renderer supports headings, paragraphs, lists, fenced code, emphasis, inline code, and HTTP(S) links; it escapes raw HTML.

Writes use candidate-state transactions. If local storage rejects a write, committed data is left unchanged and the text remains in the editor with an unsaved-status message. A later edit retries the save.

LaTeX uses KaTeX 0.16.22, as in MindGraph: write `$E=mc^2$` for inline math and `$$...$$` for display equations (including multiple lines). Math inside code examples stays literal. The renderer and fonts are bundled locally for offline use; imports and exports retain the original TeX source.

## Checks and limitations

Run `python3 verify.py` for source and asset checks. `regression.html` is a self-contained browser regression page. It loads the real app in an iframe and uses only `fieldnotes.regression.test.v1`; it never reads or overwrites the production `fieldnotes.v1` key.

The browser suite covers storage-write failure and recovery, deletion cancellation, reload persistence, live preview, import/export, and CodeMirror Vim editing and cursor modes.
