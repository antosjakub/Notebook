(function () {
  const fallback = document.getElementById('editor');
  const badge = document.getElementById('editorModeBadge');
  if (!fallback) return;

  let editor = null;
  let suppressChange = false;
  let vimEnabled = false;

  function setBadge(text, mode) {
    if (!badge) return;
    badge.textContent = text;
    badge.dataset.mode = mode;
  }

  function createEditor() {
    if (editor || !window.CodeMirror) return editor;

    editor = window.CodeMirror.fromTextArea(fallback, {
      mode: 'markdown',
      keyMap: 'default',
      lineNumbers: false,
      lineWrapping: true,
      theme: 'default',
      viewportMargin: Infinity,
      scrollbarStyle: 'native',
      inputStyle: 'textarea',
    });

    editor.on('change', () => {
      editor.save();
      if (!suppressChange) fallback.dispatchEvent(new Event('input', { bubbles: true }));
    });
    editor.on('vim-mode-change', details => {
      const mode = details?.mode || 'normal';
      setBadge(mode.toUpperCase(), mode);
    });
    editor.getWrapperElement().classList.add('fieldnotes-cm-wrapper');
    return editor;
  }

  window.FieldnotesEditor = {
    isReady() {
      return !!editor;
    },
    getCodeMirror() {
      return editor;
    },
    setValue(value) {
      const text = value ?? '';
      fallback.value = text;
      const instance = createEditor();
      if (instance) {
        suppressChange = true;
        try {
          // A new note must not inherit the previous note's undo history or mode.
          if (vimEnabled) instance.setOption('keyMap', 'default');
          instance.setValue(text);
          instance.clearHistory();
          if (vimEnabled) instance.setOption('keyMap', 'vim');
        } finally {
          suppressChange = false;
        }
      }
    },
    getValue() {
      return editor ? editor.getValue() : fallback.value;
    },
    setDisabled(disabled) {
      fallback.disabled = disabled;
      const instance = createEditor();
      if (instance) instance.setOption('readOnly', disabled ? 'nocursor' : false);
    },
    setVim(enabled) {
      vimEnabled = Boolean(enabled);
      const instance = createEditor();
      if (!instance || !window.CodeMirror.Vim) {
        setBadge(vimEnabled ? 'VIM UNAVAILABLE' : 'PLAIN', vimEnabled ? 'fallback' : 'plain');
        return;
      }
      instance.setOption('keyMap', vimEnabled ? 'vim' : 'default');
      setBadge(vimEnabled ? 'NORMAL' : 'PLAIN', vimEnabled ? 'normal' : 'plain');
      instance.refresh();
    },
    focus() {
      const instance = createEditor();
      if (instance) instance.focus();
      else fallback.focus();
    },
    refresh() {
      if (editor) editor.refresh();
    },
  };

  createEditor();
})();
