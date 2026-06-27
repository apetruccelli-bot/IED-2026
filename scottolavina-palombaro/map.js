const locations = [
  {
    title: "Strait of Florida",
    latitude: 25.0,
    longitude: -79.75,
  },
  {
    title: "Monterey Submarine Canyon, CA",
    latitude: 36.666667,
    longitude: -122.083333,
  },
  {
    title: "Aleutian Trench, AK",
    latitude: 51.21,
    longitude: -174.83,
  },
];

mapboxgl.accessToken = "pk.eyJ1IjoibS1zY290dG9sYXZpbmEiLCJhIjoiY21wMTNsZzAyMDExdjJzczl4cnZsaWdyeiJ9.CtMmob3AiGfgsuflTXlWIQ";

const mapContainer = document.getElementById("map");
const locationPlacement = {
  "strait of florida": {
    coastBearing: 300,
    deepBearing: 145,
    deepBaseDistance: 420,
    deepRingGap: 110,
    deepMinimumSpacingKm: 70,
  },
  "monterey submarine canyon": { coastBearing: 80, deepBearing: 255 },
  "aleutian trench": { coastBearing: 345, deepBearing: 165 },
};

// Global deep-side bias: steer deep images roughly toward this bearing
const deepSideBiasBearing = 200; // degrees (approx. south-west)
const deepBiasFactor = 0.72; // how strongly deep items are pulled toward deepSideBiasBearing

let activeImageMarkers = [];
let imageMarkersBounds = null;
let imageMarkersMap = null;
let ensureImagesVisibleHandler = null;
let isAdjustingImageBounds = false;
let lastBoundsAdjustTime = 0;
let activeGalleryImages = [];
let activeGalleryIndex = 0;
let activeGalleryTitle = '';

// helper: normalize area names (take text before comma, lowercase)
function normalizeArea(a) {
  if (!a) return '';
  return String(a).split(',')[0].trim().toLowerCase();
}

function offsetLngLat(origin, distanceKm, bearingDeg) {
  const R = 6371;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (origin[1] * Math.PI) / 180;
  const lon1 = (origin[0] * Math.PI) / 180;
  const delta = distanceKm / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(delta) +
      Math.cos(lat1) * Math.sin(delta) * Math.cos(bearing)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(delta) * Math.cos(lat1),
      Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}

