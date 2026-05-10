const grid = document.getElementById('grid');
const searchInput = document.getElementById('search');
const tagsBar = document.getElementById('tags-bar');
const areaBar = document.getElementById('area-bar');
const resultsInfo = document.getElementById('results-info');

const lightbox   = document.getElementById('lightbox');
const lbImg      = document.getElementById('lb-img');
const lbTagsEl   = document.getElementById('lb-tags');
const lbClose    = document.getElementById('lb-close');
const lbPrev     = document.getElementById('lb-prev');
const lbNext     = document.getElementById('lb-next');
const lbBackdrop = document.getElementById('lb-backdrop');

const labels = {
  missions: "Missions",
  "deck-operations": "Deck Operations"
};


let items = [];          // original data from JSON
let displayItems = [];   // current display order
let activeTags = new Set();
let activeArea = null;
let searchQuery = '';
let lbIndex = -1;        // current index in filteredItems() array

function normalizeKey(value) {
  if (Array.isArray(value)) {
    return String(value[0] ?? '').trim().toLowerCase();
  }
  return String(value ?? '').trim().toLowerCase();
}

function labelText(value) {
  if (Array.isArray(value)) {
    return String(value[0] ?? '').trim();
  }
  return String(value ?? '').trim();
}

// ── Utility: shuffle items ───────────────────────────────────────────────
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}



// ── Load data ──────────────────────────────────────────────────────────────
async function loadData() {
  const res = await fetch('data.json');
  const data = await res.json();
  items = data.items;
  displayItems = shuffleArray(items);
  buildTagsBar();
  buildAreaBar();
  render();
}

// ── Build the filter tags bar (categories + subcategories) ───────────────
function buildTagsBar() {
  tagsBar.innerHTML = '';

  // collect unique subcategories per category, preserving insertion order
  const catMap = new Map();
  items.forEach(item => {
    const catKey = normalizeKey(item.category);
    const subKey = normalizeKey(item.subcategory);
    const catLabel = labelText(item.category);
    const subLabel = labelText(item.subcategory);
    if (!catKey) return;
    if (!catMap.has(catKey)) {
      catMap.set(catKey, { label: catLabel || catKey, subs: new Map() });
    }
    if (subKey) {
      catMap.get(catKey).subs.set(subKey, subLabel || subKey);
    }
  });

  catMap.forEach((entry, catKey) => {
    const catBlock = document.createElement('div');
    catBlock.className = 'cat-block';

    const catBtn = document.createElement('button');
    catBtn.className = 'tag-btn cat-btn';
    catBtn.textContent = entry.label;
    catBtn.dataset.tag = catKey;
    catBtn.addEventListener('click', () => toggleTag(catKey));
    catBlock.appendChild(catBtn);

    if (entry.subs.size > 0) {
      const subsWrap = document.createElement('div');
      subsWrap.className = 'sub-wrap';
      entry.subs.forEach((subLabel, subKey) => {
        const subBtn = document.createElement('button');
        subBtn.className = 'tag-btn sub-btn';
        subBtn.textContent = subLabel;
        subBtn.dataset.tag = subKey;
        subBtn.addEventListener('click', () => toggleTag(subKey));
        subsWrap.appendChild(subBtn);
      });
      catBlock.appendChild(subsWrap);
    }

    tagsBar.appendChild(catBlock);
  });

  syncTagButtonStates();
}

function syncTagButtonStates() {
  if (!tagsBar) return;

  const hasSelection = activeTags.size > 0;
  tagsBar.querySelectorAll('.tag-btn').forEach(btn => {
    const tagKey = normalizeKey(btn.dataset.tag);
    const isActive = activeTags.has(tagKey);
    btn.classList.toggle('active', isActive);
    btn.classList.toggle('dimmed', hasSelection && !isActive);
  });
}

function normalizeArea(area) {
  if (Array.isArray(area)) {
    return area.join(', ');
  }
  return area ?? '';
}

