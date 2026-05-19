const grid = document.getElementById('grid');
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

function updateCategoryText(category) {
  const japaneseText = document.getElementById("category-japanese-text");
  const englishText = document.getElementById("category-english-text");

  if (!japaneseText || !englishText) return;

  const text = categoryTexts[category] || categoryTexts.fotografie;

  japaneseText.textContent = text.japanese;
  englishText.textContent = text.english;
}



let items = [];          // original data from JSON
let displayItems = [];   // current display order (may be shuffled)
let activeTags = new Set();
let searchQuery = '';
let isRandom = false;
let lbIndex = -1;        // current index in filteredItems() array
let activeCategory = null; // 'fotografie' | 'pacchetti' | 'pubblicità' | null
let activeYear = null;     // e.g. 1985 | null
let activeFilter = null;
let activeFilterType = null;

// ── Load data ──────────────────────────────────────────────────────────────
async function loadData() {
  // fetch data from data.json
  const res = await fetch('data.json');
  // parse the json
  const data = await res.json();
  // set the items and display items
  console.log('res', res);
  console.log('data', data);
  items = data.items;
  displayItems = [...items];
  buildTagsBar();
  buildYearFilter();
  render();
}

// ── Collect all unique tags ───────────────────────────────────────────────
function allTags() {
  const set = new Set();
  console.log('items', items);
  items.forEach(item => item.tags.forEach(t => set.add(t)));
  return [...set].sort();
}

// ── Build the filter tags bar ─────────────────────────────────────────────
function buildTagsBar() {
  return
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
  return displayItems.filter(item => {
    const matchesCategory = !activeCategory || item.category === activeCategory;

    let matchesCustomFilter = true;

    if (activeFilter && activeFilterType === "year") {
      matchesCustomFilter = Number(item.year) === Number(activeFilter);
    }

    if (activeFilter && activeFilterType === "tag") {
      matchesCustomFilter =
        item.tags?.includes(activeFilter) ||
        item["tags-fotografie"]?.includes(activeFilter) ||
        item["tags-pacchetti"]?.includes(activeFilter);
    }

    if (activeFilter && activeFilterType === "luogo") {
      matchesCustomFilter =
        item["luogo-pacchetti"]?.toLowerCase() === activeFilter.toLowerCase() ||
        item.tags?.includes(activeFilter.toLowerCase());
    }

    return matchesCategory && matchesCustomFilter;
  });
}

// ── Category filter ───────────────────────────────────────────────────────
function setCategory(cat) {
  activeCategory = activeCategory === cat ? null : cat;
  updateCategoryText(activeCategory || "fotografie");

  activeFilter = null;
  activeFilterType = null;

  document.querySelectorAll('[data-category]').forEach(el => {
    el.style.opacity = (!activeCategory || el.dataset.category === activeCategory) ? '1' : '0.35';
  });

  grid.classList.remove('layout-fotografie', 'layout-pacchetti', 'layout-pubblicita');

  if (activeCategory === 'pacchetti') grid.classList.add('layout-pacchetti');
  if (activeCategory === 'pubblicità') grid.classList.add('layout-pubblicita');

  renderCategoryFilters(activeCategory || "fotografie");
  render();
}
const filtersByCategory = {
  fotografie: [
    {
      title: "状態 Status",
      type: "tag",
      values: ["day", "evening", "far away", "close by"]
    },
    {
      title: "人々 People",
      type: "tag",
      values: ["肖像 portrait", "集合写真 group", "先輩 senpai", "様 sama", "君 kun"]
    },
    {
      title: "年 Year",
      type: "year",
      values: [1985, 1986, 1987, 1988, 1989, 1990]
    }
  ],

  pacchetti: [
    {
      title: "色 Color",
      type: "tag",
      values: ["青 blue", "白 white", "赤 red", "黄 yellow", "緑 green"]
    },
    {
      title: "年 Year",
      type: "year",
      values: [1985, 1986, 1987, 1988, 1989, 1990]
    },
    {
      title: "場所 Place",
      type: "luogo",
      values: ["大阪 Osaka", "東京 Tokyo", "京都 Kyoto", "奈良 Nara"]
    }
  ],

  pubblicità: [
    {
      title: "年 Year",
      type: "year",
      values: [1985, 1986, 1987, 1988, 1989, 1990]
    }
  ]
};