function approximateDistanceKm(a, b) {
  const latKm = 111;
  const lonKm = 111 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const dLat = (a[1] - b[1]) * latKm;
  const dLon = (a[0] - b[0]) * lonKm;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function isCoastalItem(item) {
  const tags = Array.isArray(item?.tags)
    ? item.tags.map((t) => String(t).toLowerCase())
    : [];
  const subcategory = String(item?.subcategory || '').toLowerCase();
  return tags.includes('crew') || subcategory.includes('deck operations');
}

function isDeepSeaItem(item) {
  const src = String(item?.src || '').toLowerCase();
  const category = String(item?.category || '').toLowerCase();
  const subcategory = String(item?.subcategory || '').toLowerCase();
  return src.includes('/fondali/') || category === 'sea depths' || subcategory.includes('immersion');
}

function clearActiveImageMarkers() {
  if (imageMarkersMap && ensureImagesVisibleHandler) {
    imageMarkersMap.off('moveend', ensureImagesVisibleHandler);
    ensureImagesVisibleHandler = null;
  }

  activeImageMarkers.forEach((m) => m.remove());
  activeImageMarkers = [];
  imageMarkersBounds = null;
}

function getPlacementConfig(title) {
  const key = normalizeArea(title);
  if (key.includes('strait of florida')) return locationPlacement['strait of florida'];
  if (key.includes('monterey submarine canyon')) return locationPlacement['monterey submarine canyon'];
  if (key.includes('aleutian trench')) return locationPlacement['aleutian trench'];
  return { coastBearing: 300, deepBearing: 120 };
}

function renderImagesAroundLocation(map, location, items) {
  clearActiveImageMarkers();
  if (!items || items.length === 0) return;
  
  if (!map || typeof map.project !== 'function') {
    console.warn('[MAP] Map not ready for image rendering');
    return;
  }

  const origin = [location.longitude, location.latitude];
  const placement = getPlacementConfig(location.title);
  const coastalItems = items.filter(isCoastalItem);
  const deepItems = items.filter((item) => !isCoastalItem(item));
  const placedPoints = [];

  function placeItemGroup(groupItems, isCoastal) {
    const perRing = isCoastal ? 4 : 3; 
    const angleStep = isCoastal ? 26 : 28; 
    const ringGap = isCoastal ? 36 : (placement.deepRingGap || 60);
    const baseDistance = isCoastal ? 28 : (placement.deepBaseDistance || 160);
    const baseBearing = isCoastal ? placement.coastBearing : placement.deepBearing;
    const minimumSpacingKm = isCoastal ? 24 : (placement.deepMinimumSpacingKm || 40);

    const placedPixelPoints = [];
    const containerRect = map.getContainer().getBoundingClientRect();
    const labelRects = Array.from(document.querySelectorAll('.map-location-label')).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left - containerRect.left,
        top: r.top - containerRect.top,
        right: r.right - containerRect.left,
        bottom: r.bottom - containerRect.top,
        width: r.width,
        height: r.height,
      };
    });

    groupItems.forEach((item, index) => {
      const isDeepSea = !isCoastal && isDeepSeaItem(item);
      const ringIndex = Math.floor(index / perRing);
      const slotIndex = index % perRing;
      const slotOffset = slotIndex - (perRing - 1) / 2;
      let targetLngLat = origin;

      for (let attempt = 0; attempt < 18; attempt += 1) {
        const jitter = attempt * (isCoastal ? 6 : 12) * (attempt % 2 === 0 ? 1 : -1);

        let bearingBase = baseBearing;
        if (!isCoastal) {
          const diff = (((deepSideBiasBearing - baseBearing + 540) % 360) - 180);
          bearingBase = (baseBearing + diff * deepBiasFactor + 360) % 360;
        }

        const bearing = bearingBase + slotOffset * angleStep + ringIndex * 6 + jitter;
        const distanceBoost = isDeepSea ? 80 : 0;
        const distanceKm =
          baseDistance + distanceBoost + ringIndex * ringGap + slotIndex * (isCoastal ? 3 : 9) + attempt * (isCoastal ? 2 : 6);
        const candidate = offsetLngLat(origin, distanceKm, bearing);
        const isTooClose = placedPoints.some((point) => approximateDistanceKm(point, candidate) < minimumSpacingKm);

        let isTooCloseToLabel = false;
        let overlapsPixel = false;
        try {
          let pt;
          if (!map.isStyleLoaded()) {
            isTooCloseToLabel = false;
            overlapsPixel = false;
          } else {
            try {
              pt = map.project(candidate);
            } catch (e) {
              console.warn('[MAP] Project failed, skipping pixel checks:', e.message);
              pt = null;
            }
          }

          if (!pt) {
            isTooCloseToLabel = false;
            overlapsPixel = false;
          } else {
            const minLabelDistancePx = Math.max(44, (isCoastal ? 48 : 60));
            const thumbPx = isCoastal ? 64 : 96;
            const minPixelSpacing = thumbPx + 18;

            for (const lr of labelRects) {
              if (pt.x >= lr.left && pt.x <= lr.right && pt.y >= lr.top && pt.y <= lr.bottom) {
                isTooCloseToLabel = true;
                break;
              }
              const cx = lr.left + lr.width / 2;
              const cy = lr.top + lr.height / 2;
              const dx = pt.x - cx;
              const dy = pt.y - cy;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < minLabelDistancePx + Math.max(lr.width, lr.height) * 0.5) {
                isTooCloseToLabel = true;
                break;
              }
            }

            if (!isTooCloseToLabel) {
              for (const p of placedPixelPoints) {
                const dx = pt.x - p.x;
                const dy = pt.y - p.y;
                if (Math.sqrt(dx * dx + dy * dy) < minPixelSpacing) {
                  overlapsPixel = true;
                  break;
                }
              }
            }
          }
        } catch (e) {
          isTooCloseToLabel = false;
          overlapsPixel = false;
        }

        if ((!isTooClose && !isTooCloseToLabel && !overlapsPixel) || attempt === 13) {
          targetLngLat = candidate;
          placedPoints.push(candidate);
          try {
            if (map.isStyleLoaded()) {
              const ptFinal = map.project(candidate);
              placedPixelPoints.push({ x: ptFinal.x, y: ptFinal.y });
            }
          } catch (e) {
            // ignore
          }
          break;
        }
      }

      const markerEl = document.createElement('a');
      markerEl.className = 'map-photo-marker';
      markerEl.href = item.src;
      markerEl.target = '_blank';
      markerEl.rel = 'noopener';
      markerEl.title = item.description || location.title;
      markerEl.style.setProperty('--tilt', Math.random().toFixed(2));
      markerEl.style.pointerEvents = 'none';

      const thumb = document.createElement('img');
      thumb.src = item.src;
      thumb.alt = location.title;
      markerEl.appendChild(thumb);

      const imageMarker = new mapboxgl.Marker({
        element: markerEl,
        anchor: 'center',
      })
        .setLngLat(targetLngLat)
        .addTo(map);

      activeImageMarkers.push(imageMarker);
    });
  }

  placeItemGroup(coastalItems, true);
  placeItemGroup(deepItems, false);

  if (activeImageMarkers.length > 0) {
    const bounds = new mapboxgl.LngLatBounds(origin, origin);
    activeImageMarkers.forEach((marker) => {
      bounds.extend(marker.getLngLat());
    });

    imageMarkersBounds = bounds;
    imageMarkersMap = map;

    map.fitBounds(bounds, {
      padding: { top: 80, bottom: 80, left: 80, right: 80 },
      maxZoom: 7,
      duration: 800
    });

    if (ensureImagesVisibleHandler) {
      map.off('moveend', ensureImagesVisibleHandler);
    }

    ensureImagesVisibleHandler = () => {
      if (!imageMarkersBounds || !imageMarkersMap || activeImageMarkers.length === 0) return;
      if (isAdjustingImageBounds) return;
      if (!imageMarkersMap.isStyleLoaded()) return;

      const now = Date.now();
      if (now - lastBoundsAdjustTime < 600) return;

      const mapBounds = imageMarkersMap.getBounds();
      let allVisible = true;

      for (const marker of activeImageMarkers) {
        const lngLat = marker.getLngLat();
        if (!mapBounds.contains(lngLat)) {
          allVisible = false;
          break;
        }
      }

      if (!allVisible) {
        isAdjustingImageBounds = true;
        lastBoundsAdjustTime = now;

        imageMarkersMap.fitBounds(imageMarkersBounds, {
          padding: { top: 80, bottom: 80, left: 80, right: 80 },
          maxZoom: 7,
          duration: 300,
        });

        requestAnimationFrame(() => {
          isAdjustingImageBounds = false;
        });
      }
    };

    map.on('moveend', ensureImagesVisibleHandler);
  }
}

