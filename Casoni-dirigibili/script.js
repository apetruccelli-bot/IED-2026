const archiveGallery = document.getElementById('archive-gallery');
const searchInput = document.getElementById('search');

function getRowCount() {
  if (window.innerWidth <= 600) return 1;

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
const lbMobilePrev = document.getElementById('lb-mobile-prev');
const lbMobileNext = document.getElementById('lb-mobile-next');

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

const mobileActiveFilters = document.getElementById('mobile-active-filters');
const mobileFilterOptions = document.getElementById('mobile-filter-options');


function isMobileIndex() {
  return window.matchMedia('(max-width: 600px)').matches;
}

function restoreMobileFilterOptions() {
  if (!mobileFilterOptions) return;

  const movedRow = document.querySelector('.filter-row[data-mobile-options-moved="true"]');
  const movedInside = mobileFilterOptions.querySelector('.filter-row-inside');

  if (movedRow && movedInside) {
    movedRow.appendChild(movedInside);
    movedRow.removeAttribute('data-mobile-options-moved');
  }

  mobileFilterOptions.classList.remove('is-open');
}

function showMobileFilterOptions(row) {
  if (!mobileFilterOptions || !row) return;

  const inside = row.querySelector('.filter-row-inside');
  if (!inside) return;

  restoreMobileFilterOptions();

  mobileFilterOptions.appendChild(inside);
  mobileFilterOptions.classList.add('is-open');
  row.dataset.mobileOptionsMoved = 'true';

  if (row.dataset.controlType === 'victims') {
    requestAnimationFrame(() => positionVictimsStops(row));
  }
}

function setupMobileFilterMenus() {
  document.querySelectorAll('.filter-row').forEach(row => {
    const label = row.querySelector('.filter-label');
    if (!label || label.dataset.mobileReady === 'true') return;

    label.dataset.mobileReady = 'true';

    label.addEventListener('click', () => {
      if (!isMobileIndex()) return;

      const isOpen = row.classList.contains('mobile-open');

      document.querySelectorAll('.filter-row.mobile-open').forEach(openRow => {
        openRow.classList.remove('mobile-open');
      });

      restoreMobileFilterOptions();

      if (!isOpen) {
        row.classList.add('mobile-open');
        showMobileFilterOptions(row);
      }
    });
  });
}

function renderMobileActiveFilters() {
  if (!mobileActiveFilters) return;

  mobileActiveFilters.innerHTML = '';

  const chips = [];

  if (activeCategory) {
    chips.push({
      label: 'Category',
      value: activeCategory,
      type: 'category'
    });
  }

  Object.entries(activeRowFilters).forEach(([label, value]) => {
    if (!value) return;

    if (value instanceof Set) {
      value.forEach(singleValue => {
        chips.push({
          label,
          value: singleValue,
          type: 'row'
        });
      });
    } else {
      chips.push({
        label,
        value,
        type: 'row'
      });
    }
  });

  chips.forEach(chip => {
    const btn = document.createElement('button');
    btn.className = 'mobile-active-filter-chip';
    btn.type = 'button';
    btn.textContent = `${chip.value} ×`;

    btn.addEventListener('click', () => {
      if (chip.type === 'category') {
        activeCategory = null;

        document.querySelectorAll('.filter-link').forEach(button => {
          button.classList.remove('active');
        });

        if (filtersPanel) {
          filtersPanel.classList.remove('has-active-category');
        }

        document.querySelectorAll('.card').forEach(card => {
          card.classList.remove('card-dim');
        });

        updateDisabledFilterRows();
        renderMobileActiveFilters();
        return;
      }

      const currentValue = activeRowFilters[chip.label];

      if (currentValue instanceof Set) {
        currentValue.delete(chip.value);

        if (currentValue.size === 0) {
          activeRowFilters[chip.label] = null;
        }
      } else {
        activeRowFilters[chip.label] = null;
      }

      document.querySelectorAll('.filter-row').forEach(row => {
        const rowLabel = row.querySelector('.filter-label')?.textContent.trim();
        if (rowLabel !== chip.label) return;

        row.querySelectorAll('.filter-chip').forEach(filterChip => {
          if (filterChip.dataset.value === chip.value || !(activeRowFilters[chip.label])) {
            filterChip.classList.remove('active');
          }
        });

        if (row.dataset.controlType === 'victims') {
          syncVictimsRow(row);
        }
      });

      applyRowFilters({ autoScroll: true });
      renderMobileActiveFilters();
    });

    mobileActiveFilters.appendChild(btn);
  });
}

const disabledRowLabels = new Set(['Causes', 'Victims']);
const categoryDisablesRows = new Set(['models', 'drawings', 'study models', 'technical drawings']);
const victimStops = ['<10', '20', '30', '40', '50', '60', '70', '80', '90', '>100'];

function getVictimsLabelFromIndex(index) {
  return victimStops[Math.max(0, Math.min(victimStops.length - 1, index))];
}

function getVictimsIndexFromLabel(label) {
  return victimStops.indexOf(label);
}

function positionVictimsStops(row) {
  const slider =
  row.querySelector('.victims-slider') ||
  mobileFilterOptions?.querySelector('.victims-slider');

  const stops = row.querySelectorAll('.victims-stop').length
    ? row.querySelectorAll('.victims-stop')
    : mobileFilterOptions?.querySelectorAll('.victims-stop');

  if (!slider || !stops || stops.length === 0) return;

  const min = Number(slider.min);
  const max = Number(slider.max);
  const sliderWidth = slider.offsetWidth;

  const thumbSize = parseFloat(getComputedStyle(slider).getPropertyValue('--victims-thumb-size')) || 22;
  const usableWidth = sliderWidth - thumbSize;

  stops.forEach(stopEl => {
    const index = Number(stopEl.dataset.index);
    const percent = (index - min) / (max - min);
    const x = (thumbSize / 2) + (percent * usableWidth);

    stopEl.style.left = `${x}px`;
  });
}


function matchesVictimsFilter(victims, label) {
  if (victims == null) return false;
  if (label === '<10') return victims < 10;
  if (label === '>100') return victims > 100;
  const target = Number(label);
  return Number.isFinite(target) && victims >= target - 5 && victims <= target + 5;
}


// ── Load data ──────────────────────────────────────────────────────────────
async function loadData() {
  const res = await fetch('data.json');
  const data = await res.json();

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
        applyRowFilters({ autoScroll: true });
        renderMobileActiveFilters();
      });

      stops.addEventListener('click', e => {
        const stopEl = e.target.closest('.victims-stop');
        if (!stopEl) return;
        const index = Number(stopEl.dataset.index);
        const stopLabel = getVictimsLabelFromIndex(index);

        if (activeRowFilters[label] === stopLabel) {
          activeRowFilters[label] = null;
        } else {
          slider.value = String(index);
          activeRowFilters[label] = stopLabel;
        }
        syncVictimsRow(row);
        applyRowFilters({ autoScroll: true });
        renderMobileActiveFilters();

        if (isMobileIndex()) {
          row.classList.add('mobile-open');
          showMobileFilterOptions(row);
        }
      });

      wrap.appendChild(slider);
      wrap.appendChild(stops);
      inside.appendChild(wrap);
      requestAnimationFrame(() => positionVictimsStops(row));

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
        applyRowFilters({ autoScroll: true });
        renderMobileActiveFilters();

        if (isMobileIndex()) {
          row.classList.add('mobile-open');
          showMobileFilterOptions(row);
        }
      });
      inside.appendChild(chip);
    });
  });

  updateDisabledFilterRows();
  setupMobileFilterMenus();
  renderMobileActiveFilters();
}

