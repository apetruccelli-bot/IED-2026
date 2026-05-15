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

mapboxgl.accessToken = "pk.eyJ1IjoibS1zY290dG9sYXZpbmEiLCJhIjoiY21wM3N3b3d6MGYxMTJ0c2NxMnZzOG80dCJ9.M3V6x1Xasc2_64AmPzNpGw";

const mapContainer = document.getElementById("map");

// helper: normalize area names (take text before comma, lowercase)
function normalizeArea(a) {
  if (!a) return '';
  return String(a).split(',')[0].trim().toLowerCase();
}

// load data.json and map images by normalized area
async function loadImagesByArea() {
  try {
    const res = await fetch('data.json');
    if (!res.ok) return {};
    const data = await res.json();
    const map = {};
    (data.items || []).forEach((it) => {
      if (!it.area || !it.src) return;
      const key = normalizeArea(it.area);
      if (!map[key]) map[key] = [];
      map[key].push(it.src);
    });
    return map;
  } catch (e) {
    console.warn('Could not load data.json', e);
    return {};
  }
}

function showGallery(title, images){
  const gallery = document.getElementById('gallery');
  if (!gallery) return;
  gallery.innerHTML = '';
  const h = document.createElement('div');
  h.style.fontWeight = '600';
  h.style.marginRight = '12px';
  h.textContent = title + ':';
  gallery.appendChild(h);

  if (!images || images.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nessuna immagine per questa area';
    gallery.appendChild(empty);
    return;
  }

  images.forEach((src) => {
    const a = document.createElement('a');
    a.href = src;
    a.target = '_blank';
    a.rel = 'noopener';
    const img = document.createElement('img');
    img.src = src;
    img.alt = title;
    a.appendChild(img);
    gallery.appendChild(a);
  });
}

if (mapContainer && typeof mapboxgl !== "undefined") {
  (async () => {
    const areaMap = await loadImagesByArea();

    const map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-98.5795, 39.8283],
      zoom: 3.5,
      scrollZoom: false,
      projection: "mercator",
      pitch: 0,
      bearing: 0,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    const bounds = new mapboxgl.LngLatBounds();

    locations.forEach((location) => {
      const coordinates = [location.longitude, location.latitude];

      const markerElement = document.createElement("div");
      markerElement.className = "custom-marker";

      const marker = new mapboxgl.Marker(markerElement)
        .setLngLat(coordinates)
        .setPopup(
          new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: true,
            offset: 16,
          }).setText(location.title)
        )
        .addTo(map);

      // on click show images related to this area
      markerElement.addEventListener('click', () => {
        const key = normalizeArea(location.title);
        const imgs = areaMap[key] || [];
        showGallery(location.title, imgs);
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