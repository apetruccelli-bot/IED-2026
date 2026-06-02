const grid = document.getElementById('grid');
const searchInput = document.getElementById('search');
const tagsBar = document.getElementById('tags-bar');
const areaBar = document.getElementById('area-bar');
const resultsInfo = document.getElementById('results-info');

const lightbox   = document.getElementById('lightbox');
const lbImg      = document.getElementById('lbImg') || document.getElementById('lb-img');
const lbTagsEl   = document.getElementById('lbTags') || document.getElementById('lb-tags');
const lbSimilarEl = document.getElementById('lbSimilar') || document.getElementById('lb-similar');
const lbCaption  = document.getElementById('lbCaption') || document.getElementById('lb-caption');
const lbDescription = document.getElementById('lb-description');
const lbMeta = document.getElementById('lb-meta');
const lbClose    = document.getElementById('lbClose') || document.getElementById('lb-close');
const lbPrev     = document.getElementById('lbPrev') || document.getElementById('lb-prev');
const lbNext     = document.getElementById('lbNext') || document.getElementById('lb-next');
const lbBackdrop = document.getElementById('lbBackdrop') || document.getElementById('lb-backdrop');

const labels = {
  missions: "Missions",
  "deck-operations": "Deck Operations"
};

function updateCaptionWidth() {
  if (!lbCaption || !lbImg) return;
  const imgRect = lbImg.getBoundingClientRect();
  if (imgRect.width && imgRect.width > 0) {
    const maxWidth = Math.min(imgRect.width, window.innerWidth * 0.9);
    lbCaption.style.width = maxWidth + 'px';
    lbCaption.style.marginLeft = 'auto';
    lbCaption.style.marginRight = 'auto';
  } else {
    lbCaption.style.width = '';
    lbCaption.style.marginLeft = '';
    lbCaption.style.marginRight = '';
  }
}

if (lbImg) {
  lbImg.addEventListener('load', updateCaptionWidth);
}
window.addEventListener('resize', updateCaptionWidth);

