'use strict';

const META_URL = 'meta.json';
const COOLDOWN = 60;

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem('bq.' + k)); return v ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem('bq.' + k, JSON.stringify(v));

const State = {
  ids: [],
  current: [],
  favorites: load('favorites', []),
  tags: load('tags', {}),
  notes: load('notes', {}),
  recent: load('recent', []),
  copyCount: load('copyCount', {}),
  selected: new Set(),
  multiSelect: false,
  favSortByUse: false,
  focusIdx: 0,
  theme: load('theme', 'auto'),
  installPrompt: null,
};

const grid = $('#grid');
const favGrid = $('#favorites');
const statusEl = $('#status');
const modal = $('#modal');
const wheel = $('#wheel');
const wheelInner = wheel.querySelector('.wheel-inner');
const toast = $('#toast');

function imgUrl(id) { return `img/${id}.jpg`; }
function getCount() { return Math.min(parseInt($('#count').value, 10) || 24, 200); }

function showToast(msg, ms = 1500) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), ms);
}

function askPrompt(title, value = '') {
  return new Promise(resolve => {
    const dlg = $('#prompt-dialog');
    const titleEl = dlg.querySelector('.pd-title');
    const input = dlg.querySelector('.pd-input');
    const ok = dlg.querySelector('.pd-ok');
    const cancel = dlg.querySelector('.pd-cancel');
    titleEl.textContent = title;
    input.value = value;
    dlg.classList.add('open');
    setTimeout(() => input.focus(), 10);
    const cleanup = () => {
      dlg.classList.remove('open');
      ok.onclick = cancel.onclick = null;
      input.onkeydown = null;
      dlg.onclick = null;
    };
    const confirm = () => { const v = input.value; cleanup(); resolve(v); };
    const dismiss = () => { cleanup(); resolve(null); };
    ok.onclick = confirm;
    cancel.onclick = dismiss;
    input.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      else if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    };
    dlg.onclick = e => { if (e.target === dlg) dismiss(); };
  });
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initTheme() {
  const t = State.theme;
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  ['auto', 'light', 'dark'].forEach(v => {
    const btn = $(`#theme-${v}`);
    if (btn) btn.classList.toggle('on', v === t);
  });
}

function setTheme(t) {
  State.theme = t;
  save('theme', t);
  initTheme();
}

async function loadMeta() {
  statusEl.innerHTML = 'loading';
  try {
    const r = await fetch(META_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data.ids) || data.ids.length === 0) throw new Error('empty manifest');
    State.ids = data.ids;
    statusEl.textContent = `${State.ids.length} available`;
    save('lastIds', State.ids);
    return true;
  } catch (e) {
    const cached = load('lastIds', []);
    State.ids = cached;
    const suffix = cached.length ? ` (using ${cached.length} cached)` : '';
    statusEl.innerHTML = '';
    statusEl.append(`meta load failed${suffix} `);
    const retry = document.createElement('button');
    retry.className = 'sm';
    retry.textContent = 'retry';
    retry.onclick = async () => { if (await loadMeta()) { reroll(); } };
    statusEl.append(retry);
    return false;
  }
}

function pickRandom(n) {
  const exclude = new Set(State.recent);
  const pool = shuffle(State.ids);
  const filtered = pool.filter(id => !exclude.has(id));
  return (filtered.length >= n ? filtered : pool).slice(0, n);
}

function pickRange(lo, hi, n) {
  return shuffle(State.ids.filter(id => id >= lo && id <= hi)).slice(0, n);
}

async function copyImage(id) {
  try {
    const blob = await fetch(imgUrl(id)).then(r => r.blob());
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width; canvas.height = bmp.height;
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    const pngBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    showToast(`#${id} copied`);
    recordUsed(id);
  } catch (e) {
    try {
      await navigator.clipboard.writeText(imgUrl(id).startsWith('http') ? imgUrl(id) : location.origin + '/' + imgUrl(id));
      showToast('URL copied (image copy needs HTTPS)');
    } catch {
      showToast('copy failed');
    }
  }
}