function renderCategoryFilters(category) {
  const panel = document.getElementById("filters-panel");
  if (!panel) return;

  panel.innerHTML = "";

  const filters = filtersByCategory[category] || [];

  filters.forEach(group => {
    const div = document.createElement("div");
    div.className = "filter col-span-4 grid grid-cols-4 gap-x-10px gap-y-5px h-fit";

    div.innerHTML = `
      <p class="col-span-1">${group.title}</p>
      <p class="col-span-3 flex flex-wrap gap-x-10px">
        ${group.values.map(value => `
          <span class="cursor-pointer filter-option"
                data-filter-type="${group.type}"
                data-filter-value="${value}">
            ${value}
          </span>
        `).join("")}
      </p>
    `;

    panel.appendChild(div);
  });

  document.querySelectorAll(".filter-option").forEach(option => {
    option.addEventListener("click", () => {
      const value = option.dataset.filterValue;
      const type = option.dataset.filterType;

      if (activeFilter === value && activeFilterType === type) {
        activeFilter = null;
        activeFilterType = null;
      } else {
        activeFilter = value;
        activeFilterType = type;
      }

      document.querySelectorAll(".filter-option").forEach(el => {
        el.style.opacity =
          activeFilter === el.dataset.filterValue &&
          activeFilterType === el.dataset.filterType
            ? "1"
            : "0.35";
      });

      render();
    });
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
    const card = document.createElement('article');
    card.className = 'card';
    card.style.cursor = 'zoom-in';
    card.dataset.itemYear = item.year;
    if (!activeYear || item.year === activeYear) card.classList.add('activeImg');

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

    EventListener('click', () => {
  // funziona solo nella categoria Portraits / fotografie
  if (activeCategory !== "fotografie") return;

  const alreadyActive = card.classList.contains("selectedImg");

  document.querySelectorAll(".card").forEach(c => {
    c.classList.remove("selectedImg");
  });

  if (alreadyActive) {
    grid.classList.remove("has-selected");
  } else {
    grid.classList.add("has-selected");
    card.classList.add("selectedImg");
  }
});

//selectedImg//
if (!activeYear || item.year === activeYear) card.classList.add('activeImg');

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

// ── Category buttons ──────────────────────────────────────────────────────
document.querySelectorAll('[data-category]').forEach(el => {
  el.addEventListener('click', () => setCategory(el.dataset.category));
});
// ── Year filter ───────────────────────────────────────────────────────────
function buildYearFilter() {
  const container = document.getElementById('year-filter-list');
  if (!container) return;
  const years = [...new Set(items.map(i => i.year).filter(Boolean))].sort();
  container.innerHTML = '';
  years.forEach(year => {
    const span = document.createElement('span');
    span.className = 'cursor-pointer';
    span.dataset.year = year;
    span.textContent = `${year}年`;
    span.addEventListener('click', () => setYear(year));
    container.appendChild(span);
  });
}

function setYear(year) {
  activeYear = activeYear === year ? null : year;
  grid.classList.toggle('year-filtered', !!activeYear);
  document.querySelectorAll('[data-year]').forEach(el => {
    el.style.opacity = (!activeYear || Number(el.dataset.year) === activeYear) ? '1' : '0.35';
  });
  document.querySelectorAll('.card[data-item-year]').forEach(card => {
    const match = !activeYear || Number(card.dataset.itemYear) === activeYear;
    card.classList.toggle('activeImg', match);
  });
}
// ── Init ──────────────────────────────────────────────────────────────────
loadData();
renderCategoryFilters("fotografie");
setCategory("fotografie");
