const rowsHost = document.getElementById('archive-rows');
const galleryHost = document.getElementById('archive-gallery');
const searchInput = document.getElementById('search');
const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
const lbId = document.getElementById('lb-id');
const lbDesc = document.getElementById('lb-desc');
const lbClose = document.getElementById('lb-close');
const lbPrev = document.getElementById('lb-prev');
const lbNext = document.getElementById('lb-next');
const lbBackdrop = document.getElementById('lb-backdrop');
const markerModal = document.getElementById('marker-modal');
const markerModalImg = document.getElementById('marker-modal-img');
const markerModalId = document.getElementById('marker-modal-id');
const markerModalDesc = document.getElementById('marker-modal-desc');
const markerModalClose = document.getElementById('marker-modal-close');
const markerModalPrev = document.getElementById('marker-modal-prev');
const markerModalNext = document.getElementById('marker-modal-next');
const markerModalBackdrop = document.getElementById('marker-modal-backdrop');

const archiveRows = [
  { anno: '1964', autore: 'Scorza', regione: 'Calabria', abitanti: 'Meno di 10', documento: 'Fotografia' },
  { anno: '1965', autore: 'Varani', regione: 'Sicilia', abitanti: 'Tra 10 e 100', documento: 'Note di campo' },
  { anno: '1966', autore: 'Fiore', regione: 'Puglia', abitanti: 'Tra 100 e 1000', documento: '' },
  { anno: '1967', autore: 'Maffei', regione: 'Campania', abitanti: 'Piu di 1000', documento: '' },
  { anno: '1968', autore: 'Ferri', regione: 'Molise', abitanti: '', documento: '' },
];

let enrichedRows = [];
let allItems = [];
let mapItems = [];
let activeFilters = new Set();
let lbIndex = -1;
let markerIndex = -1;

const regionGroups = {
  Calabria: ['Serra Vasta', 'Valle Cupa', 'Zagara', 'San Velio', 'Fonte Chiusa', 'Santa Rena', 'Costa Nera', 'Pietra Lenta'],
  Basilicata: ['Fonte Secca', 'Monteferro', 'Poggio Nero', 'Piana Morta'],
  Campania: ['Vallefredda', 'Rocca Secca', 'Serra Antica'],
  Puglia: ['Borgo Cupo', 'Castel Ruvo', 'Borgo Salso'],
  Sicilia: ['Colle Ombra', 'Riva Spenta'],
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalize(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeComparable(value) {
  return normalize(value).replace(/\s+/g, ' ').trim();
}

function findBestImage(row, items) {
  const targetYear = Number(row.anno);
  const surname = normalize(row.autore);

  return (
    items.find((item) => item.year === targetYear && normalize(item.description).includes(surname)) ||
    items.find((item) => item.year === targetYear) ||
    null
  );
}

function getItemField(item, key) {
  if (!item) return '';
  if (key === 'year') return String(item.year || '');
  if (key === 'tags') return Array.isArray(item.tags) ? item.tags : [];
  return String(item[key] || '');
}

function buildFilterColumns() {
  const unique = (arr) => [...new Set(arr.filter(Boolean))];
  const abitantiOrder = ['Meno di 10', 'Tra 10 e 100', 'Tra 100 e 1000', 'Piu di 1000'];

  return [
    { key: 'year', label: 'anno', values: unique(allItems.map((item) => String(item.year || ''))).sort() },
    { key: 'autore', label: 'autore', values: unique(allItems.map((item) => item.autore)).sort() },
    { key: 'regione', label: 'regione', values: unique(allItems.map((item) => item.regione)).sort() },
    { key: 'abitanti', label: 'abitanti', values: unique(allItems.map((item) => item.abitanti)).sort((a, b) => abitantiOrder.indexOf(a) - abitantiOrder.indexOf(b)) },
    { key: 'documento', label: 'documento', values: unique(allItems.map((item) => item.documento)).sort() },
  ];
}

async function hydrateRowsWithImages() {
  const response = await fetch('data.json');
  const data = await response.json();
  const items = Array.isArray(data.items) ? data.items : [];

  allItems = items;
  enrichedRows = archiveRows.map((row) => {
    const match = findBestImage(row, items);
    return {
      ...row,
      imageSrc: match?.src || '',
      imageDescription: match?.description || 'Immagine non disponibile',
    };
  });
  // populate filters UI when rows are hydrated
  renderFilters();
}

function renderFilters() {
  if (!rowsHost) return;

  const columns = buildFilterColumns();

  rowsHost.innerHTML = columns
    .map(
      ({ key, label, values }) => `
      <div class="flex flex-col">
        ${key === 'regione'
          ? values
              .map((v) => {
                const towns = regionGroups[v] || [];
                return `
                  <div class="region-group">
                    <button
                      type="button"
                      class="w-full text-left text-justify cursor-pointer select-none"
                      data-filter-key="${escapeHtml(key)}"
                      data-filter-value="${escapeHtml(v)}"
                      data-region-toggle="${escapeHtml(v)}"
                      aria-expanded="false"
                    >
                      ${escapeHtml(v)}
                    </button>
                    <div class="region-towns hidden pl-10px pt-10px pb-10px" data-region-town-list="${escapeHtml(v)}">
                      ${towns.map((town) => `<p class="text-justify opacity-50 cursor-pointer select-none" data-filter-key="paese" data-filter-value="${escapeHtml(town)}">${escapeHtml(town)}</p>`).join('')}
                    </div>
                  </div>
                `;
              })
              .join('')
          : values
              .map(
                (v) =>
                  `<p class="text-justify cursor-pointer select-none" data-filter-key="${escapeHtml(key)}" data-filter-value="${escapeHtml(v)}">${escapeHtml(v)}</p>`
              )
              .join('')}
      </div>`
    )
    .join('');

  rowsHost.querySelectorAll('[data-filter-key][data-filter-value]').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.dataset.filterKey;
      const value = el.dataset.filterValue;
      if (key && value) toggleFilter(key, value);
    });
  });
}

