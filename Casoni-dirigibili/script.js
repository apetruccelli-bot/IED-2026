const archiveGallery = document.getElementById('archive-gallery');
const searchInput = document.getElementById('search');

function getRowCount() {
  const h = window.innerHeight;
  if (h > 750) return 3;
  if (h > 600) return 2;
  return 1;
}

function getActiveRows() {
  const n = getRowCount();
  const allRows = [...document.getElementsByClassName('archive-row')];
  // show only the needed rows, hide the rest
  allRows.forEach((row, i) => {
    row.style.display = i < n ? '' : 'none';
  });
  // update row height CSS variable to match number of active rows
  document.documentElement.style.setProperty(
    '--rowHeight',
    /* `calc(calc(100% / ${n}) - ${(n - 1) * 10 / n + 10}px)` */
    `calc(100% / ${n})`
  );
  return allRows.slice(0, n);
}
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
let activeRowFilters = {};

const disabledRowLabels = new Set(['Causes', 'Victims']);
const categoryDisablesRows = new Set(['models', 'drawings', 'study models', 'technical drawings']);
const victimStops = ['<10', '20', '30', '40', '50', '60', '70', '80', '90', '>100'];

function getVictimsLabelFromIndex(index) {
  return victimStops[Math.max(0, Math.min(victimStops.length - 1, index))];
}

function getVictimsIndexFromLabel(label) {
  return victimStops.indexOf(label);
}

function matchesVictimsFilter(victims, label) {
  if (victims == null) return false;
  if (label === '<10') return victims < 10;
  if (label === '>100') return victims > 100;
  const target = Number(label);
  return Number.isFinite(target) && victims >= target - 5 && victims <= target + 5;
}

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
  displayItems = shuffle([...items]);
  buildTagsBar();
  buildFilterRows();
  console.log('data loaded', items);
  render();
}

// ── Build filter-row-inside chips ────────────────────────────────────────
function buildFilterRows() {
  // maps label text → how to collect unique values from items
  const rowDefs = [
    { label: 'Causes',  values: items => [...new Set(items.flatMap(i => i.causes ?? []))].sort() },
    { label: 'Year',    values: items => [...new Set(items.map(i => i.year))].sort() },
    { label: 'Country', values: items => [...new Set(items.map(i => i.country))].sort() },
    { label: 'Tags',    values: items => [...new Set(items.flatMap(i => i.tags))].sort() },
    { label: 'People',  values: () => ['Yes', 'No'] },
    { label: 'Victims', values: items => {
        const max = Math.max(...items.filter(i => i.victims != null).map(i => i.victims));
        const step = 25;
        const buckets = [];
        for (let lo = 0; lo <= max; lo += step) buckets.push(`${lo}–${lo + step - 1}`);
        return buckets;
      }
    },
  ];

  // activeRowFilters is module-scoped

  document.querySelectorAll('.filter-row').forEach(row => {
    const label = row.querySelector('.filter-label')?.textContent.trim();
    const def = rowDefs.find(d => d.label === label);
    const inside = row.querySelector('.filter-row-inside');
    if (!def || !inside) return;

    if (label === 'Victims') {
      inside.innerHTML = '';

      const wrap = document.createElement('div');
      wrap.className = 'victims-control';

      const slider = document.createElement('input');
      slider.className = 'victims-slider';
      slider.type = 'range';
      slider.min = '0';
      slider.max = String(victimStops.length - 1);
      slider.step = '1';
      slider.value = '4';
      slider.setAttribute('aria-label', 'Victims filter');

      const stops = document.createElement('div');
      stops.className = 'victims-stops';

      victimStops.forEach((stop, index) => {
        const stopEl = document.createElement('span');
        stopEl.className = 'victims-stop';
        stopEl.textContent = stop;
        stopEl.dataset.index = String(index);
        stops.appendChild(stopEl);
      });

      slider.addEventListener('input', () => {
        const stopLabel = getVictimsLabelFromIndex(Number(slider.value));
        activeRowFilters[label] = stopLabel;
        syncVictimsRow(row);
        applyRowFilters();
      });

      stops.addEventListener('click', e => {
        const stopEl = e.target.closest('.victims-stop');
        if (!stopEl) return;
        const index = Number(stopEl.dataset.index);
        slider.value = String(index);
        const stopLabel = getVictimsLabelFromIndex(index);
        activeRowFilters[label] = stopLabel;
        syncVictimsRow(row);
        applyRowFilters();
      });

      wrap.appendChild(slider);
      wrap.appendChild(stops);
      inside.appendChild(wrap);

      row.dataset.controlType = 'victims';
      syncVictimsRow(row);
      return;
    }

    def.values(items).forEach(val => {
      const chip = document.createElement('button');
      chip.className = 'filter-chip';
      chip.type = 'button';
      chip.textContent = val;
      chip.dataset.value = val;
      chip.dataset.rowLabel = label;
      chip.addEventListener('click', () => {
        if (chip.disabled || inside.closest('.filter-row')?.classList.contains('is-disabled')) return;

        const isTagsRow = label === 'Tags';
        if (isTagsRow) {
          // Tags: allow multiple selections
          if (!(activeRowFilters[label] instanceof Set)) {
            activeRowFilters[label] = new Set();
          }
          const tagSet = activeRowFilters[label];
          if (tagSet.has(val)) {
            tagSet.delete(val);
            chip.classList.remove('active');
            if (tagSet.size === 0) {
              activeRowFilters[label] = null;
            }
          } else {
            tagSet.add(val);
            chip.classList.add('active');
          }
        } else {
          // Other rows: single selection
          if (activeRowFilters[label] === val) {
            // deselect
            activeRowFilters[label] = null;
            chip.classList.remove('active');
          } else {
            // deselect previous in same row
            inside.querySelectorAll('.filter-chip.active').forEach(c => c.classList.remove('active'));
            activeRowFilters[label] = val;
            chip.classList.add('active');
          }
        }
        applyRowFilters();
      });
      inside.appendChild(chip);
    });
  });

  updateDisabledFilterRows();
}

