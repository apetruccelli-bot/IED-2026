const grid = document.getElementById('grid');
const itemPreview = document.getElementById('item-preview');
const searchInput = document.getElementById('search');
const tagsBar = document.getElementById('tags-bar');
const resultsInfo = document.getElementById('results-info');
const btnRandom = document.getElementById('btn-random');

const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
const lbId = document.getElementById('lb-id');
const lbTagsEl = document.getElementById('lb-tags');
const lbClose = document.getElementById('lb-close');
const lbPrev = document.getElementById('lb-prev');
const lbNext = document.getElementById('lb-next');
const lbBackdrop = document.getElementById('lb-backdrop');

const categoryTexts = {
  fotografie: {
    japanese: `ある実業家が、まるでその中を探そうとするかのように、腰をかがめて吸い殻を拾い上げた。ある実業家が、まるでその中を探そうとするかのように、腰をかがめて吸い殻を拾い上げた。`,
    english: `Hiroshi Tanaka, a tobacconist in Osaka in the 1980s, viewed smoking not merely as a vice but as a way of life, collecting cigarettes and related items. When he was diagnosed with lung cancer, instead of quitting, he continued to smoke and began photographing people smoking on the street to show just how normal it was.`
  },
  pacchetti: {
    japanese: `タバコの箱は、色、文字、場所によって集められた小さな記憶の断片である。`,
    english: `Cigarette packs presents the visual archive of tobacco packaging: colors, lettering and graphic details collected between Osaka, Tokyo, Kyoto and Nara.`
  },
  pubblicità: {
    japanese: `広告は、喫煙が日常の中でどのように語られ、見せられていたかを記録している。`,
    english: `Advertisements shows how cigarettes were represented through commercial images, slogans and visual culture.`
  }
};

const filtersByCategory = {
  pacchetti: [
    { title: '色 Color', type: 'pack-color', values: ['赤 Red', '白 White', '青 Blue', '黄色 Yellow', '緑 Green'] },
    { title: '産地 Origin', type: 'origin', values: ['大阪 Osaka', '東京 Tokyo', '京都 Kyoto', '奈良 Nara'] },
    { title: '年 Year', type: 'year', values: [1985, 1986, 1987, 1988, 1989, 1990] }
  ]
};

let items = [];
let displayItems = [];
let activeTags = new Set();
let searchQuery = '';
let isRandom = false;
let lbIndex = -1;
let activeCategory = 'fotografie';
let activeFilter = null;
let activeFilterType = null;
let advertisingScrollBound = false;
let lastAdvertisingIndex = -1;
let portraitGestureIndex = 0;
let packGestureIndex = 0;
let adGestureIndex = 0;
let categoryImagesRevealed = false;

const GESTURE_CATEGORIES = ['fotografie', 'pacchetti', 'pubblicità'];

function isGestureCategoryActive() {
  return GESTURE_CATEGORIES.includes(activeCategory);
}

function isCategoryImagesRevealed() {
  return categoryImagesRevealed;
}

function usesYearDimMode() {
  return activeFilterType === 'year'
    && (activeCategory === 'fotografie' || activeCategory === 'pacchetti');
}

function itemMatchesYearFilter(item) {
  return Number(item.year) === Number(activeFilter);
}

function revealCategoryImages() {
  if (categoryImagesRevealed || !['fotografie', 'pacchetti', 'pubblicità'].includes(activeCategory)) {
    return false;
  }

  categoryImagesRevealed = true;
  syncCategoryRevealState();

  if (activeCategory === 'pubblicità') {
    const visible = filteredItems();
    renderAdvertisingDescriptions(visible);
    if (grid) grid.scrollTop = 0;
    lastAdvertisingIndex = -1;
    setupAdvertisingScrollText();
    requestAnimationFrame(() => updateAdvertisingScrollState());
  } else if (activeCategory === 'fotografie') {
    portraitGestureIndex = 0;
    selectPortraitByIndex(0);
  } else if (activeCategory === 'pacchetti') {
    packGestureIndex = 0;
    selectPackByIndex(0);
  }

  window.updateIdleGestureStatus?.();
  return true;
}

function syncCategoryRevealState() {
  const main = document.querySelector('.mainLayout');
  main?.classList.toggle('category-images-revealed', categoryImagesRevealed);

  const intro = document.querySelector('.description-intro');
  if (!categoryImagesRevealed) {
    clearItemPreview();
    grid?.classList.remove('has-selected');
    main?.classList.remove('has-item-selected');
    if (intro) intro.hidden = false;
    if (activeCategory === 'pubblicità') {
      clearAdvertisingDescriptions();
    }
    return;
  }

  if (intro) intro.hidden = true;
}

function openPubblicitaViaGesture() {
  if (document.body.classList.contains('about-open')) {
    closeExploreModal();
  }
  if (activeCategory !== 'pubblicità') {
    setCategory('pubblicità');
  } else {
    window.ensureCategoryGestures?.();
  }
}
let aboutGestureIndex = 0;
let aboutBlowHeld = false;

function updateCategoryText(category) {
  const japaneseText = document.getElementById('category-japanese-text');
  const englishText = document.getElementById('category-english-text');
  if (!japaneseText || !englishText) return;

  const text = categoryTexts[category] || categoryTexts.fotografie;
  japaneseText.textContent = text.japanese;
  englishText.textContent = text.english;
}

