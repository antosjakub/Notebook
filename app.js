'use strict';

const $ = selector => document.querySelector(selector);
const status = $('#status');
const editor = $('#editor');
const editorBridge = window.FieldnotesEditor;
const preview = $('#preview');
const tree = $('#tree');
const storageMode = new URLSearchParams(location.search).get('storage');
const KEY = storageMode === 'regression' ? 'fieldnotes.regression.test.v1' : 'fieldnotes.v1';
const EMPTY = { projects: [], notes: [], preferences: { view: 'split', vim: true, sidebar: true } };

let state = structuredClone(EMPTY);
let current = null;
let activeProject = null;
let view = 'split';
let vim = false;
let sidebar = true;
let saveTimer;
let liveTimer;
let renderGeneration = 0;
const collapsedProjects = new Set();

function editorValue() {
  return editorBridge?.getValue() ?? editor.value;
}

function say(message) {
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) status.textContent = '';
  }, 3500);
}

function persist(candidate = state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(candidate));
    return true;
  } catch (error) {
    say(`Save failed; changes not saved: ${error.message}`);
    return false;
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || EMPTY;
    if (!Array.isArray(saved.projects) || !Array.isArray(saved.notes)) throw Error('invalid stored data');
    return {
      projects: saved.projects,
      notes: saved.notes,
      preferences: { ...EMPTY.preferences, ...(saved.preferences || {}) },
    };
  } catch (error) {
    say(`Could not load saved notes: ${error.message}`);
    return structuredClone(EMPTY);
  }
}

function commit(change) {
  const next = structuredClone(state);
  change(next);
  if (!persist(next)) return false;
  state = next;
  return true;
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function selectedNote() {
  return state.notes.find(note => note.id === current);
}

function selectedProject() {
  return state.projects.find(project => project.id === activeProject)
    || state.projects.find(project => project.id === selectedNote()?.project)
    || state.projects[0];
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
}

function markdown(source) {
  // Keep Mermaid source out of the normal Markdown parser. It may contain
  // pipes, dollar signs, and other characters that have meaning in Markdown.
  let mermaidPrefix = 'FIELDNOTESMERMAID';
  while (source.includes(mermaidPrefix)) mermaidPrefix += 'X';
  const mermaid = [];
  const withoutMermaid = source.replace(
    /^```mermaid[ \t]*\r?\n([\s\S]*?)^```[ \t]*(?:\r?\n|$)/gim,
    (_, diagram) => {
      const token = mermaidPrefix + mermaid.length + 'END';
      mermaid.push(diagram.trimEnd());
      return token;
    },
  );
  // Protect TeX from Markdown emphasis and line splitting, while leaving code
  // examples literal. Use a prefix absent from the source to avoid collisions.
  let prefix = 'FIELDNOTESMATH';
  while (withoutMermaid.includes(prefix)) prefix += 'X';
  const math = [];
  const processed = withoutMermaid.replace(
    /^```[^\n]*(?:\n[\s\S]*?^```[^\n]*(?=\n|$)|[\s\S]*$)|`[^`\n]+`|\\\$|\$\$([\s\S]+?)\$\$|(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/gm,
    (match, display, inlineMath) => {
      if (display === undefined && inlineMath === undefined) return match;
      const tex = (display ?? inlineMath).trim();
      const token = prefix + math.length + 'END';
      try {
        math.push(window.katex.renderToString(tex, {
          displayMode: display !== undefined,
          throwOnError: false,
          trust: false,
        }));
      } catch {
        math.push('<code>' + escapeHtml(tex) + '</code>');
      }
      return token;
    },
  );
  const html = markdownBlocks(processed).replace(
    new RegExp(prefix + '(\\d+)END', 'g'),
    (_, index) => math[Number(index)],
  );
  return {
    html: html.replace(
      new RegExp(mermaidPrefix + '(\\d+)END', 'g'),
      (_, index) => `<div class="mermaid-block" data-mermaid-index="${index}"></div>`,
    ),
    mermaid,
  };
}

function markdownBlocks(source) {
  const lines = source.split(/\r?\n/);
  const output = [];
  const tableRow = line => {
    if (!line.includes('|')) return null;
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
  };
  const tableSeparator = line => {
    const cells = tableRow(line);
    return cells?.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
  };
  const tableHtml = (header, rows) => {
    const headings = header.map(cell => `<th scope="col">${inline(cell)}</th>`).join('');
    const body = rows.map(row => `<tr>${header.map((_, index) => `<td>${inline(row[index] || '')}</td>`).join('')}</tr>`).join('');
    return `<table><thead><tr>${headings}</tr></thead>${body ? `<tbody>${body}</tbody>` : ''}</table>`;
  };
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) output.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^```/.test(line)) {
      flush();
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) code.push(lines[index++]);
      output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (tableRow(line) && index + 1 < lines.length && tableSeparator(lines[index + 1])) {
      flush();
      const header = tableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && tableRow(lines[index]) && !tableSeparator(lines[index])) rows.push(tableRow(lines[index++]));
      output.push(tableHtml(header, rows));
      index -= 1;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      flush();
      const level = heading[1].length;
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (/^\s*[-*]\s+/.test(line)) {
      flush();
      if (!output.length || !output.at(-1).startsWith('<ul>')) output.push('<ul>');
      output[output.length - 1] = output.at(-1).replace(/<\/ul>$/, '')
        + `<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li></ul>`;
    } else if (!line.trim()) {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return output.join('\n');
}

