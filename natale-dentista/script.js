const grid = document.getElementById('grid');
const searchInput = document.getElementById('search');
const tagsBar = document.getElementById('tags-bar');
const resultsInfo = document.getElementById('results-info');
const btnRandom = document.getElementById('btn-random');

const lightbox   = document.getElementById('lightbox');
const lbImg      = document.getElementById('lb-img');
const lbId       = document.getElementById('lb-id');
const lbTagsEl   = document.getElementById('lb-tags');
const lbClose    = document.getElementById('lb-close');
const lbPrev     = document.getElementById('lb-prev');
const lbNext     = document.getElementById('lb-next');
const lbBackdrop = document.getElementById('lb-backdrop');

let items = [];          // original data from JSON
let displayItems = [];   // current display order (may be shuffled)
let activeTags = new Set();
let searchQuery = '';
let isRandom = false;
let lbIndex = -1;        // current index in filteredItems() array
let activeMacro = null;  // currently selected macro category (string)
let macroFilterIds = null; // Set of ids to show when a macro is active

// explicit mapping macro -> ids (provided by user)
const macroToIds = {
  "strumentazione da lavoro": [8,12,14,28,29,31,18,21,27,35,36,41,23,24,31,32,33,34,17,22,25,26,30,36].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b),
  "radiografie": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,37,39].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b),
  "studio dentistico": [23,24,9,13,16,18,20,22,25,26,27,28,29,35,36,37,38,39,40,41].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b)
};

// ── Load data ──────────────────────────────────────────────────────────────
async function loadData() {
  // fetch data from data.json
  const res = await fetch('data.json');
  // parse the json
  const data = await res.json();
  // set the items and display items
  items = data.items;
  // macro categories (optional in data.json)
  window.macroCategories = data.macroCategories || {};
  displayItems = [...items];
  buildMacroBar();
  buildTagsBar();
  syncMacroStates();
  render();
}

function syncMacroStates() {
  const macros = window.macroCategories || {};
  const macroBar = document.getElementById('macro-bar');
  if (!macroBar) return;
  macroBar.querySelectorAll('.macro-btn').forEach(b => {
    const m = b.dataset.macro;
    const tlist = macros[m] || [];
    const isActive = tlist.some(t => activeTags.has(t));
    b.classList.toggle('active', isActive);
  });
}

// ── Collect all unique tags ───────────────────────────────────────────────
function allTags() {
  const set = new Set();
  items.forEach(item => item.tags.forEach(t => set.add(t)));
  return [...set].sort();
}

// ── Build the filter tags bar ─────────────────────────────────────────────
function buildTagsBar() {
  tagsBar.innerHTML = '';
  allTags().forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-btn';
    btn.textContent = tag;
    btn.dataset.tag = tag;
    btn.addEventListener('click', () => toggleTag(tag));
    tagsBar.appendChild(btn);
  });
  // ensure tag button states reflect any active macro
  updateTagButtonStates();
}

// build the macro categories bar (above tags bar)
function buildMacroBar() {
  const macroBar = document.getElementById('macro-bar');
  if (!macroBar) return;
  macroBar.innerHTML = '';
  const macros = window.macroCategories || {};
  Object.keys(macros).forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'macro-btn';
    btn.textContent = m;
    btn.dataset.macro = m;
    btn.addEventListener('click', () => toggleMacro(m));
    // mark active if matches
    if (activeMacro === m) btn.classList.add('active');
    macroBar.appendChild(btn);
  });
}

// toggle a macro: selects/deselects all tags that belong to that macro
// TOGGLE MACROS E TAGS
function toggleMacro(macro) {
  const macros = window.macroCategories || {};
  // toggle behavior: if clicking same macro, deactivate
  if (activeMacro === macro) {
    activeMacro = null;
    macroFilterIds = null;
    // restore display items to full set (respecting random state)
    displayItems = isRandom ? shuffle(items) : [...items];
  } else {
    activeMacro = macro;
    // prefer explicit IDs mapping from macroToIds, fallback to finding items by tags listed in data
    const ids = macroToIds[macro] || (macros[macro] ? [] : []);
    if (ids && ids.length > 0) {
      macroFilterIds = new Set(ids);
    } else if (macros[macro]) {
      // build ids from items whose tags intersect macros[macro]
      const allowed = new Set(macros[macro]);
      macroFilterIds = new Set(items.filter(it => it.tags.some(t => allowed.has(t))).map(it => it.id));
    } else {
      macroFilterIds = null;
    }
    // set displayItems to only items in macroFilterIds (preserve random if active)
    const base = items.filter(it => macroFilterIds ? macroFilterIds.has(it.id) : true);
    displayItems = isRandom ? shuffle(base) : base;
    // remove any active tags that are not part of this macro (they would be dimmed)
    const allowedTags = new Set(macros[macro] || []);
    activeTags.forEach(t => { if (!allowedTags.has(t)) activeTags.delete(t); });
  }

  // update UI states
  // macro buttons
  const macroBar = document.getElementById('macro-bar');
  if (macroBar) {
    macroBar.querySelectorAll('.macro-btn').forEach(b => b.classList.toggle('active', b.dataset.macro === activeMacro));
  }

  // tag buttons: mark active and dim those not in macro
  updateTagButtonStates();

  render();
}