function setDescriptionIntroVisible(visible) {
  if (!categoryImagesRevealed) {
    document.querySelector('.mainLayout')?.classList.remove('has-item-selected');
    const intro = document.querySelector('.description-intro');
    if (intro) intro.hidden = false;
    return;
  }

  document.querySelector('.mainLayout')?.classList.toggle('has-item-selected', !visible);
  const intro = document.querySelector('.description-intro');
  if (intro) intro.hidden = true;
}

async function loadData() {
  const res = await fetch('data.json');
  if (!res.ok) throw new Error(`Impossibile caricare data.json: ${res.status}`);
  const data = await res.json();
  items = Array.isArray(data.items) ? data.items : [];
  displayItems = [...items];
  buildTagsBar();
}

function getItemTags(item) {
  return [
    ...(item.tags || []),
    ...(item['tags-fotografie'] || []),
    ...(item['tags-pacchetti'] || [])
  ];
}

function allTags() {
  return [...new Set(items.flatMap(getItemTags))].sort();
}

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

function toggleTag(tag) {
  if (activeTags.has(tag)) activeTags.delete(tag);
  else activeTags.add(tag);
  syncGlobalTagButtons();
  render();
}

function syncGlobalTagButtons() {
  if (!tagsBar) return;
  tagsBar.querySelectorAll('.tag-btn').forEach(btn => {
    btn.classList.toggle('active', activeTags.has(btn.dataset.tag));
  });
}

function filteredItems() {
  const q = searchQuery.trim().toLowerCase();

  return displayItems.filter(item => {
    const matchesCategory = !activeCategory || item.category === activeCategory;
    const tags = getItemTags(item);
    const matchesTags = [...activeTags].every(tag => tags.includes(tag));
    const matchesSearch = !q || [item.description, item['description-ja'], item['description-en'], item['portrait-status'], item['portrait-relationship'], item.category, item.year, ...tags]
      .join(' ')
      .toLowerCase()
      .includes(q);

    let matchesCustomFilter = true;

    if (activeFilter && activeFilterType === 'year' && !usesYearDimMode()) {
      matchesCustomFilter = Number(item.year) === Number(activeFilter);
    }

    if (activeFilter && activeFilterType === 'tag') {
      matchesCustomFilter = tags.includes(activeFilter);
    }

    if (activeFilter && activeFilterType === 'luogo') {
      matchesCustomFilter =
        item['luogo-pacchetti']?.toLowerCase() === activeFilter.toLowerCase() ||
        tags.some(tag => tag.toLowerCase() === activeFilter.toLowerCase());
    }

    if (activeFilter && activeFilterType === 'pack-color') {
      matchesCustomFilter = item['pack-color'] === activeFilter;
    }

    if (activeFilter && activeFilterType === 'origin') {
      matchesCustomFilter = item['pack-origin'] === activeFilter;
    }

    if (activeFilter && activeFilterType === 'status') {
      matchesCustomFilter = item['portrait-status'] === activeFilter;
    }

    if (activeFilter && activeFilterType === 'relationship') {
      matchesCustomFilter = item['portrait-relationship'] === activeFilter;
    }

    return matchesCategory && matchesTags && matchesSearch && matchesCustomFilter;
  });
}

function updateHeaderNavState({ aboutOpen = false, highlightCategory = null } = {}) {
  const aboutLink = document.getElementById('header-about-link');
  const activeCat = highlightCategory ?? activeCategory;

  document.querySelectorAll('[data-category]').forEach(el => {
    el.classList.toggle('is-active', !aboutOpen && el.dataset.category === activeCat);
    el.style.opacity = '';
  });

  aboutLink?.classList.toggle('is-active', aboutOpen);
}

function setCategory(cat) {
  activeCategory = cat;
  activeFilter = null;
  activeFilterType = null;
  activeTags.clear();
  categoryImagesRevealed = false;
  syncGlobalTagButtons();

  clearItemPreview();
  setDescriptionIntroVisible(true);

  grid?.classList.remove(
    'has-selected',
    'layout-fotografie',
    'layout-pacchetti',
    'layout-pubblicita',
    'year-filtered'
  );

  updateHeaderNavState();

  document.querySelector('.mainLayout')?.classList.toggle('category-pubblicita', activeCategory === 'pubblicità');

  if (activeCategory === 'fotografie') {
    portraitGestureIndex = 0;
    grid?.classList.add('layout-fotografie');
    renderPortraitFilters();
  } else if (activeCategory === 'pubblicità') {
    clearCategoryFilters();
  } else {
    renderCategoryFilters(activeCategory);
  }

  if (activeCategory === 'pacchetti') {
    packGestureIndex = 0;
    grid?.classList.add('layout-pacchetti');
  }
  if (activeCategory === 'pubblicità') {
    adGestureIndex = 0;
    grid?.classList.add('layout-pubblicita');
    lastAdvertisingIndex = -1;
    if (grid) grid.scrollTop = 0;
  } else {
    resetAdvertisingScroll();
  }

  document.body.classList.toggle(
    'category-gesture-active',
    activeCategory === 'fotografie' || activeCategory === 'pacchetti'
  );

  updateCategoryText(activeCategory);
  render();
  syncCategoryRevealState();
  window.ensureCategoryGestures?.();
}

function getPortraitItems() {
  let list = filteredItems().filter(item => item.category === 'fotografie');
  if (usesYearDimMode()) {
    list = list.filter(itemMatchesYearFilter);
  }
  return list;
}

