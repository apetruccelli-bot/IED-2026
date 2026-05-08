//const grid = document.getElementById('grid');
const myColumns = document.getElementsByClassName('myColumn');
const searchInput = document.getElementById('search');
const tagsBar = document.getElementById('tags-bar');
const resultsInfo = document.getElementById('results-info');
const btnRandom = document.getElementById('btn-random');

const lightbox   = document.getElementById('lightbox');
const lbImg      = document.getElementById('lb-img');
const lbId       = document.getElementById('lb-id');
//const lbTagsEl   = document.getElementById('lb-tags');
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
const activeFilters = new Map(); // subcategoryKey → value

// ── Load data ──────────────────────────────────────────────────────────────
async function loadData() {
  // fetch data from data.json
  const res = await fetch('data.json');
  // parse the json
  const data = await res.json();
  // set the items and display items
  items = data.items;
  displayItems = shuffle([...items]);
  buildTagsBar();
  render();
  buildFilters();
}

// ── Collect all unique tags ───────────────────────────────────────────────
function allTags() {
  const set = new Set();
  items.forEach(item => item.tags.forEach(t => set.add(t)));
  return [...set].sort();
}

// ── Build the filter tags bar ─────────────────────────────────────────────
function buildTagsBar() {
  return
  tagsBar.innerHTML = '';
  allTags().forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-btn';
    btn.textContent = tag;
    btn.dataset.tag = tag;
    btn.addEventListener('click', () => toggleTag(tag));
    tagsBar.appendChild(btn);
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
btnRandom?.addEventListener('click', () => {
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
searchInput?.addEventListener('input', e => {
  searchQuery = e.target.value;
  render();
});

// ── Render cards ──────────────────────────────────────────────────────────
function render() {

  // get the visible items
  const visible = filteredItems();

  // set the results info
  if (resultsInfo) {
    resultsInfo.textContent =
    visible.length === items.length
      ? `${items.length} items`
      : `${visible.length} / ${items.length} items`;
  }

  // clear the columns
  [...myColumns].forEach(col => col.innerHTML = '');

  // if there are no visible items, show the empty state
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nessun risultato.';
    myColumns[0].appendChild(empty);
    return;
  }

  // loop through the visible items and create a card for each item
  visible.forEach((item, i) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.style.cursor = 'zoom-in';
    card.dataset.itemId = item.id;
    const matchesFilters = activeFilters.size === 0 || [...activeFilters.entries()].every(([k, v]) => {
      const field = item[k];
      return Array.isArray(field) ? field.map(String).includes(v) : String(field ?? '') === v;
    });
    card.classList.toggle('active-img', matchesFilters);

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
    item.tags?.forEach(tag => {
      const t = document.createElement('span');
      t.className = 'card-tag' + (activeTags.has(tag) ? ' highlight' : '');
      t.textContent = tag;
      t.addEventListener('click', e => { e.stopPropagation(); toggleTag(tag); });
      tagsEl.appendChild(t);
    });
    body.appendChild(tagsEl);

    card.addEventListener('click', () => openLightbox(i));

    card.appendChild(body);
    myColumns[i % myColumns.length].appendChild(card);
  });
}

// ── Filters ───────────────────────────────────────────────────────────────
function buildFilters() {
  const container = document.getElementById('filters-container');
  if (!container) return;
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))];
  container.innerHTML = '';
  categories.forEach(cat => {
    const prefix = cat + '-';
    const subKeys = new Set();
    items.filter(i => i.category === cat).forEach(item => {
      Object.keys(item).forEach(k => { if (k.startsWith(prefix)) subKeys.add(k); });
    });
    const catEl = document.createElement('div');
    catEl.className = 'filter-category flex flex-col gap-10px';
    catEl.dataset.filterCategory = cat;
    const catTitle = document.createElement('p');
    catTitle.className = 'filter-category-title font-myTitle';
    catTitle.textContent = cat;
    catEl.appendChild(catTitle);
    subKeys.forEach(subKey => {
      const values = [...new Set(
        items.filter(i => i.category === cat && i[subKey] != null).flatMap(i =>
          Array.isArray(i[subKey]) ? i[subKey].map(String) : [String(i[subKey])]
        )
      )].sort();
      const subEl = document.createElement('div');
      subEl.className = 'filter-sub grid grid-cols-4 ';
      const label = document.createElement('p');
      label.className = 'col-span-full opacity-40';
      label.textContent = subKey.replace(prefix, '');
      subEl.appendChild(label);
      const valuesEl = document.createElement('p');
      valuesEl.className = 'col-span-full flex flex-wrap gap-x-10px';
      values.forEach(val => {
        const span = document.createElement('span');
        span.className = 'cursor-pointer';
        span.textContent = val;
        span.dataset.filterKey = subKey;
        span.dataset.filterVal = val;
        span.addEventListener('click', () => toggleFilter(subKey, val));
        valuesEl.appendChild(span);
      });
      subEl.appendChild(valuesEl);
      catEl.appendChild(subEl);
    });
    container.appendChild(catEl);
  });
}

