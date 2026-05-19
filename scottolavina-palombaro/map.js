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

  const origin = [location.longitude, location.latitude];
  const placement = getPlacementConfig(location.title);
  const coastalItems = items.filter(isCoastalItem);
  const deepItems = items.filter((item) => !isCoastalItem(item));
  const placedPoints = [];

  function placeItemGroup(groupItems, isCoastal) {
    const perRing = isCoastal ? 3 : 3;
    const angleStep = isCoastal ? 18 : 28;
    // make deep-items much farther and more spread out
      const ringGap = isCoastal ? 26 : (placement.deepRingGap || 60);
      const baseDistance = isCoastal ? 22 : (placement.deepBaseDistance || 160);
    const baseBearing = isCoastal ? placement.coastBearing : placement.deepBearing;
    const minimumSpacingKm = isCoastal ? 14 : (placement.deepMinimumSpacingKm || 40);

    groupItems.forEach((item, index) => {
      const isDeepSea = !isCoastal && isDeepSeaItem(item);
      const ringIndex = Math.floor(index / perRing);
      const slotIndex = index % perRing;
      const slotOffset = slotIndex - (perRing - 1) / 2;
      let targetLngLat = origin;

      for (let attempt = 0; attempt < 18; attempt += 1) {
        const jitter = attempt * (isCoastal ? 6 : 12) * (attempt % 2 === 0 ? 1 : -1);

        // bias bearing base for deep items toward a common deep-side bearing
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

        if (!isTooClose || attempt === 13) {
          targetLngLat = candidate;
          placedPoints.push(candidate);
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

  // Calculate bounding box that includes origin and all placed markers
  if (activeImageMarkers.length > 0) {
    const bounds = new mapboxgl.LngLatBounds(origin, origin);
    activeImageMarkers.forEach((marker) => {
      bounds.extend(marker.getLngLat());
    });

    // Save bounds and map for use in zoom/move handlers
    imageMarkersBounds = bounds;
    imageMarkersMap = map;

    // Fit map to show all images with padding
    map.fitBounds(bounds, {
      padding: { top: 80, bottom: 80, left: 80, right: 80 },
      maxZoom: 7,
      duration: 800
    });

    // Attach a guarded listener to keep images in view during zoom/pan.
    // Guarding avoids recursive fitBounds -> moveend -> fitBounds loops.
    if (ensureImagesVisibleHandler) {
      map.off('moveend', ensureImagesVisibleHandler);
    }

    ensureImagesVisibleHandler = () => {
      if (!imageMarkersBounds || !imageMarkersMap || activeImageMarkers.length === 0) return;
      if (isAdjustingImageBounds) return;

      const now = Date.now();
      if (now - lastBoundsAdjustTime < 220) return;

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
          duration: 0,
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

// load data.json and map images by normalized area
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

  const imageLink = gallery.querySelector('.map-gallery-link');
  const image = gallery.querySelector('.map-gallery-image');
  const counter = gallery.querySelector('.map-gallery-count');

  if (!imageLink || !image || !counter) return;

  if (!activeGalleryImages.length) {
    imageLink.href = '#';
    image.alt = activeGalleryTitle || 'Gallery image';
    image.removeAttribute('src');
    counter.textContent = '0 / 0';
    return;
  }

  const currentImage = activeGalleryImages[activeGalleryIndex];
  imageLink.href = currentImage.src;
  image.alt = currentImage.description || activeGalleryTitle || 'Gallery image';
  image.src = currentImage.src;
  counter.textContent = `${activeGalleryIndex + 1} / ${activeGalleryImages.length}`;
}

function stepGallery(direction) {
  if (!activeGalleryImages.length) return;

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

  const imageLink = document.createElement('a');
  imageLink.className = 'map-gallery-link';
  imageLink.target = '_blank';
  imageLink.rel = 'noopener';

  const img = document.createElement('img');
  img.className = 'map-gallery-image';
  img.alt = title;
  imageLink.appendChild(img);
  viewport.appendChild(imageLink);

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
      projection: "mercator",
      pitch: initialMapView.pitch,
      bearing: initialMapView.bearing,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    const bounds = new mapboxgl.LngLatBounds();

    // Define helper functions outside the loop
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
    renderImagesAroundLocation(map, location, images);
  }, 1600);
}
    function navigateMapWithHand(handX, handY, videoWidth, videoHeight, movementScale = 1) {
  // If a location detail is open, skip hand-driven panning
  if (window.locationIsOpen) return;

  // Defensive defaults
  const vw = videoWidth || window.innerWidth;
  const vh = videoHeight || window.innerHeight;

  // If the video is mirrored in the UI (scaleX(-1)), invert X so visual movement matches math
  const isVideoMirrored = true;
  const effectiveX = isVideoMirrored ? vw - handX : handX;

  // Normalize to -0.5 .. 0.5 around center
  const nx = effectiveX / vw - 0.5;
  const ny = handY / vh - 0.5;

  // Larger dead zone to reduce drift significantly
  const deadZoneFraction = 0.12; // 12% of view instead of 4%
  if (Math.abs(nx) < deadZoneFraction && Math.abs(ny) < deadZoneFraction) return;

  // Map pan strength (pixels). Increase for better response and right/left control
  const maxPanX = Math.max(150, vw * 0.25); // more horizontal sensitivity
  const maxPanY = Math.max(100, vh * 0.15);

  const panX = nx * maxPanX * 2.0 * movementScale; // increased horizontal gain
  const panY = ny * maxPanY * 1.0 * movementScale;

  map.panBy([panX, panY], {
    duration: 100,
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
      
      // Clear gallery
      const gallery = document.getElementById('gallery');
      if (gallery) {
        gallery.innerHTML = '';
      }
      
      // Clear image markers
      clearActiveImageMarkers();
      
      // Reset map view
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

    // Expose functions to global scope
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

    // Create markers with click handlers
    locations.forEach((location) => {
      const coordinates = [location.longitude, location.latitude];

      const markerElement = document.createElement("div");
      markerElement.className = "map-location-label";
      markerElement.textContent = location.title;

      new mapboxgl.Marker(markerElement)
        .setLngLat(coordinates)
        .addTo(map);

      markerElement.addEventListener("click", () => {
        const key = normalizeArea(location.title);
        const images = areaMap[key] || [];
        renderImagesAroundLocation(map, location, images);
      });

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

      // Bathymetry source and fill layer
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
          padding: {
            top: 48,
            bottom: 48,
            left: 48,
            right: 48,
          },
          maxZoom: 5,
        });
      }
    });
  })();
}