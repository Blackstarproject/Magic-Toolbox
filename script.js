/* HoloDesk */

(async function(){
  // DOM helpers
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // Panels
  const tabWorkspace = $('#tab-workspace');
  const tabTools = $('#tab-tools');
  const tabConverter = $('#tab-converter');
  const tabStorage = $('#tab-storage');
  const panels = {
    workspace: $('#workspace'),
    tools: $('#tools'),
    converter: $('#converter'),
    storage: $('#storageEditor')
  };

  function showPanel(name){
    for(const k in panels) {
      panels[k].classList.toggle('hidden', k !== name);
    }
    // nav aria-pressed
    tabWorkspace.setAttribute('aria-pressed', name==='workspace');
    tabTools.setAttribute('aria-pressed', name==='tools');
    tabConverter.setAttribute('aria-pressed', name==='converter');
    tabStorage.setAttribute('aria-pressed', name==='storage');
  }

  tabWorkspace.addEventListener('click', ()=> showPanel('workspace'));
  tabTools.addEventListener('click', ()=> showPanel('tools'));
  tabConverter.addEventListener('click', ()=> showPanel('converter'));
  tabStorage.addEventListener('click', ()=> showPanel('storage'));

  // Utility functions
  const LOCALSTORAGE_PREFIX = 'holodesk-';
  const isLocalStorageKey = (k) => k.startsWith(LOCALSTORAGE_PREFIX);
  function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // IndexedDB Brains 
  let db;
  const DB_NAME = 'HoloDeskDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'convertedFiles';

  function initDB(){
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = (e) => {
        db = e.target.result;
        resolve();
      };

      request.onerror = (e) => {
        console.error('IndexedDB error:', e.target.errorCode);
        reject('IndexedDB initialization failed');
      };
    });
  }

  function saveFile(fileData){
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(fileData);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e);
    });
  }

  function deleteFile(id){
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e);
    });
  }

  function getAllFiles(){
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e);
    });
  }

  // WORKSPACE: Notes 
  function loadNotes(){
    const raw = localStorage.getItem(LOCALSTORAGE_PREFIX + 'notes');
    return raw ? JSON.parse(raw) : [];
  }
  function saveNotes(notes){
    localStorage.setItem(LOCALSTORAGE_PREFIX + 'notes', JSON.stringify(notes));
  }

  function renderNotesList(){
    const notes = loadNotes();
    const listEl = $('#notesList');
    listEl.innerHTML = '';
    if(notes.length === 0){
      listEl.innerHTML = '<div class="muted">No saved notes.</div>';
      return;
    }
    notes.forEach((note, idx) => {
      const el = document.createElement('div');
      el.classList.add('saved-item');
      el.innerHTML = `
        <div>
          <div class="saved-item-name">${note.title || 'Untitled'}</div>
          <div class="muted small">${new Date(note.timestamp).toLocaleString()}</div>
        </div>
        <div class="saved-item-actions">
          <button data-idx="${idx}" class="btn small load-note">Load</button>
          <button data-idx="${idx}" class="btn small delete-note">Delete</button>
        </div>
      `;
      listEl.appendChild(el);
    });

    listEl.querySelectorAll('.load-note').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const note = loadNotes()[idx];
        if(note) $('#noteEditor').value = note.content;
      });
    });

    listEl.querySelectorAll('.delete-note').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        if(confirm('Delete this note?')){
          const notes = loadNotes();
          notes.splice(idx, 1);
          saveNotes(notes);
          renderNotesList();
        }
      });
    });
  }

  $('#btnSaveNote').addEventListener('click', () => {
    const content = $('#noteEditor').value.trim();
    if(!content) return alert('Note is empty.');
    const notes = loadNotes();
    notes.push({ title: content.substring(0, 30), content, timestamp: new Date().toISOString() });
    saveNotes(notes);
    renderNotesList();
    $('#noteEditor').value = '';
  });

  $('#btnClearNote').addEventListener('click', () => {
    $('#noteEditor').value = '';
  });

  // WORKSPACE: Tasks 
  function loadTasks(){
    const raw = localStorage.getItem(LOCALSTORAGE_PREFIX + 'tasks');
    return raw ? JSON.parse(raw) : [];
  }
  function saveTasks(tasks){
    localStorage.setItem(LOCALSTORAGE_PREFIX + 'tasks', JSON.stringify(tasks));
  }

  function renderTodos(){
    const tasks = loadTasks();
    const listEl = $('#taskList');
    listEl.innerHTML = '';
    if(tasks.length === 0){
      listEl.innerHTML = '<li class="muted">No tasks yet.</li>';
      return;
    }
    tasks.forEach((task, idx) => {
      const li = document.createElement('li');
      li.classList.add('task-item');
      li.innerHTML = `
        <input type="checkbox" ${task.completed ? 'checked' : ''} data-idx="${idx}" class="task-check">
        <span style="flex:1; ${task.completed ? 'text-decoration:line-through; opacity:0.6;' : ''}">${task.text}</span>
        <button data-idx="${idx}" class="btn small delete-task">Delete</button>
      `;
      listEl.appendChild(li);
    });

    listEl.querySelectorAll('.task-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const tasks = loadTasks();
        tasks[idx].completed = e.target.checked;
        saveTasks(tasks);
        renderTodos();
      });
    });

    listEl.querySelectorAll('.delete-task').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const tasks = loadTasks();
        tasks.splice(idx, 1);
        saveTasks(tasks);
        renderTodos();
      });
    });
  }

  $('#addTask').addEventListener('click', () => {
    const text = $('#taskInput').value.trim();
    if(!text) return;
    const tasks = loadTasks();
    tasks.push({ text, completed: false, timestamp: new Date().toISOString() });
    saveTasks(tasks);
    $('#taskInput').value = '';
    renderTodos();
  });

  $('#taskInput').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') $('#addTask').click();
  });

  // WORKSPACE STUFF: Snippets 
  function loadSnippets(){
    const raw = localStorage.getItem(LOCALSTORAGE_PREFIX + 'snippets');
    return raw ? JSON.parse(raw) : [];
  }
  function saveSnippets(snippets){
    localStorage.setItem(LOCALSTORAGE_PREFIX + 'snippets', JSON.stringify(snippets));
  }

  function renderSnippets(){
    const snippets = loadSnippets();
    const listEl = $('#snippets');
    listEl.innerHTML = '';
    if(snippets.length === 0){
      listEl.innerHTML = '<div class="muted">No snippets saved.</div>';
      return;
    }
    snippets.forEach((snip, idx) => {
      const el = document.createElement('div');
      el.classList.add('saved-item');
      el.innerHTML = `
        <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${snip.text}</div>
        <div class="saved-item-actions">
          <button data-idx="${idx}" class="btn small copy-snippet">Copy</button>
          <button data-idx="${idx}" class="btn small delete-snippet">Delete</button>
        </div>
      `;
      listEl.appendChild(el);
    });

    listEl.querySelectorAll('.copy-snippet').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const snip = loadSnippets()[idx];
        if(snip){
          navigator.clipboard.writeText(snip.text).then(() => {
            alert('Copied to clipboard!');
          });
        }
      });
    });

    listEl.querySelectorAll('.delete-snippet').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        if(confirm('Delete snippet?')){
          const snippets = loadSnippets();
          snippets.splice(idx, 1);
          saveSnippets(snippets);
          renderSnippets();
        }
      });
    });
  }

  $('#saveSnippet').addEventListener('click', () => {
    const text = $('#snippetInput').value.trim();
    if(!text) return;
    const snippets = loadSnippets();
    snippets.push({ text, timestamp: new Date().toISOString() });
    saveSnippets(snippets);
    $('#snippetInput').value = '';
    renderSnippets();
  });

  // TOOLS: Color Picker 
  const colorPresets = ['#7c4dff', '#00e5ff', '#ff4081', '#ffeb3b', '#4caf50', '#ff5722', '#2196f3', '#9c27b0', '#ff9800', '#795548'];
  
  function renderColorGrid(){
    const grid = $('#colorGrid');
    grid.innerHTML = '';
    colorPresets.forEach(color => {
      const swatch = document.createElement('div');
      swatch.classList.add('color-swatch');
      swatch.style.background = color;
      swatch.dataset.color = color;
      swatch.addEventListener('click', () => {
        $('#customColor').value = color;
        alert('Color selected: ' + color);
      });
      grid.appendChild(swatch);
    });
  }

  $('#applyCustomColor').addEventListener('click', () => {
    const hex = $('#customColor').value.trim();
    if(/^#[0-9A-Fa-f]{6}$/.test(hex)){
      alert('Applied color: ' + hex);
      document.body.style.setProperty('--accent1', hex);
    } else {
      alert('Invalid hex color. Use format: #RRGGBB');
    }
  });

  $('#copyColor').addEventListener('click', () => {
    const hex = $('#customColor').value.trim();
    if(hex){
      navigator.clipboard.writeText(hex).then(() => alert('Copied: ' + hex));
    }
  });

  // TOOLS: Unit Converter 
  const unitFactors = {
    m: 1,
    km: 1000,
    ft: 0.3048,
    mi: 1609.34
  };

  $('#ucConvert').addEventListener('click', () => {
    const value = parseFloat($('#ucValue').value);
    const from = $('#ucFrom').value;
    const to = $('#ucTo').value;
    if(isNaN(value)) return alert('Enter a valid number.');
    
    const meters = value * unitFactors[from];
    const result = meters / unitFactors[to];
    $('#ucResult').textContent = `${value} ${from} = ${result.toFixed(4)} ${to}`;
  });

  // TOOL BOX: Text Analyzer 
  $('#analyzeBtn').addEventListener('click', () => {
    const text = $('#textToAnalyze').value;
    const chars = text.length;
    const words = text.trim().split(/\s+/).filter(w => w).length;
    const lines = text.split('\n').length;
    $('#textResult').textContent = `Characters: ${chars} | Words: ${words} | Lines: ${lines}`;
  });

  $('#hashBtn').addEventListener('click', async () => {
    const text = $('#textToAnalyze').value;
    if(!text) return alert('Enter text to hash.');
    
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    $('#hashResult').textContent = 'SHA-256: ' + hashHex;
  });

  // File Converter (Simple Client-Side) This handles basic audio format conversions using the browser's built-in capabilities
  
  let inputFile = null;
  
  $('#mediaFile').addEventListener('change', (ev)=>{
    inputFile = ev.target.files[0];
    if(inputFile){
      $('#startFF').disabled = false;
      $('#ffStatus').textContent = `Ready to convert: ${inputFile.name}`;
    }
  });

  async function convertFile(){
    if(!inputFile) {
      alert('Please select a file first.');
      return;
    }

    const outputFormat = $('#outFormat').value;
    const outputName = `converted_${Date.now()}.${outputFormat}`;

    try{
      $('#startFF').disabled = true;
      $('#cancelFF').disabled = false;
      $('#ffStatus').textContent = 'Processing...';
      $('#ffLog').textContent = 'Starting conversion...\n';
      $('#ffProgressInner').style.width = '10%';

      // For audio files, we can use Web Audio API
      const isAudio = ['mp3', 'wav', 'ogg', 'aac', 'flac'].includes(outputFormat);
      
      if(isAudio && inputFile.type.startsWith('audio')){
        // Simple audio conversion using AudioContext
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await inputFile.arrayBuffer();
        
        $('#ffLog').textContent += 'Decoding audio...\n';
        $('#ffProgressInner').style.width = '30%';
        
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        $('#ffLog').textContent += 'Converting format...\n';
        $('#ffProgressInner').style.width = '60%';
        
        // Create WAV blob (most compatible)
        const wavBlob = audioBufferToWav(audioBuffer);
        
        $('#ffProgressInner').style.width = '100%';
        
        // Save to IndexedDB
        const fileId = uuidv4();
        await saveFile({
          id: fileId,
          name: outputName.replace(/\.\w+$/, '.wav'),
          mimeType: 'audio/wav',
          size: wavBlob.size,
          timestamp: new Date().toISOString(),
          blob: wavBlob
        });
        
        $('#ffLog').textContent += 'Conversion complete!\n';
        $('#ffStatus').textContent = 'Complete! (converted to WAV format)';
        
      } else {
        // For video or unsupported formats, just store the original
        $('#ffLog').textContent += 'Storing file (format conversion requires ffmpeg.wasm)...\n';
        $('#ffProgressInner').style.width = '100%';
        
        const fileId = uuidv4();
        await saveFile({
          id: fileId,
          name: inputFile.name,
          mimeType: inputFile.type,
          size: inputFile.size,
          timestamp: new Date().toISOString(),
          blob: inputFile
        });
        
        $('#ffStatus').textContent = 'File stored (note: format conversion requires full ffmpeg)';
        $('#ffLog').textContent += 'Note: Full format conversion requires ffmpeg.wasm\n';
      }
      
      renderConvertedList();
      $('#startFF').disabled = false;
      $('#cancelFF').disabled = true;
      inputFile = null;
      $('#mediaFile').value = '';
      
    } catch(e){
      console.error('Conversion failed:', e);
      $('#ffStatus').textContent = `Error: ${e.message}`;
      $('#ffLog').textContent += `Error: ${e.message}\n`;
      $('#startFF').disabled = false;
      $('#cancelFF').disabled = true;
    }
  }

  // Helper function to convert AudioBuffer to WAV
  function audioBufferToWav(buffer) {
    const length = buffer.length * buffer.numberOfChannels * 2 + 44;
    const wav = new ArrayBuffer(length);
    const view = new DataView(wav);
    const channels = [];
    let offset = 0;
    let pos = 0;

    // Write WAV header
    const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
    const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };
   // Relative Info
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(buffer.numberOfChannels);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels); // avg. bytes/sec
    setUint16(buffer.numberOfChannels * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // Write interleaved data
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([wav], { type: 'audio/wav' });
  }

  $('#startFF').addEventListener('click', convertFile);
  $('#cancelFF').addEventListener('click', () => {
    alert('Process cannot be cancelled. Please wait for completion.');
  });

  // Converted Files List
  async function renderConvertedList(){
    const files = await getAllFiles();
    const listEl = $('#convertedList');
    listEl.innerHTML = '';

    if(files.length === 0){
      listEl.innerHTML = '<div class="muted">No files converted yet.</div>';
      return;
    }

    files.forEach(file => {
      const el = document.createElement('div');
      el.classList.add('saved-item');
      el.innerHTML = `
        <div>
          <div class="saved-item-name">${file.name}</div>
          <div class="muted">${(file.size / 1024 / 1024).toFixed(2)} MB · ${new Date(file.timestamp).toLocaleDateString()}</div>
        </div>
        <div class="saved-item-actions">
          <button data-id="${file.id}" class="btn small download-file">Download</button>
          <button data-id="${file.id}" class="btn small delete-file">Delete</button>
        </div>
      `;
      listEl.appendChild(el);
    });

    listEl.querySelectorAll('.download-file').forEach(button => {
      button.addEventListener('click', async (e) => {
        const fileId = e.target.dataset.id;
        const file = (await getAllFiles()).find(f => f.id === fileId);
        if(file && file.blob){
          const url = URL.createObjectURL(file.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    });

    listEl.querySelectorAll('.delete-file').forEach(button => {
      button.addEventListener('click', async (e) => {
        const fileId = e.target.dataset.id;
        if(confirm('Delete this file?')){
          await deleteFile(fileId);
          renderConvertedList();
        }
      });
    });
  }
  
  // Local Storage Editor 
  const lsSelect = $('#lsSelect');
  const lsContent = $('#lsContent');

  function refreshKeys(){
    lsSelect.innerHTML = '';
    let keys = [];
    for(let i=0; i<localStorage.length; i++){
      const key = localStorage.key(i);
      if(key.startsWith(LOCALSTORAGE_PREFIX)){ keys.push(key); }
    }
    keys.sort();
    
    if(keys.length === 0){
      lsSelect.innerHTML = '<option>No keys found</option>';
      lsContent.value = '';
      lsContent.disabled = true;
      $('#lsSave').disabled = true;
      $('#lsDelete').disabled = true;
      return;
    }
    
    keys.forEach(k=>{
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k.replace(LOCALSTORAGE_PREFIX, '');
      lsSelect.appendChild(opt);
    });
    
    lsContent.value = localStorage.getItem(keys[0]) || '';
    lsContent.disabled = false;
    $('#lsSave').disabled = false;
    $('#lsDelete').disabled = false;
  }

  lsSelect.addEventListener('change', ()=>{
    const key = lsSelect.value;
    if(key && key !== 'No keys found'){
      lsContent.value = localStorage.getItem(key) || '';
    }
  });

  $('#lsSave').addEventListener('click', ()=>{
    const key = lsSelect.value;
    if(!key || key === 'No keys found') return;
    const content = lsContent.value;
    try{
      localStorage.setItem(key, content);
      alert('Saved ' + key);
    } catch(e){ alert('Save failed: ' + e.message); }
  });

  $('#lsDelete').addEventListener('click', ()=>{
    const key = lsSelect.value;
    if(!key || key === 'No keys found') return;
    if(confirm('Delete ' + key + '?')){
      localStorage.removeItem(key);
      refreshKeys();
    }
  });

  $('#lsRefresh').addEventListener('click', refreshKeys);

  // Quick actions
  $('#btn-new-note').addEventListener('click', () => {
    $('#noteEditor').value = '';
    showPanel('workspace');
  });

  $('#btn-new-task').addEventListener('click', () => {
    $('#taskInput').focus();
    showPanel('workspace');
  });

  // Export/Import 
  $('#export-all').addEventListener('click', ()=>{
    try{
      const exportData = { localStorage: {} };
      for(let i=0; i<localStorage.length; i++){
        const k = localStorage.key(i);
        if(k.startsWith(LOCALSTORAGE_PREFIX)){ 
          exportData.localStorage[k] = localStorage.getItem(k); 
        }
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'holodesk-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch(e){ 
      console.error(e); 
      alert('Export failed: ' + (e.message||e)); 
    }
  });

  $('#import-all').addEventListener('click', ()=> $('#import-file').click());
  $('#import-file').addEventListener('change', (ev)=>{
    const f = ev.target.files[0]; 
    if(!f) return;
    const r = new FileReader();
    r.onload = (e)=>{
      try{
        const obj = JSON.parse(e.target.result);
        if(obj.localStorage){
          Object.entries(obj.localStorage).forEach(([k,v])=>{
            localStorage.setItem(k, v);
          });
        }
        alert('Import complete!');
        refreshKeys();
        renderNotesList();
        renderSnippets();
        renderTodos();
      } catch(err){ 
        alert('Import failed: ' + err.message); 
      }
    };
    r.readAsText(f);
  });

  // Initialization
  async function init(){
    await initDB();
    renderConvertedList();
    loadFfmpeg();
    refreshKeys();
    renderNotesList();
    renderSnippets();
    renderTodos();
    renderColorGrid();
  }

  init();
})();