function syncVictimsRow(row) {
  const slider = row.querySelector('.victims-slider');
  const stops = row.querySelectorAll('.victims-stop');
  if (!slider || stops.length === 0) return;

  const activeValue = activeRowFilters.Victims;
  const activeIndex = activeValue ? getVictimsIndexFromLabel(activeValue) : -1;
  stops.forEach((stopEl, index) => {
    stopEl.classList.toggle('active', index === activeIndex);
  });
  if (activeIndex >= 0) {
    slider.value = String(activeIndex);
  }
}

function isCategoryDisablingRows() {
  if (!activeCategory) return false;
  return categoryDisablesRows.has(String(activeCategory).toLowerCase());
}

function updateDisabledFilterRows() {
  const shouldDisable = isCategoryDisablingRows();

  document.querySelectorAll('.filter-row').forEach(row => {
    const label = row.querySelector('.filter-label')?.textContent.trim();
    const isTargetRow = disabledRowLabels.has(label);
    const disableRow = shouldDisable && isTargetRow;

    row.classList.toggle('is-disabled', disableRow);

    row.querySelectorAll('.filter-chip').forEach(chip => {
      chip.disabled = disableRow;
      chip.setAttribute('aria-disabled', disableRow ? 'true' : 'false');
    });

    const victimsSlider = row.querySelector('.victims-slider');
    if (victimsSlider) {
      victimsSlider.disabled = disableRow;
    }

    if (disableRow && activeRowFilters[label]) {
      activeRowFilters[label] = null;
      row.querySelectorAll('.filter-chip.active').forEach(chip => chip.classList.remove('active'));
    }

    if (row.dataset.controlType === 'victims') {
      syncVictimsRow(row);
    }
  });

  applyRowFilters();
}

function matchesRowFilters(item) {
  return Object.entries(activeRowFilters).every(([label, val]) => {
    if (!val) return true;

    if (label === 'Tags' && val instanceof Set) {
      // Multiple tags: item must have all of the selected tags
      if (val.size === 0) return true;
      return [...val].every(tag => item.tags.includes(tag));
    }

    switch (label) {
      case 'Causes':  return (item.causes ?? []).includes(val);
      case 'Year':    return item.year === val;
      case 'Country': return item.country === val;
      case 'Tags':    return item.tags.includes(val);
      case 'People':  return (val === 'Yes') === item.people;
      case 'Victims': return matchesVictimsFilter(item.victims, val);
      default: return true;
    }
  });
}

