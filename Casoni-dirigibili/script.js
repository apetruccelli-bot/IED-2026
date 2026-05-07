const gridRow1 = document.getElementsByClassName('archive-row')[0];
const gridRow2 = document.getElementsByClassName('archive-row')[1];
const gridRow3 = document.getElementsByClassName('archive-row')[2];
const searchInput = document.getElementById('search');
const tagsBar = document.getElementById('tags-bar');
const resultsInfo = document.getElementById('results-info');
const btnRandom = document.getElementById('btn-random');

const lightbox   = document.getElementById('lightbox');
const lbImg      = document.getElementById('lb-img');
const lbId       = document.getElementById('lb-id');
const lbTagsEl   = document.getElementById('lb-tags');
const lbDescription = document.getElementById('lb-description');
const lbMeta     = document.getElementById('lb-meta');
const lbClose    = document.getElementById('lb-close');
const lbPrev     = document.getElementById('lb-prev');
const lbNext     = document.getElementById('lb-next');
const lbBackdrop = document.getElementById('lb-backdrop');
const galleryScroll = document.querySelector('.gallery-scroll');

function formatMetaValue(key, value) {
  if (key === 'causes') {
    return Array.isArray(value) ? value.join(', ') : (value || '-');
  }
  if (value === undefined || value === null || value === '') {
    return '-';
  }
  return String(value);
}

function renderLightboxMeta(item) {
  if (!lbMeta) return;

  const category = (item.category || '').toLowerCase();
  const fullMetaCategories = new Set(['airships', 'wreckage', 'newspapers']);
  const compactMetaCategories = new Set(['study models', 'technical drawings', 'models', 'drawings']);
  const metaLabels = {
    causes: 'Causes',
    country: 'Country',
    year: 'Year',
    victims: 'Victims',
  };

  let fields = [];
  if (fullMetaCategories.has(category)) {
    fields = ['causes', 'country', 'year', 'victims'];
  } else if (compactMetaCategories.has(category)) {
    fields = ['year', 'country'];
  }

  lbMeta.innerHTML = '';
  if (fields.length === 0) return;

  fields.forEach(field => {
    const row = document.createElement('p');
    row.className = 'lb-meta-row';
    const label = document.createElement('span');
    label.className = 'lb-meta-label';
    label.textContent = `${metaLabels[field] || field}: `;

    const value = document.createElement('span');
    value.className = 'lb-meta-value';
    value.textContent = formatMetaValue(field, item[field]);

    row.appendChild(label);
    row.appendChild(value);
    lbMeta.appendChild(row);
  });
}

let items = [];          // original data from JSON
let displayItems = [];   // current display order (may be shuffled)
let activeTags = new Set();
let searchQuery = '';
let isRandom = false;
let lbIndex = -1;        // current index in filteredItems() array

if (galleryScroll) {
  galleryScroll.addEventListener('wheel', (e) => {
    const dominantDelta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;

    if (dominantDelta === 0) return;

    e.preventDefault();
    galleryScroll.scrollLeft += dominantDelta;
  }, { passive: false });
}

// ── Load data ──────────────────────────────────────────────────────────────
async function loadData() {
  // fetch data from data.json
  const res = await fetch('data.json');
  // parse the json
  const data = await res.json();
  // set the items and display items
  items = data.items;
  displayItems = [...items];
  buildTagsBar();
  console.log('data loaded', items);
  render();
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
  console.log('active tags', activeTags);
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
  console.log('display items', displayItems);
  render();
});

// ── Search ────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', e => {
  searchQuery = e.target.value;
  console.log('search query', searchQuery);
  render();
});

// ── Render cards ──────────────────────────────────────────────────────────
function render() {

  console.log('Rendering...');

  // get the visible items
  const visible = filteredItems();

  // set the results info
  resultsInfo.textContent =
    visible.length === items.length
      ? `${items.length} items`
      : `${visible.length} / ${items.length} items`;

  // clear the grid
  //grid.innerHTML = '';
  // gridRow1.innerHTML = '';
  // gridRow2.innerHTML = '';
  // gridRow3.innerHTML = '';

  // if there are no visible items, show the empty state
  console.log('visible lenght', visible.length);
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nessun risultato.';
    //grid.appendChild(empty);
    // gridRow1.appendChild(empty);
    // gridRow2.appendChild(empty);
    // gridRow3.appendChild(empty);
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
    //grid.appendChild(card);
    const rows = [gridRow1, gridRow2, gridRow3];
    rows[i % 3].appendChild(card);
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

  lbDescription.textContent = item.description || '';
  renderLightboxMeta(item);


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