async function renderMermaid(diagrams, generation) {
  const blocks = [...preview.querySelectorAll('.mermaid-block')];
  if (!blocks.length) return;
  if (!window.mermaid) {
    blocks.forEach(block => {
      block.className = 'mermaid-error';
      block.textContent = 'Mermaid renderer unavailable';
    });
    return;
  }
  window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark' });
  await Promise.all(blocks.map(async (block, index) => {
    try {
      const result = await window.mermaid.render(`fieldnotes-mermaid-${generation}-${index}`, diagrams[index]);
      if (generation !== renderGeneration) return;
      block.innerHTML = result.svg;
      result.bindFunctions?.(block);
    } catch (error) {
      if (generation !== renderGeneration) return;
      block.className = 'mermaid-error';
      block.textContent = `Mermaid error: ${error.message || error}`;
    }
  }));
}

function render() {
  renderGeneration += 1;
  const generation = renderGeneration;
  const result = current ? markdown(editorValue()) : { html: '', mermaid: [] };
  preview.innerHTML = result.html;
  renderMermaid(result.mermaid, generation);
}

function setView(nextView, save = true) {
  if (selectedNote()?.live && nextView !== 'preview') return;
  view = nextView;
  $('#panes').className = `view-${view}`;
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  requestAnimationFrame(() => editorBridge?.refresh());
  if (save) commit(next => { next.preferences.view = view; });
}

function setSidebar(nextSidebar, save = true) {
  sidebar = nextSidebar;
  document.body.classList.toggle('sidebar-collapsed', !sidebar);
  const button = $('#toggleSidebar');
  button.setAttribute('aria-expanded', String(sidebar));
  button.textContent = sidebar ? '☰ Notes' : '☰ Show notes';
  requestAnimationFrame(() => editorBridge?.refresh());
  if (save) commit(next => { next.preferences.sidebar = sidebar; });
}

function draw() {
  tree.replaceChildren();
  for (const project of state.projects) {
    const projectRow = document.createElement('div');
    projectRow.className = 'project-row';
    const isCollapsed = collapsedProjects.has(project.id);
    const collapseButton = document.createElement('button');
    collapseButton.className = 'project-toggle';
    collapseButton.type = 'button';
    collapseButton.textContent = isCollapsed ? '▸' : '▾';
    collapseButton.title = isCollapsed ? 'Expand notes' : 'Collapse notes';
    collapseButton.setAttribute('aria-label', collapseButton.title);
    collapseButton.setAttribute('aria-expanded', String(!isCollapsed));
    collapseButton.onclick = () => {
      if (collapsedProjects.has(project.id)) collapsedProjects.delete(project.id);
      else collapsedProjects.add(project.id);
      draw();
    };
    const projectButton = document.createElement('button');
    projectButton.className = `project${project.id === activeProject ? ' selected-project' : ''}`;
    projectButton.textContent = project.name;
    projectButton.title = 'Use this project for a new note';
    projectButton.onclick = () => { activeProject = project.id; draw(); };
    projectRow.append(collapseButton, projectButton);
    tree.append(projectRow);
    if (isCollapsed) continue;
    for (const note of state.notes.filter(item => item.project === project.id)) {
      const noteButton = document.createElement('button');
      noteButton.className = `note${note.id === current ? ' selected' : ''}`;
      noteButton.textContent = note.name;
      noteButton.onclick = () => select(note.id);
      tree.append(noteButton);
    }
  }
}

