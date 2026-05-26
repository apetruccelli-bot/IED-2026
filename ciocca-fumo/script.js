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
    japanese: `ある実業家がまるでその中を探そうとするかのように
腰をかがめて吸い殻を拾い上げた。`,
    english: `Portraits collects photographs of people smoking in Osaka between 1985 and 1990. These images show smoking as a daily gesture, part of work, waiting, conversation and urban life.`
  },
  pacchetti: {
    japanese: `タバコの箱は、色、文字、場所によって集められた
小さな記憶の断片である。`,
    english: `Cigarette packs presents the visual archive of tobacco packaging: colors, lettering and graphic details collected between Osaka, Tokyo, Kyoto and Nara.`
  },
  pubblicità: {
    japanese: `広告は、喫煙が日常の中でどのように語られ、
見せられていたかを記録している。`,
    english: `Advertisements shows how cigarettes were represented through commercial images, slogans and visual culture.`
  }
};

const filtersByCategory = {
  fotografie: [
    { title: '状態 Status', type: 'tag', values: ['giorno', 'sera', 'lontano', 'primo piano', 'interno', 'esterno'] },
    { title: '人々 People', type: 'tag', values: ['ritratto', 'gruppo', 'anziano', 'business'] },
    { title: '年 Year', type: 'year', values: [1985, 1986, 1987, 1988, 1989, 1990] }
  ],
  pacchetti: [
    { title: '色 Color', type: 'tag', values: ['blu', 'bianco', 'rosso', 'verde'] },
    { title: '年 Year', type: 'year', values: [1985, 1986, 1987, 1988, 1989, 1990, 1996] },
    { title: '場所 Place', type: 'luogo', values: ['Osaka', 'Tokyo', 'Kyoto', 'Nara'] }
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

  if (tagsBar) {
    tagsBar.querySelectorAll('.tag-btn').forEach(btn => {
      btn.classList.toggle('active', activeTags.has(btn.dataset.tag));
    });
  }
  render();
}

function filteredItems() {
  const q = searchQuery.trim().toLowerCase();

  return displayItems.filter(item => {
    const matchesCategory = !activeCategory || item.category === activeCategory;
    const tags = getItemTags(item);
    const matchesTags = [...activeTags].every(tag => tags.includes(tag));
    const matchesSearch = !q || [
      item.description,
      item.category,
      item.year,
      ...tags
    ].join(' ').toLowerCase().includes(q);

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

    return matchesCategory && matchesTags && matchesSearch && matchesCustomFilter;
  });
}

function setCategory(cat) {
  activeCategory = cat;
  activeFilter = null;
  activeFilterType = null;
  grid?.classList.remove('has-selected', 'layout-fotografie', 'layout-pacchetti', 'layout-pubblicita', 'year-filtered');

  document.querySelectorAll('[data-category]').forEach(el => {
    el.style.opacity = el.dataset.category === activeCategory ? '1' : '0.35';
  });

  if (activeCategory === 'pacchetti') grid?.classList.add('layout-pacchetti');
  if (activeCategory === 'pubblicità') grid?.classList.add('layout-pubblicita');

  updateCategoryText(activeCategory);
  renderCategoryFilters(activeCategory);
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

function renderCategoryFilters(category) {
  const panel = document.getElementById('filters-panel');
  if (!panel) return;

  panel.innerHTML = '';
  (filtersByCategory[category] || []).forEach(group => {
    const div = document.createElement('div');
    div.className = 'filter col-span-4 grid grid-cols-4 gap-x-10px gap-y-5px h-fit';
    div.innerHTML = `
      <p class="col-span-1">${group.title}</p>
      <p class="col-span-3 flex flex-wrap gap-x-10px">
        ${group.values.map(value => `
          <span class="cursor-pointer filter-option" data-filter-type="${group.type}" data-filter-value="${value}">${value}</span>
        `).join('')}
      </p>
    `;
    panel.appendChild(div);
  });

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

      panel.querySelectorAll('.filter-option').forEach(el => {
        const active = activeFilter === el.dataset.filterValue && activeFilterType === el.dataset.filterType;
        el.style.opacity = !activeFilter || active ? '1' : '0.35';
      });
      render();
    });
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
  grid.classList.toggle('layout-pubblicita', activeCategory === 'pubblicità');
  grid.classList.toggle('layout-pacchetti', activeCategory === 'pacchetti');

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
        <p class="card-desc">${item.description || ''}</p>
        <div class="card-tags card-tags-info">
          <span>色 Color</span><span>${(item['tags-pacchetti'] || []).join(' ')}</span>
          <span>産地 Origin</span><span>${item['luogo-pacchetti'] || ''} ${item['paese-pacchetti'] || ''}</span>
          <span>年 Year</span><span>${item.year || ''}年</span>
        </div>
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
        t.className = 'card-tag' + (activeTags.has(tag) ? ' highlight' : '');
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
    card.addEventListener('click', () => {
      if (activeCategory !== 'fotografie' && activeCategory !== 'pacchetti') return;
      const alreadyActive = card.classList.contains('selectedImg');
      grid.querySelectorAll('.card').forEach(c => c.classList.remove('selectedImg'));
      grid.classList.toggle('has-selected', !alreadyActive);
      if (!alreadyActive) card.classList.add('selectedImg');
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