function getWebhook() {
  const url = load('discordWebhook', '');
  if (!url) {
    document.querySelector('details.section').open = true;
    showToast('add Discord webhook URL in settings');
    return null;
  }
  return url;
}

async function postDiscordBatch(url, ids) {
  const form = new FormData();
  for (let i = 0; i < ids.length; i++) {
    const blob = await fetch(imgUrl(ids[i])).then(r => r.blob());
    form.append(`files[${i}]`, new File([blob], `${ids[i]}.jpg`, { type: 'image/jpeg' }));
  }
  const r = await fetch(url, { method: 'POST', body: form });
  if (r.status === 429) {
    const j = await r.json().catch(() => ({}));
    const wait = Math.max(1, (j.retry_after || 2)) * 1000;
    await new Promise(res => setTimeout(res, wait));
    return postDiscordBatch(url, ids);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

async function sendToDiscord(id) {
  const webhookUrl = getWebhook();
  if (!webhookUrl) return;
  showToast('sending...', 2000);
  try {
    await postDiscordBatch(webhookUrl, [id]);
    showToast(`sent #${id} to Discord`);
    recordUsed(id);
  } catch (e) {
    showToast(`failed: ${e.message}`);
  }
}

async function sendBulkToDiscord(ids) {
  const webhookUrl = getWebhook();
  if (!webhookUrl) return;
  const total = ids.length;
  const batchSize = 10;
  let sent = 0;
  showToast(`sending ${total} to Discord...`, 4000);
  try {
    for (let i = 0; i < total; i += batchSize) {
      const slice = ids.slice(i, i + batchSize);
      await postDiscordBatch(webhookUrl, slice);
      slice.forEach(recordUsed);
      sent += slice.length;
      if (i + batchSize < total) {
        showToast(`sent ${sent}/${total}...`, 2000);
        await new Promise(res => setTimeout(res, 1200));
      }
    }
    showToast(`sent ${sent} to Discord`);
  } catch (e) {
    showToast(`stopped at ${sent}/${total}: ${e.message}`, 3000);
  }
}

function recordUsed(id) {
  State.recent = [id, ...State.recent.filter(x => x !== id)].slice(0, COOLDOWN);
  save('recent', State.recent);
  State.copyCount[id] = (State.copyCount[id] || 0) + 1;
  save('copyCount', State.copyCount);
}

function toggleFav(id) {
  if (State.favorites.includes(id)) {
    State.favorites = State.favorites.filter(x => x !== id);
  } else {
    State.favorites.push(id);
  }
  save('favorites', State.favorites);
  renderFavorites();
  renderGrid();
}

function setTags(id, tags) {
  if (tags.length === 0) delete State.tags[id];
  else State.tags[id] = tags;
  save('tags', State.tags);
}

function getNote(id) { return State.notes[id] || ''; }
function setNote(id, text) {
  if (!text.trim()) delete State.notes[id];
  else State.notes[id] = text.trim();
  save('notes', State.notes);
}

async function bulkTagSelected() {
  if (State.selected.size === 0) return;
  const ids = [...State.selected];
  const existing = [...new Set(ids.flatMap(id => State.tags[id] || []))].join(', ');
  const next = await askPrompt(`Tags for ${ids.length} images (comma separated, replaces existing):`, existing);
  if (next === null) return;
  const tags = next.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  ids.forEach(id => setTags(id, tags));
  showToast(`tagged ${ids.length} images`);
  renderGrid();
  renderFavorites();
}

async function exportFavZip() {
  if (State.favorites.length === 0) { showToast('no favorites'); return; }
  if (typeof JSZip === 'undefined') { showToast('zip lib not loaded'); return; }
  showToast(`packaging ${State.favorites.length} favorites...`, 4000);
  const zip = new JSZip();
  let ok = 0;
  for (const id of State.favorites) {
    try { const blob = await fetch(imgUrl(id)).then(r => r.blob()); zip.file(`${id}.jpg`, blob); ok++; } catch {}
  }
  const out = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(out);
  a.download = `biaoqing-favs-${Date.now()}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`downloaded ${ok} favorites`);
}

function renderCard(id, container, opts = {}) {
  const card = document.createElement('div');
  card.className = 'card';
  if (State.selected.has(id)) card.classList.add('selected');
  card.dataset.id = id;
  if (opts.draggable) card.draggable = true;

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = imgUrl(id);
  img.onerror = () => card.remove();

  const idTag = document.createElement('span');
  idTag.className = 'id-tag';
  idTag.textContent = '#' + id;

  const isFav = State.favorites.includes(id);
  const star = document.createElement('span');
  star.className = 'star' + (isFav ? ' active' : '');
  star.textContent = isFav ? '★' : '☆';
  star.onclick = e => {
    e.stopPropagation();
    if (State.multiSelect && State.selected.size > 0) {
      const allFaved = [...State.selected].every(sid => State.favorites.includes(sid));
      for (const sid of State.selected) {
        if (allFaved) State.favorites = State.favorites.filter(x => x !== sid);
        else if (!State.favorites.includes(sid)) State.favorites.push(sid);
      }
      save('favorites', State.favorites);
      renderFavorites();
      renderGrid();
      showToast(allFaved ? `unstarred ${State.selected.size}` : `starred ${State.selected.size}`);
    } else {
      toggleFav(id);
    }
  };

  card.append(img, idTag, star);

  const tags = State.tags[id];
  if (tags && tags.length) {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = tags.join(' ');
    card.appendChild(pill);
  }

  if (State.multiSelect) {
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'select-box';
    check.checked = State.selected.has(id);
    check.onclick = e => {
      e.stopPropagation();
      if (check.checked) State.selected.add(id); else State.selected.delete(id);
      card.classList.toggle('selected', check.checked);
      updateMultiUI();
    };
    card.appendChild(check);
  }

  card.onclick = () => {
    if (State.multiSelect) {
      if (State.selected.has(id)) State.selected.delete(id);
      else State.selected.add(id);
      card.classList.toggle('selected', State.selected.has(id));
      const cb = card.querySelector('.select-box');
      if (cb) cb.checked = State.selected.has(id);
      updateMultiUI();
    } else {
      openModal(id);
    }
  };

  if (opts.draggable) {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', String(id));
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    card.addEventListener('drop', e => {
      e.preventDefault();
      const fromId = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (fromId === id) return;
      const arr = State.favorites.slice();
      const from = arr.indexOf(fromId), to = arr.indexOf(id);
      if (from < 0 || to < 0) return;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      State.favorites = arr;
      save('favorites', arr);
      renderFavorites();
    });
  }

  container.appendChild(card);
}

function renderGrid() {
  grid.innerHTML = '';
  State.current.forEach(id => renderCard(id, grid));
  highlightFocus();
}

function renderFavorites() {
  favGrid.innerHTML = '';
  $('#fav-count').textContent = State.favorites.length ? `(${State.favorites.length})` : '';
  if (State.favorites.length === 0) {
    favGrid.innerHTML = '<div class="empty">no favorites yet. click ☆ on any image</div>';
    return;
  }
  const sorted = State.favSortByUse
    ? [...State.favorites].sort((a, b) => (State.copyCount[b] || 0) - (State.copyCount[a] || 0))
    : State.favorites;
  sorted.forEach(id => renderCard(id, favGrid, { draggable: !State.favSortByUse }));
  const btn = $('#fav-sort-toggle');
  if (btn) btn.classList.toggle('on', State.favSortByUse);
}

let _ocrWorker = null;
async function getOcrWorker() {
  if (_ocrWorker) return _ocrWorker;
  if (!window.Tesseract) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  _ocrWorker = await Tesseract.createWorker('chi_sim', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  });
  return _ocrWorker;
}

async function translateImage(imgEl, resultEl) {
  resultEl.textContent = 'loading OCR model (first time: ~40mb)...';
  try {
    const worker = await getOcrWorker();
    resultEl.textContent = 'reading text...';
    const { data: { text } } = await worker.recognize(imgEl);
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) { resultEl.textContent = 'no text detected'; return; }
    resultEl.textContent = 'translating...';
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleaned)}&langpair=zh|en`);
    const j = await r.json();
    const trans = j?.responseData?.translatedText;
    resultEl.innerHTML = trans
      ? `<strong>${trans}</strong><br><span style="opacity:.5;font-size:11px">${cleaned}</span>`
      : cleaned;
  } catch (e) {
    resultEl.textContent = `failed: ${e.message}`;
  }
}