function syncVictimsRow(row) {
 const slider =
  row.querySelector('.victims-slider') ||
  mobileFilterOptions?.querySelector('.victims-slider');

  const stops = row.querySelectorAll('.victims-stop').length
    ? row.querySelectorAll('.victims-stop')
    : mobileFilterOptions?.querySelectorAll('.victims-stop');

  if (!slider || !stops || stops.length === 0) return;

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

function getActiveGalleryCards() {
  return [...document.querySelectorAll('.card:not(.card-dim)')];
}

function getCardVisibilityRatioInGallery(card) {
  if (!galleryScroll || !card) return 0;

  const galleryRect = galleryScroll.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();

  if (isMobileIndex()) {
    const topHome = document.querySelector('.top-home');
    const topHomeRect = topHome ? topHome.getBoundingClientRect() : null;

    const safeTop = topHomeRect
      ? Math.max(galleryRect.top, topHomeRect.bottom)
      : galleryRect.top;

    const visibleTop = Math.max(cardRect.top, safeTop);
    const visibleBottom = Math.min(cardRect.bottom, galleryRect.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);

    if (cardRect.height === 0) return 0;

    return visibleHeight / cardRect.height;
  }

  const visibleLeft = Math.max(cardRect.left, galleryRect.left);
  const visibleRight = Math.min(cardRect.right, galleryRect.right);
  const visibleWidth = Math.max(0, visibleRight - visibleLeft);

  if (cardRect.width === 0) return 0;

  return visibleWidth / cardRect.width;
}

// scroll sulla immagine illuminata se non è visibile
function isCardVisibleEnoughInGallery(card) {
  return getCardVisibilityRatioInGallery(card) >= 0.5;
}

function getActiveGalleryCards() {
  return [...galleryScroll.querySelectorAll('.card:not(.card-dim)')];
}

function getActiveCenterCards() {
  if (isMobileIndex()) {
    return getActiveGalleryCards();
  }

  return infiniteScrollState.rows.flatMap(rowData => {
    return [...rowData.centerBlock.querySelectorAll('.card:not(.card-dim)')];
  });
}

function scrollToFirstActiveCardIfNeeded() {
  if (!galleryScroll) return;

  const activeCards = getActiveGalleryCards();

  if (activeCards.length === 0) return;

  const hasActiveCardVisibleEnough = activeCards.some(card => {
    return isCardVisibleEnoughInGallery(card);
  });

  if (hasActiveCardVisibleEnough) return;

  if (isMobileIndex()) {
    const firstActiveCard = activeCards.reduce((first, card) => {
      return card.offsetTop < first.offsetTop ? card : first;
    }, activeCards[0]);

    const galleryRect = galleryScroll.getBoundingClientRect();
    const cardRect = firstActiveCard.getBoundingClientRect();

    const currentScrollTop = galleryScroll.scrollTop;
    const targetScrollTop =
      currentScrollTop + cardRect.top - galleryRect.top - 10;

    galleryScroll.scrollTo({
      top: Math.max(targetScrollTop, 0),
      behavior: 'smooth'
    });

    return;
  }

  const centerActiveCards = getActiveCenterCards();

  if (centerActiveCards.length === 0) return;

  const galleryRect = galleryScroll.getBoundingClientRect();

  const firstActiveCard = centerActiveCards.reduce((best, card) => {
    const bestRect = best.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    return cardRect.left < bestRect.left ? card : best;
  }, centerActiveCards[0]);

  const cardRect = firstActiveCard.getBoundingClientRect();

  const desiredLeft = galleryRect.left + 10;
  const delta = cardRect.left - desiredLeft;

  animateVirtualXBy(delta, 650); /*velocità scroll automatico */
}

function scheduleScrollToFirstActiveCardIfNeeded() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!isMobileIndex()) {
        measureInfiniteRows();
        updateInfiniteRows();
      }

      scrollToFirstActiveCardIfNeeded();
    });
  });
}

