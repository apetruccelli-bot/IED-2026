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
    japanese: `大阪の路地、商店街やオフィス街、小さなバーの出入り口で撮影された肖像である。会社員、年配の常連、若い人々の一服は、健康上の注意喚起のあとも、なお公的な習慣として続いていた。新世界の田中博の店から持ち出された私的な映像資料である。`,
    english: `Portraits taken in the alleys of Osaka, along shopping and business streets, and at the entrances to small bars. Office workers, older regulars, and young people caught mid-cigarette: gestures that remained a public habit even after health warnings. Private video footage from Hiroshi Tanaka's shop in Shinsekai.`
  },
  pacchetti: {
    japanese: `一九八五年から一九九〇年まで、店頭と陳列窓から集められたプレミアムたばこのパッケージである。刷色—赤・白・青・黄・緑—、産地名（大阪・東京・京都・奈良）、銘柄の文字組みが、一枚ずつ、店内にあった標準品と地域色を帯びたパッケージの図形的な差を物語る。`,
    english: `Premium cigarette packs collected from counters and windows between 1985 and 1990. The print colors: red, white, blue, yellow, and green, the place names (Osaka, Tokyo, Kyoto, Nara), and the brand lettering testify, sheet by sheet, to the graphic differences between the standard and regional packs present in the store.`
  },
  pubblicità: {
    japanese: `店内の壁面や収集資料のなかに残された広告ポスターである。日本の銘柄は、感情の約束—仕事のあとの休息、街の夜、家庭の静けさ—を通じて喫煙を見せている。一九七〇年代後半から二〇〇年代初頭に貼られ、剥がされずに残った商業画像である。`,
    english: `Advertising posters preserved on interior walls and among the collected material. Brands from Japan present smoking through emotional promises, after-work relief, nights on the town, domestic tranquility. Commercial images posted from the late 1970s to the early 2000s and left in place.`
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
let activeFilters = [];  // Array of { type, value }
let searchQuery = '';
let isRandom = false;
let lbIndex = -1;
let activeCategory = 'fotografie';
let advertisingScrollBound = false;
let lastAdvertisingIndex = -1;
let portraitGestureIndex = 0;
let packGestureIndex = 0;
let adGestureIndex = 0;
let adRevealScrollTimer = null;
const AD_REVEAL_SCROLL_DELAY_MS = 2200;
let categoryImagesRevealed = false;

// Helper functions for managing multiple filters
function hasActiveFilter() {
  return activeFilters.length > 0;
}

function isFilterActive(type, value) {
  return activeFilters.some(f => f.type === type && f.value === value);
}

function setFilterForType(type, value) {
  // Remove any existing filter of the same type
  activeFilters = activeFilters.filter(f => f.type !== type);
  // Add the new filter value for this type
  if (value !== null && value !== undefined) {
    activeFilters.push({ type, value });
  }
}

function toggleFilter(type, value) {
  // If this filter is already active, remove it
  if (isFilterActive(type, value)) {
    activeFilters = activeFilters.filter(f => !(f.type === type && f.value === value));
  } else {
    // Otherwise, replace any filter of the same type with this one
    setFilterForType(type, value);
  }
}

function clearAllFilters() {
  activeFilters = [];
}

function getActiveFiltersByType(type) {
  return activeFilters.filter(f => f.type === type);
}

function itemMatchesAllFilters(item) {
  if (activeFilters.length === 0) return true;

  const tags = getItemTags(item);

  // Check all active filters - item must match ALL
  for (const filter of activeFilters) {
    let matches = false;

    if (filter.type === 'year') {
      matches = Number(item.year) === Number(filter.value.replace('年', ''));
    } else if (filter.type === 'tag') {
      matches = tags.includes(filter.value);
    } else if (filter.type === 'luogo') {
      matches = item['luogo-pacchetti']?.toLowerCase() === filter.value.toLowerCase() ||
        tags.some(tag => tag.toLowerCase() === filter.value.toLowerCase());
    } else if (filter.type === 'pack-color') {
      matches = item['pack-color'] === filter.value;
    } else if (filter.type === 'origin') {
      matches = item['pack-origin'] === filter.value;
    } else if (filter.type === 'status') {
      matches = item['portrait-status'] === filter.value;
    } else if (filter.type === 'relationship') {
      matches = item['portrait-relationship'] === filter.value;
    }

    if (!matches) {
      return false;
    }
  }

  return true;
}

function isGestureCategoryActive() {
  return activeCategory === 'fotografie'
    || activeCategory === 'pacchetti'
    || activeCategory === 'pubblicità';
}

function isCategoryImagesRevealed() {
  return categoryImagesRevealed;
}

function usesYearDimMode() {
  return getActiveFiltersByType('year').length > 0
    && (activeCategory === 'fotografie' || activeCategory === 'pacchetti');
}

function itemMatchesYearFilter(item) {
  const yearFilters = getActiveFiltersByType('year');
  if (yearFilters.length === 0) return true;
  return yearFilters.some(f => Number(item.year) === Number(f.value));
}

function revealCategoryImages() {
  if (categoryImagesRevealed || !['fotografie', 'pacchetti', 'pubblicità'].includes(activeCategory)) {
    return false;
  }

  categoryImagesRevealed = true;
  syncCategoryRevealState();
  document.body.classList.toggle(
    'category-gesture-active',
    activeCategory === 'fotografie'
      || activeCategory === 'pacchetti'
      || activeCategory === 'pubblicità'
  );
  window.updateGestureCameraVisibility?.();

  if (activeCategory === 'pubblicità') {
    revealAdsContent();
  } else if (activeCategory === 'fotografie') {
    portraitGestureIndex = 0;
  } else if (activeCategory === 'pacchetti') {
    packGestureIndex = 0;
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
      grid?.querySelectorAll('.card').forEach(card => {
        card.classList.remove('ad-past', 'ad-active', 'ad-revealed');
      });
    }
    return;
  }

  if (intro) intro.hidden = false;
}