function buildAreaBar() {
  if (!areaBar) return;

  areaBar.innerHTML = '';

  const areas = [...new Map(
    items.map(item => [
      normalizeArea(item.area),
      {
        area: normalizeArea(item.area),
        story: item.story
      }
    ])
  ).values()];

  areas.forEach(areaData => {
    const areaItem = document.createElement('div');
    areaItem.className = 'area-item';
    areaItem.dataset.area = areaData.area;

    const title = document.createElement('div');
    title.className = 'area-title';
    title.textContent = areaData.area;

    const story = document.createElement('div');
    story.className = 'area-story';
    story.textContent = areaData.story;

    areaItem.appendChild(title);
    areaItem.appendChild(story);

    areaItem.addEventListener('click', () => {
      activeArea = activeArea === areaData.area ? null : areaData.area;
      syncAreaButtonStates();
      render();
    });

    areaBar.appendChild(areaItem);
  });

  syncAreaButtonStates();
}

function syncAreaButtonStates() {
  if (!areaBar) return;

  areaBar.querySelectorAll('.area-item').forEach(el => {
    const isActive = el.dataset.area === activeArea;
    el.classList.toggle('active', isActive);
    el.classList.toggle('dimmed', Boolean(activeArea) && !isActive);
  });
}

// ── Toggle a filter tag ───────────────────────────────────────────────────
function toggleTag(tag) {
  const key = normalizeKey(tag);
  if (activeTags.has(key)) {
    activeTags.delete(key);
  } else {
    activeTags.add(key);
  }
  syncTagButtonStates();
  render();
}

// ── Filter logic ──────────────────────────────────────────────────────────
function filteredItems() {
  const q = searchQuery.toLowerCase().trim();
  return displayItems.filter(item => {
    const matchesSearch =
      q === '' ||
      item.description.toLowerCase().includes(q) ||
      item.tags.some(t => t.toLowerCase().includes(q)) ||
      normalizeKey(item.category).includes(q) ||
      normalizeKey(item.subcategory).includes(q);
    return matchesSearch;
  });
}

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
    const itemTags = [
      normalizeKey(item.category),
      normalizeKey(item.subcategory),
      ...item.tags.map(tag => normalizeKey(tag))
    ].filter(Boolean);
    const matchesTags =
      activeTags.size === 0 ||
      [...activeTags].every(tag => itemTags.includes(tag));
    const matchesArea =
      !activeArea || normalizeArea(item.area) === activeArea;
    const shouldDim =
      (activeTags.size > 0 && !matchesTags) ||
      (activeArea && !matchesArea);

    const card = document.createElement('article');
    card.className = 'card';
    card.style.cursor = 'zoom-in';
    card.classList.toggle('dimmed', shouldDim);

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
    // Keep loading predictable across browsers: avoid lazy edge-cases
    img.loading = 'eager';
    img.decoding = 'sync';
    img.addEventListener('error', () => {
      card.classList.add('image-error');
      console.error('Image failed to load:', item.src, 'ID:', item.id);
    });
    // append the image to the card
    card.appendChild(img);

    // body
    const body = document.createElement('div');
    body.className = 'card-body';

    const desc = document.createElement('p');
    desc.className = 'card-desc';
    desc.textContent = item.description;
    // body.appendChild(desc);

    const tagsEl = document.createElement('div');
    tagsEl.className = 'card-tags';
    item.tags.forEach(tag => {
      const tagKey = normalizeKey(tag);
      const t = document.createElement('span');
      t.className = 'card-tag' + (activeTags.has(tagKey) ? ' highlight' : '');
      t.textContent = tag;
      t.addEventListener('click', e => { e.stopPropagation(); toggleTag(tagKey); });
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

  lbTagsEl.innerHTML = '';
  // loop through the tags and create a span for each tag
  item.tags.forEach(tag => {
    const tagKey = normalizeKey(tag);
    const t = document.createElement('span');
    t.className = 'card-tag' + (activeTags.has(tagKey) ? ' highlight' : '');
    t.textContent = tag;
    t.addEventListener('click', () => { toggleTag(tagKey); closeLightbox(); });
    lbTagsEl.appendChild(t);
  });


  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.classList.add('lightbox-open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lightbox-open');
  document.body.style.overflow = '';
  lbImg.src = '';
}

function navigateLightbox(dir) {
  const visible = filteredItems();

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