function toggleFilter(key, value) {
  const token = `${key}::${normalizeComparable(value)}`;

  if (activeFilters.has(token)) {
    activeFilters.delete(token);
  } else {
    [...activeFilters].forEach((activeToken) => {
      if (activeToken.startsWith(`${key}::`)) {
        activeFilters.delete(activeToken);
      }
    });
    activeFilters.add(token);
  }
  // update visual state: if any tags active, dim unselected and highlight selected
  document.querySelectorAll('[data-filter-key][data-filter-value]').forEach((el) => {
    const currentToken = `${el.dataset.filterKey}::${normalizeComparable(el.dataset.filterValue)}`;

    if (activeFilters.size === 0) {
      el.classList.remove('opacity-50', 'opacity-100');
    } else {
      const isActive = activeFilters.has(currentToken);
      el.classList.toggle('opacity-100', isActive);
      el.classList.toggle('opacity-50', !isActive);
    }
  });
  syncRegionExpansion();
  filterVisible(searchInput?.value || '');
}

function syncRegionExpansion() {
  document.querySelectorAll('[data-region-toggle]').forEach((button) => {
    const value = button.dataset.regionToggle || '';
    const isExpanded = activeFilters.has(`regione::${normalizeComparable(value)}`);
    const details = document.querySelector(`[data-region-town-list="${CSS.escape(value)}"]`);

    button.setAttribute('aria-expanded', String(isExpanded));
    if (details) {
      details.classList.toggle('hidden', !isExpanded);
    }
  });
}