function isAllowedMapImageItem(item) {
  if (!item || !item.src) return false;

  const src = String(item.src).toLowerCase();
  const category = String(item.category || '').toLowerCase();
  const subcategory = String(item.subcategory || '').toLowerCase();

  const isPalombari = src.includes('/palombari/') || category === 'missions';
  const isFondali = src.includes('/fondali/') || category === 'sea depths';
  const isImmersione = subcategory.includes('immersion');

  return isPalombari || isFondali || isImmersione;
}

async function loadImagesByArea() {
  try {
    const res = await fetch('data.json');
    if (!res.ok) return {};
    const data = await res.json();
    const map = {};
    (data.items || []).forEach((it) => {
      if (!isAllowedMapImageItem(it)) return;
      if (!it.area || !it.src) return;
      const key = normalizeArea(it.area);
      if (!map[key]) map[key] = [];
      map[key].push({
        src: it.src,
        tags: it.tags || [],
        subcategory: it.subcategory || '',
        description: it.description || '',
      });
    });
    return map;
  } catch (e) {
    console.warn('Could not load data.json', e);
    return {};
  }
}

function renderActiveGalleryImage() {
  const gallery = document.getElementById('gallery');
  if (!gallery) return;

  const prevLink = gallery.querySelector('.map-gallery-link-prev');
  const prevImage = gallery.querySelector('.map-gallery-image-prev');
  const currentLink = gallery.querySelector('.map-gallery-link-current');
  const currentImageEl = gallery.querySelector('.map-gallery-image-current');
  const nextLink = gallery.querySelector('.map-gallery-link-next');
  const nextImage = gallery.querySelector('.map-gallery-image-next');
  const counter = gallery.querySelector('.map-gallery-count');

  if (!prevLink || !prevImage || !currentLink || !currentImageEl || !nextLink || !nextImage || !counter) return;

  if (!activeGalleryImages.length) {
    [prevLink, currentLink, nextLink].forEach((link) => {
      link.href = '#';
    });
    [prevImage, currentImageEl, nextImage].forEach((image) => {
      image.alt = activeGalleryTitle || 'Gallery image';
      image.removeAttribute('src');
    });
    counter.textContent = '0 / 0';
    return;
  }

  const total = activeGalleryImages.length;
  const prevIndex = (activeGalleryIndex - 1 + total) % total;
  const nextIndex = (activeGalleryIndex + 1) % total;
  const currentImageData = activeGalleryImages[activeGalleryIndex];
  const prevImageData = activeGalleryImages[prevIndex];
  const nextImageData = activeGalleryImages[nextIndex];

  prevLink.href = prevImageData.src;
  currentLink.href = currentImageData.src;
  nextLink.href = nextImageData.src;

  const preloadAndSwap = (imgEl, src, alt) => {
    imgEl.alt = alt || activeGalleryTitle || 'Gallery image';
    imgEl.style.opacity = '0';
    const tmp = new Image();
    tmp.onload = () => {
      imgEl.src = src;
      imgEl.style.transition = 'opacity 240ms ease';
      requestAnimationFrame(() => { imgEl.style.opacity = '1'; });
    };
    tmp.onerror = () => {
      imgEl.src = src;
      imgEl.style.opacity = '1';
    };
    tmp.src = src;
  };

  preloadAndSwap(prevImage, prevImageData.src, prevImageData.description);
  preloadAndSwap(currentImageEl, currentImageData.src, currentImageData.description);
  preloadAndSwap(nextImage, nextImageData.src, nextImageData.description);

  counter.textContent = `${activeGalleryIndex + 1} / ${activeGalleryImages.length}`;
}

