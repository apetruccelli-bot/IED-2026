const rowsHost = document.getElementById('archive-rows');
const galleryHost = document.getElementById('archive-gallery');
const searchInput = document.getElementById('search');
const archiveToggleButtons = document.querySelectorAll('[data-archive-toggle]');
const archiveMobileFilterToggle = document.getElementById('archive-mobile-filter-toggle');
const archiveMobileFilterClose = document.getElementById('archive-mobile-filter-close');
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

function initializePageTransition() {
  const root = document.body;
  root.classList.add('page-transition');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.add('page-transition-ready');
    });
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || link.target === '_blank') return;

    const href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

    let targetUrl;
    try {
      targetUrl = new URL(link.href, window.location.href);
    } catch {
      return;
    }

    if (targetUrl.protocol !== window.location.protocol) return;
    if (targetUrl.pathname === window.location.pathname && targetUrl.hash === window.location.hash) return;

    event.preventDefault();
    root.classList.add('page-transition-leaving');

    window.setTimeout(() => {
      window.location.href = targetUrl.href;
    }, 260);
  });
}

const archiveRows = [
  { anno: '1964', autore: 'Scorza', regione: 'Calabria', abitanti: 'Meno di 10', documento: 'Fotografia' },
  { anno: '1965', autore: 'Varani', regione: 'Sicilia', abitanti: 'Tra 10 e 100', documento: 'Note di campo' },
  { anno: '1966', autore: 'Fiore', regione: 'Puglia', abitanti: 'Tra 100 e 1000', documento: '' },
  { anno: '1967', autore: 'Maffei', regione: 'Campania', abitanti: 'Piu di 1000', documento: '' },
  { anno: '1968', autore: 'Ferri', regione: '', abitanti: '', documento: '' },
];

let enrichedRows = [];
let allItems = [];
let mapItems = [];
let activeFilters = new Set();
let lbIndex = -1;
let lightboxItems = [];
let lightboxUseFilteredNavigation = true;
let markerIndex = -1;
let archiveFiltersVisible = false;
let manualToggle = false;
let archiveGridView = false;

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

function setArchiveFiltersVisible(visible) {
  archiveFiltersVisible = visible;

  if (rowsHost) {
    rowsHost.hidden = !visible;
  }

  if (stickyHeader) {
    stickyHeader.classList.toggle('is-open', visible);
  }

  // toggle full-screen overlay class on body so entire background fades to myWhite
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('archive-overlay-open', visible);
    document.body.classList.toggle('archive-mobile-filters-open', visible);
  }

  archiveToggleButtons.forEach((button) => {
    button.setAttribute('aria-expanded', String(visible));
  });

  if (archiveMobileFilterToggle) {
    archiveMobileFilterToggle.setAttribute('aria-expanded', String(visible));
  }
}

function renderFilters() {
  if (!rowsHost) return;

  const columns = buildFilterColumns();

  rowsHost.innerHTML = columns
  .map(
    ({ key, label, values }) => `
    <div class="flex flex-col ${key === 'year' ? 'archive-filter-column-year' : ''}">
      <div class="archive-filter-heading">${escapeHtml(label.charAt(0).toUpperCase() + label.slice(1))}</div>
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
                    ${towns.map((town) => `<p class="text-justify cursor-pointer select-none" data-filter-key="paese" data-filter-value="${escapeHtml(town)}">${escapeHtml(town)}</p>`).join('')}
                  </div>
                </div>
              `;
            })
            .join('')
        : values
            .map(
              (v) => {
                const year = Number(v);
                const isScrollableYear = key === 'year' && !Number.isNaN(year) && year > 1970;

                return `<p class="text-justify cursor-pointer select-none ${isScrollableYear ? 'archive-year-over-1970' : ''}" data-filter-key="${escapeHtml(key)}" data-filter-value="${escapeHtml(v)}">${escapeHtml(v)}</p>`;
              }
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

  setArchiveFiltersVisible(archiveFiltersVisible);
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
  updateArchiveFilterColorState();
  syncRegionExpansion();
  filterVisible(searchInput?.value || '');
}

