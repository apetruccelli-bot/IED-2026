//const grid = document.getElementById('grid');
const myColumns = document.getElementsByClassName('myColumn');
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
}

const tagDagherrotipi = ['tags-dagherrotipi','dagh-esposizione','dagh-fissaggio','dagh-difetti-fisici','dagh-difetti-ottici','anno'];
const tagFotocamere = ['tags-fotocamere','anno'];
const tagFotografi = ['tags-fotografi'];

// ── Get tags for a single item based on its categoria ───────────────────
const categoryKeys = {
  dagherrotipi: tagDagherrotipi,
  fotocamere:   tagFotocamere,
  fotografi:    tagFotografi,
};
function getItemTags(item) {
  const keys = categoryKeys[item.categoria] || [];
  return keys.flatMap(k => {
    const v = item[k];
    if (Array.isArray(v)) return v;
    if (v != null) return [String(v)];
    return [];
  });
}

// ── Collect all unique tags ───────────────────────────────────────────────
function allTags() {
  const set = new Set();
  items.forEach(item => getItemTags(item).forEach(t => set.add(t)));
  return [...set].sort();
}

// ── Fade images on scroll ───────────────────────────────────────────────
function updateImageFade() {
  const imgs = document.querySelectorAll('.card-img');
  if (window.scrollY > 10) {
    imgs.forEach(img => img.classList.add('faded'));
  } else {
    imgs.forEach(img => img.classList.remove('faded'));
  }
}
window.addEventListener('scroll', updateImageFade);
window.addEventListener('DOMContentLoaded', updateImageFade);

// ── Build the filter tags bar ─────────────────────────────────────────────
function buildTagsBar() {
  if (!tagsBar) return;
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
      [...activeTags].every(t => getItemTags(item).includes(t));
    const matchesSearch =
      q === '' ||
      item.description.toLowerCase().includes(q) ||
      getItemTags(item).some(t => t.toLowerCase().includes(q));
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
  if(resultsInfo) {
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
    getItemTags(item).forEach(tag => {
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
  updateImageFade();
}

// ── Lightbox ──────────────────────────────────────────────────────────────
function openLightbox(index) {
  // get the visible items
  const visible = filteredItems();
  // set the current index
  lbIndex = index;
  // get the item
  const item = visible[lbIndex];
  if (!item) return;

  lbImg.src = item.src;
  // set the alt text
  lbImg.alt = `Item ${item.id}`;
  // set the id
  lbId.textContent = `#${String(item.id).padStart(2, '0')}`;

  lbTagsEl.innerHTML = '';
  // loop through the tags and create a span for each tag
  getItemTags(item).forEach(tag => {
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