// ── Apply row filters to cards ────────────────────────────────────────────
function applyRowFilters() {
  const hasAny = Object.values(activeRowFilters).some(v => v);
  document.querySelectorAll('.card').forEach(card => {
    const item = items.find(i => String(i.id) === card.dataset.id);
    if (!item) return;

    const categoryDim = activeCategory && item.category !== activeCategory;
    if (!hasAny) {
      card.classList.toggle('card-dim', categoryDim);
      return;
    }
    const match = matchesRowFilters(item);
    card.classList.toggle('card-dim', categoryDim || !match);
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

function lightboxItems() {
  const visible = filteredItems();
  return visible.filter(item => {
    const matchesCategory = !activeCategory || item.category === activeCategory;
    const matchesFilters = matchesRowFilters(item);
    return matchesCategory && matchesFilters;
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

  // clear all rows
  [...document.getElementsByClassName('archive-row')].forEach(r => r.innerHTML = '');
  const rows = getActiveRows();

  // if there are no visible items, show the empty state
  console.log('visible lenght', visible.length);
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nessun risultato.';
    rows[0].appendChild(empty);
    return;
  }

  // loop through the visible items and create a card for each item
  visible.forEach((item, i) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.style.cursor = 'zoom-in';
    card.dataset.category = item.category;
    card.dataset.id = item.id;

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

    card.addEventListener('click', () => openLightbox(item.id));

    card.appendChild(body);
    if (activeCategory && item.category !== activeCategory) card.classList.add('card-dim');
    rows[i % rows.length].appendChild(card);
  });
  // reapply row filters after cards are rebuilt
  applyRowFilters();
}

// ── Lightbox ──────────────────────────────────────────────────────────────
function openLightbox(itemId) {
  const visible = lightboxItems();
  const nextIndex = visible.findIndex(item => String(item.id) === String(itemId));
  if (nextIndex === -1) return;

  lbIndex = nextIndex;
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
  const visible = lightboxItems();
  if (visible.length === 0) return;

  // calcola il prossimo indice
  let next = lbIndex + dir;

  // se si va oltre l'ultimo, torna al primo
  if (next >= visible.length) next = 0;

  // se si va prima del primo, salta all'ultimo
  if (next < 0) next = visible.length - 1;

  openLightbox(visible[next].id);
}

lbClose.addEventListener('click', closeLightbox);
lbBackdrop.addEventListener('click', closeLightbox);

// Navigate by clicking left/right half of the image
//const lbImg = document.getElementById('lb-img');
lbImg.addEventListener('click', e => {
  const half = e.offsetX < lbImg.offsetWidth / 2;
  navigateLightbox(half ? -1 : +1);
});
lbImg.addEventListener('mousemove', e => {
  lbImg.style.cursor = e.offsetX < lbImg.offsetWidth / 2 ? 'w-resize' : 'e-resize';
});

document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('open')) return;
  if (e.key === 'ArrowLeft')  navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(+1);
  if (e.key === 'Escape')     closeLightbox();
});

// ── Category filter links ────────────────────────────────────────────────
let activeCategory = null;
const filtersPanel = document.querySelector('.filters-panel');
document.querySelectorAll('.filter-link').forEach(btn => {
  btn.addEventListener('click', () => {
    const cat = btn.dataset.category;
    if (activeCategory === cat) {
      // deselect
      activeCategory = null;
      document.querySelectorAll('.filter-link').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.card').forEach(c => c.classList.remove('card-dim'));
    } else {
      activeCategory = cat;
      document.querySelectorAll('.filter-link').forEach(b =>
        b.classList.toggle('active', b.dataset.category === cat)
      );
      document.querySelectorAll('.card').forEach(c =>
        c.classList.toggle('card-dim', c.dataset.category !== cat)
      );
    }

    if (filtersPanel) {
      filtersPanel.classList.toggle('has-active-category', !!activeCategory);
    }

    updateDisabledFilterRows();
  });
});

// ── Responsive row count ──────────────────────────────────────────────────
let _lastRowCount = getRowCount();
window.addEventListener('resize', () => {
  const n = getRowCount();
  if (n !== _lastRowCount) {
    _lastRowCount = n;
    render();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────
loadData();