function openModal(id) {
  modal.classList.add('open');
  modal.innerHTML = '';

  const img = document.createElement('img');
  img.src = imgUrl(id);

  const dimsEl = document.createElement('span');
  dimsEl.className = 'img-dims';
  img.onload = () => { dimsEl.textContent = `${img.naturalWidth} x ${img.naturalHeight}`; };

  const close = document.createElement('button');
  close.textContent = '×';
  close.className = 'modal-close';
  close.onclick = closeModal;

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const transResult = document.createElement('div');
  transResult.className = 'trans-result';

  const mkBtn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; return b; };

  const transBtn = mkBtn('translate', async () => {
    transBtn.disabled = true;
    await translateImage(img, transResult);
    transBtn.disabled = false;
  });

  actions.append(
    mkBtn('copy img', () => copyImage(id)),
    mkBtn('copy url', async () => { await navigator.clipboard.writeText(imgUrl(id).startsWith('http') ? imgUrl(id) : location.origin + '/' + imgUrl(id)); showToast('URL copied'); }),
    mkBtn(State.favorites.includes(id) ? 'unstar' : 'star', () => { toggleFav(id); openModal(id); }),
    mkBtn('tags', async () => {
      const cur = (State.tags[id] || []).join(', ');
      const next = await askPrompt(`Tags for #${id} (comma separated):`, cur);
      if (next === null) return;
      setTags(id, next.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
      showToast('tags saved');
      renderGrid(); renderFavorites();
    }),
    mkBtn('discord', () => sendToDiscord(id)),
    transBtn,
    mkBtn('open', () => window.open(imgUrl(id), '_blank')),
  );

  const noteArea = document.createElement('textarea');
  noteArea.className = 'note-area';
  noteArea.placeholder = 'notes...';
  noteArea.value = getNote(id);
  noteArea.addEventListener('change', () => setNote(id, noteArea.value));

  modal.append(close, img, dimsEl, actions, noteArea, transResult);
}
function closeModal() { modal.classList.remove('open'); }