function stepGallery(direction) {
  if (!activeGalleryImages.length) return;

  const now = Date.now();
  if (!window._lastGalleryStepTime) window._lastGalleryStepTime = 0;
  if (now - window._lastGalleryStepTime < 320) return;
  window._lastGalleryStepTime = now;

  activeGalleryIndex = (activeGalleryIndex + direction + activeGalleryImages.length) % activeGalleryImages.length;
  renderActiveGalleryImage();
}

function showGallery(title, images){
  const gallery = document.getElementById('gallery');
  if (!gallery) return;
  gallery.innerHTML = '';

  activeGalleryTitle = title || '';
  activeGalleryImages = Array.isArray(images) ? images.slice() : [];
  activeGalleryIndex = 0;

  const header = document.createElement('div');
  header.className = 'map-gallery-header';

  const h = document.createElement('div');
  h.className = 'map-gallery-title';
  h.textContent = title + ':';
  header.appendChild(h);

  const hint = document.createElement('div');
  hint.className = 'map-gallery-hint';
  hint.textContent = 'Punta a sinistra o destra per scorrere le immagini.';
  header.appendChild(hint);

  gallery.appendChild(header);

  if (!images || images.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nessuna immagine per questa area';
    gallery.appendChild(empty);
    return;
  }

  const frame = document.createElement('div');
  frame.className = 'map-gallery-frame';

  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.className = 'map-gallery-button';
  prevButton.textContent = '←';
  prevButton.setAttribute('aria-label', 'Immagine precedente');
  prevButton.addEventListener('click', () => stepGallery(-1));

  const viewport = document.createElement('div');
  viewport.className = 'map-gallery-viewport';

  const strip = document.createElement('div');
  strip.className = 'map-gallery-strip';

  const createPreview = (variant) => {
    const link = document.createElement('a');
    link.className = `map-gallery-link map-gallery-link-${variant}`;
    link.target = '_blank';
    link.rel = 'noopener';

    const img = document.createElement('img');
    img.className = `map-gallery-image map-gallery-image-${variant}`;
    link.appendChild(img);
    return { link, img };
  };

  const prevPreview = createPreview('prev');
  const currentPreview = createPreview('current');
  const nextPreview = createPreview('next');

  strip.appendChild(prevPreview.link);
  strip.appendChild(currentPreview.link);
  strip.appendChild(nextPreview.link);
  viewport.appendChild(strip);

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'map-gallery-button';
  nextButton.textContent = '→';
  nextButton.setAttribute('aria-label', 'Immagine successiva');
  nextButton.addEventListener('click', () => stepGallery(1));

  frame.appendChild(prevButton);
  frame.appendChild(viewport);
  frame.appendChild(nextButton);
  gallery.appendChild(frame);

  const footer = document.createElement('div');
  footer.className = 'map-gallery-footer';

  const counter = document.createElement('div');
  counter.className = 'map-gallery-count';
  footer.appendChild(counter);

  gallery.appendChild(footer);
  renderActiveGalleryImage();
}

