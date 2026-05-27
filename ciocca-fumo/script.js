const grid = document.getElementById('grid');
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
  ],
  pubblicità: [
    { title: '年 Year', type: 'year', values: [1960] }
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

function updateCategoryText(category) {
  const japaneseText = document.getElementById('category-japanese-text');
  const englishText = document.getElementById('category-english-text');
  if (!japaneseText || !englishText) return;

  const text = categoryTexts[category] || categoryTexts.fotografie;
  japaneseText.textContent = text.japanese;
  englishText.textContent = text.english;
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

    if (activeFilter && activeFilterType === 'year') {
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

function setCategory(cat) {
  activeCategory = cat;
  activeFilter = null;
  activeFilterType = null;
  activeTags.clear();
  syncGlobalTagButtons();

  grid?.classList.remove(
    'has-selected',
    'layout-fotografie',
    'layout-pacchetti',
    'layout-pubblicita',
    'year-filtered'
  );

  document.querySelectorAll('[data-category]').forEach(el => {
    el.style.opacity = el.dataset.category === activeCategory ? '1' : '0.35';
  });

  if (activeCategory === 'fotografie') {
    grid?.classList.add('layout-fotografie');
    renderPortraitFilters();
  } else {
    renderCategoryFilters(activeCategory);
  }

  if (activeCategory === 'pacchetti') grid?.classList.add('layout-pacchetti');
  if (activeCategory === 'pubblicità') grid?.classList.add('layout-pubblicita');

  updateCategoryText(activeCategory);
  render();

  if (
    activeCategory === 'fotografie' &&
    typeof handDetector !== 'undefined' &&
    !handDetector &&
    typeof initPortraitGesture === 'function'
  ) {
    initPortraitGesture();
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
    el.style.opacity = el.dataset.category === item.category ? '1' : '0.35';
  });

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

  document.querySelectorAll('.card-tag').forEach(tagEl => {
    tagEl.classList.toggle('highlight', tags.includes(tagEl.textContent));
  });
}

function clearActiveInfo() {
  document.querySelectorAll('[data-category]').forEach(el => {
    el.style.opacity = el.dataset.category === activeCategory ? '1' : '0.35';
  });
  document.querySelectorAll('.filter-option').forEach(el => {
    el.classList.remove('active-filter');
    el.style.opacity = '1';
  });
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
  grid.classList.toggle('layout-fotografie', activeCategory === 'fotografie');
  grid.classList.toggle('layout-pubblicita', activeCategory === 'pubblicità');
  grid.classList.toggle('layout-pacchetti', activeCategory === 'pacchetti');
  grid.classList.remove('has-selected');

  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nessun risultato.';
    grid.appendChild(empty);
    return;
  }

  visible.forEach((item, i) => {
    const card = document.createElement('article');
    card.className = 'card activeImg';
    card.style.cursor = activeCategory === 'fotografie' || activeCategory === 'pacchetti' ? 'zoom-in' : 'default';
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
    card.appendChild(img);

    const body = document.createElement('div');
    body.className = 'card-body';

    if (item.category === 'pacchetti') {
      body.innerHTML = `
        <div class="card-tags">
          ${(item.tags || []).map(tag => `<span class="card-tag">${tag}</span>`).join('')}
        </div>
        <p class="card-desc">${item['description-ja'] || ''}<br>${item['description-en'] || ''}</p>
      `;
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

      if (item.category === 'fotografie') {
        const descEl = document.createElement('p');
        descEl.className = 'card-desc';
        descEl.innerHTML = `${item['description-ja'] || ''}<br>${item['description-en'] || ''}`;
        body.appendChild(descEl);
      }
    }

    card.appendChild(body);

    card.addEventListener('click', () => {
      if (activeCategory !== 'fotografie' && activeCategory !== 'pacchetti') return;

      const alreadyActive = card.classList.contains('selectedImg');
      grid.querySelectorAll('.card').forEach(c => c.classList.remove('selectedImg'));
      grid.classList.toggle('has-selected', !alreadyActive);

      if (!alreadyActive) {
        card.classList.add('selectedImg');
        updateActiveInfo(item);
      } else {
        clearActiveInfo();
      }
    });

    grid.appendChild(card);
  });

  if (activeCategory === 'pubblicità') setupAdvertisingScrollText();
}

function setupAdvertisingScrollText() {
  if (!grid || advertisingScrollBound) {
    updateAdvertisingTextOnScroll();
    return;
  }
  grid.addEventListener('scroll', updateAdvertisingTextOnScroll);
  advertisingScrollBound = true;
  updateAdvertisingTextOnScroll();
}

function updateAdvertisingTextOnScroll() {
  const cards = document.querySelectorAll('.myPhotos.layout-pubblicita .card');
  const japaneseText = document.getElementById('category-japanese-text');
  const englishText = document.getElementById('category-english-text');
  if (!cards.length || !japaneseText || !englishText) return;

  let activeCard = cards[0];
  cards.forEach(card => {
    const rect = card.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.45) activeCard = card;
    card.classList.toggle('ad-past', rect.bottom < window.innerHeight * 0.35);
  });

  japaneseText.textContent = activeCard.dataset.adJa || '';
  englishText.textContent = activeCard.dataset.adEn || '';
}

function openLightbox(index) {
  if (!lightbox || !lbImg || !lbId || !lbTagsEl) return;
  const visible = filteredItems();
  lbIndex = index;
  const item = visible[lbIndex];
  if (!item) return;

  lbImg.src = item.src;
  lbImg.alt = item.description || `Item ${item.id}`;
  lbId.textContent = `#${String(item.id).padStart(2, '0')}`;
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
    setCategory(el.dataset.category);
  });
});

function initAboutImageBlurOnScroll() {
  const modal = document.getElementById('explore-modal');
  const images = document.querySelectorAll('.about-grid img');
  if (!modal || !images.length || modal.dataset.blurBound === 'true') return;

  modal.dataset.blurBound = 'true';
  modal.addEventListener('scroll', () => {
    images.forEach(img => {
      const rect = img.getBoundingClientRect();
      const progress = 1 - rect.top / window.innerHeight;
      img.classList.toggle('about-faded', progress > 0.45);
    });
  });
}

function openExploreModal() {
  const modal = document.getElementById('explore-modal');
  if (!modal) return;
  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');
  initAboutImageBlurOnScroll();
}

function closeExploreModal() {
  const modal = document.getElementById('explore-modal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

async function init() {
  try {
    await loadData();
    setCategory('fotografie');
  } catch (error) {
    console.error(error);
    if (grid) grid.innerHTML = `<div class="empty">Errore nel caricamento dei dati.</div>`;
  }
}

init();