function applySearch(query) {
  query = query.trim().toLowerCase();
  if (!query) { reroll(); return; }
  const n = getCount();
  if (/^\d+-\d+$/.test(query)) {
    const [lo, hi] = query.split('-').map(Number);
    State.current = pickRange(lo, hi, n);
  } else if (query === 'recent') {
    const max = State.ids[State.ids.length - 1] ?? 0;
    State.current = pickRange(Math.max(0, max - 80), max, n);
  } else if (query === 'favs') {
    State.current = shuffle(State.favorites).slice(0, n);
  } else if (query === 'local') {
    State.current = shuffle(State.ids.filter(id => id >= 10000)).slice(0, n);
  } else if (query.startsWith('tag:')) {
    const t = query.slice(4).trim();
    State.current = Object.entries(State.tags)
      .filter(([, tags]) => tags.includes(t))
      .map(([id]) => +id).slice(0, n);
    if (State.current.length === 0) showToast(`no images tagged "${t}"`);
  } else if (query.startsWith('note:')) {
    const t = query.slice(5).trim();
    State.current = Object.entries(State.notes)
      .filter(([, note]) => note.toLowerCase().includes(t))
      .map(([id]) => +id).slice(0, n);
    if (State.current.length === 0) showToast(`no images with note matching "${t}"`);
  } else {
    showToast('try: 10-50 | recent | favs | local | tag:name | note:text');
    return;
  }
  State.focusIdx = 0;
  renderGrid();
}