// ── FUNZIONI GESTIONE OVERLAY ISTRUZIONI (Gestures Help) ──

function createMapInstructionsOverlay() {
  if (document.getElementById('map-instructions-overlay')) return;

  const styleId = 'map-instructions-style';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      .map-instructions-overlay { position: fixed; inset: 0; display:flex; align-items:center; justify-content:center; background: rgba(6,8,10,0.45); z-index:2147483646; }
      .map-instructions-panel { max-width:720px; width:92%; background: rgba(18,20,22,0.86); color: #fff; padding:20px 22px; border-radius:14px; box-shadow:0 8px 30px rgba(2,6,12,0.6); backdrop-filter: blur(8px) saturate(1.05); font-family: 'ABCFavoritMono', monospace; }
      .map-instructions-panel h2 { margin:0 0 8px 0; font-size:18px; }
      .map-instructions-panel p { margin:0 0 10px 0; opacity:0.95; }
      .map-instructions-panel ul { margin:8px 0 12px 18px; padding:0; }
      .map-instructions-panel li { margin:8px 0; line-height:1.35; }
      .map-instructions-close { appearance:none; border:0; background:#fff; color:#0b0b0b; padding:8px 14px; border-radius:var(--radius); cursor:pointer; font-weight:600; }

      .map-gestures-help-button {
        position: fixed;
        left: 24px;
        bottom: 24px;
        z-index: 2147483645;
        font-family: 'ABCFavoritMono', monospace;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #1a1a1a;
        background: #ffffff;
        border: none;
        border: none;
        padding: 8px 12px;
        border-radius: var(--radius);
        cursor: pointer;
      }
      html[data-theme="dark"] .map-gestures-help-button { background: #0e1113 !important; color: #ffffff !important; border: none !important; }
      @media (max-width:520px){ .map-instructions-panel{ padding:16px; border-radius:12px; } }
    `;
    try {
      document.head.appendChild(s);
    } catch (e) {}
  }

  const overlay = document.createElement('div');
  overlay.id = 'map-instructions-overlay';
  overlay.className = 'map-instructions-overlay';

  overlay.innerHTML = `
    <div class="map-instructions-panel" role="dialog" aria-modal="true" aria-labelledby="map-instructions-title">
      <h2 id="map-instructions-title">Hand Tracking & Gesture Controls</h2>
      <p>Use your hand in front of the camera to control the map and galleries. Gesture recognition runs in real-time.</p>
      <ul>
        <li><strong>Closed fist</strong> — Pan the map: move your hand left/right/up/down to pan the map smoothly.</li>
        <li><strong>Open palm</strong> — When no location is open: selects the nearest location and opens its gallery.</li>
        <li><strong>Swipe with an open palm</strong> — When a location is open: swipe left or right to scroll the gallery.</li>
        <li><strong>Pinch (thumb + index)</strong> — When a location is open: closes the location / gallery.</li>
      </ul>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px;">
        <button class="map-instructions-close">Got it</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('.map-instructions-close');
  if (closeBtn) closeBtn.addEventListener('click', () => { overlay.remove(); });

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) overlay.remove();
  });
}