function select(id) {
  clearInterval(liveTimer);
  current = id;
  const note = selectedNote();
  if (note) activeProject = note.project;
  const live = Boolean(note?.live);
  editor.disabled = !note || live;
  editor.value = note?.content || '';
  editorBridge?.setDisabled(!note || live);
  editorBridge?.setValue(note?.content || '');
  $('#title').textContent = note?.name || 'Choose a note';
  document.body.classList.toggle('live-note', live);
  document.querySelectorAll('[data-view="edit"], [data-view="split"]').forEach(button => { button.disabled = live; });
  if (live && view !== 'preview') setView('preview');
  render();
  draw();
  if (live) startLiveSync(note);
}

function startLiveSync(note) {
  let busy = false;
  const refresh = async () => {
    if (busy || current !== note.id) return;
    busy = true;
    try {
      const response = await fetch(`/api/live/${encodeURIComponent(note.live.token)}`, { cache: 'no-store' });
      if (!response.ok) throw Error('source file is unavailable');
      const file = await response.json();
      if (typeof file?.content !== 'string' || typeof file?.revision !== 'string') throw Error('invalid live file response');
      if (file.revision === selectedNote()?.live?.revision) return;
      if (!commit(next => {
        const target = next.notes.find(item => item.id === note.id);
        if (target) {
          target.content = file.content;
          target.live.revision = file.revision;
        }
      })) return;
      editor.value = file.content;
      editorBridge?.setValue(file.content);
      render();
      say(`Updated from ${note.name}`);
    } catch (error) {
      say(`Live preview paused: ${error.message}`);
    } finally {
      busy = false;
    }
  };
  refresh();
  liveTimer = setInterval(refresh, 1000);
}

function queueSave(noteId, text) {
  clearTimeout(saveTimer);
  status.textContent = 'Unsaved changes';
  saveTimer = setTimeout(() => {
    const saved = commit(next => {
      const note = next.notes.find(item => item.id === noteId);
      if (note) note.content = text;
    });
    if (saved) say('Saved locally');
    else status.textContent = 'Unsaved — save failed; editor text is recoverable';
  }, 250);
}

$('#newProject').onclick = () => {
  const name = prompt('Project name?');
  if (!name?.trim()) return;
  const project = { id: makeId(), name: name.trim() };
  if (commit(next => next.projects.push(project))) {
    activeProject = project.id;
    draw();
  }
};

$('#newNote').onclick = () => {
  const project = selectedProject();
  if (!project) return say('Create a project first');
  const name = prompt('Note name?', 'Untitled');
  if (!name?.trim()) return;
  const note = { id: makeId(), project: project.id, name: name.trim(), content: '' };
  if (commit(next => next.notes.push(note))) select(note.id);
};

$('#renameProject').onclick = () => {
  const project = selectedProject();
  if (!project) return say('Create a project first');
  const name = prompt('Rename project?', project.name);
  if (name?.trim() && commit(next => { next.projects.find(item => item.id === project.id).name = name.trim(); })) draw();
};

$('#deleteProject').onclick = () => {
  const project = selectedProject();
  if (!project) return say('Create a project first');
  if (!confirm(`Delete project “${project.name}” and all its notes?`)) return;
  if (commit(next => {
    next.projects = next.projects.filter(item => item.id !== project.id);
    next.notes = next.notes.filter(note => note.project !== project.id);
  })) {
    activeProject = state.projects[0]?.id || null;
    select(state.notes[0]?.id || null);
  }
};