function reroll() {
  State.current = pickRandom(getCount());
  State.focusIdx = 0;
  renderGrid();
}

function makePermalink() {
  const ids = State.current.join(',');
  const url = `${location.origin}${location.pathname}#ids=${ids}`;
  navigator.clipboard.writeText(url);
  history.replaceState(null, '', `#ids=${ids}`);
  showToast('share link copied');
}

function loadFromHash() {
  const m = location.hash.match(/ids=([\d,]+)/);
  if (!m) return false;
  State.current = m[1].split(',').map(Number).filter(n => !isNaN(n));
  return State.current.length > 0;
}

async function downloadZip() {
  if (State.selected.size === 0) { showToast('select images first'); return; }
  if (typeof JSZip === 'undefined') { showToast('zip lib not loaded'); return; }
  showToast(`packaging ${State.selected.size} files...`, 4000);
  const zip = new JSZip();
  let ok = 0;
  for (const id of State.selected) {
    try { const blob = await fetch(imgUrl(id)).then(r => r.blob()); zip.file(`${id}.jpg`, blob); ok++; } catch {}
  }
  const out = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(out);
  a.download = `biaoqing-${Date.now()}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`downloaded ${ok} files`);
}

function updateMultiUI() {
  const n = State.selected.size;
  $('#multi-status').textContent = State.multiSelect ? `${n} selected` : '';
  $('#download-zip').disabled = n === 0;
  $('#discord-send').disabled = n === 0;
  $('#bulk-tag').hidden = !State.multiSelect;
}

function toggleMultiSelect() {
  State.multiSelect = !State.multiSelect;
  if (!State.multiSelect) State.selected.clear();
  $('#multi-toggle').classList.toggle('on', State.multiSelect);
  renderGrid();
  renderFavorites();
  updateMultiUI();
}

function initSwipe() {
  let sx = 0, sy = 0;
  grid.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  grid.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      dx > 0 ? moveFocus(-1) : moveFocus(1);
    } else if (dy < -60) {
      const id = focusedId();
      if (id != null) copyImage(id);
    }
  }, { passive: true });
}

const keys = {};
keys[' '] = () => reroll();
keys['j'] = () => moveFocus(1);
keys['k'] = () => moveFocus(-1);
keys['ArrowRight'] = () => moveFocus(1);
keys['ArrowLeft'] = () => moveFocus(-1);
keys['ArrowDown'] = () => moveFocus(getColCount());
keys['ArrowUp'] = () => moveFocus(-getColCount());
keys['c'] = () => { const id = focusedId(); if (id != null) copyImage(id); };
keys['d'] = () => { const id = focusedId(); if (id != null) sendToDiscord(id); };
keys['f'] = () => { const id = focusedId(); if (id != null) toggleFav(id); };
keys['Enter'] = () => { const id = focusedId(); if (id != null) openModal(id); };
keys['Escape'] = () => { closeModal(); closeWheel(); };
keys['?'] = () => toggleWheel();
keys['/'] = (e) => { e.preventDefault(); $('#search').focus(); };
keys['s'] = () => toggleMultiSelect();
keys['z'] = () => downloadZip();

function focusedId() { return State.current[State.focusIdx]; }
function getColCount() {
  const cs = getComputedStyle(grid).gridTemplateColumns;
  return cs.split(' ').filter(Boolean).length || 1;
}
function moveFocus(d) {
  if (State.current.length === 0) return;
  State.focusIdx = (State.focusIdx + d + State.current.length) % State.current.length;
  highlightFocus();
}
function highlightFocus() {
  const cards = $$('#grid .card');
  cards.forEach((el, i) => el.classList.toggle('focus', i === State.focusIdx));
  cards[State.focusIdx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (modal.classList.contains('open') && (e.key === 'c' || e.key === 'C')) {
    const idStr = modal.querySelector('img')?.src.match(/\/(\d+)\.jpg/)?.[1];
    if (idStr) copyImage(+idStr);
    return;
  }
  const fn = keys[e.key];
  if (fn) { e.preventDefault(); fn(e); }
});

function toggleWheel() {
  wheel.classList.toggle('open');
  if (wheel.classList.contains('open')) renderWheel();
}
function closeWheel() { wheel.classList.remove('open'); }
function renderWheel() {
  const pool = [...new Set([...State.favorites, ...State.recent])].slice(0, 12);
  wheelInner.innerHTML = '';
  if (pool.length === 0) {
    wheelInner.innerHTML = '<div class="empty">no favorites or recents yet</div>';
    return;
  }
  const radius = 130;
  pool.forEach((id, i) => {
    const angle = (i / pool.length) * 2 * Math.PI - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const slot = document.createElement('div');
    slot.className = 'wheel-slot';
    slot.style.transform = `translate(${x}px, ${y}px)`;
    slot.title = `#${id}`;
    const im = document.createElement('img');
    im.src = imgUrl(id);
    slot.appendChild(im);
    slot.onclick = () => { copyImage(id); closeWheel(); };
    wheelInner.appendChild(slot);
  });
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('sw.js'); }
  catch (e) { console.warn('sw register failed', e); }
}