let autoScrollAnimationFrame = null;

function animateVirtualXBy(delta, duration = 550) {
  if (autoScrollAnimationFrame) {
    cancelAnimationFrame(autoScrollAnimationFrame);
  }

  const startX = infiniteScrollState.virtualX;
  const targetX = startX + delta;
  const startTime = performance.now();

  function easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeInOutCubic(progress);

    infiniteScrollState.virtualX = startX + (targetX - startX) * eased;
    updateInfiniteRows();

    if (progress < 1) {
      autoScrollAnimationFrame = requestAnimationFrame(step);
    } else {
      infiniteScrollState.virtualX = targetX;
      updateInfiniteRows();
      autoScrollAnimationFrame = null;
    }
  }

  autoScrollAnimationFrame = requestAnimationFrame(step);
}

// ── Apply row filters to cards ────────────────────────────────────────────
function applyRowFilters(options = {}) {
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

    if (options.autoScroll) {
    scheduleScrollToFirstActiveCardIfNeeded();
  }
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

    card.appendChild(body);
    if (activeCategory && item.category !== activeCategory) card.classList.add('card-dim');
    rows[i % rows.length].appendChild(card);
  });
  // reapply row filters after cards are rebuilt
  applyRowFilters();

  if (!isMobileIndex()) {
    enableInfiniteScroll();
  }
}

if (galleryScroll) {
  galleryScroll.addEventListener('click', e => {
    const card = e.target.closest('.card');

    if (!card || !galleryScroll.contains(card)) return;

    const id = card.dataset.id;
    if (!id) return;

    openLightbox(id);
  });
}