function revealAdsContent() {
  const visible = filteredItems();
  renderAdvertisingDescriptions(visible);
  if (grid) grid.scrollTop = 0;
  lastAdvertisingIndex = -1;
  setupAdvertisingScrollText();
  requestAnimationFrame(() => updateAdvertisingScrollState());
}

let aboutGestureIndex = 0;
let aboutWiping = false;
const aboutPlateWipe = new Map();

function updateCategoryText(category) {
  const japaneseText = document.getElementById('category-japanese-text');
  const englishText = document.getElementById('category-english-text');
  if (!japaneseText || !englishText) return;

  const text = categoryTexts[category] || categoryTexts.fotografie;
  japaneseText.textContent = text.japanese;
  englishText.textContent = text.english;
}

function setDescriptionIntroVisible(visible) {
  const main = document.querySelector('.mainLayout');
  const intro = document.querySelector('.description-intro');

  if (!categoryImagesRevealed) {
    main?.classList.remove('has-item-selected');
    if (intro) intro.hidden = false;
    return;
  }

  main?.classList.toggle('has-item-selected', !visible);
  if (intro) intro.hidden = !visible;

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

    return matchesCategory && matchesTags && matchesSearch;
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
  closeAboutIndex();
  window.clearTimeout(adRevealScrollTimer);
  adRevealScrollTimer = null;
  const prevCategory = activeCategory;
  activeCategory = cat;
  clearAllFilters();
  activeTags.clear();

  categoryImagesRevealed = cat === 'fotografie' || cat === 'pacchetti' || cat === 'pubblicità';
  if (cat === 'pubblicità') {
    adGestureIndex = 0;
    lastAdvertisingIndex = -1;
    document.body.classList.remove('ad-smoking-gesture');
    clearAdvertisingDescriptions();
  }

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
  } else if (activeCategory === 'pacchetti') {
    packGestureIndex = 0;
    grid?.classList.add('layout-pacchetti');
    renderPackFilters();
  } else if (activeCategory === 'pubblicità') {
    clearCategoryFilters();
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
    activeCategory === 'fotografie'
      || activeCategory === 'pacchetti'
      || activeCategory === 'pubblicità'
  );

  updateCategoryText(activeCategory);
  syncCategoryRevealState();
  render();
  if (activeCategory === 'pacchetti' && grid) {
    grid.scrollTop = 0;
  }
  if (activeCategory === 'pubblicità') {
    revealAdsContent();
  }
  // If we left the advertising category, reset scroll and ensure description visible
  if (activeCategory !== 'pubblicità') {
    const main = document.querySelector('.mainLayout');
    if (main) main.scrollTop = 0;
    const intro = document.querySelector('.description-intro');
    const photoDescriptions = Array.from(document.getElementsByClassName('card-desc'));
    if (intro) {
      intro.classList.remove('opacity-0');
      intro.hidden = false;
    }
    if (photoDescriptions) {
      photoDescriptions.forEach(desc => desc.classList.add('opacity-0'));
    }
  }

  window.ensureCategoryGestures?.();
  if (activeCategory === 'pacchetti') {
    window.initPackBodyTracking?.();
  }
  updateScrollToTopVisibility();
}