async function precacheAll() {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) { showToast('SW not active, reload page'); return; }
  const urls = State.ids.map(id => imgUrl(id));
  sw.postMessage({ type: 'precache', urls });
  showToast(`pre-caching ${urls.length} images...`, 3000);
}

navigator.serviceWorker?.addEventListener('message', e => {
  if (e.data?.type === 'precache-progress') {
    statusEl.textContent = `caching ${e.data.done}/${e.data.total}`;
  } else if (e.data?.type === 'precache-done') {
    statusEl.textContent = `${State.ids.length} cached`;
    showToast('pre-cache complete');
  }
});

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  State.installPrompt = e;
  const btn = $('#install');
  btn.hidden = false;
  btn.onclick = async () => {
    btn.hidden = true;
    State.installPrompt?.prompt();
    State.installPrompt = null;
  };
});

window.addEventListener('hashchange', () => {
  if (loadFromHash()) { State.focusIdx = 0; renderGrid(); }
});

async function main() {
  initTheme();
  await loadMeta();
  if (!loadFromHash()) State.current = pickRandom(getCount());
  renderGrid();
  renderFavorites();
  updateMultiUI();

  $('#reroll').onclick = reroll;
  $('#share').onclick = makePermalink;
  $('#theme-auto').onclick = () => setTheme('auto');
  $('#theme-light').onclick = () => setTheme('light');
  $('#theme-dark').onclick = () => setTheme('dark');
  $('#multi-toggle').onclick = toggleMultiSelect;
  $('#bulk-tag').onclick = bulkTagSelected;
  $('#download-zip').onclick = downloadZip;
  $('#discord-send').onclick = () => {
    if (State.selected.size > 0) sendBulkToDiscord([...State.selected]);
  };
  $('#export-favs').onclick = exportFavZip;
  $('#fav-sort-toggle').onclick = () => {
    State.favSortByUse = !State.favSortByUse;
    renderFavorites();
  };
  $('#precache').onclick = precacheAll;
  $('#search').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.target.blur(); applySearch(e.target.value); }
  });
  $('#count').addEventListener('change', reroll);

  const webhookInput = $('#webhook-url');
  webhookInput.value = load('discordWebhook', '');
  webhookInput.addEventListener('change', () => {
    save('discordWebhook', webhookInput.value.trim());
    showToast('webhook saved');
  });

  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  wheel.addEventListener('click', e => { if (e.target === wheel) closeWheel(); });
  initSwipe();
  registerSW();
}

main();
