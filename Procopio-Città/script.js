const rowsHost = document.getElementById('archive-rows');
const galleryHost = document.getElementById('archive-gallery');
const searchInput = document.getElementById('search');
const archiveToggleButtons = document.querySelectorAll('[data-archive-toggle]');
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
  }

  archiveToggleButtons.forEach((button) => {
    button.setAttribute('aria-expanded', String(visible));
  });
}

function renderFilters() {
  if (!rowsHost) return;

  const columns = buildFilterColumns();

  rowsHost.innerHTML = columns
  .map(
    ({ key, label, values }) => `
    <div class="flex flex-col ${key === 'year' ? 'archive-filter-column-year' : ''}">
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
    manualToggle = !manualToggle;
    setArchiveFiltersVisible(manualToggle);
  });
});

// show filters on hover; if the user manually toggled (manualToggle), keep that state
const stickyHeader = document.querySelector('.archive-page .sticky:not(.story-sticky)');
if (stickyHeader) {
  stickyHeader.addEventListener('mouseenter', () => setArchiveFiltersVisible(true));
  stickyHeader.addEventListener('mouseleave', () => {
    if (!manualToggle) setArchiveFiltersVisible(false);
  });

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
  .then(() => renderAll())
  .catch(() => {
    enrichedRows = [...archiveRows];
    renderAll();
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

document.addEventListener('DOMContentLoaded', applyActiveSidebarLink);
document.addEventListener('DOMContentLoaded', initializePageTransition);
document.addEventListener('DOMContentLoaded', initializeStoryBackToTop);


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

// Fade-in sections while scrolling.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const scroller = getStoryScroller();
    if (!scroller) return;

    const mainScroll = scroller.mainScroll;
    const storyGrid =
      mainScroll.querySelector('.story-fade-grid') ||
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

  const mobileQuery = window.matchMedia('(max-width: 1119px)');

  const updateButtonVisibility = () => {
    const shouldShow = mobileQuery.matches && scroller.getTop() >= scroller.getMaxTop() * 0.5;

    backToTopButton.classList.toggle('is-visible', shouldShow);
    backToTopButton.setAttribute('aria-hidden', String(!shouldShow));
  };

  const scrollToTop = () => {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    scroller.scrollTo(0, behavior);
  };

  backToTopButton.addEventListener('click', (event) => {
    event.preventDefault();
    scrollToTop();
  });

  let rafId = 0;
  const requestUpdate = () => {
    if (rafId) return;

    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      updateButtonVisibility();
    });
  };

  mobileQuery.addEventListener('change', requestUpdate);
  scroller.addScrollListener(requestUpdate);
  window.addEventListener('resize', requestUpdate, { passive: true });

  updateButtonVisibility();
}

function initializeStatisticsPage() {
  if (!document.body.classList.contains('stat-page')) return;

  const statPage = document.getElementById('main-scroll') || document.body;
  const formatInteger = (value) => new Intl.NumberFormat('it-IT').format(Math.max(0, Math.round(value)));
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const statData = {
    houses: [
      { town: 'ZAGARA', built: 612, occupied: 189, active: 74 },
      { town: 'MONTEFERRO', built: 431, occupied: 102, active: 39 },
      { town: 'BORGO CUPO', built: 288, occupied: 41, active: 12 },
    ],
  };

  const housesHost = document.getElementById('houses-chart');
  if (housesHost && !housesHost.querySelector('svg')) {
    housesHost.innerHTML = `
      <svg viewBox="0 60 520 290" xmlns="http://www.w3.org/2000/svg" class="block w-full h-auto" aria-labelledby="houses-chart-title houses-chart-desc" role="img" style="font-family: 'Diatype', serif;">
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
          .small { font-size: 11px !important; }
          .axis { stroke: #1E1E1E; stroke-width: 1; }
          .b1 { fill: #1E1E1E; }
          .b2 { fill: #5C5C5C; }
          .b3 { fill: #A0A0A0; }
        ]]></style>
        <title id="houses-chart-title">Case occupate</title>
        <desc id="houses-chart-desc">Confronto tra case costruite, occupate e attive per Zagara, Monteferro e Borgo Cupo.</desc>
        <line x1="60" y1="300" x2="490" y2="300" class="axis"/>
        <line x1="60" y1="100" x2="60" y2="300" class="axis"/>
        <rect x="90" y="145" width="28" height="155" class="b1"/>
        <rect x="123" y="250" width="28" height="50" class="b2"/>
        <rect x="156" y="280" width="28" height="20" class="b3"/>
        <text x="88" y="138" class="small">612</text>
        <text x="120" y="243" class="small">189</text>
        <text x="155" y="273" class="small">74</text>
        <text x="90" y="325" class="small">ZAGARA</text>
        <rect x="240" y="190" width="28" height="110" class="b1"/>
        <rect x="273" y="270" width="28" height="30" class="b2"/>
        <rect x="306" y="290" width="28" height="10" class="b3"/>
        <text x="238" y="183" class="small">431</text>
        <text x="270" y="263" class="small">102</text>
        <text x="305" y="283" class="small">39</text>
        <text x="235" y="325" class="small">MONTEFERRO</text>
        <rect x="390" y="228" width="28" height="72" class="b1"/>
        <rect x="423" y="290" width="28" height="10" class="b2"/>
        <rect x="456" y="296" width="28" height="4" class="b3"/>
        <text x="388" y="221" class="small">288</text>
        <text x="423" y="283" class="small">41</text>
        <text x="455" y="290" class="small">12</text>
        <text x="390" y="325" class="small">BORGO CUPO</text>
   <rect x="150" y="72" width="7" height="7" class="b1"/>
<text x="165" y="80" class="small">COSTRUITE</text>

<rect x="265" y="72" width="7" height="7" class="b2"/>
<text x="280" y="80" class="small">OCCUPATE</text>

<rect x="380" y="72" width="7" height="7" class="b3"/>
<text x="395" y="80" class="small">ATTIVE</text>
      </svg>
    `;
  }

  const charts = Array.from(statPage.querySelectorAll('[data-stat-chart]'));
  const liveNodes = [];

  const getSvg = (chart) => chart.matches('svg') ? chart : chart.querySelector('svg');
  const numberPattern = /^\s*(\d+(?:[.,]\d+)?)(%)?\s*$/;
  const trailingNumberPattern = /^(.*?)(\d+(?:[.,]\d+)?)(%)?\s*$/;

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

  const registerLiveNode = (node, parsed) => {
    if (!node || node.dataset.statLive === 'true' || !parsed || !Number.isFinite(parsed.value)) return;
    node.dataset.statLive = 'true';
    node.dataset.statValue = String(parsed.value);
    node.dataset.statCurrent = String(parsed.value);
    node.dataset.statPrefix = parsed.prefix || '';
    node.dataset.statSuffix = parsed.suffix || '';
    node.dataset.statDecimals = String(parsed.decimals || 0);
    liveNodes.push(node);
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

  const resetLineBuild = (chart) => {
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
        animate(950, (t) => {
          rect.setAttribute('width', String(targetWidth * t));
        });
      }, index * 90);
    });
  };

  const setupBarsRight = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('rect.bar, rect.bar2').forEach((rect) => {
      if (!rect.dataset.statTargetWidth) rect.dataset.statTargetWidth = rect.getAttribute('width') || '0';
      const label = rect.nextElementSibling;
      // Percent labels in this chart are live data.
      svg.querySelectorAll('text').forEach((text) => {
        if ((text.textContent || '').trim().endsWith('%')) registerLiveNode(text, parseNumericText(text.textContent));
      });
    });
  };

  const resetBarsRight = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('rect.bar, rect.bar2').forEach((rect) => {
      if (!rect.dataset.statTargetWidth) rect.dataset.statTargetWidth = rect.getAttribute('width') || '0';
      rect.setAttribute('width', '0');
    });
  };

  const playBarsRight = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('rect.bar, rect.bar2').forEach((rect, index) => {
      const target = Number(rect.dataset.statTargetWidth || 0);
      window.setTimeout(() => {
        animate(780, (t) => rect.setAttribute('width', String(target * t)));
      }, index * 45);
    });
  };

  const setupNumberCount = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('text').forEach((text) => {
      const raw = (text.textContent || '').trim();
      const parsed = parseNumericText(raw);
      if (parsed) registerLiveNode(text, parsed);
    });
  };

  const resetNumberCount = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('text[data-stat-live="true"]').forEach((text) => {
      const suffix = text.dataset.statSuffix || '';
      const prefix = text.dataset.statPrefix || '';
      text.textContent = `${prefix}0${suffix}`;
    });
  };

  const playNumberCount = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('text[data-stat-live="true"]').forEach((text) => {
      const target = Number(text.dataset.statCurrent || text.dataset.statValue || 0);
      const decimals = Number(text.dataset.statDecimals || 0);
      const suffix = text.dataset.statSuffix || '';
      const prefix = text.dataset.statPrefix || '';
      animate(900, (t) => {
        const value = target * t;
        const number = decimals ? value.toFixed(decimals) : formatInteger(value);
        text.textContent = `${prefix}${number}${suffix}`;
      });
    });
  };

  const setupRectGrow = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('rect.b1, rect.b2, rect.b3').forEach((rect) => {
      if (!rect.dataset.statTargetY) rect.dataset.statTargetY = rect.getAttribute('y') || '300';
      if (!rect.dataset.statTargetHeight) rect.dataset.statTargetHeight = rect.getAttribute('height') || '0';
      if (!rect.dataset.statBaseline) rect.dataset.statBaseline = String(Number(rect.dataset.statTargetY) + Number(rect.dataset.statTargetHeight));
    });
    svg.querySelectorAll('text.small').forEach((text) => {
      const parsed = parseNumericText(text.textContent);
      if (parsed) registerLiveNode(text, parsed);
    });
  };

  const resetRectGrow = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('rect.b1, rect.b2, rect.b3').forEach((rect) => {
      const baseline = Number(rect.dataset.statBaseline || 300);
      rect.setAttribute('y', String(baseline));
      rect.setAttribute('height', '0');
    });
  };

  const playRectGrow = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('rect.b1, rect.b2, rect.b3').forEach((rect, index) => {
      const baseline = Number(rect.dataset.statBaseline || 300);
      const targetHeight = Number(rect.dataset.statTargetHeight || 0);
      window.setTimeout(() => {
        animate(760, (t) => {
          const height = targetHeight * t;
          rect.setAttribute('height', String(height));
          rect.setAttribute('y', String(baseline - height));
        });
      }, index * 45);
    });
  };

  const setupLinePosition = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('line.value').forEach((line) => {
      if (!line.dataset.statTargetX2) line.dataset.statTargetX2 = line.getAttribute('x2') || line.getAttribute('x1') || '0';
    });
    svg.querySelectorAll('text').forEach((text) => {
      const x = Number(text.getAttribute('x') || 0);
      const parsed = parseNumericText(text.textContent);
      if (parsed && x >= 390) registerLiveNode(text, parsed);
    });
  };

  const resetLinePosition = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('line.value').forEach((line) => {
      line.setAttribute('x2', line.getAttribute('x1') || '0');
    });
  };

  const playLinePosition = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('line.value').forEach((line, index) => {
      const startX = Number(line.getAttribute('x1') || 0);
      const targetX = Number(line.dataset.statTargetX2 || startX);
      window.setTimeout(() => {
        animate(760, (t) => {
          line.setAttribute('x2', String(startX + (targetX - startX) * t));
        });
      }, index * 60);
    });
  };

  const setupPopulationLiveLabels = (chart) => {
    const svg = getSvg(chart);
    if (!svg) return;
    svg.querySelectorAll('text').forEach((text) => {
      const x = Number(text.getAttribute('x') || 0);
      if (x < 390) return;
      const parsed = parseTrailingNumericText(text.textContent);
      if (parsed) registerLiveNode(text, parsed);
    });
  };

  const resetChart = (chart) => {
    const type = chart.dataset.statChart;
    if (type === 'line-build') resetLineBuild(chart);
    if (type === 'bars-right') resetBarsRight(chart);
    if (type === 'number-count') resetNumberCount(chart);
    if (type === 'rect-grow') resetRectGrow(chart);
    if (type === 'line-position') resetLinePosition(chart);
  };

  const playChart = (chart) => {
    const type = chart.dataset.statChart;
    resetChart(chart);
    if (type === 'line-build') playLineBuild(chart);
    if (type === 'bars-right') playBarsRight(chart);
    if (type === 'number-count') playNumberCount(chart);
    if (type === 'rect-grow') playRectGrow(chart);
    if (type === 'line-position') playLinePosition(chart);
  };

  charts.forEach((chart) => {
    const type = chart.dataset.statChart;
    if (type === 'line-build') {
      setupPopulationLiveLabels(chart);
      resetLineBuild(chart);
    }
    if (type === 'bars-right') setupBarsRight(chart);
    if (type === 'number-count') setupNumberCount(chart);
    if (type === 'rect-grow') setupRectGrow(chart);
    if (type === 'line-position') setupLinePosition(chart);
    resetChart(chart);
  });

  const scroller = typeof getStoryScroller === 'function' ? getStoryScroller() : null;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const chart = entry.target;
        if (entry.isIntersecting) {
          playChart(chart);
        } else {
          resetChart(chart);
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

  if (liveNodes.length) {
    window.setInterval(() => {
      liveNodes.forEach((node) => {
        const current = Number(node.dataset.statCurrent || node.dataset.statValue || 0);
        const next = Math.max(0, current - 1);
        node.dataset.statCurrent = String(next);
        renderLiveValue(node);
      });
    }, 10000);
  }

  let statModalDismissed = false;

  const closeStatDeclineModal = () => {
    statModalDismissed = true;
    const modal = document.getElementById('stat-decline-modal');
    if (!modal) return;
    modal.classList.remove('is-visible');
    modal.setAttribute('aria-hidden', 'true');
  };

  window.closeStatDeclineModal = closeStatDeclineModal;

  window.setTimeout(() => {
    if (statModalDismissed) return;
    const modal = document.getElementById('stat-decline-modal');
    if (!modal) return;
    modal.classList.add('is-visible');
    modal.setAttribute('aria-hidden', 'false');
  }, 30000);

  const handleStatModalClose = (event) => {
    const closeButton = event.target.closest?.('[data-stat-modal-close], .stat-decline-modal__close');
    if (!closeButton) return;
    event.preventDefault();
    event.stopPropagation();
    closeStatDeclineModal();
  };

  document.addEventListener('click', handleStatModalClose, true);
  document.addEventListener('pointerdown', handleStatModalClose, true);
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
})();