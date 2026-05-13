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