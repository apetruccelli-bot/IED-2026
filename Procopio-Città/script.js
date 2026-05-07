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
let filteredGalleryItems = [];
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
}

function rowTemplate(row) {
  const cells = [row.anno, row.autore, row.regione, row.abitanti, row.documento];
  const href = row.imageSrc || '#';

  return `
    <div class="grid grid-cols-6 items-start">
      ${cells
        .map((cell) => `<a href="${escapeHtml(href)}" target="_blank" class="p text-justify block">${escapeHtml(cell || '')}</a>`)
        .join('')}
      <span class="p text-justify block"></span>
    </div>
  `;
}

function galleryTemplate(item, index) {
  if (!item.src) return '';

  return `
    <div data-gallery-index="${index}" class="col-span-3 flex cursor-pointer flex-col transition-opacity hover:opacity-80">
      <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.description || 'Immagine archivio')}" class="h-auto w-full" loading="lazy">
      <p class="mt-10px font-myTitle">${escapeHtml(item.description || 'Senza descrizione')}</p>
    </div>
  `;
}

function filterGalleryItems(term = '') {
  const query = term.trim().toLowerCase();
  if (!query) return allItems;

  return allItems.filter((item) =>
    [item.description, item.category, item.year].some((value) =>
      String(value || '').toLowerCase().includes(query)
    )
  );
}

function filterRows(term = '') {
  const query = term.trim().toLowerCase();
  if (!query) return enrichedRows;

  return enrichedRows.filter((row) =>
    Object.values(row).some((value) => String(value).toLowerCase().includes(query))
  );
}

function render(term = '') {
  const filteredRows = filterRows(term);
  if (rowsHost) {
    rowsHost.innerHTML = filteredRows.map(rowTemplate).join('');
  }

  filteredGalleryItems = filterGalleryItems(term);
  const galleryMarkup = filteredGalleryItems.map((item, index) => galleryTemplate(item, index)).join('');
  if (galleryHost) {
    galleryHost.innerHTML = galleryMarkup || '<p class="col-span-6 p opacity-50">Nessuna immagine trovata.</p>';
  }

  document.querySelectorAll('[data-gallery-index]').forEach((element) => {
    element.addEventListener('click', () => {
      openLightbox(Number(element.dataset.galleryIndex));
    });
  });
}

function openLightbox(index) {
  lbIndex = index;
  const item = filteredGalleryItems[lbIndex];

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
  let nextIndex = lbIndex + direction;
  if (nextIndex >= filteredGalleryItems.length) nextIndex = 0;
  if (nextIndex < 0) nextIndex = filteredGalleryItems.length - 1;
  openLightbox(nextIndex);
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
    render(event.target.value);
  });
}

hydrateRowsWithImages()
  .then(() => render())
  .catch(() => {
    enrichedRows = [...archiveRows];
    render();
  });