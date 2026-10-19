'use strict';

const $ = selector => document.querySelector(selector);
const status = $('#status');
const editor = $('#editor');
const editorBridge = window.FieldnotesEditor;
const preview = $('#preview');
const tree = $('#tree');
const storageMode = new URLSearchParams(location.search).get('storage');
const KEY = storageMode === 'regression' ? 'fieldnotes.regression.test.v1' : 'fieldnotes.v1';
const EMPTY = { projects: [], notes: [], preferences: { view: 'split', vim: false } };

let state = structuredClone(EMPTY);
let current = null;
let activeProject = null;
let view = 'split';
let vim = false;
let saveTimer;

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
  const lines = source.split(/\r?\n/);
  const output = [];
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

function render() {
  preview.innerHTML = current ? markdown(editorValue()) : '';
}

function setView(nextView, save = true) {
  view = nextView;
  $('#panes').className = `view-${view}`;
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  requestAnimationFrame(() => editorBridge?.refresh());
  if (save) commit(next => { next.preferences.view = view; });
}

function draw() {
  tree.replaceChildren();
  for (const project of state.projects) {
    const projectButton = document.createElement('button');
    projectButton.className = `project${project.id === activeProject ? ' selected-project' : ''}`;
    projectButton.textContent = project.name;
    projectButton.title = 'Use this project for a new note';
    projectButton.onclick = () => { activeProject = project.id; draw(); };
    tree.append(projectButton);
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
  current = id;
  const note = selectedNote();
  if (note) activeProject = note.project;
  editor.disabled = !note;
  editor.value = note?.content || '';
  editorBridge?.setDisabled(!note);
  editorBridge?.setValue(note?.content || '');
  $('#title').textContent = note?.name || 'Choose a note';
  render();
  draw();
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
  if (!current) return;
  render();
  queueSave(current, editorValue());
});

document.querySelectorAll('[data-view]').forEach(button => {
  button.onclick = () => setView(button.dataset.view);
});

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

state = load();
view = state.preferences.view;
vim = Boolean(state.preferences.vim);
$('#vimToggle').checked = vim;
editorBridge?.setVim(vim);
draw();
setView(view, false);
select(null);