function updateTagButtonStates() {
  const macro = activeMacro;
  const macros = window.macroCategories || {};
  const allowed = macro ? new Set(macros[macro] || []) : null;
  tagsBar.querySelectorAll('.tag-btn').forEach(btn => {
    const tag = btn.dataset.tag;
    // active state
    btn.classList.toggle('active', activeTags.has(tag));
    // dim if macro active and tag not in allowed set
    if (macro && (!allowed || !allowed.has(tag))) {
      btn.classList.add('dimmed');
    } else {
      btn.classList.remove('dimmed');
    }
  });
}

// ── Toggle a filter tag ───────────────────────────────────────────────────
function toggleTag(tag) {
  if (activeTags.has(tag)) {
    activeTags.delete(tag);
  } else {
    activeTags.add(tag);
  }
  // sync button states
  tagsBar.querySelectorAll('.tag-btn').forEach(btn => {
    btn.classList.toggle('active', activeTags.has(btn.dataset.tag));
  });
  render();
}

// ── Filter logic ──────────────────────────────────────────────────────────
function filteredItems() {

  // get the search query
  const q = searchQuery.toLowerCase().trim();
  // filter the items
  return displayItems.filter(item => {
    // check if the item matches the tags
    const matchesTags =
      activeTags.size === 0 ||
      [...activeTags].every(t => item.tags.includes(t));
    const matchesSearch =
      q === '' ||
      item.description.toLowerCase().includes(q) ||
      item.tags.some(t => t.toLowerCase().includes(q));
    return matchesTags && matchesSearch;
  });
}

// ── Shuffle array (Fisher-Yates) ──────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Random button ─────────────────────────────────────────────────────────
btnRandom.addEventListener('click', () => {
  if (isRandom) {
    // restore original order
    displayItems = [...items];
    btnRandom.textContent = 'Random';
    isRandom = false;
  } else {
    displayItems = shuffle(items);
    btnRandom.textContent = 'Reset';
    isRandom = true;
  }
  render();
});

// ── Search ────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', e => {
  searchQuery = e.target.value;
  render();
});

// ── Render cards ──────────────────────────────────────────────────────────
function render() {

  // get the visible items
  const visible = filteredItems();

  // set the results info
  resultsInfo.textContent =
    visible.length === items.length
      ? `${items.length} items`
      : `${visible.length} / ${items.length} items`;

  // clear the grid
  grid.innerHTML = '';

  // if there are no visible items, show the empty state
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nessun risultato.';
    grid.appendChild(empty);
    return;
  }

  // loop through the visible items and create a card for each item
  visible.forEach((item, i) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.style.cursor = 'zoom-in';

    // image
    // create an image element
    const img = document.createElement('img');
    // set the class name
    img.className = 'card-img';
    // set the source
    img.src = item.src;
    // set the alt text
    img.alt = `Item ${item.id}`;
    // set the loading attribute
    img.loading = 'lazy';
    // append the image to the card
    card.appendChild(img);

    // body
    const body = document.createElement('div');
    body.className = 'card-body';

    // id
    const idEl = document.createElement('span');
    idEl.className = 'card-id';
    idEl.textContent = `#${String(item.id).padStart(2, '0')}`;
    body.appendChild(idEl);

    const desc = document.createElement('p');
    desc.className = 'card-desc';
    desc.textContent = item.description;
    // body.appendChild(desc);

    const tagsEl = document.createElement('div');
    tagsEl.className = 'card-tags';
    item.tags.forEach(tag => {
      const t = document.createElement('span');
      t.className = 'card-tag' + (activeTags.has(tag) ? ' highlight' : '');
      t.textContent = tag;
      t.addEventListener('click', e => { e.stopPropagation(); toggleTag(tag); });
      tagsEl.appendChild(t);
    });
    body.appendChild(tagsEl);

    card.addEventListener('click', () => openLightbox(i));

    card.appendChild(body);
    grid.appendChild(card);
  });
}

// ── Lightbox ──────────────────────────────────────────────────────────────
function openLightbox(index) {
  // get the visible items
  const visible = filteredItems();
  // set the current index
  lbIndex = index;
  // get the item
  const item = visible[lbIndex];

  lbImg.src = item.src;
  // set the alt text
  lbImg.alt = `Item ${item.id}`;
  // set the id
  lbId.textContent = `#${String(item.id).padStart(2, '0')}`;

  lbTagsEl.innerHTML = '';
  // loop through the tags and create a span for each tag
  item.tags.forEach(tag => {
    const t = document.createElement('span');
    t.className = 'card-tag' + (activeTags.has(tag) ? ' highlight' : '');
    t.textContent = tag;
    t.addEventListener('click', () => { toggleTag(tag); closeLightbox(); });
    lbTagsEl.appendChild(t);
  });


  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  lbImg.src = '';
}

function navigateLightbox(dir) {
  const visible = filteredItems();

  // calcola il prossimo indice
  let next = lbIndex + dir;

  // se si va oltre l'ultimo, torna al primo
  if (next >= visible.length) next = 0;

  // se si va prima del primo, salta all'ultimo
  if (next < 0) next = visible.length - 1;

  openLightbox(next);
}

lbClose.addEventListener('click', closeLightbox);
lbBackdrop.addEventListener('click', closeLightbox);
lbPrev.addEventListener('click', () => navigateLightbox(-1));
lbNext.addEventListener('click', () => navigateLightbox(+1));

document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('open')) return;
  if (e.key === 'ArrowLeft')  navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(+1);
  if (e.key === 'Escape')     closeLightbox();
});

// ── Init ──────────────────────────────────────────────────────────────────
loadData();
