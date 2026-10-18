#!/usr/bin/env python3
"""Offline structural checks. Browser behavior is covered by regression.html."""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent
app = (root / 'app.js').read_text()
html = (root / 'index.html').read_text()
regression = (root / 'regression.html').read_text()

checks = [
    ('required controls', all(token in html for token in (
        'id="newProject"', 'id="newNote"', 'id="renameProject"',
        'id="deleteProject"', 'id="rename"', 'id="delete"',
        'id="vimToggle"', 'data-view="edit"', 'data-view="split"',
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
    ('Vim normal-mode edits are bounded', all(token in app for token in (
        'function moveVertical', "event.key === 'x'", "event.key === 'd' && event.ctrlKey",
        'event.preventDefault()', 'editor.setRangeText'))),
    ('saved view and Vim preferences', all(token in app for token in (
        'preferences: { view:', 'next.preferences.view = view',
        'next.preferences.vim = vim'))),
    ('browser regression page uses isolated storage',
        'fieldnotes.regression.test.v1' in app and 'storage=regression' in regression),
    ('local asset links resolve', all((root / link.split('#')[0].split('?')[0]).is_file()
        for link in re.findall(r'(?:src|href)=["\']([^"\']+)', html, re.I)
        if link and not link.startswith(('data:', '#')))),
]

for name, passed in checks:
    print(f"{'PASS' if passed else 'FAIL'} | {name}")
sys.exit(not all(passed for _, passed in checks))