function galleryTemplate(item, index) {
  if (!item.src) return '';
  const rawCaption = item.description || 'Immagine archivio';
  const parts = rawCaption.split(',').map((part) => part.trim()).filter(Boolean);
  const author = parts.length > 1 ? parts[parts.length - 1] : '';
  const mainTitle = parts.length > 1 ? parts.slice(0, -1).join(', ') : rawCaption;

  return `
    <div data-item-index="${index}" class="group relative mb-10px inline-block w-full break-inside-avoid cursor-pointer">
      <img src="${escapeHtml(item.src)}" alt="${escapeHtml(rawCaption)}" class="gallery-image block h-auto w-full" loading="lazy">
      <div class="gallery-title-wrap pointer-events-none absolute inset-0 flex items-center justify-center">
        <div class="gallery-title font-myTitle text-myBlack text-center px-4">
          ${escapeHtml(mainTitle)}${author ? `<br>${escapeHtml(author)}` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderAll() {
  if (rowsHost) {
    renderFilters();
  }

  if (galleryHost) {
    galleryHost.innerHTML = allItems.map(galleryTemplate).join('') ||
      '<p class="mb-10px block opacity-50">Nessuna immagine trovata.</p>';
  }

  document.querySelectorAll('[data-item-index]').forEach((el) => {
    el.addEventListener('click', () => openLightbox(Number(el.dataset.itemIndex)));
  });

  initializeArchiveScrollOpacity();
}

function filterVisible(term = '') {
  const query = normalize(term.trim());

  document.querySelectorAll('[data-item-index]').forEach((el) => {
    const item = allItems[Number(el.dataset.itemIndex)];
    const matchesSearch = !query || [item.description, item.category, item.year].some(
      (v) => normalize(String(v || '')).includes(query)
    );
    const matchesTags =
      activeFilters.size === 0 ||
      [...activeFilters].every((token) => {
        const [key, value] = token.split('::');
        const field = getItemField(item, key);

        if (key === 'tags') {
          return Array.isArray(field) && field.some((tag) => normalizeComparable(tag) === value);
        }

        if (key === 'paese') {
          const itemTown = String(item.description || '').split(',')[0].trim();
          return normalizeComparable(itemTown) === value;
        }

        return normalizeComparable(field) === value;
      });
    const shouldHide = !matchesSearch || !matchesTags;
    el.classList.toggle('hidden', shouldHide);
    el.style.display = shouldHide ? 'none' : '';
  });
}

function openLightbox(index) {
  lbIndex = index;
  const item = allItems[lbIndex];

  if (!item) return;

  lbImg.src = item.src;
  lbImg.alt = item.description || 'Immagine archivio';
  lbId.textContent = item.id != null ? `( ${item.id} )` : 'ID non disponibile';
  lbDesc.textContent = item.description || 'Senza descrizione';

  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.classList.add('lightbox-open');
  document.body.style.overflow = 'hidden';
  const sidebarLinks = document.querySelector('.sidebar-links');
  if (sidebarLinks) sidebarLinks.style.visibility = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lightbox-open');
  document.body.style.overflow = '';
  lbImg.src = '';
  const sidebarLinks = document.querySelector('.sidebar-links');
  if (sidebarLinks) sidebarLinks.style.visibility = 'visible';
}

function openMarkerModal(index) {
  if (!markerModal || !markerModalImg || !markerModalDesc) return;

  const item = mapItems[index];
  if (!item) return;

  markerIndex = index;
  markerModalImg.src = item.src;
  markerModalImg.alt = item.label || 'Immagine marker';
  if (markerModalId) {
    markerModalId.textContent = item.id != null ? `( ${item.id} )` : 'ID non disponibile';
  }
  markerModalDesc.textContent = item.description || '';

  markerModal.classList.add('open');
  markerModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const sidebarLinks = document.querySelector('.sidebar-links');
  if (sidebarLinks) sidebarLinks.style.visibility = 'hidden';
}

function closeMarkerModal() {
  if (!markerModal) return;

  markerModal.classList.remove('open');
  markerModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (markerModalImg) markerModalImg.src = '';
  const sidebarLinks = document.querySelector('.sidebar-links');
  if (sidebarLinks) sidebarLinks.style.visibility = 'visible';
}

function navigateMarkerModal(direction) {
  if (!mapItems.length) return;

  let nextIndex = markerIndex + direction;
  if (nextIndex >= mapItems.length) nextIndex = 0;
  if (nextIndex < 0) nextIndex = mapItems.length - 1;
  openMarkerModal(nextIndex);
}

function navigateLightbox(direction) {
  const visible = [...document.querySelectorAll('[data-item-index]:not(.hidden)')];
  const currentPos = visible.findIndex((el) => Number(el.dataset.itemIndex) === lbIndex);
  let nextPos = currentPos + direction;
  if (nextPos >= visible.length) nextPos = 0;
  if (nextPos < 0) nextPos = visible.length - 1;
  openLightbox(Number(visible[nextPos].dataset.itemIndex));
}

if (lbClose) lbClose.addEventListener('click', closeLightbox);
if (lbBackdrop) lbBackdrop.addEventListener('click', closeLightbox);
if (lbPrev) lbPrev.addEventListener('click', () => navigateLightbox(-1));
if (lbNext) lbNext.addEventListener('click', () => navigateLightbox(1));

/* document.addEventListener('keydown', (event) => {
  if (!lightbox.classList.contains('open')) return;
  if (event.key === 'ArrowLeft') navigateLightbox(-1);
  if (event.key === 'ArrowRight') navigateLightbox(1);
  if (event.key === 'Escape') closeLightbox();
}); */

if (searchInput) {
  searchInput.addEventListener('input', (event) => {
    filterVisible(event.target.value);
  });
}

hydrateRowsWithImages()
  .then(() => renderAll())
  .catch(() => {
    enrichedRows = [...archiveRows];
    renderAll();
  });

function initializeArchiveScrollOpacity() {
  const archiveScroll = document.querySelector('#archive-scroll, .col-start-3.col-end-9.bg-myWhite.h-screen.overflow-y-scroll');
  const archiveItems = Array.from(document.querySelectorAll('#archive-gallery [data-item-index]'));

  if (!archiveScroll || !archiveItems.length) return;

  archiveItems.forEach((item) => item.classList.add('archive-fade'));

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    archiveItems.forEach((item) => item.classList.add('archive-fade--visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle('archive-fade--visible', entry.isIntersecting);
    });
  }, {
    root: archiveScroll,
    threshold: 0.14,
    rootMargin: '0px 0px -8% 0px',
  });

  archiveItems.forEach((item) => observer.observe(item));
}

function normalizeNavPath(pathname) {
  const raw = String(pathname || '').trim().toLowerCase();
  if (!raw) return 'home.html';
  if (raw === 'stat') return 'stat.html';
  return raw;
}

function applyActiveSidebarLink() {
  const currentPage = normalizeNavPath(window.location.pathname.split('/').pop());

  document.querySelectorAll('.sidebar-links a[href]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const targetPage = normalizeNavPath(href.split('#')[0].split('/').pop());
    const isActive = currentPage === targetPage;

    link.classList.toggle('is-active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

document.addEventListener('DOMContentLoaded', applyActiveSidebarLink);


// Handle smooth scrolling inside the main scroll container for section anchors
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const container = document.getElementById('main-scroll');
    if (!container) return;
    const headerOffset = 80; // keep in sync with CSS
    document.querySelectorAll('a[href^="#sezione_"]').forEach(a => {
      a.addEventListener('click', function(e){
        e.preventDefault();
        const id = this.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (!target) return;
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const scrollTop = container.scrollTop + (targetRect.top - containerRect.top) - headerOffset;
        container.scrollTo({ top: scrollTop, behavior: 'smooth' });
      });
    });
  });
})();

// Fade-in sections while scrolling inside the story page container
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const mainScroll = document.getElementById('main-scroll');
    const storyGrid = mainScroll?.querySelector('div.grid.grid-cols-2.gap-10px.pt-30px.pl-10px.pr-10px.pb-30px');
    if (!mainScroll || !storyGrid) return;

    const storyItems = Array.from(storyGrid.children).filter((element) => element.nodeType === 1);
    if (!storyItems.length) return;

    storyItems.forEach((element) => element.classList.add('story-fade'));
    // Fallback: if IntersectionObserver is unavailable, reveal all
    if (!('IntersectionObserver' in window)) {
      storyItems.forEach((element) => element.classList.add('story-fade--visible'));
      return;
    }

    // Track last scroll position to detect direction
    let lastScrollTop = mainScroll.scrollTop || 0;

    // Mark items already visible on load as visible
    const containerRect = mainScroll.getBoundingClientRect();
    storyItems.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < containerRect.bottom && r.bottom > containerRect.top) {
        el.classList.add('story-fade--visible');
      }
    });

    const observer = new IntersectionObserver((entries) => {
      const currentScroll = mainScroll.scrollTop || 0;
      const scrollingDown = currentScroll > lastScrollTop;

      entries.forEach((entry) => {
        if (entry.isIntersecting && scrollingDown) {
          entry.target.classList.add('story-fade--visible');
          observer.unobserve(entry.target);
        }
      });

      lastScrollTop = currentScroll;
    }, {
      root: mainScroll,
      threshold: 0.18,
      rootMargin: '0px 0px -10% 0px',
    });

    storyItems.forEach((element) => {
      if (!element.classList.contains('story-fade--visible')) observer.observe(element);
    });
  });
})();

// Progressive opacity for sticky section anchors while scrolling inside the story page
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const mainScroll = document.getElementById('main-scroll');
    if (!mainScroll) return;

    const navLinks = Array.from(mainScroll.querySelectorAll('.sticky a[href^="#sezione_"]'));
    if (!navLinks.length) return;
    const headerOffset = 80;

    const sectionTargets = navLinks
      .map((link) => {
        const targetId = link.getAttribute('href')?.slice(1);
        const target = targetId ? document.getElementById(targetId) : null;
        return target ? { link, target } : null;
      })
      .filter(Boolean);

    const updateAnchorOpacity = () => {
      const scrollTop = mainScroll.scrollTop || 0;
      const currentPosition = scrollTop + headerOffset;
      const containerRect = mainScroll.getBoundingClientRect();
      let activeIndex = -1;

      sectionTargets.forEach(({ target }, index) => {
        if (!target) return;
        const sectionTop = target.getBoundingClientRect().top - containerRect.top + scrollTop;
        const sectionStart = Math.max(0, sectionTop - headerOffset);
        if (currentPosition >= sectionStart) {
          activeIndex = index;
        }
      });

      sectionTargets.forEach(({ link }, index) => {
        link.style.opacity = index === activeIndex ? '1' : '.3';
      });
    };

    let rafId = 0;
    const requestUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateAnchorOpacity();
      });
    };

    updateAnchorOpacity();
    mainScroll.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate, { passive: true });
  });
})();

function initializeStatisticsPage() {
  // Use main scroll container as root for stats if explicit wrapper is not present
  const statPage = document.getElementById('main-scroll') || document.body;

  const formatNumber = (value) => new Intl.NumberFormat('it-IT').format(Math.round(value));
  const clampPercentage = (value) => Math.max(4, Math.min(100, value));

  const data = {
    population: [
      { town: 'Zagara', start: 1842, today: 312 },
      { town: 'Santa Rena', start: 986, today: 141 },
      { town: 'Monteferro', start: 1204, today: 226 },
      { town: 'Serra Vasta', start: 1530, today: 318 },
      { town: 'Valle Cupa', start: 764, today: 82 },
      { town: 'Borgo Cupo', start: 692, today: 57 },
      { town: 'Rocca Secca', start: 1106, today: 149 },
    ],
    age: [
      { label: '0–14 anni', historic: 26, today: 3 },
      { label: '15–35 anni', historic: 31, today: 7 },
      { label: '36–64 anni', historic: 29, today: 28 },
      { label: '65+ anni', historic: 14, today: 62 },
    ],
    births: [
      { town: 'Zagara', start: 38, last: 1 },
      { town: 'Santa Rena', start: 21, last: 0 },
      { town: 'Monteferro', start: 27, last: 2 },
      { town: 'Valle Cupa', start: 14, last: 0 },
      { town: 'Borgo Cupo', start: 12, last: 0 },
      { town: 'Piana Morta', start: 9, last: 0 },
    ],
    houses: [
      { town: 'Zagara', built: 612, occupied: 189, active: 74 },
      { town: 'Monteferro', built: 431, occupied: 102, active: 39 },
      { town: 'Borgo Cupo', built: 288, occupied: 41, active: 12 },
    ],
    services: [
      { town: 'Zagara', school: 'chiusa', postOffice: 'parziale', clinic: 'mensile', transport: 'ridotto', groceries: '1' },
      { town: 'Santa Rena', school: 'chiusa', postOffice: 'chiuso', clinic: 'assente', transport: 'assente', groceries: '0' },
      { town: 'Monteferro', school: 'chiusa', postOffice: 'parziale', clinic: 'assente', transport: 'ridotto', groceries: '1' },
      { town: 'Borgo Cupo', school: 'chiusa', postOffice: 'chiuso', clinic: 'assente', transport: 'assente', groceries: '0' },
    ],
    continuity: [
      { town: 'Zagara', value: 18 },
      { town: 'Monteferro', value: 22 },
      { town: 'Serra Vasta', value: 31 },
      { town: 'Santa Rena', value: 12 },
      { town: 'Borgo Cupo', value: 7 },
      { town: 'Piana Morta', value: 4 },
    ],
  };

  const populationHost = document.getElementById('population-chart');
  if (populationHost) {
    const maxStart = Math.max(...data.population.map((item) => item.start));
    populationHost.innerHTML = data.population
      .map((item) => {
        const currentWidth = clampPercentage((item.start / maxStart) * 100);
        const todayWidth = clampPercentage((item.today / item.start) * 100);

        return `
          <div class="stat-population-row">
            <div class="stat-town">${item.town}</div>
            <div class="stat-population-cell">
              <span class="stat-cell-label">1964</span>
              <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${currentWidth}%"></div></div>
              <div class="stat-value">${formatNumber(item.start)}</div>
            </div>
            <div class="stat-population-cell">
              <span class="stat-cell-label">oggi</span>
              <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-fill--today" data-stat-fill="population" style="width:${todayWidth}%"></div></div>
              <div class="stat-value" data-stat-drift-type="population" data-base="${item.today}" data-current="${item.today}" data-min="0">${formatNumber(item.today)}</div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  const ageHost = document.getElementById('age-chart');
  if (ageHost) {
    ageHost.innerHTML = data.age
      .map((item) => `
        <div class="stat-age-row">
          <div class="stat-town">${item.label}</div>
          <div class="stat-age-bars">
            <div class="stat-age-bar">
              <span class="stat-cell-label">1964</span>
              <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-fill--light" style="width:${item.historic}%"></div></div>
              <div class="stat-value">${item.historic}%</div>
            </div>
            <div class="stat-age-bar">
              <span class="stat-cell-label">oggi</span>
              <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${item.today}%"></div></div>
              <div class="stat-value">${item.today}%</div>
            </div>
          </div>
        </div>
      `)
      .join('');
  }

  const birthsHost = document.getElementById('births-chart');
  if (birthsHost) {
    birthsHost.classList.add('stat-births-grid');
    birthsHost.innerHTML = data.births
      .map((item) => {
        const width = clampPercentage((item.last / item.start) * 100);
        return `
          <div class="stat-birth-card">
            <div class="stat-town">${item.town}</div>
            <div class="stat-birth-values">
              <div>
                <span class="stat-cell-label">1964</span>
                <div class="stat-value">${formatNumber(item.start)}</div>
              </div>
              <div>
                <span class="stat-cell-label">ultimo anno</span>
                <div class="stat-value" data-stat-drift-type="births" data-base="${item.last}" data-current="${item.last}" data-min="0">${formatNumber(item.last)}</div>
              </div>
            </div>
            <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-fill--today" data-stat-fill="births" style="width:${width}%"></div></div>
          </div>
        `;
      })
      .join('');
  }

  const housesHost = document.getElementById('houses-chart');
  if (housesHost) {
    const maxBuilt = Math.max(...data.houses.map((item) => item.built));
    housesHost.innerHTML = data.houses
      .map((item) => {
        const builtWidth = clampPercentage((item.built / maxBuilt) * 100);
        const occupiedWidth = clampPercentage((item.occupied / item.built) * 100);
        const activeWidth = clampPercentage((item.active / item.built) * 100);

        return `
          <div class="stat-houses-row">
            <div class="stat-town">${item.town}</div>
            <div class="stat-house-cell">
              <span class="stat-cell-label">costruite</span>
              <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${builtWidth}%"></div></div>
              <div class="stat-value">${formatNumber(item.built)}</div>
            </div>
            <div class="stat-house-cell">
              <span class="stat-cell-label">occupate</span>
              <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-fill--light" style="width:${occupiedWidth}%"></div></div>
              <div class="stat-value">${formatNumber(item.occupied)}</div>
            </div>
            <div class="stat-house-cell">
              <span class="stat-cell-label">attive</span>
              <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-fill--today" style="width:${activeWidth}%"></div></div>
              <div class="stat-value">${formatNumber(item.active)}</div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  const servicesHost = document.getElementById('services-chart');
  if (servicesHost) {
    const serviceHead = `
      <div class="stat-services-head">
        <span>Paese</span>
        <span>Scuola</span>
        <span>Ufficio postale</span>
        <span>Ambulatorio</span>
        <span>Trasporto</span>
        <span>Alimentari</span>
      </div>
    `;

    const serviceCell = (value) => {
      const normalized = normalize(value);
      let modifier = 'stat-service-cell--empty';
      if (normalized === '1') modifier = 'stat-service-cell--on';
      else if (normalized === '0' || normalized.includes('assente')) modifier = 'stat-service-cell--off';
      else if (normalized.includes('chius')) modifier = 'stat-service-cell--off';
      else if (normalized.includes('parziale') || normalized.includes('ridotto') || normalized.includes('mensile')) modifier = 'stat-service-cell--partial';

      return `<span class="stat-service-cell ${modifier}">${value || '—'}</span>`;
    };

    servicesHost.innerHTML = `
      <div class="stat-services-table">
        ${serviceHead}
        ${data.services
          .map((item) => `
            <div class="stat-services-row">
              <span class="stat-town">${item.town}</span>
              ${serviceCell(item.school)}
              ${serviceCell(item.postOffice)}
              ${serviceCell(item.clinic)}
              ${serviceCell(item.transport)}
              ${serviceCell(item.groceries)}
            </div>
          `)
          .join('')}
      </div>
    `;
  }

  const continuityHost = document.getElementById('continuity-chart');
  if (continuityHost) {
    const continuityLabel = (value) => {
      if (value >= 70) return 'continuità attiva';
      if (value >= 40) return 'continuità fragile';
      if (value >= 15) return 'continuità terminale';
      return 'continuità non rilevabile';
    };

    continuityHost.innerHTML = `
      ${data.continuity
        .map((item) => {
          const width = clampPercentage(item.value);
          return `
            <div class="stat-continuity-row">
              <div class="stat-town">${item.town}</div>
              <div class="stat-continuity-value">
                <span class="stat-cell-label">indice</span>
                <div class="stat-bar-track"><div class="stat-bar-fill" data-stat-fill="continuity" style="width:${width}%"></div></div>
                <div class="stat-value" data-stat-drift-type="continuity" data-base="${item.value}" data-current="${item.value}" data-min="0">${item.value}</div>
              </div>
              <div class="stat-range">${continuityLabel(item.value)}</div>
            </div>
          `;
        })
        .join('')}
      <div class="stat-legend">
        <span>100–70 continuità attiva</span>
        <span>69–40 continuità fragile</span>
        <span>39–15 continuità terminale</span>
        <span>14–0 continuità non rilevabile</span>
      </div>
    `;
  }

  const driftingNodes = Array.from(statPage.querySelectorAll('[data-stat-drift-type]'));
  if (driftingNodes.length) {
    const updateDrift = () => {
      driftingNodes.forEach((node) => {
        const current = Number(node.dataset.current || node.dataset.base || 0);
        const min = Number(node.dataset.min || 0);
        if (current <= min) return;

        const next = Math.max(min, current - 1);
        node.dataset.current = String(next);
        node.textContent = formatNumber(next);

        const type = node.dataset.statDriftType || '';
        const parent = node.closest('.stat-population-cell, .stat-birth-card, .stat-continuity-value');
        const fill = parent ? parent.querySelector(`[data-stat-fill="${type}"]`) : null;
        const base = Number(node.dataset.base || current || 1);
        if (fill && base > 0) {
          const percent = Math.max(3, (next / base) * 100);
          fill.style.width = `${Math.min(100, percent)}%`;
        }
      });
    };

    updateDrift();
    window.setInterval(updateDrift, 12000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeStatisticsPage);
} else {
  // If script is loaded after DOMContentLoaded, run immediately
  initializeStatisticsPage();
}

// Toggle sidebar-links on pages that include the toggle button
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById('toggle-sidebar');
    const sidebar = document.querySelector('.sidebar-links');
    if (!btn || !sidebar) return;
    /* btn.addEventListener('click', function(){
      const open = sidebar.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
      // switch symbol between + and ×
      btn.textContent = open ? '×' : '+';
    }); */
  });
})();




//pk.eyJ1IjoibWFydGlpbmFwcm9jb3BpbyIsImEiOiJjbW93cG4wYjkwMzhuNDhzZW9nbG84NjZyIn0.AqkBWyL51ozeXHUJR2snXg

// ── Loading Animation ──
function initializeLoadingAnimation() {
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingImageCenter = document.getElementById('loading-image');
  const loadingCoordinates = document.getElementById('loading-coordinates');
  const loadingGallery = document.getElementById('loading-gallery');
  const homeMap = document.getElementById('home-map');
  
  if (!loadingOverlay || !loadingImageCenter || !loadingCoordinates || !loadingGallery || !homeMap) return;

  // Fetch map data for images
  fetch('map-data.json')
    .then(res => res.json())
    .then(data => {
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) throw new Error('No items found');

      // Preload all images with array tracking to verify load state
      let preloadedImages = [];
      let preloadedCount = 0;
      const totalItems = items.length;
      
      items.forEach(item => {
        const img = new Image();
        img.onload = () => preloadedCount++;
        img.onerror = () => preloadedCount++;
        img.src = item.src;
        preloadedImages.push(img);
      });

      let currentIndex = 0;
      const imageDuration = 120; // Each image shows for 120ms (faster)
      const firstImageDuration = 600; // First image shows for 0.6 seconds (faster)
      const transitionDuration = 20; // Fade transition duration - very fast
      
      // Determine how many images to actually show (limit to 15)
      const maxSlides = Math.min(items.length, 25);

      // Wait for images to preload before starting slideshow
      const startSlideshow = () => {
        if (preloadedCount < totalItems) {
          setTimeout(startSlideshow, 50);
          return;
        }
        // Make map visible as slideshow starts
        if (homeMap) homeMap.classList.add('visible');
        showImage(0);
      };
      
      // Function to show image with coordinates
      function showImage(index) {
        if (index >= maxSlides) {
          startZoomPhase();
          return;
        }
        
        const item = items[index];
        const coords = item.coordinates; // [lng, lat]
        const coordsText = `(${coords[0].toFixed(2)}, ${coords[1].toFixed(2)})`;
        
        // Wait for image to load before displaying
        const img = preloadedImages[index];
        
        const displayAndScheduleNext = () => {
          loadingImageCenter.src = item.src;
          loadingImageCenter.classList.add('show');
          
          // First image gets reveal animation and longer display time
          if (index === 0) {
            loadingImageCenter.classList.add('first-image-reveal');
          }
          
          // Create individual spans for each character to enable digit-by-digit animation
          loadingCoordinates.innerHTML = '';
          [...coordsText].forEach((char, charIndex) => {
            const span = document.createElement('span');
            span.textContent = char;
            span.className = 'coord-char';
            span.style.display = 'inline-block';
            span.style.animationDelay = `${charIndex * 20}ms`;
            loadingCoordinates.appendChild(span);
          });
          
          loadingCoordinates.classList.add('show');
          
          // Determine display duration based on whether this is first image
          const displayDuration = index === 0 ? firstImageDuration : imageDuration;
          
          // Schedule next image AFTER image is shown and visible
          setTimeout(() => {
            loadingImageCenter.classList.remove('show');
            loadingImageCenter.classList.remove('first-image-reveal');
            loadingCoordinates.classList.remove('show');
            
            setTimeout(() => {
              showImage(index + 1);
            }, transitionDuration);
          }, displayDuration);
        };
        
        // Wait for image to be fully loaded before displaying
        if (img && !img.complete) {
          // Image not fully loaded yet, wait for load event
          img.addEventListener('load', displayAndScheduleNext, { once: true });
        } else {
          // Image already loaded or preloaded, display immediately
          displayAndScheduleNext();
        }
      }
      
      // Function to handle zoom/scatter phase
      function startZoomPhase() {
        // Fade out the central image and coordinates
        loadingImageCenter.classList.add('fade-out');
        loadingCoordinates.classList.add('fade-out');
        
        // After a brief delay, show the gallery with fade-in
        setTimeout(() => {
          loadingGallery.classList.add('show');
        }, 100);
        
        // Show gallery briefly (no scatter) and reveal the map quickly
        const map = window.procopioMap;

        // Show gallery UI without creating individual images
        loadingGallery.classList.add('show');

        // Ensure map is visible immediately
        if (homeMap) homeMap.classList.add('visible');

        // Fade out overlay shortly after revealing the map
        const quickFade = 350; // ms
        setTimeout(() => {
          loadingOverlay.classList.add('fade-out');
          if (typeof initProcopioTracking === 'function') {
            initProcopioTracking();
          }
        }, quickFade);
      }
      
      // Start showing images (shorter delay)
      setTimeout(() => {
        startSlideshow();
      }, 150);
    })
    .catch(err => {
      console.error('Error loading animation images:', err);
      // Fallback: skip animation after 2 seconds
      setTimeout(() => {
        loadingOverlay.classList.add('fade-out');
      }, 3000);
    });
}

document.addEventListener('DOMContentLoaded', initializeLoadingAnimation);

// Initialize Mapbox background on home page
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    const mapEl = document.getElementById('home-map');
    if (!mapEl || typeof mapboxgl === 'undefined') return;

    try {
      mapboxgl.accessToken = 'pk.eyJ1IjoibWFydGlpbmFwcm9jb3BpbyIsImEiOiJjbW93cG4wYjkwMzhuNDhzZW9nbG84NjZyIn0.AqkBWyL51ozeXHUJR2snXg';
      mapEl.style.display = 'block';
      mapEl.style.height = window.innerHeight + 'px';

      const bounds = [
        [12, 36], // Southwest coordinates
        [19.5, 42.5] // Northeast coordinates
      ];


      const map = new mapboxgl.Map({
        container: 'home-map',
        style: 'mapbox://styles/martiinaprocopio/cmowvc4ao001n01r5g7ad3t1i',
        center: [13, 39.5],
        zoom: 5,
        /* maxZoom: 8,
        minZoom: 5, */
        maxBounds: bounds
      });
      window.procopioMap = map;

      // Handle resize
      window.addEventListener('resize', () => {
        mapEl.style.height = window.innerHeight + 'px';
        map.resize();
      });

      // Logic for markers must be INSIDE the same block or passed the map variable
      map.on('load', async () => {
        console.log('Map loaded, fetching markers...');
        try {
          const response = await fetch('map-data.json');
          if (!response.ok) throw new Error('Network response was not ok');
          const mapData = await response.json();
          mapItems = Array.isArray(mapData.items) ? mapData.items : [];

          mapItems.forEach((item, index) => {
            // Create element
            const el = document.createElement('div');
            el.className = 'custom-marker pointer-events-auto'; // Tailwind helper
            el.innerHTML = `
              <div class="marker-content flex flex-col items-center">
                <img src="${item.src}" alt="${item.label}" 
                     style="width:100px; height:100px; object-fit:cover; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <span class="marker-label bg-white px-2 py-1 rounded text-xs font-bold mt-1 shadow-sm">${item.label}</span>
              </div>
            `;

            // Add to map
            new mapboxgl.Marker(el)
              .setLngLat(item.coordinates)
              .addTo(map);

            // Interaction
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              openMarkerModal(index);
            });
          });

          if (markerModalClose) markerModalClose.addEventListener('click', closeMarkerModal);
          if (markerModalPrev) markerModalPrev.addEventListener('click', () => navigateMarkerModal(-1));
          if (markerModalNext) markerModalNext.addEventListener('click', () => navigateMarkerModal(1));
          if (markerModalBackdrop) markerModalBackdrop.addEventListener('click', closeMarkerModal);
          document.addEventListener('keydown', (e) => {
            if (!markerModal || !markerModal.classList.contains('open')) return;
            if (e.key === 'ArrowLeft') navigateMarkerModal(-1);
            if (e.key === 'ArrowRight') navigateMarkerModal(1);
            if (e.key === 'Escape') closeMarkerModal();
          });
        } catch (err) {
          console.error('Error loading markers:', err);
        }
      });

    } catch (e) {
      console.error('Mapbox initialization failed:', e);
    }
  });
})();