function createGesturesHelpButton() {
  if (document.getElementById('map-gestures-help-button')) return;

  const button = document.createElement('button');
  button.id = 'map-gestures-help-button';
  button.className = 'map-gestures-help-button';
  button.type = 'button';
  button.textContent = 'HOW TO';
  button.setAttribute('aria-label', 'Show gesture instructions');

  button.addEventListener('click', () => {
    createMapInstructionsOverlay();
  });

  document.body.appendChild(button);
}

// ── MAP INIZIALIZZAZIONE ──

if (mapContainer && typeof mapboxgl !== "undefined") {
  (async () => {
    const areaMap = await loadImagesByArea();
    const initialMapView = {
      center: [-98.5795, 39.8283],
      zoom: 3.5,
      pitch: 0,
      bearing: 0,
    };

    const map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/light-v11",
      center: initialMapView.center,
      zoom: initialMapView.zoom,
      scrollZoom: false,
      interactive: false, 
      projection: "mercator",
      pitch: initialMapView.pitch,
      bearing: initialMapView.bearing,
    });

    // Mostra l'overlay all'avvio e inietta il pulsante persistente
    try {
      createMapInstructionsOverlay();
      createGesturesHelpButton();
    } catch (e) {
      console.warn('[MAP] Could not create instructions elements', e);
    }

    const bounds = new mapboxgl.LngLatBounds();
    let selectedLocationIndex = 0;

    function selectLocation(index) {
      selectedLocationIndex = index;
      window.locationIsOpen = true;

      const location = locations[selectedLocationIndex];
      const key = normalizeArea(location.title);
      const images = areaMap[key] || [];

      showGallery(location.title, images);

      map.flyTo({
        center: [location.longitude, location.latitude],
        zoom: 6,
        pitch: 0,
        bearing: 0,
        duration: 1500,
      });

      setTimeout(() => {
        if (map && typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
          renderImagesAroundLocation(map, location, images);
        } else {
          console.warn('[MAP] Map not ready, retrying');
          setTimeout(() => {
            if (map && typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
              renderImagesAroundLocation(map, location, images);
            }
          }, 800);
        }
      }, 1600);
    }

    function navigateMapWithHand(handX, handY, videoWidth, videoHeight, movementScale = 1) {
      if (window.locationIsOpen) return;
      if (!map || typeof map.isStyleLoaded !== 'function' || !map.isStyleLoaded()) return;

      const vw = videoWidth || window.innerWidth;
      const vh = videoHeight || window.innerHeight;

      const isVideoMirrored = true;
      const effectiveX = isVideoMirrored ? vw - handX : handX;

      const nx = effectiveX / vw - 0.5;
      const ny = handY / vh - 0.5;

      const deadZoneFraction = 0.12; 
      if (Math.abs(nx) < deadZoneFraction && Math.abs(ny) < deadZoneFraction) return;

      const maxPanX = Math.max(150, vw * 0.25); 
      const maxPanY = Math.max(100, vh * 0.15);

      const panX = nx * maxPanX * 2.0 * movementScale; 
      const panY = ny * maxPanY * 1.0 * movementScale;

      if (!window._lastPanTime) window._lastPanTime = 0;
      const now = Date.now();
      if (now - window._lastPanTime < 60) return; 
      window._lastPanTime = now;

      map.panBy([panX, panY], {
        duration: 260,
        easing: (t) => t, 
      });
    }

    function selectNearestLocation() {
      const center = map.getCenter();
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      locations.forEach((location, index) => {
        const distance =
          Math.abs(center.lng - location.longitude) +
          Math.abs(center.lat - location.latitude);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      selectLocation(nearestIndex);
    }

    function stopMapMotion() {
      map.stop();
    }

    function closeLocationDetail() {
      window.locationIsOpen = false;
      activeGalleryImages = [];
      activeGalleryIndex = 0;
      activeGalleryTitle = '';
      
      const gallery = document.getElementById('gallery');
      if (gallery) gallery.innerHTML = '';
      
      clearActiveImageMarkers();
      
      map.stop();
      map.flyTo({
        center: initialMapView.center,
        zoom: initialMapView.zoom,
        pitch: initialMapView.pitch,
        bearing: initialMapView.bearing,
        duration: 900,
      });
    }

    function zoomOutMap() {
      map.stop();
      map.easeTo({
        center: initialMapView.center,
        zoom: 2.5,
        pitch: 0,
        bearing: 0,
        duration: 520,
      });
    }

    function resetToInitialView() {
      map.stop();
      map.flyTo({
        center: initialMapView.center,
        zoom: initialMapView.zoom,
        pitch: initialMapView.pitch,
        bearing: initialMapView.bearing,
        duration: 900,
      });
    }

    window.oceanMapControls = {
      navigateMapWithHand,
      selectNearestLocation,
      selectLocation,
      stepGallery,
      stopMapMotion,
      zoomOutMap,
      resetToInitialView,
      closeLocationDetail,
    };

    locations.forEach((location) => {
      const coordinates = [location.longitude, location.latitude];
      const markerElement = document.createElement("div");
      markerElement.className = "map-location-label";
      markerElement.textContent = location.title;
      markerElement.style.pointerEvents = 'none';

      new mapboxgl.Marker(markerElement)
        .setLngLat(coordinates)
        .addTo(map);

      bounds.extend(coordinates);
    });

    map.on("load", () => {
      map.getStyle().layers.forEach((layer) => {
        const layerId = layer.id.toLowerCase();
        const layerType = layer.type;

        const isBoundaryLayer =
          layerId.includes("boundary") ||
          layerId.includes("admin") ||
          layerId.includes("country") ||
          layerId.includes("state") ||
          layerId.includes("coast") ||
          layerId.includes("shore") ||
          layerId.includes("water") ||
          layerId.includes("land") ||
          layerId.includes("earth") ||
          layerId.includes("ocean") ||
          layerId.includes("sea");

        if (layerType === "symbol" || !isBoundaryLayer) {
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
      });

      map.addSource("bathymetry", {
        type: "vector",
        url: "mapbox://mapbox.mapbox-bathymetry-v2",
      });

      map.addLayer({
        id: "bathymetry-fill",
        type: "fill",
        source: "bathymetry",
        "source-layer": "depth",
        minzoom: 0,
        maxzoom: 8,
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "min_depth"],
            0, "rgba(18, 68, 80, 0.10)",
            200, "rgba(14, 58, 74, 0.16)",
            1000, "rgba(10, 45, 65, 0.22)",
            3000, "rgba(6, 34, 54, 0.30)",
            6000, "rgba(3, 22, 40, 0.38)"
          ],
          "fill-outline-color": "rgba(235, 220, 180, 0.35)"
        }
      });

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: { top: 48, bottom: 48, left: 48, right: 48 },
          maxZoom: 5,
        });
      }
    });
  })();
}