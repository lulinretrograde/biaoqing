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
  recent: load('recent', []),
  selected: new Set(),
  multiSelect: false,
  focusIdx: 0,
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

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadMeta() {
  try {
    const r = await fetch(META_URL, { cache: 'no-store' });
    const data = await r.json();
    if (!Array.isArray(data.ids) || data.ids.length === 0) throw new Error('empty manifest');
    State.ids = data.ids;
    statusEl.textContent = `${State.ids.length} available`;
  } catch (e) {
    statusEl.textContent = 'meta load failed';
    State.ids = load('lastIds', []);
  }
  if (State.ids.length) save('lastIds', State.ids);
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
      await navigator.clipboard.writeText(location.origin + '/' + imgUrl(id));
      showToast('URL copied (image copy needs HTTPS)');
    } catch {
      showToast('copy failed');
    }
  }
}

function recordUsed(id) {
  State.recent = [id, ...State.recent.filter(x => x !== id)].slice(0, COOLDOWN);
  save('recent', State.recent);
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

function renderCard(id, container, opts = {}) {
  const card = document.createElement('div');
  card.className = 'card';
  if (State.selected.has(id)) card.classList.add('selected');
  card.dataset.id = id;
  if (opts.draggable) card.draggable = true;

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = imgUrl(id);
  img.onerror = () => card.classList.add('broken');

  const idTag = document.createElement('span');
  idTag.className = 'id-tag';
  idTag.textContent = '#' + id;

  const star = document.createElement('span');
  const isFav = State.favorites.includes(id);
  star.className = 'star' + (isFav ? ' active' : '');
  star.textContent = isFav ? '★' : '☆';
  star.onclick = e => { e.stopPropagation(); toggleFav(id); };

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
    favGrid.innerHTML = '<div class="empty">no favorites yet — click ☆ on any image</div>';
    return;
  }
  State.favorites.forEach(id => renderCard(id, favGrid, { draggable: true }));
}

function openModal(id) {
  modal.classList.add('open');
  modal.innerHTML = '';
  const img = document.createElement('img');
  img.src = imgUrl(id);

  const close = document.createElement('button');
  close.textContent = '×';
  close.className = 'modal-close';
  close.onclick = closeModal;

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const mkBtn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; return b; };

  actions.append(
    mkBtn('copy img', () => copyImage(id)),
    mkBtn('copy url', async () => { await navigator.clipboard.writeText(location.origin + '/' + imgUrl(id)); showToast('URL copied'); }),
    mkBtn(State.favorites.includes(id) ? 'unstar' : 'star', () => { toggleFav(id); openModal(id); }),
    mkBtn('tags', () => {
      const cur = (State.tags[id] || []).join(', ');
      const next = prompt(`Tags for #${id} (comma separated):`, cur);
      if (next === null) return;
      setTags(id, next.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
      showToast('tags saved');
      renderGrid(); renderFavorites();
    }),
    mkBtn('open', () => window.open(imgUrl(id), '_blank')),
  );

  modal.append(close, img, actions);
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
  } else {
    showToast('try: 10-50 | recent | favs | local | tag:name');
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
  showToast(`packaging ${State.selected.size} files…`, 4000);
  const zip = new JSZip();
  let ok = 0;
  for (const id of State.selected) {
    try {
      const blob = await fetch(imgUrl(id)).then(r => r.blob());
      zip.file(`${id}.jpg`, blob);
      ok++;
    } catch {}
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
  $('#multi-status').textContent = State.multiSelect ? `${State.selected.size} selected` : '';
  $('#download-zip').disabled = State.selected.size === 0;
}

function toggleMultiSelect() {
  State.multiSelect = !State.multiSelect;
  if (!State.multiSelect) State.selected.clear();
  $('#multi-toggle').classList.toggle('on', State.multiSelect);
  renderGrid();
  renderFavorites();
  updateMultiUI();
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
  if (!sw) { showToast('SW not active — reload page'); return; }
  const urls = State.ids.map(id => imgUrl(id));
  sw.postMessage({ type: 'precache', urls });
  showToast(`pre-caching ${urls.length} images…`, 3000);
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
  await loadMeta();
  if (!loadFromHash()) State.current = pickRandom(getCount());
  renderGrid();
  renderFavorites();
  updateMultiUI();
  $('#reroll').onclick = reroll;
  $('#share').onclick = makePermalink;
  $('#multi-toggle').onclick = toggleMultiSelect;
  $('#download-zip').onclick = downloadZip;
  $('#precache').onclick = precacheAll;
  $('#search').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.target.blur(); applySearch(e.target.value); }
  });
  $('#count').addEventListener('change', reroll);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  wheel.addEventListener('click', e => { if (e.target === wheel) closeWheel(); });
  registerSW();
}

main();