function getPortraitItems() {
  let list = filteredItems().filter(item => item.category === 'fotografie');
  if (hasActiveFilter()) {
    list = list.filter(itemMatchesAllFilters);
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

function hasCategoryItemSelected() {
  return Boolean(grid?.classList.contains('has-selected'));
}

function advancePortraitViaGesture() {
  if (activeCategory !== 'fotografie' || !categoryImagesRevealed) {
    return;
  }

  if (!hasCategoryItemSelected()) {
    selectPortraitByIndex(0);
    return;
  }

  selectPortraitByIndex(portraitGestureIndex + 1);
}

function getPackItems() {
  let list = filteredItems().filter(item => item.category === 'pacchetti');
  if (hasActiveFilter()) {
    list = list.filter(itemMatchesAllFilters);
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
  if (activeCategory !== 'pacchetti' || !categoryImagesRevealed) {
    return;
  }
  if (!hasCategoryItemSelected()) {
    selectPackByIndex(0);
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

function revealAdAtIndex(index) {
  const ads = getAdItems();
  if (!ads.length || index < 0 || index >= ads.length) return;

  const card = findCardForItem(ads[index]);
  if (!card) return;

  card.classList.add('ad-revealed', 'ad-active');
  card.classList.remove('ad-past');

  syncAdCardDescriptionVisibility();

  setActiveAdvertisingDescription(index);
  lastAdvertisingIndex = index;
}

function scrollToAdCard(index) {
  const ads = getAdItems();
  if (!ads.length || !grid || index < 0 || index >= ads.length) return;

  const card = findCardForItem(ads[index]);
  if (!card) return;

  const cardTop = card.offsetTop;
  const cardHeight = card.offsetHeight;
  const targetScroll = cardTop - (grid.clientHeight * 0.45) + (cardHeight / 2);

  grid.scrollTo({
    top: Math.max(0, targetScroll),
    behavior: 'smooth',
  });

  window.setTimeout(() => {
    updateAdvertisingScrollState();
    syncAdCardDescriptionVisibility();
  }, 450);
}

function advanceAdViaGesture() {
  if (activeCategory !== 'pubblicità' || !categoryImagesRevealed) return;
  if (adRevealScrollTimer) return;

  const ads = getAdItems();
  if (!ads.length) return;

  syncAdIndexToScroll();
  const openIndex = adGestureIndex;

  revealAdAtIndex(openIndex);

  if (ads.length === 1) return;

  const nextIndex = (openIndex + 1) % ads.length;

  window.clearTimeout(adRevealScrollTimer);
  adRevealScrollTimer = window.setTimeout(() => {
    adRevealScrollTimer = null;
    adGestureIndex = nextIndex;
    scrollToAdCard(nextIndex);
  }, AD_REVEAL_SCROLL_DELAY_MS);
}

function getAboutImages() {
  return [...document.querySelectorAll('.about-plate img, .about-grid img')];
}

function ensureAboutWipeHints() {
  const hintHtml = `
      <span class="japanese">汚れを拭く · クリックでも</span>
      <span class="english">wipe or click to remove the dirt</span>
    `;

  getAboutImages().forEach(img => {
    const existing = img.closest('.about-image-frame');
    if (existing) {
      existing.classList.add('about-glass-frame');
      let hint = existing.querySelector('.about-wipe-hint, .about-blow-hint');
      if (!hint) {
        hint = document.createElement('div');
        existing.appendChild(hint);
      }
      hint.className = 'about-wipe-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.innerHTML = hintHtml;
      return;
    }

    const frame = document.createElement('div');
    frame.className = 'about-image-frame about-glass-frame';

    const hint = document.createElement('div');
    hint.className = 'about-wipe-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = hintHtml;

    const parent = img.parentNode;
    if (!parent) return;
    parent.insertBefore(frame, img);
    frame.appendChild(img);
    frame.appendChild(hint);
  });

  initAboutImageClicks();
}

function revealAboutPlate(index) {
  const images = getAboutImages();
  if (index < 0 || index >= images.length) return;

  aboutPlateWipe.set(index, 1);
  applyAboutWipeVisuals();
}

function initAboutImageClicks() {
  getAboutImages().forEach((img, i) => {
    const frame = img.closest('.about-image-frame');
    if (!frame || frame.dataset.aboutClickBound === 'true') return;

    frame.dataset.aboutClickBound = 'true';
    frame.addEventListener('click', () => {
      if (!document.body.classList.contains('about-open')) return;
      revealAboutPlate(i);
    });
  });
}

function clearAboutPlateWipe(img) {
  if (!img) return;
  img.style.setProperty('--about-wipe', '0');
  const frame = img.closest('.about-image-frame');
  frame?.classList.remove('is-wiped', 'is-wiping');
}

function applyAboutWipeVisuals() {
  const images = getAboutImages();
  if (!images.length) return;

  if (aboutGestureIndex >= images.length) {
    aboutGestureIndex = images.length - 1;
  }

  images.forEach((img, i) => {
    const wipe = aboutPlateWipe.get(i) ?? 0;
    const isActive = i === aboutGestureIndex;
    const frame = img.closest('.about-image-frame');

    const wipeValue = wipe.toFixed(4);
    img.style.setProperty('--about-wipe', wipeValue);
    frame?.style.setProperty('--about-wipe', wipeValue);
    frame?.classList.toggle('is-about-active', isActive);
    frame?.classList.toggle('is-wiped', wipe > 0.92);
    frame?.classList.toggle('is-wiping', isActive && aboutWiping && wipe < 0.92);
  });
}

function getAboutWipeProgress(index = aboutGestureIndex) {
  return aboutPlateWipe.get(index) ?? 0;
}

function addAboutWipeProgress(amount) {
  if (!document.body.classList.contains('about-open')) return;

  const idx = aboutGestureIndex;
  const current = aboutPlateWipe.get(idx) ?? 0;
  if (current >= 1) return;

  const next = Math.min(1, current + amount);
  aboutPlateWipe.set(idx, next);
  applyAboutWipeVisuals();
}

function setAboutWiping(active) {
  aboutWiping = Boolean(active);
  if (document.body.classList.contains('about-open')) {
    applyAboutWipeVisuals();
  }
}

function initAboutImageState() {
  aboutWiping = false;
  aboutPlateWipe.clear();
  getAboutImages().forEach((img) => {
    clearAboutPlateWipe(img);
    img.closest('.about-image-frame')?.classList.remove('is-about-active');
  });
  applyAboutWipeVisuals();
}

function syncAboutIndexToScroll() {
  if (!document.body.classList.contains('about-open')) return;

  const images = getAboutImages();
  if (!images.length) return;

  const targetY = window.innerHeight * 0.45;
  let bestIndex = 0;
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

  const prevIndex = aboutGestureIndex;
  aboutGestureIndex = bestIndex;

  if (prevIndex !== aboutGestureIndex) {
    const prevLevel = aboutPlateWipe.get(prevIndex) ?? 0;
    if (prevLevel < 0.92) {
      const prevImg = images[prevIndex];
      aboutPlateWipe.delete(prevIndex);
      if (prevImg) clearAboutPlateWipe(prevImg);
    }
    window.aboutWindowWipeResetStroke?.();
  }

  applyAboutWipeVisuals();
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

function resetAboutWipeGesture() {
  aboutGestureIndex = 0;
  aboutWiping = false;
  window.stopAboutWipeSound?.();
  aboutPlateWipe.clear();
  getAboutImages().forEach((img) => {
    clearAboutPlateWipe(img);
    img.closest('.about-image-frame')?.classList.remove('is-about-active');
  });
  applyAboutWipeVisuals();
}

function renderPackFilters() {
  const panel = document.getElementById('filters-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="filter">
      <p>色&nbsp;&nbsp; Color</p>
      <p>
        <span class="filter-option" data-filter-type="pack-color" data-filter-value="赤 Red">赤 Red</span>
        <span class="filter-option" data-filter-type="pack-color" data-filter-value="白 White">白 White</span>
        <span class="filter-option" data-filter-type="pack-color" data-filter-value="青 Blue">青 Blue</span>
        <span class="filter-option" data-filter-type="pack-color" data-filter-value="黄色 Yellow">黄色 Yellow</span>
        <span class="filter-option" data-filter-type="pack-color" data-filter-value="緑 Green">緑 Green</span>
      </p>
    </div>

    <div class="filter">
      <p>産地&nbsp;&nbsp; Origin</p>
      <p>
        <span class="filter-option" data-filter-type="origin" data-filter-value="大阪 Osaka">大阪 Osaka</span>
        <span class="filter-option" data-filter-type="origin" data-filter-value="東京 Tokyo">東京 Tokyo</span>
        <span class="filter-option" data-filter-type="origin" data-filter-value="京都 Kyoto">京都 Kyoto</span>
        <span class="filter-option" data-filter-type="origin" data-filter-value="奈良 Nara">奈良 Nara</span>
      </p>
    </div>

    <div class="filter filter-year">
      <p>年&nbsp;&nbsp; Year</p>
      <p>
        <span class="filter-option" data-filter-type="year" data-filter-value="1985">1985年</span>
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

    <div class="filter filter-year">
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

function formatFilterOptionLabel(type, value) {
  if (type === 'year') return `${value}年`;
  return value;
}

function formatFilterOptionValue(type, value) {
  return type === 'year' ? String(value) : value;
}

function renderCategoryFilters(category) {
  const panel = document.getElementById('filters-panel');
  if (!panel) return;

  panel.innerHTML = '';

  (filtersByCategory[category] || []).forEach(group => {
    const div = document.createElement('div');
    div.className = 'filter';
    div.className = group.type === 'year' ? 'filter filter-year' : 'filter';
    div.innerHTML = `
      <p>${group.title}</p>
      <p>
        ${group.values.map(value => `
          <span class="filter-option" data-filter-type="${group.type}" data-filter-value="${formatFilterOptionValue(group.type, value)}">${formatFilterOptionLabel(group.type, value)}</span>
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

      toggleFilter(type, value);

      updateFilterOpacity();
      applyFilterOpacityToCards();
    });
  });
}

function syncAdCardDescriptionVisibility() {
  if (activeCategory !== 'pubblicità' || !grid) return;

  const intro = document.querySelector('.description-intro');
  const cards = [...grid.querySelectorAll('.myPhotos.layout-pubblicita .card')];
  const scrolled = grid.scrollTop > 4;

  if (intro) {
    intro.classList.toggle('opacity-0', scrolled);
  }

  cards.forEach(card => {
    const desc = card.querySelector('.card-desc');
    if (!desc) return;
    desc.classList.toggle('opacity-0', !card.classList.contains('ad-revealed'));
  });
}

function ifAdvertisingHideDesc(event) {
  if (activeCategory !== 'pubblicità' || event.target !== grid) return;
  syncAdCardDescriptionVisibility();
}


function updateFilterOpacity() {
  document.querySelectorAll('.filter-option').forEach(el => {
    const active = isFilterActive(el.dataset.filterType, el.dataset.filterValue);
    el.classList.toggle('active-filter', active);
    el.style.opacity = !hasActiveFilter() || active ? '1' : '0.35';
  });
}

function applyFilterOpacityToCards() {
  const cards = document.querySelectorAll('#grid .card');
  cards.forEach(card => {
    // Reconstruct item data from card
    const img = card.querySelector('img');
    if (!img) return;

    const itemSrc = img.src;
    const item = displayItems.find(it => it.src === itemSrc || img.src.endsWith(it.src));
    if (!item) return;

    const matches = itemMatchesAllFilters(item);
    /* card.style.opacity = matches ? '.6' : '0.3'; */
    card.classList.toggle('opacity-30', !matches);
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

  if (hasActiveFilter()) {
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
  if (hasActiveFilter()) {
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

  if (activeCategory === 'pubblicità') {
    syncAdvertisingIntroVisibility();
    updateAdvertisingScrollState();
  } else {
    updateCategoryText(activeCategory);
  }
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
  grid.classList.toggle('year-filtered', hasActiveFilter());
  grid.classList.remove('has-selected');

  let mount = grid;
  if (activeCategory === 'pacchetti') {
    const masonry = document.createElement('div');
    masonry.className = 'pack-masonry';
    grid.appendChild(masonry);
    mount = masonry;
  }

  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nessun risultato.';
    mount.appendChild(empty);
    return;
  }

  visible.forEach((item, i) => {
    const matchesFilters = itemMatchesAllFilters(item);
    const card = document.createElement('article');
    card.className = 'card activeImg';
    /* card.style.opacity = matchesFilters ? '1' : '0.3'; */
    card.style.cursor = ['fotografie', 'pacchetti'].includes(activeCategory) && matchesFilters
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

      //create a div with description and add it to card
      const descDiv = document.createElement('div');
      descDiv.className = 'card-desc opacity-0';
      descDiv.innerHTML = descriptionTextHtml(item['description-ja'], item['description-en']);
      card.appendChild(descDiv);
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

    if (item.category !== 'pacchetti') {
      card.appendChild(body);
    }

    if (['fotografie', 'pacchetti'].includes(activeCategory)) {
      card.addEventListener('click', () => {
        if (!categoryImagesRevealed) return;
        if (!itemMatchesAllFilters(item)) return;

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

    mount.appendChild(card);
  });

  if (activeCategory === 'pubblicità' && categoryImagesRevealed) {
    renderAdvertisingDescriptions(visible);
    if (grid) grid.scrollTop = 0;
    lastAdvertisingIndex = -1;
    setupAdvertisingScrollText();
    requestAnimationFrame(() => {
      updateAdvertisingScrollState();
      syncAdCardDescriptionVisibility();
    });
  } else {
    clearAdvertisingDescriptions();
  }

  if (hasActiveFilter()) {
    updateFilterOpacity();
  }
}

function toggleAdvertisingDescScroll(show) {
  const scroll = document.getElementById('advertising-desc-scroll');
  if (!scroll) return;
  scroll.classList.toggle('is-active', show);
  //scroll.setAttribute('aria-hidden', String(!show));
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

function syncAdvertisingIntroVisibility() {
  const intro = document.querySelector('.description-intro');
  if (!intro || activeCategory !== 'pubblicità' || !grid) return;
  intro.hidden = grid.scrollTop >= 20;
}

function updateAdvertisingScrollState() {
  if (!categoryImagesRevealed) return;
  if (itemPreview?.classList.contains('open')) return;

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

  if (activeIndex >= 0 && cards[activeIndex]?.classList.contains('ad-revealed')) {
    setActiveAdvertisingDescription(activeIndex);
  } else {
    setActiveAdvertisingDescription(-1);
  }
  syncAdvertisingIntroVisibility();

  if (activeIndex < 0) {
    lastAdvertisingIndex = -1;
    return;
  }

  if (!adRevealScrollTimer) {
    adGestureIndex = activeIndex;
  }

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

  syncAdCardDescriptionVisibility();
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
  window.clearTimeout(adRevealScrollTimer);
  adRevealScrollTimer = null;
  adGestureIndex = 0;
  document.body.classList.remove('ad-smoking-gesture');
  grid?.querySelectorAll('.myPhotos.layout-pubblicita .card').forEach(card => {
    card.classList.remove('ad-revealed');
    card.querySelector('.card-desc')?.classList.add('opacity-0');
  });
}

function updateHeaderOffset() {
  const header = document.querySelector('header');
  if (!header) return;
  const offset = `${header.offsetHeight}px`;
  document.documentElement.style.setProperty('--header-offset', offset);
  document.documentElement.style.setProperty('--about-header-offset', offset);
}

function updateAboutHeaderOffset() {
  updateHeaderOffset();
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
  if (!document.body.classList.contains('about-open')) return;
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

  aboutWrap.addEventListener('mouseenter', () => {
    if (!document.body.classList.contains('about-open')) return;
    openAboutIndexPanel();
  });
}

function openExploreModal() {
  const modal = document.getElementById('explore-modal');
  if (!modal) return;
  window.clearTimeout(adRevealScrollTimer);
  adRevealScrollTimer = null;
  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');
  modal.scrollTop = 0;
  document.body.classList.add('about-open');
  openAboutIndexPanel();
  ensureAboutWipeHints();
  initAboutImageState();
  requestAnimationFrame(() => {
    updateAboutHeaderOffset();
    requestAnimationFrame(updateAboutHeaderOffset);
  });
  updateHeaderNavState({ aboutOpen: true });
  initAboutGestureScrollSync();
  window.ensureCategoryGestures?.();
  updateScrollToTopVisibility();
}

function closeExploreModal() {
  const modal = document.getElementById('explore-modal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('about-open');
  closeAboutIndex();
  resetAboutWipeGesture();
  updateHeaderNavState();
  window.updateGestureCameraVisibility?.();
  const gestureStatus = document.getElementById('gesture-status');
  if (gestureStatus) {
    gestureStatus.hidden = true;
    gestureStatus.textContent = '';
  }
  updateScrollToTopVisibility();
}

function getActiveScrollContainer() {
  if (document.body.classList.contains('about-open')) {
    return document.getElementById('explore-modal');
  }
  return grid;
}

function isLandingActive() {
  const landing = document.getElementById('landing-modal');
  return Boolean(landing && landing.style.pointerEvents !== 'none');
}

function updateScrollToTopVisibility() {
  const btn = document.getElementById('scroll-to-top');
  if (!btn) return;

  if (isLandingActive() || lightbox?.classList.contains('open')) {
    btn.hidden = true;
    return;
  }

  const container = getActiveScrollContainer();
  const scrollTop = container?.scrollTop ?? 0;
  btn.hidden = scrollTop < 80;
}

function scrollActiveViewToTop() {
  const container = getActiveScrollContainer();
  if (!container) return;

  container.scrollTo({ top: 0, behavior: 'smooth' });

  if (activeCategory === 'pubblicità') {
    window.setTimeout(() => {
      syncAdvertisingIntroVisibility();
      updateAdvertisingScrollState();
      updateScrollToTopVisibility();
    }, 400);
  } else {
    window.setTimeout(updateScrollToTopVisibility, 400);
  }
}

function initScrollToTop() {
  const btn = document.getElementById('scroll-to-top');
  const aboutModal = document.getElementById('explore-modal');
  if (!btn) return;

  document.body.appendChild(btn);
  btn.addEventListener('click', scrollActiveViewToTop);

  const onScroll = () => updateScrollToTopVisibility();
  grid?.addEventListener('scroll', onScroll, { passive: true });
  aboutModal?.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  updateScrollToTopVisibility();
  updateHeaderOffset();
}

async function init() {
  try {
    await loadData();
    setCategory('fotografie');
    updateHeaderOffset();
    initAboutIndexLinks();
    initAboutDropdown();
    initScrollToTop();
    window.addEventListener('resize', () => {
      updateHeaderOffset();
      if (activeCategory === 'pubblicità' && categoryImagesRevealed) {
        updateAdvertisingScrollState();
      }
      updateScrollToTopVisibility();
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
window.advanceAdViaGesture = advanceAdViaGesture;
window.revealCategoryImages = revealCategoryImages;
window.isCategoryImagesRevealed = isCategoryImagesRevealed;
window.isGestureCategoryActive = isGestureCategoryActive;
window.addAboutWipeProgress = addAboutWipeProgress;
window.getAboutWipeProgress = getAboutWipeProgress;
window.setAboutWiping = setAboutWiping;
window.isAboutWiping = () => aboutWiping;
window.syncAboutIndexToScroll = syncAboutIndexToScroll;
window.updateHeaderOffset = updateHeaderOffset;
window.getAboutRevealIndex = () => aboutGestureIndex;
window.resetAboutWipeGesture = resetAboutWipeGesture;
//window.resetAboutBlowGesture = resetAboutBlowGesture;
window.scrollContentByGesture = scrollContentByGesture;