function updateArchiveFilterColorState() {
  document.querySelectorAll('[data-filter-key][data-filter-value]').forEach((el) => {
    const key = el.dataset.filterKey || '';
    const value = el.dataset.filterValue || '';
    const currentToken = `${key}::${normalizeComparable(value)}`;

    el.classList.remove('opacity-50', 'opacity-100', 'archive-filter-muted', 'archive-filter-active');

    if (activeFilters.size === 0) {
      el.classList.add('archive-filter-active');
      return;
    }

    const activePaeseToken = [...activeFilters].find((token) => token.startsWith('paese::'));
    const isTown = key === 'paese';

    if (isTown && !activePaeseToken) {
      el.classList.add('archive-filter-active');
      return;
    }

    const isActive = activeFilters.has(currentToken);
    el.classList.toggle('archive-filter-active', isActive);
    el.classList.toggle('archive-filter-muted', !isActive);
  });
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
  const town = String(item.description || '').split(',')[0].trim();
  const year = item.year || '';

  return `
    <div data-item-index="${index}" class="group relative mb-20px inline-block w-full break-inside-avoid cursor-pointer px-module-sm pt-module-sm3 pb-module-sm3 md:pb-0 flex flex-col gap-module-sm3 md:gap-module-xxl">
      <img src="${escapeHtml(item.src)}" alt="${escapeHtml(rawCaption)}" class="gallery-image px-module-sm pt-module-sm3 pb-module-sm3 md:pb-0" loading="lazy">
      <div class="gallery-caption mt-10px">
        <div class="caption-row flex justify-between items-start">
          <div class="caption-year italic font-myText text-myBlack text-left">${escapeHtml(String(year))}</div>
          <div class="caption-meta italic font-myText text-myBlack text-right">${escapeHtml(author)}${author && town ? ` — ${escapeHtml(town)}` : (town ? escapeHtml(town) : '')}</div>
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

  document.querySelectorAll('#archive-gallery [data-item-index]').forEach((el) => {
    const image = el.querySelector('.gallery-image');
    if (image) {
      image.style.setProperty('transition', 'opacity 800ms cubic-bezier(.77,0,.175,1)', 'important');
    }
  });

  initializeArchiveScrollOpacity();
}

function initializeArchiveViewToggle() {
  const button = document.getElementById('archive-view-toggle');
  if (!button || !galleryHost) return;
  if (button.dataset.archiveViewToggleReady === 'true') return;
  button.dataset.archiveViewToggleReady = 'true';

  let isArchiveViewAnimating = false;

  button.addEventListener('click', () => {
    if (isArchiveViewAnimating) return;
    isArchiveViewAnimating = true;

    const nextGridView = !archiveGridView;

    galleryHost.classList.add('archive-view-transition-out');

    window.setTimeout(() => {
      archiveGridView = nextGridView;

      galleryHost.classList.toggle('archive-grid-view', archiveGridView);
      button.textContent = archiveGridView
        ? 'Vedi in colonna'
        : 'Vedi in griglia';

      filterVisible(searchInput?.value || '');

      galleryHost.classList.remove('archive-view-transition-out');
      galleryHost.classList.add('archive-view-transition-in');

      window.requestAnimationFrame(() => {
        galleryHost.classList.add('archive-view-transition-ready');
      });

      window.setTimeout(() => {
        galleryHost.classList.remove('archive-view-transition-in', 'archive-view-transition-ready');
        isArchiveViewAnimating = false;
      }, 620);
    }, 180);
  });
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

    if (archiveGridView) {
      el.classList.toggle('grid-dimmed', shouldHide);
      el.classList.remove('hidden');
      el.style.display = '';
    } else {
      el.classList.remove('grid-dimmed');
      el.classList.toggle('hidden', shouldHide);
      el.style.display = shouldHide ? 'none' : '';
    }
  });
}

function openLightbox(index, items = allItems, useFilteredNavigation = true) {
  lbIndex = index;
  lightboxItems = Array.isArray(items) ? items : allItems;
  lightboxUseFilteredNavigation = useFilteredNavigation;
  const item = lightboxItems[lbIndex];

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
  if (!markerModal || !markerModalImg || !markerModalDesc) {
    openLightbox(index, mapItems, false);
    return;
  }

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
  const items = lightboxItems.length ? lightboxItems : allItems;

  if (!lightboxUseFilteredNavigation) {
    if (!items.length) return;

    let nextIndex = lbIndex + direction;
    if (nextIndex >= items.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = items.length - 1;
    openLightbox(nextIndex, items, false);
    return;
  }

  const visible = [...document.querySelectorAll('[data-item-index]:not(.hidden)')];
  const currentPos = visible.findIndex((el) => Number(el.dataset.itemIndex) === lbIndex);
  let nextPos = currentPos + direction;
  if (nextPos >= visible.length) nextPos = 0;
  if (nextPos < 0) nextPos = visible.length - 1;
  openLightbox(Number(visible[nextPos].dataset.itemIndex), allItems, true);
}

if (lbClose) lbClose.addEventListener('click', closeLightbox);
if (lbBackdrop) lbBackdrop.addEventListener('click', closeLightbox);
if (lbPrev) lbPrev.addEventListener('click', () => navigateLightbox(-1));
if (lbNext) lbNext.addEventListener('click', () => navigateLightbox(1));

archiveToggleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setArchiveFiltersVisible(true);
  });
});

if (archiveMobileFilterToggle) {
  archiveMobileFilterToggle.addEventListener('click', () => {
    manualToggle = true;
    setArchiveFiltersVisible(true);
  });
}

if (archiveMobileFilterClose) {
  archiveMobileFilterClose.addEventListener('click', () => {
    manualToggle = false;
    setArchiveFiltersVisible(false);
  });
}
// show filters on hover; keep the panel open while moving between header and archive rows
const stickyHeader = document.querySelector('.archive-page .sticky:not(.story-sticky)');
if (stickyHeader) {
  let archiveFiltersCloseTimer = 0;

  const cancelArchiveFiltersClose = () => {
    if (archiveFiltersCloseTimer) {
      window.clearTimeout(archiveFiltersCloseTimer);
      archiveFiltersCloseTimer = 0;
    }
  };

  const scheduleArchiveFiltersClose = () => {
    cancelArchiveFiltersClose();
    archiveFiltersCloseTimer = window.setTimeout(() => {
      const headerHovered = stickyHeader.matches(':hover');
      const rowsHovered = rowsHost && rowsHost.matches(':hover');

      if (!headerHovered && !rowsHovered) {
        setArchiveFiltersVisible(false);
      }
    }, 180);
  };

  stickyHeader.addEventListener('mouseenter', () => {
    cancelArchiveFiltersClose();
    setArchiveFiltersVisible(true);
  });

  stickyHeader.addEventListener('mouseleave', scheduleArchiveFiltersClose);

  if (rowsHost) {
    rowsHost.addEventListener('mouseenter', () => {
      cancelArchiveFiltersClose();
      setArchiveFiltersVisible(true);
    });

    rowsHost.addEventListener('mouseleave', scheduleArchiveFiltersClose);
  }

  // support basic touch toggling for mobile: tap header to toggle filters
  stickyHeader.addEventListener('touchstart', (e) => {
    manualToggle = !manualToggle;
    setArchiveFiltersVisible(manualToggle);
    // prevent immediate mouse events
    e.preventDefault();
  }, { passive: false });
}

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

setArchiveFiltersVisible(false);

hydrateRowsWithImages()
  .then(() => {
    renderAll();
    initializeArchiveViewToggle();
  })
  .catch(() => {
    enrichedRows = [...archiveRows];
    renderAll();
    initializeArchiveViewToggle();
  });

function initializeArchiveScrollOpacity() {
  const archiveItems = Array.from(document.querySelectorAll('#archive-gallery [data-item-index]'));

  if (!archiveItems.length) return;

  archiveItems.forEach((item, index) => {
    item.classList.add('archive-fade');
    item.style.setProperty('--enter-delay', `${20 + Math.min(index, 12) * 12}ms`);
    item.style.setProperty('--parallax-shift', `${12 + (index % 5) * 2}px`);
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    archiveItems.forEach((item) => item.classList.add('archive-fade--visible'));
    return;
  }

  window.setTimeout(() => {
    archiveItems.forEach((item) => item.classList.add('archive-fade--visible'));
  }, 240);
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



function getStoryScroller() {
  const mainScroll = document.getElementById('main-scroll');
  if (!mainScroll) return null;

  const style = window.getComputedStyle(mainScroll);
  const useMainScroll =
    mainScroll.scrollHeight > mainScroll.clientHeight + 2 &&
    /(auto|scroll)/.test(style.overflowY);

  const getWindowTop = () =>
    window.pageYOffset ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0;

  return {
    mainScroll,
    useMainScroll,
    root: useMainScroll ? mainScroll : null,

    getTop() {
      return useMainScroll ? mainScroll.scrollTop : getWindowTop();
    },

    getMaxTop() {
      if (useMainScroll) {
        return Math.max(0, mainScroll.scrollHeight - mainScroll.clientHeight);
      }

      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    },

    scrollTo(top, behavior = 'smooth') {
      const safeTop = Math.max(0, top);

      if (useMainScroll) {
        mainScroll.scrollTo({ top: safeTop, behavior });
      } else {
        window.scrollTo({ top: safeTop, behavior });
      }
    },

    getViewportRect() {
      if (useMainScroll) return mainScroll.getBoundingClientRect();
      return { top: 0, bottom: window.innerHeight };
    },

    getTargetTop(target, headerOffset = 80) {
      if (useMainScroll) {
        const containerRect = mainScroll.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        return mainScroll.scrollTop + (targetRect.top - containerRect.top) - headerOffset;
      }

      return getWindowTop() + target.getBoundingClientRect().top - headerOffset;
    },

    addScrollListener(callback) {
      const target = useMainScroll ? mainScroll : window;
      target.addEventListener('scroll', callback, { passive: true });
    },
  };
}

// Handle smooth scrolling for section anchors, both with body scroll and #main-scroll scroll.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const scroller = getStoryScroller();
    if (!scroller) return;

    const headerOffset = 80;

    document.querySelectorAll('a[href^="#sezione_"]').forEach((link) => {
      link.addEventListener('click', function (event) {
        const id = this.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (!target) return;

        event.preventDefault();
        scroller.scrollTo(scroller.getTargetTop(target, headerOffset), 'smooth');
      });
    });
  });
})();


// Progressive opacity for sticky section anchors.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const scroller = getStoryScroller();
    if (!scroller) return;

    const mainScroll = scroller.mainScroll;
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
      const scrollTop = scroller.getTop();
      const currentPosition = scrollTop + headerOffset;
      const containerRect = scroller.getViewportRect();

      let activeIndex = -1;

      sectionTargets.forEach(({ target }, index) => {
        let sectionTop;

        if (scroller.useMainScroll) {
          sectionTop = target.getBoundingClientRect().top - containerRect.top + scrollTop;
        } else {
          sectionTop = target.getBoundingClientRect().top + scrollTop;
        }

        const sectionStart = Math.max(0, sectionTop - headerOffset);
        if (currentPosition >= sectionStart) activeIndex = index;
      });

      // CHANGE OPACOITY TO STICKY ANCHORS AS IT SCROLLS
      sectionTargets.forEach(({ link }, index) => {
        //link.style.opacity = index === activeIndex ? '1' : '.3';
        link.style.color = index === activeIndex ? '#000000' : '#909090';
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
    scroller.addScrollListener(requestUpdate);
    window.addEventListener('resize', requestUpdate, { passive: true });
  });
})();

function initializeStoryBackToTop() {
  if (
    !document.body.classList.contains('story-page') &&
    !document.body.classList.contains('stat-page')
  ) {
    return;
  }

  const scroller = getStoryScroller();
  const backToTopButton = document.querySelector('[data-story-back-to-top]');
  if (!scroller || !backToTopButton) return;

  if (backToTopButton.parentElement !== document.body) {
    document.body.appendChild(backToTopButton);
  }

  const headerOffset = 80;
  const sectionTolerance = 44;

  const getSectionTop = (section) => scroller.getTargetTop(section, headerOffset);

  const getSections = () => {
    const navLinks = Array.from(document.querySelectorAll('[data-story-top-nav] a[href^="#sezione_"]'));
    const navSections = navLinks
      .map((link) => {
        const id = link.getAttribute('href')?.slice(1);
        return id ? document.getElementById(id) : null;
      })
      .filter(Boolean);

    if (navSections.length) {
      return navSections.filter((section, index, sections) => sections.indexOf(section) === index);
    }

    return [...document.querySelectorAll('[id^="sezione_"]')]
      .filter((section) => section.id !== 'sezione_8')
      .sort((a, b) => {
        const aNumber = Number((a.id.match(/\d+$/) || ['0'])[0]);
        const bNumber = Number((b.id.match(/\d+$/) || ['0'])[0]);
        return aNumber - bNumber;
      });
  };

  const isAtBottom = () => scroller.getTop() >= scroller.getMaxTop() - 8;

  const getCurrentSectionIndex = () => {
    const sections = getSections();
    const currentScroll = scroller.getTop();
    let currentIndex = 0;

    sections.forEach((section, index) => {
      const top = getSectionTop(section);

      if (currentScroll >= top - sectionTolerance) {
        currentIndex = index;
      }
    });

    if (isAtBottom()) return Math.max(0, sections.length - 1);
    return currentIndex;
  };

  const getNextSection = () => {
    const sections = getSections();
    const currentScroll = scroller.getTop();
    const next = sections.find((section) => getSectionTop(section) > currentScroll + sectionTolerance);
    return next || null;
  };

  const updateButtonLabel = () => {
    const sections = getSections();
    const currentIndex = getCurrentSectionIndex();
    const isLastSection = sections.length > 0 && currentIndex >= sections.length - 1;

    backToTopButton.textContent = isLastSection
      ? 'Torna in cima'
      : 'Prossima sezione';

    backToTopButton.classList.add('is-visible');
    backToTopButton.setAttribute('aria-hidden', 'false');
    backToTopButton.setAttribute(
      'aria-label',
      isLastSection ? 'Torna in cima' : 'Vai alla sezione successiva'
    );
  };

  const scrollNavigation = () => {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const sections = getSections();
    const currentIndex = getCurrentSectionIndex();
    const isLastSection = sections.length > 0 && currentIndex >= sections.length - 1;

    if (isLastSection) {
      scroller.scrollTo(0, behavior);
      return;
    }

    const nextSection = getNextSection();
    if (!nextSection) {
      scroller.scrollTo(0, behavior);
      return;
    }

    scroller.scrollTo(getSectionTop(nextSection), behavior);
  };

  backToTopButton.addEventListener('click', (event) => {
    event.preventDefault();
    scrollNavigation();
    window.setTimeout(updateButtonLabel, 260);
    window.setTimeout(updateButtonLabel, 720);
  });

  let rafId = 0;
  const requestUpdate = () => {
    if (rafId) return;

    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      updateButtonLabel();
    });
  };

  scroller.addScrollListener(requestUpdate);
  window.addEventListener('resize', requestUpdate, { passive: true });

  updateButtonLabel();
}

function initializeStatisticsPage() {
  if (!document.body.classList.contains('stat-page')) return;

  const statPage = document.getElementById('main-scroll') || document.body;
  const formatInteger = (value) => new Intl.NumberFormat('it-IT').format(Math.max(0, Math.round(value)));
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const housesHost = document.getElementById('houses-chart');
  if (housesHost && !housesHost.querySelector('svg')) {
    housesHost.classList.add('stat-chart--houses');
    housesHost.innerHTML = `
      <svg viewBox="0 0 520 290" xmlns="http://www.w3.org/2000/svg" class="block w-full h-auto stat-svg--houses" aria-labelledby="houses-chart-title houses-chart-desc" role="img" style="font-family: 'Diatype', serif;">
        <style type="text/css"><![CDATA[
          text {
            font-family: 'Diatype-Mono', 'Diatype', sans-serif !important;
            font-weight: 400 !important;
            letter-spacing: 0.01em !important;
            text-rendering: optimizeLegibility !important;
            shape-rendering: geometricPrecision !important;
            text-transform: none !important;
            font-size: 10px !important;
          }
          .small { font-size: 10px !important; }
          .axis { stroke: #1E1E1E; stroke-width: 1; }
          .b1, .legend-b1 { fill: #1E1E1E; }
          .b2, .legend-b2 { fill: #5C5C5C; }
          .b3, .legend-b3 { fill: #A0A0A0; }
        ]]></style>
        <title id="houses-chart-title">Case occupate</title>
        <desc id="houses-chart-desc">Confronto tra case costruite, occupate e attive per Zagara, Monteferro e Borgo Cupo.</desc>
        <g class="houses-chart-inner" transform="translate(-30 0)">
        <line x1="60" y1="240" x2="490" y2="240" class="axis"/>
        <line x1="60" y1="40" x2="60" y2="240" class="axis"/>
        <rect x="90" y="85" width="28" height="155" class="b1"/>
        <rect x="123" y="190" width="28" height="50" class="b2"/>
        <rect x="156" y="220" width="28" height="20" class="b3"/>
        <text x="104" y="78" class="small" text-anchor="middle">612</text>
        <text x="137" y="183" class="small" text-anchor="middle">189</text>
        <text x="170" y="213" class="small" text-anchor="middle">74</text>
        <text x="137" y="265" class="small" text-anchor="middle">ZAGARA</text>
        <rect x="240" y="130" width="28" height="110" class="b1"/>
        <rect x="273" y="210" width="28" height="30" class="b2"/>
        <rect x="306" y="230" width="28" height="10" class="b3"/>
        <text x="254" y="123" class="small" text-anchor="middle">431</text>
        <text x="287" y="203" class="small" text-anchor="middle">102</text>
        <text x="320" y="223" class="small" text-anchor="middle">39</text>
        <text x="287" y="265" class="small" text-anchor="middle">MONTEFERRO</text>
        <rect x="390" y="168" width="28" height="72" class="b1"/>
        <rect x="423" y="230" width="28" height="10" class="b2"/>
        <rect x="456" y="236" width="28" height="4" class="b3"/>
        <text x="404" y="161" class="small" text-anchor="middle">288</text>
        <text x="437" y="223" class="small" text-anchor="middle">41</text>
        <text x="470" y="230" class="small" text-anchor="middle">12</text>
        <text x="437" y="265" class="small" text-anchor="middle">BORGO CUPO</text>
        <rect x="150" y="12" width="7" height="7" class="legend-b1"/>
        <text x="165" y="20" class="small">COSTRUITE</text>
        <rect x="265" y="12" width="7" height="7" class="legend-b2"/>
        <text x="280" y="20" class="small">OCCUPATE</text>
        <rect x="380" y="12" width="7" height="7" class="legend-b3"/>
        <text x="395" y="20" class="small">ATTIVE</text>
        </g>
      </svg>
    `;
  }

  const charts = Array.from(statPage.querySelectorAll('[data-stat-chart]'));
  const getSvg = (chart) => chart.matches('svg') ? chart : chart.querySelector('svg');
  const numberPattern = /^\s*(\d+(?:[.,]\d+)?)(%)?\s*$/;
  const trailingNumberPattern = /^(.*?)(\d+(?:[.,]\d+)?)(%)?\s*$/;
  const randomDelay = () => 5000 + Math.random() * 5000;
  const randomItem = (items) => items[Math.floor(Math.random() * items.length)];

  const parseNumericText = (text) => {
    const match = String(text || '').trim().match(numberPattern);
    if (!match) return null;
    return {
      value: Number(match[1].replace(',', '.')),
      suffix: match[2] || '',
      decimals: match[1].includes('.') || match[1].includes(',') ? 1 : 0,
      prefix: '',
    };
  };

  const parseTrailingNumericText = (text) => {
    const match = String(text || '').trim().match(trailingNumberPattern);
    if (!match) return null;
    return {
      prefix: match[1] || '',
      value: Number(match[2].replace(',', '.')),
      suffix: match[3] || '',
      decimals: match[2].includes('.') || match[2].includes(',') ? 1 : 0,
    };
  };

  const renderLiveValue = (node) => {
    const current = Number(node.dataset.statCurrent || node.dataset.statValue || 0);
    const decimals = Number(node.dataset.statDecimals || 0);
    const suffix = node.dataset.statSuffix || '';
    const prefix = node.dataset.statPrefix || '';
    const number = decimals ? current.toFixed(decimals) : formatInteger(current);
    node.textContent = `${prefix}${number}${suffix}`;
  };

  const registerLiveNode = (node, parsed, options = {}) => {
    if (!node || !parsed || !Number.isFinite(parsed.value)) return;
    node.dataset.statLive = 'true';
    node.dataset.statValue = String(parsed.value);
    node.dataset.statCurrent = String(options.current ?? parsed.value);
    node.dataset.statPrefix = parsed.prefix || '';
    node.dataset.statSuffix = parsed.suffix || '';
    node.dataset.statDecimals = String(options.decimals ?? parsed.decimals ?? 0);
    renderLiveValue(node);
  };

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const animate = (duration, draw) => {
    if (prefersReducedMotion) {
      draw(1);
      return;
    }

    const start = performance.now();
    const frame = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      draw(easeOutCubic(progress));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  const fadePulse = (...nodes) => {
    nodes.filter(Boolean).forEach((node) => {
      node.style.transition = 'opacity 760ms cubic-bezier(.77,0,.175,1)';
      node.style.opacity = '.35';
      window.setTimeout(() => {
        node.style.opacity = '1';
      }, 80);
    });
  };

  const getLineRevealBox = (line) => {
    if (!line || typeof line.getBBox !== 'function') return null;
    try {
      const box = line.getBBox();
      return {
        x: Math.floor(box.x) - 2,
        y: Math.floor(box.y) - 8,
        width: Math.ceil(box.width) + 16,
        height: Math.ceil(box.height) + 16,
      };
    } catch {
      return null;
    }
  };

  const prepareLineRevealClip = (line, index) => {
    const svg = line.ownerSVGElement;
    if (!svg) return null;

    let defs = svg.querySelector('defs[data-stat-line-defs="true"]');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.setAttribute('data-stat-line-defs', 'true');
      svg.insertBefore(defs, svg.firstChild);
    }

    const id = `stat-line-reveal-${index}-${Math.random().toString(36).slice(2)}`;
    const clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clip.setAttribute('id', id);
    clip.setAttribute('clipPathUnits', 'userSpaceOnUse');

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    clip.appendChild(rect);
    defs.appendChild(clip);

    line.dataset.statClipId = id;
    line.setAttribute('clip-path', `url(#${id})`);
    line.style.strokeDasharray = 'none';
    line.style.strokeDashoffset = '0';
    line.style.transition = 'none';

    return rect;
  };

  const setupLineBuild = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;

    svg.querySelectorAll('polyline.line, path.line').forEach((line, index) => {
      let rect = line.dataset.statClipId
        ? svg.querySelector(`#${CSS.escape(line.dataset.statClipId)} rect`)
        : null;
      if (!rect) rect = prepareLineRevealClip(line, index);
      if (!rect) return;

      const box = getLineRevealBox(line);
      if (!box) return;

      rect.dataset.statTargetWidth = String(box.width);
      rect.setAttribute('x', String(box.x));
      rect.setAttribute('y', String(box.y));
      rect.setAttribute('height', String(box.height));
      rect.setAttribute('width', '0');
    });
  };

  const playLineBuild = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;

    svg.querySelectorAll('polyline.line, path.line').forEach((line, index) => {
      const rect = line.dataset.statClipId
        ? svg.querySelector(`#${CSS.escape(line.dataset.statClipId)} rect`)
        : null;
      if (!rect) return;

      const targetWidth = Number(rect.dataset.statTargetWidth || 0);
      if (!targetWidth) return;

      rect.setAttribute('width', '0');
      window.setTimeout(() => {
        animate(950, (t) => rect.setAttribute('width', String(targetWidth * t)));
      }, index * 90);
    });
  };

  const ageBarLabelGap = 10;

  const syncAgeBarLabel = (rect, width = null) => {
    if (!rect) return;
    const label = rect.nextElementSibling;
    if (!label || label.tagName.toLowerCase() !== 'text') return;
    const x = Number(rect.getAttribute('x') || 0);
    const currentWidth = width == null ? Number(rect.getAttribute('width') || 0) : Number(width);
    if (!Number.isFinite(x) || !Number.isFinite(currentWidth)) return;
    label.setAttribute('x', String(x + currentWidth + ageBarLabelGap));
  };

  const syncHouseBarLabel = (rect, y = null) => {
    if (!rect) return;
    const svg = rect.ownerSVGElement;
    if (!svg) return;
    const dataRects = Array.from(svg.querySelectorAll('rect.b1, rect.b2, rect.b3'));
    const index = dataRects.indexOf(rect);
    if (index < 0) return;
    const label = Array.from(svg.querySelectorAll('text.small[data-stat-live="true"]'))[index];
    if (!label) return;
    const rectX = Number(rect.getAttribute('x') || 0);
    const rectWidth = Number(rect.getAttribute('width') || 0);
    const currentY = y == null ? Number(rect.getAttribute('y') || 0) : Number(y);
    if (!Number.isFinite(rectX) || !Number.isFinite(rectWidth) || !Number.isFinite(currentY)) return;
    label.setAttribute('x', String(rectX + rectWidth / 2));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('y', String(currentY - 7));
  };

  const setupBarsRight = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;

    const rightRows = Array.from(svg.querySelectorAll('rect.bar')).map((rect) => {
      const label = rect.nextElementSibling;
      const parsed = label ? parseNumericText(label.textContent) : null;
      const y = Number(rect.getAttribute('y') || 0);
      if (!parsed || !Number.isFinite(parsed.value)) return null;
      return { rect, label, y, value: parsed.value, scale: Number(rect.getAttribute('width') || 0) / parsed.value };
    }).filter(Boolean);

    rightRows.forEach(({ rect, label, value, scale, y }) => {
      let current = value;
      if (y === 98) current = 36;
      if (y === 130) current = 54;
      rect.dataset.statScale = String(scale || 3);
      rect.dataset.statCurrent = String(current);
      rect.dataset.statTargetWidth = String(current * (scale || 3));
      rect.setAttribute('width', String(current * (scale || 3)));
      registerLiveNode(label, { value: current, suffix: '%', prefix: '', decimals: 0 }, { current, decimals: 0 });
      syncAgeBarLabel(rect, current * (scale || 3));
    });

    svg.querySelectorAll('rect.bar2').forEach((rect) => {
      if (!rect.dataset.statTargetWidth) rect.dataset.statTargetWidth = rect.getAttribute('width') || '0';
      syncAgeBarLabel(rect, Number(rect.dataset.statTargetWidth || rect.getAttribute('width') || 0));
    });
  };

  const resetBarsRight = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('rect.bar, rect.bar2').forEach((rect) => {
      if (!rect.dataset.statTargetWidth) rect.dataset.statTargetWidth = rect.getAttribute('width') || '0';
      rect.setAttribute('width', '0');
      syncAgeBarLabel(rect, 0);
    });
  };

  const playBarsRight = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('rect.bar, rect.bar2').forEach((rect, index) => {
      const target = Number(rect.dataset.statTargetWidth || rect.getAttribute('width') || 0);
      const label = rect.nextElementSibling;
      window.setTimeout(() => {
        fadePulse(label, rect);
        animate(780, (t) => {
          const width = target * t;
          rect.setAttribute('width', String(width));
          syncAgeBarLabel(rect, width);
        });
      }, index * 45);
    });
  };

  const setupBirths = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('text.num').forEach((text) => {
      const x = Number(text.getAttribute('x') || 0);
      const parsed = parseNumericText(text.textContent);
      if (parsed && x >= 430) registerLiveNode(text, parsed, { decimals: 0 });
    });
  };

  const setupServices = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  };

  const setupRectGrow = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;

    const dataRects = Array.from(svg.querySelectorAll('rect.b1, rect.b2, rect.b3'));
    const numericTexts = Array.from(svg.querySelectorAll('text.small')).filter((text) => parseNumericText(text.textContent));

    dataRects.forEach((rect, index) => {
      if (!rect.dataset.statTargetY) rect.dataset.statTargetY = rect.getAttribute('y') || '300';
      if (!rect.dataset.statTargetHeight) rect.dataset.statTargetHeight = rect.getAttribute('height') || '0';
      if (!rect.dataset.statBaseline) rect.dataset.statBaseline = String(Number(rect.dataset.statTargetY) + Number(rect.dataset.statTargetHeight));

      const text = numericTexts[index];
      const parsed = text ? parseNumericText(text.textContent) : null;
      if (!parsed) return;

      const kind = rect.classList.contains('b1') ? 'built' : rect.classList.contains('b2') ? 'occupied' : 'active';
      rect.dataset.statHouseKind = kind;
      rect.dataset.statCurrent = String(parsed.value);
      rect.dataset.statScale = String(Number(rect.dataset.statTargetHeight || 0) / parsed.value || 1);
      text.dataset.statHouseKind = kind;
      text.dataset.statHouseRectIndex = String(index);
      registerLiveNode(text, parsed, { decimals: 0 });
    });
  };

  const resetRectGrow = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('rect.b1, rect.b2, rect.b3').forEach((rect) => {
      const baseline = Number(rect.dataset.statBaseline || 300);
      rect.setAttribute('y', String(baseline));
      rect.setAttribute('height', '0');
      syncHouseBarLabel(rect, baseline);
    });
  };

  const playRectGrow = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('rect.b1, rect.b2, rect.b3').forEach((rect, index) => {
      const baseline = Number(rect.dataset.statBaseline || 300);
      const targetHeight = Number(rect.dataset.statTargetHeight || 0);
      window.setTimeout(() => {
        const label = Array.from(svg.querySelectorAll('text.small[data-stat-live="true"]'))[index];
        fadePulse(rect, label);
        animate(900, (t) => {
          const height = targetHeight * t;
          const y = baseline - height;
          rect.setAttribute('height', String(height));
          rect.setAttribute('y', String(y));
          syncHouseBarLabel(rect, y);
        });
      }, index * 45);
    });
  };

  const setupLinePosition = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('line.value').forEach((line) => {
      if (!line.dataset.statTargetX2) line.dataset.statTargetX2 = line.getAttribute('x2') || line.getAttribute('x1') || '0';
      line.dataset.statScale = String((Number(line.previousElementSibling?.getAttribute('x2') || line.getAttribute('x2') || 430) - Number(line.getAttribute('x1') || 125)) / 100);
    });
    svg.querySelectorAll('text').forEach((text) => {
      const x = Number(text.getAttribute('x') || 0);
      const parsed = parseNumericText(text.textContent);
      if (parsed && x >= 390) registerLiveNode(text, parsed, { decimals: 0 });
    });
  };

  const resetLinePosition = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('line.value').forEach((line) => line.setAttribute('x2', line.getAttribute('x1') || '0'));
  };

  const playLinePosition = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('line.value').forEach((line, index) => {
      const startX = Number(line.getAttribute('x1') || 0);
      const targetX = Number(line.dataset.statTargetX2 || startX);
      window.setTimeout(() => animate(760, (t) => line.setAttribute('x2', String(startX + (targetX - startX) * t))), index * 60);
    });
  };

  const setupPopulationLiveLabels = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('text').forEach((text, index) => {
      const x = Number(text.getAttribute('x') || 0);
      if (x < 390) return;
      const parsed = parseTrailingNumericText(text.textContent);
      if (!parsed) return;
      registerLiveNode(text, parsed, { decimals: 0 });
      text.dataset.statPopulationIndex = String(index);
    });
  };

  const playChart = (chart) => {
    const type = chart.dataset.statChart;
    if (type === 'line-build') playLineBuild(chart);
    if (type === 'bars-right') playBarsRight(chart);
    if (type === 'rect-grow') playRectGrow(chart);
    if (type === 'line-position') playLinePosition(chart);
  };

  charts.forEach((chart) => {
    const type = chart.dataset.statChart;
    if (type === 'line-build') {
      setupPopulationLiveLabels(chart);
      setupLineBuild(chart);
    }
    if (type === 'bars-right') setupBarsRight(chart);
    if (type === 'number-count' && chart.classList.contains('stat-chart--births')) setupBirths(chart);
    if (type === 'number-count' && chart.classList.contains('stat-chart--services')) setupServices(chart);
    if (type === 'rect-grow') setupRectGrow(chart);
    if (type === 'line-position') setupLinePosition(chart);
    if (type === 'bars-right') resetBarsRight(chart);
    if (type === 'rect-grow') resetRectGrow(chart);
    if (type === 'line-position') resetLinePosition(chart);
  });

  const activeCharts = new WeakSet();
  const playedCharts = new WeakSet();
  const scroller = typeof getStoryScroller === 'function' ? getStoryScroller() : null;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const chart = entry.target;
        if (entry.isIntersecting) {
          activeCharts.add(chart);
          if (!playedCharts.has(chart)) {
            playedCharts.add(chart);
            playChart(chart);
          }
        } else {
          activeCharts.delete(chart);
        }
      });
    },
    {
      root: scroller ? scroller.root : null,
      threshold: 0.35,
      rootMargin: '0px 0px -10% 0px',
    }
  );

  charts.forEach((chart) => observer.observe(chart));

  const scheduleRandomLoop = (chart, callback) => {
    const run = () => {
      window.setTimeout(() => {
        if (activeCharts.has(chart)) callback();
        run();
      }, randomDelay());
    };
    run();
  };

  const updatePopulation = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    const labels = Array.from(svg.querySelectorAll('text[data-stat-live="true"]')).filter((text) => Number(text.getAttribute('x') || 0) >= 390);
    const lines = Array.from(svg.querySelectorAll('polyline.line'));
    if (!labels.length || !lines.length) return;

    const index = Math.floor(Math.random() * Math.min(labels.length, lines.length));
    const label = labels[index];
    const line = lines[index];
    const current = Number(label.dataset.statCurrent || label.dataset.statValue || 0);
    if (!Number.isFinite(current) || current <= 0) return;

    label.dataset.statCurrent = String(current - 1);
    renderLiveValue(label);

    const points = (line.getAttribute('points') || '').trim().split(/\s+/).filter(Boolean).map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return pair;
      return `${x},${y + 1}`;
    }).join(' ');
    if (points) line.setAttribute('points', points);

    const dots = Array.from(svg.querySelectorAll('circle.dot')).slice(index * 6, index * 6 + 6);
    dots.forEach((dot) => {
      const cy = Number(dot.getAttribute('cy') || 0);
      if (Number.isFinite(cy)) dot.setAttribute('cy', String(cy + 1));
    });
    fadePulse(label, line, ...dots);
  };

  const updateAge = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    const row36 = Array.from(svg.querySelectorAll('rect.bar')).find((rect) => Number(rect.getAttribute('y') || 0) === 98);
    const row65 = Array.from(svg.querySelectorAll('rect.bar')).find((rect) => Number(rect.getAttribute('y') || 0) === 130);
    if (!row36 || !row65) return;

    const label36 = row36.nextElementSibling;
    const label65 = row65.nextElementSibling;
    const current65 = Number(label65?.dataset.statCurrent || 54);
    const current36 = Number(label36?.dataset.statCurrent || 36);
    if (current65 >= 62) return;

    const next65 = current65 + 1;
    const next36 = Math.max(0, current36 - 1);
    const scale65 = Number(row65.dataset.statScale || 3);
    const scale36 = Number(row36.dataset.statScale || 3);

    label65.dataset.statCurrent = String(next65);
    label36.dataset.statCurrent = String(next36);
    row65.dataset.statCurrent = String(next65);
    row36.dataset.statCurrent = String(next36);
    row65.dataset.statTargetWidth = String(next65 * scale65);
    row36.dataset.statTargetWidth = String(next36 * scale36);

    renderLiveValue(label65);
    renderLiveValue(label36);

    const start65Width = Number(row65.getAttribute('width') || 0);
    const start36Width = Number(row36.getAttribute('width') || 0);
    const target65Width = next65 * scale65;
    const target36Width = next36 * scale36;

    fadePulse(label65, label36, row65, row36);
    animate(900, (t) => {
      const width65 = start65Width + (target65Width - start65Width) * t;
      const width36 = start36Width + (target36Width - start36Width) * t;
      row65.setAttribute('width', String(width65));
      row36.setAttribute('width', String(width36));
      syncAgeBarLabel(row65, width65);
      syncAgeBarLabel(row36, width36);
    });
  };

  const updateBirths = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    const labels = Array.from(svg.querySelectorAll('text.num[data-stat-live="true"]')).filter((text) => Number(text.getAttribute('x') || 0) >= 430);
    const label = randomItem(labels);
    if (!label) return;
    const current = Number(label.dataset.statCurrent || label.dataset.statValue || 0);
    label.dataset.statCurrent = String(current + 1);
    renderLiveValue(label);
    fadePulse(label);
  };

  const updateHouses = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    const rects = Array.from(svg.querySelectorAll('rect.b2, rect.b3')).filter((rect) => Number(rect.dataset.statCurrent || 0) > 0);
    const rect = randomItem(rects);
    if (!rect) return;

    const dataRects = Array.from(svg.querySelectorAll('rect.b1, rect.b2, rect.b3'));
    const index = dataRects.indexOf(rect);
    const texts = Array.from(svg.querySelectorAll('text.small[data-stat-live="true"]'));
    const label = texts[index];
    const current = Number(rect.dataset.statCurrent || label?.dataset.statCurrent || 0);
    if (!Number.isFinite(current) || current <= 0) return;

    const next = current - 1;
    const scale = Number(rect.dataset.statScale || 1);
    const baseline = Number(rect.dataset.statBaseline || 240);
    const nextHeight = Math.max(0, next * scale);
    const nextY = baseline - nextHeight;

    rect.dataset.statCurrent = String(next);
    rect.dataset.statTargetHeight = String(nextHeight);
    rect.dataset.statTargetY = String(nextY);

    if (label) {
      label.dataset.statCurrent = String(next);
      renderLiveValue(label);
    }

    const startHeight = Number(rect.getAttribute('height') || 0);
    const startY = Number(rect.getAttribute('y') || baseline);

    fadePulse(rect, label);
    animate(900, (t) => {
      const height = startHeight + (nextHeight - startHeight) * t;
      const y = startY + (nextY - startY) * t;
      rect.setAttribute('height', String(height));
      rect.setAttribute('y', String(y));
      syncHouseBarLabel(rect, y);
    });
  };

  const updateContinuity = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    const labels = Array.from(svg.querySelectorAll('text[data-stat-live="true"]')).filter((text) => Number(text.dataset.statCurrent || 0) > 0);
    const label = randomItem(labels);
    if (!label) return;

    const labelsInOrder = Array.from(svg.querySelectorAll('text[data-stat-live="true"]'));
    const lines = Array.from(svg.querySelectorAll('line.value'));
    const index = labelsInOrder.indexOf(label);
    const line = lines[index];
    const current = Number(label.dataset.statCurrent || label.dataset.statValue || 0);
    if (!Number.isFinite(current) || current <= 0) return;

    const next = current - 1;
    label.dataset.statCurrent = String(next);
    renderLiveValue(label);

    if (line) {
      const x1 = Number(line.getAttribute('x1') || 140);
      const scale = Number(line.dataset.statScale || 2.3);
      const nextX2 = x1 + next * scale;
      line.setAttribute('x2', String(nextX2));
      line.dataset.statTargetX2 = String(nextX2);
      fadePulse(label, line);
    } else {
      fadePulse(label);
    }
  };

  charts.forEach((chart) => {
    if (chart.classList.contains('stat-chart--population')) scheduleRandomLoop(chart, () => updatePopulation(chart));
    if (chart.classList.contains('stat-chart--age')) scheduleRandomLoop(chart, () => updateAge(chart));
    if (chart.classList.contains('stat-chart--births')) scheduleRandomLoop(chart, () => updateBirths(chart));
    if (chart.classList.contains('stat-chart--houses')) scheduleRandomLoop(chart, () => updateHouses(chart));
    if (chart.classList.contains('stat-chart--continuity')) scheduleRandomLoop(chart, () => updateContinuity(chart));
  });
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
          // Force map to resize after overlay hides so canvas renders correctly
          if (window.procopioMap && typeof window.procopioMap.resize === 'function') {
            // small delay to allow CSS transition to start
            setTimeout(() => { window.procopioMap.resize(); }, 60);
          }
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
      // Fallback: hide overlay immediately to unblock page
      try {
        loadingOverlay.classList.add('fade-out');
      } catch (e) {
        console.error('Failed to hide loading overlay in fallback:', e);
      }
    });
}