// ── Lightbox ──────────────────────────────────────────────────────────────
function openLightbox(itemId) {
  const visible = lightboxItems();
  const nextIndex = visible.findIndex(item => String(item.id) === String(itemId));

  if (nextIndex === -1) return;

  lbIndex = nextIndex;
  const item = visible[lbIndex];

  if (!item) return;

  lbImg.src = item.src;
  lbImg.alt = `Item ${item.id}`;
  lbId.textContent = `#${String(item.id).padStart(2, '0')}`;

  lbTagsEl.innerHTML = '';

  item.tags.forEach(tag => {
    const t = document.createElement('span');
    t.className = 'card-tag' + (activeTags.has(tag) ? ' highlight' : '');
    t.textContent = tag;
    t.addEventListener('click', () => {
      toggleTag(tag);
      closeLightbox();
    });
    lbTagsEl.appendChild(t);
  });

  lbDescription.textContent = item.description + ' [evidence #' + item.id + ']' || '';
  renderLightboxMeta(item);

  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  function updateLightboxDescriptionWidth() {
    if (!lbImg || !lbDescription) return;

    const rect = lbImg.getBoundingClientRect();

    if (rect.width > 0) {
      lbDescription.style.maxWidth = Math.floor(rect.width) + 'px';
    }
  }

  lbImg.addEventListener('load', updateLightboxDescriptionWidth, { once: true });

  if (lbImg.complete) {
    updateLightboxDescriptionWidth();
  }

  const resizeHandler = () => {
    if (lightbox.classList.contains('open')) {
      updateLightboxDescriptionWidth();
    }
  };

  window.addEventListener('resize', resizeHandler);

  const removeResizeOnClose = () => {
    window.removeEventListener('resize', resizeHandler);
    lightbox.removeEventListener('transitionend', removeResizeOnClose);
  };

  lightbox.addEventListener('transitionend', removeResizeOnClose);
}

function closeLightbox() {
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  lbImg.src = '';
}

function navigateLightbox(dir) {
  const visible = lightboxItems();
  const list = visible.length ? visible : items;

  if (list.length === 0) return;

  let next = lbIndex + dir;

  if (next >= list.length) next = 0;
  if (next < 0) next = list.length - 1;

  openLightbox(list[next].id);
}

lbClose.addEventListener('click', closeLightbox);
lbBackdrop.addEventListener('click', closeLightbox);

const lightboxCursor = document.createElement('div');
lightboxCursor.style.position = 'fixed';
lightboxCursor.style.left = '0';
lightboxCursor.style.top = '0';
lightboxCursor.style.transform = 'translate(-50%, -50%)';
lightboxCursor.style.zIndex = '10003';
lightboxCursor.style.pointerEvents = 'none';
lightboxCursor.style.display = 'none';
lightboxCursor.style.color = '#FCFCFC';
lightboxCursor.style.fontFamily = "'SchengenA Regular', sans-serif";
lightboxCursor.style.fontSize = '32px';
lightboxCursor.style.fontWeight = '700';
lightboxCursor.style.lineHeight = '1';
lightboxCursor.style.userSelect = 'none';
lightboxCursor.style.webkitUserSelect = 'none';
document.body.appendChild(lightboxCursor);

function updateLightboxCursor(e) {
  if (isMobileIndex()) {
    hideLightboxCursor();
    return;
  }

  if (!lbImg || lightbox.getAttribute('aria-hidden') === 'true') return;

  const rect = lbImg.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  lightboxCursor.textContent = e.clientX < rect.left + rect.width / 2 ? 'Previous' : 'Next';
  lightboxCursor.style.left = `${e.clientX}px`;
  lightboxCursor.style.top = `${e.clientY}px`;
  lightboxCursor.style.display = 'block';
}

lbMobilePrev?.addEventListener('click', e => {
  e.stopPropagation();
  navigateLightbox(-1);
});

lbMobileNext?.addEventListener('click', e => {
  e.stopPropagation();
  navigateLightbox(+1);
});

function hideLightboxCursor() {
  lightboxCursor.style.display = 'none';
}

// Navigate by clicking left/right half of the image
//const lbImg = document.getElementById('lb-img');
lbImg.addEventListener('click', e => {
  const half = e.offsetX < lbImg.offsetWidth / 2;
  navigateLightbox(half ? -1 : +1);
});
lbImg.addEventListener('pointermove', updateLightboxCursor);
lbImg.addEventListener('pointerenter', updateLightboxCursor);
lbImg.addEventListener('pointerleave', hideLightboxCursor);
lightbox.addEventListener('pointerleave', hideLightboxCursor);
lightbox.addEventListener('click', hideLightboxCursor);
lbImg.addEventListener('mouseleave', hideLightboxCursor);
lbImg.addEventListener('click', () => {
  hideLightboxCursor();
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
    renderMobileActiveFilters();
    scheduleScrollToFirstActiveCardIfNeeded();
  });
});