function findCardForItem(item) {
  if (!grid || !item) return null;
  return [...grid.querySelectorAll('.card')].find(card => {
    const img = card.querySelector('img');
    if (!img) return false;
    const itemSrc = item.src;
    const attrSrc = img.getAttribute('src') || '';
    return attrSrc === itemSrc || img.src.endsWith(itemSrc);
  }) || null;
}

function selectPortraitByIndex(index) {
  if (activeCategory !== 'fotografie' || !grid || !categoryImagesRevealed) return;

  const portraits = getPortraitItems();
  if (!portraits.length) return;

  portraitGestureIndex = ((index % portraits.length) + portraits.length) % portraits.length;
  const item = portraits[portraitGestureIndex];

  grid.querySelectorAll('.card').forEach(c => c.classList.remove('selectedImg'));
  grid.classList.add('has-selected');

  const card = findCardForItem(item);
  if (card) {
    card.classList.add('selectedImg');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  updateActiveInfo(item);
  showItemPreview(item);
}

function syncPortraitSelection() {
  const portraits = getPortraitItems();
  if (!portraits.length) {
    clearItemPreview();
    grid?.classList.remove('has-selected');
    return;
  }

  portraitGestureIndex = Math.min(portraitGestureIndex, portraits.length - 1);
  selectPortraitByIndex(portraitGestureIndex);
}

function advancePortraitViaGesture() {
  if (activeCategory === 'fotografie' && !categoryImagesRevealed) {
    revealCategoryImages();
    return;
  }
  selectPortraitByIndex(portraitGestureIndex + 1);
}

function getPackItems() {
  let list = filteredItems().filter(item => item.category === 'pacchetti');
  if (usesYearDimMode()) {
    list = list.filter(itemMatchesYearFilter);
  }
  return list;
}

function selectPackByIndex(index) {
  if (activeCategory !== 'pacchetti' || !grid || !categoryImagesRevealed) return;

  const packs = getPackItems();
  if (!packs.length) return;

  packGestureIndex = ((index % packs.length) + packs.length) % packs.length;
  const item = packs[packGestureIndex];

  grid.querySelectorAll('.card').forEach(c => c.classList.remove('selectedImg'));
  grid.classList.add('has-selected');

  const card = findCardForItem(item);
  if (card) {
    card.classList.add('selectedImg');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  updateActiveInfo(item);
  showItemPreview(item);
}

function syncPackSelection() {
  const packs = getPackItems();
  if (!packs.length) {
    clearItemPreview();
    grid?.classList.remove('has-selected');
    return;
  }

  packGestureIndex = Math.min(packGestureIndex, packs.length - 1);
  selectPackByIndex(packGestureIndex);
}

function advancePackViaGesture() {
  if (activeCategory === 'pacchetti' && !categoryImagesRevealed) {
    revealCategoryImages();
    return;
  }
  selectPackByIndex(packGestureIndex + 1);
}

function getAdItems() {
  return filteredItems().filter(item => item.category === 'pubblicità');
}

function syncAdIndexToScroll() {
  if (activeCategory !== 'pubblicità') return;

  const cards = [...document.querySelectorAll('.myPhotos.layout-pubblicita .card')];
  if (!cards.length) return;

  const targetY = window.innerHeight * 0.45;
  let bestIndex = adGestureIndex;
  let bestDistance = Infinity;

  cards.forEach((card, i) => {
    const rect = card.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const distance = Math.abs(centerY - targetY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  });

  adGestureIndex = bestIndex;
}

function getAboutImages() {
  return [...document.querySelectorAll('.about-plate img, .about-grid img')];
}

function ensureAboutBlowHints() {
  getAboutImages().forEach(img => {
    if (img.closest('.about-image-frame')) return;

    const frame = document.createElement('div');
    frame.className = 'about-image-frame';

    const hint = document.createElement('div');
    hint.className = 'about-blow-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = `
      <span class="japanese">発見するために</span>
      <span class="english">blow to discover</span>
    `;

    const parent = img.parentNode;
    if (!parent) return;
    parent.insertBefore(frame, img);
    frame.appendChild(img);
    frame.appendChild(hint);
  });
}

function syncAboutRevealState() {
  const images = getAboutImages();
  if (!images.length) return;

  if (aboutGestureIndex >= images.length) {
    aboutGestureIndex = images.length - 1;
  }

  images.forEach((img, i) => {
    const isActive = i === aboutGestureIndex;
    const isRevealed = aboutBlowHeld && isActive;

    img.classList.toggle('about-revealed', isRevealed);
    img.closest('.about-image-frame')?.classList.toggle('is-about-active', isActive);
  });
}

function onAboutBlowGestureStart() {
  if (!document.body.classList.contains('about-open')) return;
  aboutBlowHeld = true;
  syncAboutRevealState();
}

function onAboutBlowGestureEnd() {
  if (!document.body.classList.contains('about-open')) return;
  aboutBlowHeld = false;
  syncAboutIndexToScroll();
}

function syncAboutIndexToScroll() {
  if (!document.body.classList.contains('about-open')) return;
  if (aboutBlowHeld) return;

  const images = getAboutImages();
  if (!images.length) return;

  const targetY = window.innerHeight * 0.45;
  let bestIndex = aboutGestureIndex;
  let bestDistance = Infinity;

  images.forEach((img, i) => {
    const rect = img.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const distance = Math.abs(centerY - targetY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  });

  aboutGestureIndex = bestIndex;
  syncAboutRevealState();
}

function resetAboutBlowGesture() {
  aboutGestureIndex = 0;
  aboutBlowHeld = false;
  getAboutImages().forEach(img => {
    img.classList.remove('about-revealed');
    img.closest('.about-image-frame')?.classList.remove('is-about-active');
  });
  if (document.body.classList.contains('about-open')) {
    syncAboutRevealState();
  }
}

function scrollContentByGesture(direction) {
  const modal = document.getElementById('explore-modal');
  const grid = document.getElementById('grid');
  const isAboutOpen = document.body.classList.contains('about-open') && modal?.style.display !== 'none';
  const scrollEl = isAboutOpen ? modal : grid;

  if (!scrollEl) return;

  const amount = Math.round(scrollEl.clientHeight * 0.55);
  scrollEl.scrollBy({
    top: direction === 'down' ? amount : -amount,
    behavior: 'smooth',
  });

  if (activeCategory === 'pubblicità' && !isAboutOpen) {
    window.setTimeout(() => syncAdIndexToScroll(), 450);
  }
  if (isAboutOpen) {
    window.setTimeout(() => syncAboutIndexToScroll(), 450);
  }
}

function renderPortraitFilters() {
  const panel = document.getElementById('filters-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="filter">
      <p>ステータス&nbsp;&nbsp; Status</p>
      <p>
        <span class="filter-option" data-filter-type="status" data-filter-value="様 Sama">様 Sama</span>
        <span class="filter-option" data-filter-type="status" data-filter-value="先輩 Senpai">先輩 Senpai</span>
        <span class="filter-option" data-filter-type="status" data-filter-value="君 Kun">君 Kun</span>
      </p>
    </div>

    <div class="filter">
      <p>関係&nbsp;&nbsp; Relationship</p>
      <p>
        <span class="filter-option" data-filter-type="relationship" data-filter-value="個人 Individual">個人 Individual</span>
        <span class="filter-option" data-filter-type="relationship" data-filter-value="グループ Group">グループ Group</span>
      </p>
    </div>

    <div class="filter">
      <p>年&nbsp;&nbsp; Year</p>
      <p>
        <span class="filter-option" data-filter-type="year" data-filter-value="1986">1986年</span>
        <span class="filter-option" data-filter-type="year" data-filter-value="1987">1987年</span>
        <span class="filter-option" data-filter-type="year" data-filter-value="1988">1988年</span>
        <span class="filter-option" data-filter-type="year" data-filter-value="1989">1989年</span>
        <span class="filter-option" data-filter-type="year" data-filter-value="1990">1990年</span>
      </p>
    </div>
  `;

  bindFilterOptionClicks(panel);
}

function clearCategoryFilters() {
  const panel = document.getElementById('filters-panel');
  if (!panel) return;
  panel.innerHTML = '';
}

function renderCategoryFilters(category) {
  const panel = document.getElementById('filters-panel');
  if (!panel) return;

  panel.innerHTML = '';

  (filtersByCategory[category] || []).forEach(group => {
    const div = document.createElement('div');
    div.className = 'filter';
    div.innerHTML = `
      <p>${group.title}</p>
      <p>
        ${group.values.map(value => `
          <span class="filter-option" data-filter-type="${group.type}" data-filter-value="${value}">${value}</span>
        `).join('')}
      </p>
    `;
    panel.appendChild(div);
  });

  bindFilterOptionClicks(panel);
}

function bindFilterOptionClicks(panel) {
  panel.querySelectorAll('.filter-option').forEach(option => {
    option.addEventListener('click', () => {
      const value = option.dataset.filterValue;
      const type = option.dataset.filterType;

      if (activeFilter === value && activeFilterType === type) {
        activeFilter = null;
        activeFilterType = null;
      } else {
        activeFilter = value;
        activeFilterType = type;
      }

      updateFilterOpacity();
      render();
    });
  });
}

function updateFilterOpacity() {
  document.querySelectorAll('.filter-option').forEach(el => {
    const active = activeFilter === el.dataset.filterValue && activeFilterType === el.dataset.filterType;
    el.classList.toggle('active-filter', active);
    el.style.opacity = !activeFilter || active ? '1' : '0.35';
  });
}

function updateActiveInfo(item) {
  const tags = getItemTags(item);

  document.querySelectorAll('[data-category]').forEach(el => {
    el.classList.toggle('is-active', el.dataset.category === item.category);
    el.style.opacity = '';
  });
  document.getElementById('header-about-link')?.classList.remove('is-active');

  document.querySelectorAll('.card-tag').forEach(tagEl => {
    tagEl.classList.toggle('highlight', tags.includes(tagEl.textContent));
  });

  if (activeFilter && activeFilterType) {
    updateFilterOpacity();
    return;
  }

  document.querySelectorAll('.filter-option').forEach(el => {
    const value = el.dataset.filterValue;
    const type = el.dataset.filterType;

    const isActive =
      (type === 'year' && Number(value) === Number(item.year)) ||
      (type === 'tag' && tags.includes(value)) ||
      (type === 'status' && value === item['portrait-status']) ||
      (type === 'relationship' && value === item['portrait-relationship']) ||
      (type === 'pack-color' && value === item['pack-color']) ||
      (type === 'origin' && value === item['pack-origin']) ||
      (type === 'luogo' && value === item['luogo-pacchetti']);

    el.classList.toggle('active-filter', isActive);
    el.style.opacity = isActive ? '1' : '0.35';
  });
}

function clearActiveInfo() {
  updateHeaderNavState();
  if (activeFilter && activeFilterType) {
    updateFilterOpacity();
    return;
  }
  document.querySelectorAll('.filter-option').forEach(el => {
    el.classList.remove('active-filter');
    el.style.opacity = '1';
  });
}

function descriptionTextHtml(ja, en) {
  return `
    <div class="japanese">${ja || ''}</div>
    <div class="english">${en || ''}</div>
  `;
}

function showItemPreview(item) {
  if (!itemPreview || !['fotografie', 'pacchetti', 'pubblicità'].includes(activeCategory)) return;

  const layoutClass =
    activeCategory === 'pacchetti' ? 'pacchetti'
    : activeCategory === 'pubblicità' ? 'pubblicita'
    : 'fotografie';

  itemPreview.className = `item-preview open layout-${layoutClass}`;
  setDescriptionIntroVisible(false);

  let bodyHtml = '';
  if (item.category === 'pacchetti') {
    bodyHtml = `
      <div class="card-tags">
        ${(item.tags || []).map(tag => `<span class="card-tag">${tag}</span>`).join('')}
      </div>
      <div class="card-desc">${descriptionTextHtml(item['description-ja'], item['description-en'])}</div>
    `;
  } else if (item.category === 'pubblicità') {
    bodyHtml = `
      <div class="card-desc">${descriptionTextHtml(item['description-ja'], item['description-en'])}</div>
    `;
  } else if (item.category === 'fotografie') {
    const tags = getItemTags(item);
    bodyHtml = `
      <div class="card-tags">
        ${tags.map(tag => `<span class="card-tag">${tag}</span>`).join('')}
      </div>
      <div class="card-desc">${descriptionTextHtml(item['description-ja'], item['description-en'])}</div>
    `;
  } else {
    const tags = getItemTags(item);
    bodyHtml = `
      <span class="card-id">#${String(item.id).padStart(2, '0')}</span>
      <div class="card-tags">
        ${tags.map(tag => `<span class="card-tag">${tag}</span>`).join('')}
      </div>
      <div class="card-desc">${descriptionTextHtml(item['description-ja'], item['description-en'])}</div>
    `;
  }

  itemPreview.innerHTML = `
    <img class="card-img" src="${item.src}" alt="${item.description || `Item ${item.id}`}">
    <div class="card-body">${bodyHtml}</div>
  `;
  itemPreview.setAttribute('aria-hidden', 'false');
}

function clearItemPreview() {
  if (!itemPreview) return;
  itemPreview.innerHTML = '';
  itemPreview.className = 'item-preview';
  itemPreview.setAttribute('aria-hidden', 'true');
  setDescriptionIntroVisible(true);

  if (activeCategory === 'pubblicità') updateAdvertisingScrollState();
  else updateCategoryText(activeCategory);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

btnRandom?.addEventListener('click', () => {
  if (isRandom) {
    displayItems = [...items];
    btnRandom.textContent = 'Random';
  } else {
    displayItems = shuffle(items);
    btnRandom.textContent = 'Reset';
  }
  isRandom = !isRandom;
  render();
});

searchInput?.addEventListener('input', e => {
  searchQuery = e.target.value;
  render();
});

function render() {
  if (!grid) return;
  const visible = filteredItems();

  if (resultsInfo) {
    resultsInfo.textContent = visible.length === items.length
      ? `${items.length} items`
      : `${visible.length} / ${items.length} items`;
  }

  grid.innerHTML = '';
  clearItemPreview();
  grid.classList.toggle('layout-fotografie', activeCategory === 'fotografie');
  grid.classList.toggle('layout-pubblicita', activeCategory === 'pubblicità');
  grid.classList.toggle('layout-pacchetti', activeCategory === 'pacchetti');
  grid.classList.toggle('year-filtered', usesYearDimMode());
  grid.classList.remove('has-selected');

  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nessun risultato.';
    grid.appendChild(empty);
    return;
  }

  const yearDim = usesYearDimMode();

  visible.forEach((item, i) => {
    const yearMatch = !yearDim || itemMatchesYearFilter(item);
    const card = document.createElement('article');
    card.className = yearMatch ? 'card activeImg' : 'card';
    card.style.cursor = ['fotografie', 'pacchetti'].includes(activeCategory) && yearMatch
      ? 'zoom-in'
      : 'default';
    card.dataset.itemYear = item.year;

    if (item.category === 'pubblicità') {
      card.dataset.adJa = item['description-ja'] || item.description || '';
      card.dataset.adEn = item['description-en'] || item.description || '';
    }

    const img = document.createElement('img');
    img.className = 'card-img';
    img.src = item.src;
    img.alt = item.description || `Item ${item.id}`;
    img.loading = 'lazy';

    if (item.category === 'pubblicità') {
      img.addEventListener('load', () => updateAdvertisingScrollState(), { once: true });
      if (img.complete) {
        requestAnimationFrame(() => updateAdvertisingScrollState());
      }
    }

    card.appendChild(img);

    const body = document.createElement('div');
    body.className = 'card-body';

    if (item.category === 'pacchetti') {
      body.innerHTML = `
        <div class="card-tags">
          ${(item.tags || []).map(tag => `<span class="card-tag">${tag}</span>`).join('')}
        </div>
        <div class="card-desc">${descriptionTextHtml(item['description-ja'], item['description-en'])}</div>
      `;
    } else if (item.category === 'fotografie') {
      const tagsEl = document.createElement('div');
      tagsEl.className = 'card-tags';
      getItemTags(item).forEach(tag => {
        const t = document.createElement('span');
        t.className = 'card-tag';
        t.textContent = tag;
        t.addEventListener('click', e => {
          e.stopPropagation();
          toggleTag(tag);
        });
        tagsEl.appendChild(t);
      });
      body.appendChild(tagsEl);

      const descEl = document.createElement('p');
      descEl.className = 'card-desc';
      descEl.innerHTML = descriptionTextHtml(item['description-ja'], item['description-en']);
      body.appendChild(descEl);
    } else {
      const idEl = document.createElement('span');
      idEl.className = 'card-id';
      idEl.textContent = `#${String(item.id).padStart(2, '0')}`;
      body.appendChild(idEl);

      const tagsEl = document.createElement('div');
      tagsEl.className = 'card-tags';
      getItemTags(item).forEach(tag => {
        const t = document.createElement('span');
        t.className = 'card-tag';
        t.textContent = tag;
        t.addEventListener('click', e => {
          e.stopPropagation();
          toggleTag(tag);
        });
        tagsEl.appendChild(t);
      });
      body.appendChild(tagsEl);
    }

    card.appendChild(body);

    if (['fotografie', 'pacchetti'].includes(activeCategory)) {
      card.addEventListener('click', () => {
        if (!categoryImagesRevealed) return;
        if (yearDim && !itemMatchesYearFilter(item)) return;

        const alreadyActive = card.classList.contains('selectedImg');
        grid.querySelectorAll('.card').forEach(c => c.classList.remove('selectedImg'));
        grid.classList.toggle('has-selected', !alreadyActive);

        if (!alreadyActive) {
          card.classList.add('selectedImg');
          updateActiveInfo(item);
          showItemPreview(item);
          if (activeCategory === 'fotografie') {
            const portraits = getPortraitItems();
            const idx = portraits.findIndex(p => p.id === item.id);
            if (idx >= 0) portraitGestureIndex = idx;
          } else if (activeCategory === 'pacchetti') {
            const packs = getPackItems();
            const idx = packs.findIndex(p => p.id === item.id);
            if (idx >= 0) packGestureIndex = idx;
          }
        } else {
          clearActiveInfo();
          clearItemPreview();
        }
      });
    }

    grid.appendChild(card);
  });

  if (activeCategory === 'pubblicità' && categoryImagesRevealed) {
    renderAdvertisingDescriptions(visible);
    if (grid) grid.scrollTop = 0;
    lastAdvertisingIndex = -1;
    setupAdvertisingScrollText();
    requestAnimationFrame(() => updateAdvertisingScrollState());
  } else {
    clearAdvertisingDescriptions();
  }

  if (activeCategory === 'fotografie' && categoryImagesRevealed) {
    syncPortraitSelection();
  }

  if (activeCategory === 'pacchetti' && categoryImagesRevealed) {
    syncPackSelection();
  }

  if (activeFilter && activeFilterType) {
    updateFilterOpacity();
  }
}

function toggleAdvertisingDescScroll(show) {
  const scroll = document.getElementById('advertising-desc-scroll');
  if (!scroll) return;
  scroll.classList.toggle('is-active', show);
  scroll.setAttribute('aria-hidden', String(!show));
}

function renderAdvertisingDescriptions(visible) {
  const scroll = document.getElementById('advertising-desc-scroll');
  if (!scroll) return;

  scroll.innerHTML = '';
  toggleAdvertisingDescScroll(true);

  visible.forEach(item => {
    const block = document.createElement('div');
    block.className = 'ad-desc-block';
    block.innerHTML = `
      <div class="ad-desc-text">
        <div class="japanese">${item['description-ja'] || ''}</div>
        <div class="english">${item['description-en'] || ''}</div>
      </div>
    `;
    scroll.appendChild(block);
  });
}

function clearAdvertisingDescriptions() {
  const scroll = document.getElementById('advertising-desc-scroll');
  if (scroll) scroll.innerHTML = '';
  toggleAdvertisingDescScroll(false);
}

function getAdImageMetrics(card, aside) {
  const img = card.querySelector('.card-img');
  if (!img || !aside) return null;

  const imgRect = img.getBoundingClientRect();
  const asideRect = aside.getBoundingClientRect();
  const imageHeight = Math.round(imgRect.height);

  return {
    imageHeight,
    top: Math.round(imgRect.bottom - asideRect.top - imageHeight),
  };
}

function setActiveAdvertisingDescription(activeIndex) {
  const scroll = document.getElementById('advertising-desc-scroll');
  const aside = document.querySelector('.descriptionAndFilters');
  if (!scroll || activeCategory !== 'pubblicità' || !grid) return;

  const cards = [...grid.querySelectorAll('.card')];
  const blocks = [...scroll.querySelectorAll('.ad-desc-block')];

  blocks.forEach((block, i) => {
    const isActive = i === activeIndex && activeIndex >= 0;
    block.classList.toggle('is-active', isActive);

    if (!isActive) {
      block.style.top = '';
      block.style.height = '';
      block.style.minHeight = '';
      return;
    }

    const card = cards[i];
    const metrics = card ? getAdImageMetrics(card, aside) : null;
    if (!metrics) return;

    block.style.top = `${metrics.top}px`;
    block.style.height = `${metrics.imageHeight}px`;
    block.style.minHeight = `${metrics.imageHeight}px`;
  });
}

function resetAdvertisingScroll() {
  clearAdvertisingDescriptions();
  resetAdvertisingDescriptionPosition();
}

function resetAdvertisingDescriptionPosition() {
  const intro = document.querySelector('.description-intro');
  if (!intro) return;
  intro.style.position = '';
  intro.style.left = '';
  intro.style.top = '';
  intro.style.width = '';
  intro.style.bottom = '';
  intro.style.marginBottom = '';
  intro.classList.remove('is-positioned');
}

function setupAdvertisingScrollText() {
  if (!grid || advertisingScrollBound) {
    updateAdvertisingScrollState();
    return;
  }

  grid.addEventListener('scroll', () => updateAdvertisingScrollState(), { passive: true });

  advertisingScrollBound = true;
  updateAdvertisingScrollState();
}

function updateAdvertisingScrollState() {
  if (!categoryImagesRevealed) return;
  if (document.querySelector('.mainLayout.has-item-selected')) return;

  const cards = [...document.querySelectorAll('.myPhotos.layout-pubblicita .card')];
  const blocks = [...document.querySelectorAll('.ad-desc-block')];
  if (!cards.length || !grid) return;

  const pastThreshold = window.innerHeight * 0.35;
  const activeThreshold = window.innerHeight * 0.45;
  let activeIndex = -1;

  if (grid.scrollTop < 20) {
    activeIndex = 0;
    cards.forEach((card, i) => {
      card.classList.toggle('ad-past', false);
      card.classList.toggle('ad-active', i === 0);
    });
  } else {
    cards.forEach((card, i) => {
      const rect = card.getBoundingClientRect();
      const isPast = rect.bottom < pastThreshold;
      const isActive = rect.top < activeThreshold && rect.bottom > pastThreshold;
      card.classList.toggle('ad-past', isPast);
      card.classList.toggle('ad-active', isActive);
      if (isActive) activeIndex = i;
    });
  }

  setActiveAdvertisingDescription(activeIndex);

  if (activeIndex < 0) {
    lastAdvertisingIndex = -1;
    return;
  }

  adGestureIndex = activeIndex;

  if (activeIndex !== lastAdvertisingIndex) {
    blocks.forEach((block, i) => {
      const text = block.querySelector('.ad-desc-text');
      if (!text) return;
      text.classList.remove('ad-desc-animate');
      if (i === activeIndex) {
        void text.offsetWidth;
        text.classList.add('ad-desc-animate');
      }
    });
    lastAdvertisingIndex = activeIndex;
  }
}

function openLightbox(index) {
  if (!lightbox || !lbImg || !lbId || !lbTagsEl) return;
  const visible = filteredItems();
  lbIndex = index;
  const item = visible[lbIndex];
  if (!item) return;

  lbImg.src = item.src;
  lbImg.alt = item.description || `Item ${item.id}`;
  lbId.textContent = item.category === 'fotografie' ? '' : `#${String(item.id).padStart(2, '0')}`;
  lbTagsEl.innerHTML = '';

  getItemTags(item).forEach(tag => {
    const t = document.createElement('span');
    t.className = 'card-tag' + (activeTags.has(tag) ? ' highlight' : '');
    t.textContent = tag;
    t.addEventListener('click', () => {
      toggleTag(tag);
      closeLightbox();
    });
    lbTagsEl.appendChild(t);
  });

  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  if (!lightbox || !lbImg) return;
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  lbImg.src = '';
}

function navigateLightbox(dir) {
  const visible = filteredItems();
  if (!visible.length) return;
  let next = lbIndex + dir;
  if (next >= visible.length) next = 0;
  if (next < 0) next = visible.length - 1;
  openLightbox(next);
}

lbClose?.addEventListener('click', closeLightbox);
lbBackdrop?.addEventListener('click', closeLightbox);
lbPrev?.addEventListener('click', () => navigateLightbox(-1));
lbNext?.addEventListener('click', () => navigateLightbox(1));

document.addEventListener('keydown', e => {
  if (!lightbox?.classList.contains('open')) return;
  if (e.key === 'ArrowLeft') navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(1);
  if (e.key === 'Escape') closeLightbox();
});

document.querySelectorAll('[data-category]').forEach(el => {
  el.addEventListener('click', event => {
    event.preventDefault();
    closeExploreModal();
    setCategory(el.dataset.category);
  });
});

function initAboutGestureScrollSync() {
  const modal = document.getElementById('explore-modal');
  if (!modal || !getAboutImages().length) return;

  if (modal.dataset.aboutGestureBound !== 'true') {
    modal.dataset.aboutGestureBound = 'true';
    modal.addEventListener('scroll', syncAboutIndexToScroll, { passive: true });
  }
  syncAboutIndexToScroll();
}

function resetAdGestureState() {
  adGestureIndex = 0;
}

function updateAboutHeaderOffset() {
  const header = document.querySelector('header');
  if (!header) return;
  document.documentElement.style.setProperty('--about-header-offset', `${header.offsetHeight}px`);
}

function scrollAboutSectionTo(target) {
  const modal = document.getElementById('explore-modal');
  if (!modal || !target) return;

  updateAboutHeaderOffset();
  const headerOffset = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--about-header-offset')
  ) || 80;

  const modalRect = modal.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const nextTop = modal.scrollTop + (targetRect.top - modalRect.top) - headerOffset + 12;

  modal.scrollTo({
    top: Math.max(0, nextTop),
    behavior: 'smooth',
  });

  window.setTimeout(() => {
    if (document.body.classList.contains('about-open')) {
      syncAboutIndexToScroll();
    }
  }, 450);
}

function openAboutIndexPanel() {
  document.querySelector('.header-about-wrap')?.classList.add('is-index-open');
}

function closeAboutIndexPanel() {
  document.querySelector('.header-about-wrap')?.classList.remove('is-index-open');
}

function closeAboutIndex() {
  closeAboutIndexPanel();
}

function initAboutIndexLinks() {
  document.querySelectorAll('.about-index-item').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const id = link.getAttribute('href')?.slice(1);
      const target = id ? document.getElementById(id) : null;
      const modal = document.getElementById('explore-modal');
      if (!target || !modal) return;

      const goToSection = () => scrollAboutSectionTo(target);

      if (modal.style.display === 'none') {
        openExploreModal();
        requestAnimationFrame(() => requestAnimationFrame(goToSection));
      } else {
        goToSection();
      }
    });
  });
}