document.addEventListener('DOMContentLoaded', initializeLoadingAnimation);

// Initialize Mapbox background on home page
(function() {
  function setupMap() {
    const mapEl = document.getElementById('home-map');
    console.log('setupMap: mapEl=', !!mapEl, 'mapboxgl=', typeof mapboxgl !== 'undefined');
    if (!mapEl) return;
    if (typeof mapboxgl === 'undefined') {
      console.warn('Mapbox GL not available when setupMap called');
      return;
    }

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
        maxBounds: bounds
      });
      window.procopioMap = map;

      // Handle resize
      window.addEventListener('resize', () => {
        mapEl.style.height = window.innerHeight + 'px';
        try { map.resize(); } catch (e) { console.warn('resize failed', e); }
      });

      map.on('error', (err) => console.error('Mapbox map error:', err));

      map.on('load', async () => {
        console.log('Map loaded, fetching markers...');
        try {
          const response = await fetch('map-data.json');
          if (!response.ok) throw new Error('Network response was not ok');
          const mapData = await response.json();
          mapItems = Array.isArray(mapData.items) ? mapData.items : [];

          mapItems.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'custom-marker pointer-events-auto';
            el.innerHTML = `
              <div class="marker-content flex flex-col items-center">
                <img src="${item.src}" alt="${item.label}" 
                     style="width:100px; height:100px; object-fit:cover; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <span class="marker-label bg-white px-2 py-1 rounded text-xs font-bold mt-1 shadow-sm">${item.label}</span>
              </div>
            `;

            new mapboxgl.Marker(el)
              .setLngLat(item.coordinates)
              .addTo(map);

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
  }

  document.addEventListener('DOMContentLoaded', function() {
    const mapEl = document.getElementById('home-map');
    if (!mapEl) return;

    if (typeof mapboxgl === 'undefined') {
      console.log('Mapbox GL not present, injecting script and stylesheet...');

      // inject CSS if not present
      if (!document.querySelector('link[href*="mapbox-gl-js"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
        document.head.appendChild(link);
      }

      const script = document.createElement('script');
      script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
      script.async = true;
      script.onload = () => {
        console.log('Mapbox GL loaded dynamically');
        setupMap();
      };
      script.onerror = (e) => console.error('Failed to load Mapbox GL script', e);
      document.head.appendChild(script);
    } else {
      setupMap();
    }
  });
  document.addEventListener('DOMContentLoaded', applyActiveSidebarLink);
document.addEventListener('DOMContentLoaded', initializeStoryBackToTop);
document.addEventListener('DOMContentLoaded', function () {
  if (document.body.classList.contains('home-page')) return;
  initializePageTransition();
});

})();
// Fade-in sections while scrolling.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const scroller = getStoryScroller();
    if (!scroller) return;

    const mainScroll = scroller.mainScroll;
    const storyGrid =
      mainScroll.querySelector('.storia-text-fade-grid, .stat-text-fade-grid') ||
      Array.from(mainScroll.children).find((el) => el.matches?.('.grid.grid-cols-2'));

    if (!storyGrid) return;

    const storyItems = Array.from(storyGrid.children).filter((element) => element.nodeType === 1);
    if (!storyItems.length) return;

    storyItems.forEach((element) => element.classList.add('story-fade'));

    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    ) {
      storyItems.forEach((element) => element.classList.add('story-fade--visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('story-fade--visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        root: scroller.root,
        threshold: 0.15,
        rootMargin: '0px 0px -10% 0px',
      }
    );

    storyItems.forEach((element) => observer.observe(element));
  });
})();