const areaMeta = {
  "Strait of Florida, FL": {
    title: "Strait of Florida",
    story: "The Strait of Florida was among the earliest ORA deep-sector testing sites referenced in the archive. Records from this location describe controlled descent procedures, hydrophone calibration, and preliminary communication trials conducted in relatively stable conditions. Minor signal distortion was noted during several operations, though early summaries attributed these irregularities to current activity, mineral interference, or equipment sensitivity."
  },
  "Monterey submarine Canyon, CA": {
    title: "Monterey Submarine Canyon, California",
    story: "Operations in Monterey Submarine Canyon appear to have marked an expansion of ORA’s deep-water survey program. The canyon’s steep walls and complex acoustic environment made it suitable for extended signal testing and submerged instrument placement. Surviving logs describe repeated interruptions in surface contact, including brief connection losses followed by incomplete telemetry returns. These events were formally categorized as temporary transmission instability."
  },
  "Aleutian Trench, AK": {
    title: "Aleutian Trench, Alaska",
    story: "The Aleutian Trench materials are more fragmentary than those from earlier ORA sites. Surviving excerpts reference extreme pressure conditions, irregular current movement, and repeated failure of depth-linked transmission equipment. Several records mention signal activity recorded after associated instruments had been marked inactive. No complete technical explanation for these discrepancies is preserved within the archive."
  }
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
        story: areaMeta[normalizeArea(item.area)]?.story || item.story || '',
        title: areaMeta[normalizeArea(item.area)]?.title || normalizeArea(item.area)
      }
    ])
  ).values()];

  areas.forEach(areaData => {
    const areaItem = document.createElement('div');
    areaItem.className = 'area-item';
    areaItem.dataset.area = areaData.area;

    const title = document.createElement('div');
    title.className = 'area-title';
    title.textContent = areaData.title;

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
if (searchInput) {
  searchInput.addEventListener('input', e => {
    searchQuery = e.target.value;
    render();
  });
}

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
  if (!lightbox || !lbImg || !lbSimilarEl) return;

  const visible = filteredItems();

  lbIndex = index;

  const item = visible[lbIndex];
  if (!item) return;

  lbImg.src = item.src;
  lbImg.alt = `Item ${item.id}`;
  if (lbCaption) lbCaption.textContent = item.description || '';
  if (lbDescription) lbDescription.textContent = item.description || '';
  if (lbMeta) lbMeta.textContent = ((item.area && item.area.length)? (item.area + ' · ') : '') + (item.tags && item.tags.length ? item.tags.join(', ') : '');
  renderSimilarImages(item, visible);

  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.classList.add('lightbox-open');
  document.body.style.overflow = 'hidden';
}

function renderLightboxTags(item) {
  if (!lbTagsEl) return;

  lbTagsEl.innerHTML = '';

  item.tags.forEach(tag => {
    const tagKey = normalizeKey(tag);

    const t = document.createElement('span');
    t.className = 'card-tag' + (activeTags.has(tagKey) ? ' highlight' : '');
    t.textContent = tag;

    t.addEventListener('click', () => {
      toggleTag(tagKey);
      closeLightbox();
    });

    lbTagsEl.appendChild(t);
  });
}

function renderSimilarImages(currentItem, visibleItems) {
  if (!lbSimilarEl) return;

  lbSimilarEl.innerHTML = '';

  const currentTags = new Set((currentItem.tags || []).map(normalizeKey));
  const currentCategory = normalizeKey(currentItem.category);
  const currentSubcategory = normalizeKey(currentItem.subcategory);
  const currentArea = normalizeArea(currentItem.area);

  let similarItems = visibleItems
    .filter(item => item.id !== currentItem.id)
    .map(item => {
      const itemTags = (item.tags || []).map(normalizeKey);
      const scoreByTags = itemTags.filter(tag => currentTags.has(tag)).length;
      const scoreByCategory = normalizeKey(item.category) === currentCategory ? 3 : 0;
      const scoreBySubcategory = normalizeKey(item.subcategory) === currentSubcategory ? 2 : 0;
      const scoreByArea = normalizeArea(item.area) === currentArea ? 1 : 0;
      const score = scoreByTags + scoreByCategory + scoreBySubcategory + scoreByArea;

      return {
        item,
        score
      };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(result => result.item);

  if (similarItems.length < 3) {
    const existingIds = new Set(similarItems.map(item => item.id));
    existingIds.add(currentItem.id);

    const fallbackItems = visibleItems
      .filter(item => !existingIds.has(item.id))
      .slice(0, 3 - similarItems.length);

    similarItems = [...similarItems, ...fallbackItems];
  }

  similarItems.forEach((item) => {
    const thumb = document.createElement('button');
    thumb.className = 'lightbox-similar-item';
    thumb.type = 'button';
    thumb.setAttribute('aria-label', `Open item ${item.id}`);

    thumb.innerHTML = `<img src="${item.src}" alt="Item ${item.id}">`;

    thumb.addEventListener('click', () => {
      const newIndex = visibleItems.findIndex(visibleItem => visibleItem.id === item.id);
      openLightbox(newIndex);
    });

    lbSimilarEl.appendChild(thumb);
  });
}

function closeLightbox() {
  if (!lightbox || !lbImg || !lbSimilarEl) return;

  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lightbox-open');
  document.body.style.overflow = '';

  lbImg.src = '';
  lbSimilarEl.innerHTML = '';
  if (lbCaption) {
    lbCaption.textContent = '';
    lbCaption.style.width = '';
    lbCaption.style.marginLeft = '';
    lbCaption.style.marginRight = '';
  }
  if (lbDescription) lbDescription.textContent = '';
  if (lbMeta) lbMeta.textContent = '';
}

function navigateLightbox(dir) {
  const visible = filteredItems();

  let next = lbIndex + dir;

  if (next >= visible.length) next = 0;
  if (next < 0) next = visible.length - 1;

  openLightbox(next);
}

if (lbClose) lbClose.addEventListener('click', closeLightbox);
if (lbBackdrop) lbBackdrop.addEventListener('click', closeLightbox);
if (lbPrev) lbPrev.addEventListener('click', () => navigateLightbox(-1));
if (lbNext) lbNext.addEventListener('click', () => navigateLightbox(+1));

if (lightbox) {
  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open')) return;

    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(+1);
    if (e.key === 'Escape') closeLightbox();
  });
}

// ── Init ──────────────────────────────────────────────────────────────────
if (grid && tagsBar && areaBar && resultsInfo) {
  loadData();
}