function initAboutDropdown() {
  const aboutWrap = document.querySelector('.header-about-wrap');
  const aboutLink = document.getElementById('header-about-link');
  const aboutIndex = document.getElementById('about-index');
  if (!aboutWrap || !aboutLink) return;

  aboutLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openExploreModal();
  });

  let indexCloseTimer = null;

  const cancelIndexClose = () => {
    window.clearTimeout(indexCloseTimer);
    indexCloseTimer = null;
  };

  const scheduleIndexClose = () => {
    cancelIndexClose();
    indexCloseTimer = window.setTimeout(() => {
      indexCloseTimer = null;
      closeAboutIndexPanel();
    }, 120);
  };

  aboutWrap.addEventListener('mouseenter', () => {
    cancelIndexClose();
    openAboutIndexPanel();
  });

  aboutWrap.addEventListener('mouseleave', (e) => {
    const next = e.relatedTarget;
    if (next && aboutWrap.contains(next)) return;
    scheduleIndexClose();
  });

  aboutIndex?.addEventListener('mouseenter', cancelIndexClose);
  aboutIndex?.addEventListener('mouseleave', (e) => {
    const next = e.relatedTarget;
    if (next && aboutWrap.contains(next)) return;
    scheduleIndexClose();
  });
}

function openExploreModal() {
  const modal = document.getElementById('explore-modal');
  if (!modal) return;
  ensureAboutBlowHints();
  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');
  modal.scrollTop = 0;
  document.body.classList.add('about-open');
  requestAnimationFrame(() => {
    updateAboutHeaderOffset();
    requestAnimationFrame(updateAboutHeaderOffset);
  });
  updateHeaderNavState({ aboutOpen: true });
  resetAboutBlowGesture();
  initAboutGestureScrollSync();
  window.ensureCategoryGestures?.();
  window.startAboutMicDetection?.();
}