// Header comune mobile: mostra in scroll-up, nasconde in scroll-down sotto 899px.
(function () {
  function initializeSiteHeaderScroll() {
    const header = document.querySelector('[data-site-header], .site-header');
    if (!header || header.dataset.siteHeaderScrollReady === 'true') return;
    header.dataset.siteHeaderScrollReady = 'true';

    const mobileQuery = window.matchMedia('(max-width: 899px)');
    const mainScroll = document.getElementById('main-scroll');
    const HIDE_AFTER_Y = 80;
    const DIRECTION_THRESHOLD = 24;

    const getWindowScrollY = () => window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

    const getActiveScrollY = () => {
      if (mainScroll) {
        const style = window.getComputedStyle(mainScroll);
        const useMainScroll = mainScroll.scrollHeight > mainScroll.clientHeight + 2 && /(auto|scroll)/.test(style.overflowY);
        if (useMainScroll) return mainScroll.scrollTop || 0;
      }
      return getWindowScrollY();
    };

    let lastScrollY = getActiveScrollY();
    let ticking = false;
    let headerState = header.classList.contains('header-hidden') ? 'hidden' : 'visible';

    const setHeaderVisible = () => {
      if (headerState === 'visible') return;
      headerState = 'visible';
      header.classList.add('header-visible');
      header.classList.remove('header-hidden');
    };

    const setHeaderHidden = () => {
      if (headerState === 'hidden') return;
      headerState = 'hidden';
      header.classList.add('header-hidden');
      header.classList.remove('header-visible');
    };

    const resetDesktopHeader = () => {
      header.style.top = '';
      headerState = 'visible';
      header.classList.add('header-visible');
      header.classList.remove('header-hidden');
    };

    const updateHeader = (scrollY) => {
      if (!mobileQuery.matches) {
        resetDesktopHeader();
        lastScrollY = scrollY;
        return;
      }

      header.style.top = '';
      const currentScrollY = Math.max(0, scrollY);
      const delta = currentScrollY - lastScrollY;

      if (delta > DIRECTION_THRESHOLD && currentScrollY > HIDE_AFTER_Y) {
        setHeaderHidden();
      } else if (delta < -DIRECTION_THRESHOLD || currentScrollY <= HIDE_AFTER_Y) {
        setHeaderVisible();
      }

      lastScrollY = currentScrollY;
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        updateHeader(getActiveScrollY());
      });
    };

    headerState = 'visible';
    header.style.top = '';
    header.classList.add('header-visible');
    header.classList.remove('header-hidden');

    window.addEventListener('scroll', requestUpdate, { passive: true });

    if (mainScroll) {
      mainScroll.addEventListener('scroll', requestUpdate, { passive: true });
    }

    window.addEventListener('resize', () => {
      lastScrollY = getActiveScrollY();
      if (mobileQuery.matches) setHeaderVisible();
      else resetDesktopHeader();
    }, { passive: true });

    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', () => {
        lastScrollY = getActiveScrollY();
        if (mobileQuery.matches) setHeaderVisible();
        else resetDesktopHeader();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSiteHeaderScroll);
  } else {
    initializeSiteHeaderScroll();
  }
})();