function toggleFilter(key, val) {
  const clickedCat = key.split('-')[0];
  const currentCats = new Set([...activeFilters.keys()].map(k => k.split('-')[0]));

  // If clicking a different category, clear all previous filters first
  if (currentCats.size > 0 && !currentCats.has(clickedCat)) {
    activeFilters.clear();
  }

  if (activeFilters.get(key) === val) {
    activeFilters.delete(key);
  } else {
    activeFilters.set(key, val);
  }

  const activeCategories = new Set([...activeFilters.keys()].map(k => k.split('-')[0]));
  const hasAnyFilter = activeFilters.size > 0;

  // Reset all classes
  document.querySelectorAll('[data-filter-key]').forEach(el => {
    el.classList.remove('not-active-filter');
    el.style.fontWeight = '';
  });
  document.querySelectorAll('.filter-category[data-filter-category]').forEach(catEl => {
    catEl.classList.remove('not-active-filter');
  });

  if (hasAnyFilter) {
    // Dim entire category sections that don't have an active filter
    document.querySelectorAll('.filter-category[data-filter-category]').forEach(catEl => {
      if (!activeCategories.has(catEl.dataset.filterCategory)) {
        catEl.classList.add('not-active-filter');
      }
    });

    // Within active categories, dim siblings in the same subkey that aren't selected
    document.querySelectorAll('[data-filter-key]').forEach(el => {
      const catOfKey = el.dataset.filterKey.split('-')[0];
      if (!activeCategories.has(catOfKey)) return; // parent section handles dimming
      const isActive = activeFilters.get(el.dataset.filterKey) === el.dataset.filterVal;
      const keyHasFilter = activeFilters.has(el.dataset.filterKey);
      if (keyHasFilter && !isActive) el.classList.add('not-active-filter');
      if (isActive) el.style.fontWeight = 'bold';
    });
  }

  updateActiveImg();
}

function updateActiveImg() {
  const hasFilters = activeFilters.size > 0;
  const activeCategories = new Set([...activeFilters.keys()].map(k => k.split('-')[0]));
  const grid = document.getElementById('grid');
  if (grid) grid.classList.toggle('has-filter', hasFilters);
  document.querySelectorAll('.card[data-item-id]').forEach(card => {
    const id = Number(card.dataset.itemId);
    const item = items.find(i => i.id === id);
    if (!item) return;
    const matches = !hasFilters || (
      activeCategories.has(item.category) &&
      [...activeFilters.entries()].every(([k, v]) => {
        const field = item[k];
        return Array.isArray(field) ? field.map(String).includes(v) : String(field ?? '') === v;
      })
    );
    card.classList.toggle('active-img', matches);
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
  //lbId.textContent = `#${String(item.id).padStart(2, '0')}`;

  //lbTagsEl.innerHTML = '';
  // loop through the tags and create a span for each tag
  /* item.tags.forEach(tag => {
    const t = document.createElement('span');
    t.className = 'card-tag' + (activeTags.has(tag) ? ' highlight' : '');
    t.textContent = tag;
    t.addEventListener('click', () => { toggleTag(tag); closeLightbox(); });
    lbTagsEl.appendChild(t);
  }); */


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
