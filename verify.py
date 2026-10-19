#!/usr/bin/env python3
"""Offline structural checks. Browser behavior is covered by regression.html."""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent
app = (root / 'app.js').read_text()
html = (root / 'index.html').read_text()
regression = (root / 'regression.html').read_text()
launcher = (root / 'ks-notebook').read_text()

checks = [
    ('required controls', all(token in html for token in (
        'id="newProject"', 'id="newNote"', 'id="renameProject"',
        'id="deleteProject"', 'id="rename"', 'id="delete"',
        'id="vimToggle"', 'id="toggleSidebar"', 'data-view="edit"', 'data-view="split"',
        'data-view="preview"'))),
    ('transactional local persistence', all(token in app for token in (
        'localStorage.setItem(KEY, JSON.stringify(candidate))',
        'if (!persist(next)) return false;', 'state = next;',
        'editor text is recoverable'))),
    ('project and note grouping', all(token in app for token in (
        'function selectedProject()', 'activeProject',
        'state.notes.filter(item => item.project === project.id)',
        'next.notes.push(note)'))),
    ('import and export retain Markdown text', all(token in app for token in (
        'const text = await file.text()', 'content: text',
        'new Blob([note.content]'))),
    ('safe Markdown rendering', all(token in app for token in (
        'function escapeHtml(text)', "https?:\\/\\/", 'rel="noopener noreferrer"'))),
    ('Markdown tables', all(token in app for token in (
        'const tableRow = line', 'const tableSeparator = line', '<table><thead>', '<tbody>'))),
    ('CodeMirror Vim integration', all(token in html for token in (
        'codemirror.min.js', 'mode/markdown/markdown.min.js', 'keymap/vim.min.js',
        'fieldnotes-editor.js', 'id="editorModeBadge"')) and all(token in app for token in (
        'editorBridge?.setVim(vim)', 'editorBridge?.setValue', 'editorBridge?.getValue'))),
    ('saved view and Vim preferences', all(token in app for token in (
        'preferences: { view:', 'next.preferences.view = view',
        'next.preferences.vim = vim', 'next.preferences.sidebar = sidebar'))),
    ('collapsible sidebar and projects', all(token in app for token in (
        'function setSidebar', 'collapsedProjects', 'project-toggle', 'if (isCollapsed) continue;'))),
    ('browser regression page uses isolated storage',
        'fieldnotes.regression.test.v1' in app and 'storage=regression' in regression),
    ('terminal import launcher', all(token in launcher for token in (
        "prog=", "'ks-notebook'", "'--serve'", "queue_live", "terminal-", "source = Path(file_path).expanduser().resolve()",
        "ThreadingHTTPServer(('127.0.0.1', PORT), NotebookHandler)")) and all(token in app for token in (
        'async function importTerminalFile()', 'terminal-import', '/api/${', "name === 'Imported'"))),
    ('live preview is one-way and preview-only', all(token in launcher for token in (
        'def queue_live', "'/api/live/'", "hashlib.sha256")) and all(token in app for token in (
        'function startLiveSync(note)', 'setInterval(refresh, 1000)', 'selectedNote()?.live',
        "[data-view=\"edit\"], [data-view=\"split\"]"))),
    ('local asset links resolve', all((root / link.split('#')[0].split('?')[0]).is_file()
        for link in re.findall(r'(?:src|href)=["\']([^"\']+)', html, re.I)
        if link and not link.startswith(('data:', '#', 'http://', 'https://')))),
]

for name, passed in checks:
    print(f"{'PASS' if passed else 'FAIL'} | {name}")
sys.exit(not all(passed for _, passed in checks))