$('#rename').onclick = () => {
  const note = selectedNote();
  if (!note) return say('Select a note first');
  const name = prompt('Rename note?', note.name);
  if (name?.trim() && commit(next => { next.notes.find(item => item.id === note.id).name = name.trim(); })) {
    $('#title').textContent = name.trim();
    draw();
  }
};

$('#delete').onclick = () => {
  const note = selectedNote();
  if (!note) return say('Select a note first');
  if (confirm(`Delete “${note.name}” permanently?`) && commit(next => {
    next.notes = next.notes.filter(item => item.id !== note.id);
  })) select(null);
};

editor.addEventListener('input', () => {
  if (!current || selectedNote()?.live) return;
  render();
  queueSave(current, editorValue());
});

document.querySelectorAll('[data-view]').forEach(button => {
  button.onclick = () => setView(button.dataset.view);
});

$('#toggleSidebar').onclick = () => setSidebar(!sidebar);

$('#import').onclick = () => $('#file').click();
$('#file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    let target = current;
    const imported = commit(next => {
      if (target) {
        const note = next.notes.find(item => item.id === target);
        if (!note) throw Error('selected note no longer exists');
        note.content = text;
      } else {
        if (!next.projects.length) next.projects.push({ id: makeId(), name: 'Imported' });
        const note = { id: makeId(), project: activeProject || next.projects[0].id, name: file.name.replace(/\.md$/i, ''), content: text };
        next.notes.push(note);
        target = note.id;
      }
    });
    if (imported) {
      select(target);
      say(`Imported ${file.name}`);
    }
  } catch (error) {
    say(`Import failed; changes not saved: ${error.message}`);
  }
  event.target.value = '';
};

$('#export').onclick = () => {
  const note = selectedNote();
  if (!note) return say('Select a note first');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([note.content], { type: 'text/markdown;charset=utf-8' }));
  link.download = `${note.name.replace(/[\\/:*?"<>|]/g, '_')}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

$('#vimToggle').onchange = event => {
  vim = event.target.checked;
  editorBridge?.setVim(vim);
  if (commit(next => { next.preferences.vim = vim; })) say(vim ? 'Vim mode: Normal' : 'Vim mode off');
};

async function importTerminalFile() {
  const url = new URL(location.href);
  const live = url.searchParams.has('terminal-live');
  const token = url.searchParams.get(live ? 'terminal-live' : 'terminal-import');
  if (!token) return;
  url.searchParams.delete(live ? 'terminal-live' : 'terminal-import');
  history.replaceState(null, '', url);
  try {
    const response = await fetch(`/api/${live ? 'live' : 'import'}/${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!response.ok) throw Error(live ? 'the live file was not found' : 'the queued import was not found');
    const file = await response.json();
    if (typeof file?.name !== 'string' || typeof file?.content !== 'string') throw Error('the queued import is invalid');
    let target;
    const imported = commit(next => {
      let project = next.projects.find(item => item.name === 'Imported');
      if (!project) {
        project = { id: makeId(), name: 'Imported' };
        next.projects.push(project);
      }
      const note = {
        id: makeId(), project: project.id, name: file.name || 'Untitled', content: file.content,
        ...(live ? { live: { token, revision: file.revision || '' } } : {}),
      };
      next.notes.push(note);
      target = note.id;
    });
    if (!imported) throw Error('the note could not be saved locally');
    select(target);
    say(live ? `Live previewing ${file.name}` : `Imported ${file.name}`);
  } catch (error) {
    say(`${live ? 'Live preview' : 'Terminal import'} failed: ${error.message}`);
  }
}

state = load();
view = state.preferences.view;
vim = Boolean(state.preferences.vim);
sidebar = state.preferences.sidebar !== false;
$('#vimToggle').checked = vim;
editorBridge?.setVim(vim);
draw();
setView(view, false);
setSidebar(sidebar, false);
select(null);
importTerminalFile();