// ── Responsive row count ──────────────────────────────────────────────────
let _lastRowCount = getRowCount();
window.addEventListener('resize', () => {
  const n = getRowCount();

  document.querySelectorAll('.filter-row[data-control-type="victims"]').forEach(row => {
    positionVictimsStops(row);
  });

  if (n !== _lastRowCount) {
    _lastRowCount = n;
    render();
    return;
  }

  if (!isMobileIndex()) {
    measureInfiniteRows();
    updateInfiniteRows();
  }
});

// ── Infinite scroll for gallery ────────────────────────────────────────────
const infiniteScrollState = {
  rows: [],
  virtualX: 0,
  wheelHandler: null,
  setupId: 0
};

function positiveModulo(value, size) {
  return ((value % size) + size) % size;
}

function removeInfiniteScrollListeners() {
  if (!galleryScroll) return;

  if (infiniteScrollState.wheelHandler) {
    galleryScroll.removeEventListener('wheel', infiniteScrollState.wheelHandler);
  }

  infiniteScrollState.wheelHandler = null;
}

function waitForImages(container) {
  const images = [...container.querySelectorAll('img')];

  return Promise.all(images.map(img => {
    img.loading = 'eager';

    if (img.complete && img.naturalWidth > 0) {
      return Promise.resolve();
    }

    if (img.decode) {
      return img.decode().catch(() => {});
    }

    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }));
}

function measureInfiniteRows() {
  infiniteScrollState.rows.forEach(rowData => {
    const trackStyle = getComputedStyle(rowData.track);
    const blockGap = parseFloat(trackStyle.columnGap || trackStyle.gap) || 0;

    rowData.width = rowData.centerBlock.getBoundingClientRect().width + blockGap;
  });
}

function updateInfiniteRows() {
  infiniteScrollState.rows.forEach(rowData => {
    if (!rowData.width) return;

    const offset = positiveModulo(infiniteScrollState.virtualX, rowData.width);

    rowData.track.style.transform =
      `translate3d(${-rowData.width - offset}px, 0, 0)`;
  });
}

async function enableInfiniteScroll() {
  if (!galleryScroll) return;

  infiniteScrollState.setupId += 1;
  const currentSetupId = infiniteScrollState.setupId;

  removeInfiniteScrollListeners();

  if (isMobileIndex()) {
    infiniteScrollState.rows = [];
    return;
  }

  const rows = getActiveRows();
  if (!rows.length) return;

  infiniteScrollState.rows = [];
  infiniteScrollState.virtualX = 0;

  rows.forEach(row => {
    const originalCards = [...row.children].filter(child => {
      return child.classList && child.classList.contains('card');
    });

    if (originalCards.length === 0) return;

    row.innerHTML = '';
    row.classList.add('infinite-ready');

    const track = document.createElement('div');
    track.className = 'archive-row-track';

    const leftBlock = document.createElement('div');
    const centerBlock = document.createElement('div');
    const rightBlock = document.createElement('div');

    leftBlock.className = 'archive-row-block';
    centerBlock.className = 'archive-row-block';
    rightBlock.className = 'archive-row-block';

    originalCards.forEach(card => {
      leftBlock.appendChild(card.cloneNode(true));
      centerBlock.appendChild(card);
      rightBlock.appendChild(card.cloneNode(true));
    });

    track.appendChild(leftBlock);
    track.appendChild(centerBlock);
    track.appendChild(rightBlock);

    row.appendChild(track);

    infiniteScrollState.rows.push({
      row,
      track,
      centerBlock,
      width: 0
    });
  });

  await waitForImages(archiveGallery);

  if (currentSetupId !== infiniteScrollState.setupId) return;

  requestAnimationFrame(() => {
    if (currentSetupId !== infiniteScrollState.setupId) return;

    measureInfiniteRows();
    updateInfiniteRows();

    infiniteScrollState.wheelHandler = e => {
      if (isMobileIndex()) return;

      const dominantDelta = Math.abs(e.deltaY) > Math.abs(e.deltaX)
        ? e.deltaY
        : e.deltaX;

      if (dominantDelta === 0) return;

      e.preventDefault();

      infiniteScrollState.virtualX += dominantDelta;
      updateInfiniteRows();
    };

    galleryScroll.addEventListener('wheel', infiniteScrollState.wheelHandler, {
      passive: false
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────
loadData();