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

const archiveRows = [
  { anno: '1964', autore: 'Scorza', regione: 'Calabria', abitanti: 'Meno di 10', documento: 'Fotografia' },
  { anno: '1965', autore: 'Varani', regione: 'Sicilia', abitanti: 'Tra 10 e 100', documento: 'Note di campo' },
  { anno: '1966', autore: 'Fiore', regione: 'Puglia', abitanti: 'Tra 100 e 1000', documento: '' },
  { anno: '1967', autore: 'Maffei', regione: 'Campania', abitanti: 'Piu di 1000', documento: '' },
  { anno: '1968', autore: 'Ferri', regione: 'Molise', abitanti: '', documento: '' },
];

let enrichedRows = [];
let allItems = [];
let activeTags = new Set();
let lbIndex = -1;

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

function findBestImage(row, items) {
  const targetYear = Number(row.anno);
  const surname = normalize(row.autore);

  return (
    items.find((item) => item.year === targetYear && normalize(item.description).includes(surname)) ||
    items.find((item) => item.year === targetYear) ||
    null
  );
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

  const unique = (arr) => [...new Set(arr.filter(Boolean))];

  const columns = [
    unique(allItems.map((i) => String(i.year || ''))).sort(),
    unique(enrichedRows.map((r) => r.autore)).sort(),
    unique(enrichedRows.map((r) => r.regione)).sort(),
    unique(enrichedRows.map((r) => r.abitanti)).sort(),
    unique(enrichedRows.map((r) => r.documento)).sort(),
    unique(allItems.map((i) => i.category)).sort(),
  ];

  rowsHost.innerHTML = columns
    .map(
      (values) => `
      <div class="flex flex-col">
        ${values
          .map(
            (v) =>
              `<p class="text-justify cursor-pointer select-none" data-tag="${escapeHtml(v)}">${escapeHtml(v)}</p>`
          )
          .join('')}
      </div>`
    )
    .join('');
}

function toggleTag(tag) {
  if (activeTags.has(tag)) {
    activeTags.delete(tag);
  } else {
    activeTags.add(tag);
  }
  // update visual state: if any tags active, dim unselected and highlight selected
  document.querySelectorAll('[data-tag]').forEach((el) => {
    if (activeTags.size === 0) {
      el.classList.remove('opacity-50', 'opacity-100');
    } else {
      const isActive = activeTags.has(el.dataset.tag);
      el.classList.toggle('opacity-100', isActive);
      el.classList.toggle('opacity-50', !isActive);
    }
  });
  filterVisible(searchInput?.value || '');
}

function galleryTemplate(item, index) {
  if (!item.src) return '';

  return `
    <div data-item-index="${index}" class="col-span-3 flex cursor-pointer flex-col transition-opacity hover:opacity-80 pb-12">
      <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.description || 'Immagine archivio')}" class="h-auto w-full" loading="lazy">
      <p class="mt-10px font-myTitle">${escapeHtml(item.description || 'Senza descrizione')}</p>
    </div>
  `;
}

function renderAll() {
  if (rowsHost) {
    renderFilters();
    rowsHost.addEventListener('click', (e) => {
      const tag = e.target.dataset.tag;
      if (tag) toggleTag(tag);
    });
  }

  if (galleryHost) {
    galleryHost.innerHTML = allItems.map(galleryTemplate).join('') ||
      '<p class="col-span-6 p opacity-50">Nessuna immagine trovata.</p>';
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
    const itemValues = [
      ...(item.tags || []),
      item.category,
      String(item.year || ''),
      item.autore,
      item.regione,
      item.abitanti,
      item.documento,
    ].filter(Boolean);
    const matchesTags = activeTags.size === 0 || [...activeTags].every((tag) =>
      itemValues.includes(tag)
    );
    el.classList.toggle('hidden', !matchesSearch || !matchesTags);
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
}

function closeLightbox() {
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lightbox-open');
  document.body.style.overflow = '';
  lbImg.src = '';
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

document.addEventListener('keydown', (event) => {
  if (!lightbox.classList.contains('open')) return;
  if (event.key === 'ArrowLeft') navigateLightbox(-1);
  if (event.key === 'ArrowRight') navigateLightbox(1);
  if (event.key === 'Escape') closeLightbox();
});

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
    btn.addEventListener('click', function(){
      const open = sidebar.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
      // switch symbol between + and ×
      btn.textContent = open ? '×' : '+';
    });
  });
})();

// Initialize Mapbox background on home page
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const mapEl = document.getElementById('home-map');
    if (!mapEl || typeof mapboxgl === 'undefined') return;
    try {
      mapboxgl.accessToken = 'pk.eyJ1IjoibWFydGlpbmFwcm9jb3BpbyIsImEiOiJjbW93cTBtdnQwZHd1MnJyMW95Mmk0cjNqIn0.RO2i7KN9XgFmNMMVz_iInQ'; // <-- replace with your token
      // ensure the map container has a visible height before init
      mapEl.style.display = 'block';
      mapEl.style.height = window.innerHeight + 'px';

      const map = new mapboxgl.Map({
        container: 'home-map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [9.11, 45.07], // example: Torino
        zoom: 11,
        interactive: false
      });
      // disable drag/pan if interactive=false not honored
      map.scrollZoom.disable();
      map.boxZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();
      // keep map resized if layout changes
      window.addEventListener('resize', () => {
        mapEl.style.height = window.innerHeight + 'px';
        map.resize();
      });
    } catch (e) {
      // ignore map init errors
      console.warn('Mapbox init failed', e);
    }
  });
})();