function closeExploreModal() {
  const modal = document.getElementById('explore-modal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('about-open');
  window.stopAboutMicDetection?.();
  resetAboutBlowGesture();
  closeAboutIndex();
  updateHeaderNavState();
  window.ensureCategoryGestures?.();
}

async function init() {
  try {
    await loadData();
    setCategory('fotografie');
    ensureAboutBlowHints();
    initAboutIndexLinks();
    initAboutDropdown();
    window.addEventListener('resize', () => {
      if (document.body.classList.contains('about-open')) updateAboutHeaderOffset();
      if (activeCategory === 'pubblicità' && categoryImagesRevealed) {
        updateAdvertisingScrollState();
      }
    });
  } catch (error) {
    console.error(error);
    if (grid) grid.innerHTML = `<div class="empty">Errore nel caricamento dei dati.</div>`;
  }
}

init();

window.openExploreModal = openExploreModal;
window.closeExploreModal = closeExploreModal;
window.showItemPreview = showItemPreview;
window.clearItemPreview = clearItemPreview;
window.showPortraitPreview = showItemPreview;
window.clearPortraitPreview = clearItemPreview;
window.getActiveCategory = () => activeCategory;
window.getPortraitItems = getPortraitItems;
window.selectPortraitByIndex = selectPortraitByIndex;
window.advancePortraitViaGesture = advancePortraitViaGesture;
window.getPackItems = getPackItems;
window.selectPackByIndex = selectPackByIndex;
window.advancePackViaGesture = advancePackViaGesture;
window.resetAdGestureState = resetAdGestureState;
window.openPubblicitaViaGesture = openPubblicitaViaGesture;
window.revealCategoryImages = revealCategoryImages;
window.isCategoryImagesRevealed = isCategoryImagesRevealed;
window.isGestureCategoryActive = isGestureCategoryActive;
window.onAboutBlowGestureStart = onAboutBlowGestureStart;
window.onAboutBlowGestureEnd = onAboutBlowGestureEnd;
window.getAboutRevealIndex = () => aboutGestureIndex;
window.resetAboutBlowGesture = resetAboutBlowGesture;
window.scrollContentByGesture = scrollContentByGesture;