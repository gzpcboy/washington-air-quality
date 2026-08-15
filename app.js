const DATA_URL = new URL(
  "https://gis.ecology.wa.gov/serverext/rest/services/AQ/AirQualityMonitoringHourlyResults/MapServer/0/query"
);
const AIRNOW_CONTOUR_URL = new URL(
  "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/AirNowLatestContoursCombined/FeatureServer/0/query"
);

const QUERY_FIELDS = [
  "SiteId", "SiteName", "SiteLocation", "DateTime_PST", "HourPriorToLatest",
  "AQIValue", "AQICategory", "AQI_PM25", "PM25_Value", "AQI_O3", "O3_Value",
  "AQI_NO2", "NO2_Value", "AQI_SO2", "SO2_Value", "AQI_CO", "CO_Value",
  "AQI_PM10", "PM10_Value"
];

DATA_URL.search = new URLSearchParams({
  where: "HourPriorToLatest <= 1",
  outFields: QUERY_FIELDS.join(","),
  returnGeometry: "true",
  outSR: "4326",
  f: "json"
});

AIRNOW_CONTOUR_URL.search = new URLSearchParams({
  where: "1=1",
  outFields: "gridcode,Timestamp",
  geometry: "-124.95,45.54,-116.85,49.05",
  geometryType: "esriGeometryEnvelope",
  inSR: "4326",
  spatialRel: "esriSpatialRelIntersects",
  outSR: "4326",
  returnGeometry: "true",
  f: "geojson"
});

const REFRESH_MS = 60 * 60 * 1000;
const MAX_READING_AGE_MS = 3 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 15 * 60 * 1000;
const WASHINGTON_BOUNDS = L.latLngBounds([45.54, -124.95], [49.05, -116.85]);
const CONTOUR_CATEGORIES = {
  1: { label: "Good", range: "0–50", color: "#00e400" },
  2: { label: "Moderate", range: "51–100", color: "#ffff00" },
  3: { label: "Unhealthy for Sensitive Groups", range: "101–150", color: "#ff7e00" },
  4: { label: "Unhealthy", range: "151–200", color: "#ff0000" },
  5: { label: "Very Unhealthy", range: "201–300", color: "#8f3f97" },
  6: { label: "Hazardous", range: "301+", color: "#7e0023" }
};
let contourOpacity = 0.58;
let contourUpdatedTimestamp = null;

const map = L.map("map", {
  zoomControl: false,
  minZoom: 5,
  maxBounds: [[43.5, -128], [51, -113]],
  maxBoundsViscosity: 0.7
});

L.control.zoom({ position: "bottomleft" }).addTo(map);
map.fitBounds(WASHINGTON_BOUNDS, { padding: [16, 16] });

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const airNowContourLayer = L.geoJSON(null, {
  style(feature) {
    const details = CONTOUR_CATEGORIES[feature?.properties?.gridcode];
    return {
      fillColor: details?.color ?? "transparent",
      fillOpacity: contourOpacity,
      color: "transparent",
      weight: 0
    };
  },
  onEachFeature(feature, layer) {
    layer.bindPopup(() => contourPopupHtml(feature.properties), { maxWidth: 280 });
  }
}).addTo(map);
const stationLayer = L.layerGroup().addTo(map);
const updatedElement = document.querySelector("#updated");
const errorElement = document.querySelector("#error");
const locateButton = document.querySelector("#locate");
const locationStatus = document.querySelector("#location-status");
const aqiLayerToggle = document.querySelector("#aqi-layer-toggle");
const stationLayerToggle = document.querySelector("#stations-toggle");
const opacityControl = document.querySelector("#aqi-opacity");
const layerSource = document.querySelector("#layer-source");
let stations = [];
let userMarker;

function aqiDetails(aqi) {
  if (!Number.isFinite(aqi) || aqi < 0) {
    return { label: "No current AQI", color: "#6b7280", textClass: "light-text" };
  }
  if (aqi <= 50) return { label: "Good", color: "#00e400", textClass: "dark-text" };
  if (aqi <= 100) return { label: "Moderate", color: "#ffff00", textClass: "dark-text" };
  if (aqi <= 150) return { label: "Unhealthy for Sensitive Groups", color: "#ff7e00", textClass: "dark-text" };
  if (aqi <= 200) return { label: "Unhealthy", color: "#ff0000", textClass: "light-text" };
  if (aqi <= 300) return { label: "Very Unhealthy", color: "#8f3f97", textClass: "light-text" };
  return { label: "Hazardous", color: "#7e0023", textClass: "light-text" };
}

function isValidAqi(value) {
  return Number.isInteger(value) && value >= 0;
}

function isCurrent(timestamp, now = Date.now()) {
  return Number.isFinite(timestamp)
    && timestamp >= now - MAX_READING_AGE_MS
    && timestamp <= now + FUTURE_TOLERANCE_MS;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(timestamp) {
  if (!Number.isFinite(timestamp)) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(timestamp));
}

function dominantPollutant(attributes) {
  const pollutants = [
    ["PM2.5", attributes.AQI_PM25],
    ["Ozone", attributes.AQI_O3],
    ["NO₂", attributes.AQI_NO2],
    ["SO₂", attributes.AQI_SO2],
    ["CO", attributes.AQI_CO],
    ["PM10", attributes.AQI_PM10]
  ].filter(([, value]) => Number.isFinite(value));

  if (!pollutants.length) return "Unavailable";
  pollutants.sort((a, b) => b[1] - a[1]);
  return pollutants[0][0];
}

function popupHtml(station) {
  const { attributes, aqi, category, timestamp } = station;
  const pm25 = Number.isFinite(attributes.PM25_Value)
    ? `${attributes.PM25_Value.toFixed(1)} µg/m³`
    : "Unavailable";

  return `
    <h2 class="popup-title">${escapeHtml(attributes.SiteName || "Unnamed station")}</h2>
    <dl class="popup-grid">
      <dt>Current AQI</dt><dd>${aqi ?? "Unavailable"}</dd>
      <dt>Category</dt><dd>${escapeHtml(category.label)}</dd>
      <dt>Pollutant</dt><dd>${escapeHtml(dominantPollutant(attributes))}</dd>
      <dt>PM2.5</dt><dd>${pm25}</dd>
      <dt>Updated</dt><dd>${escapeHtml(formatTime(timestamp))}</dd>
    </dl>`;
}

function parseTimestamp(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function contourPopupHtml(properties) {
  const details = CONTOUR_CATEGORIES[properties?.gridcode];
  if (!details) return "AirNow contour data unavailable";
  return `
    <h2 class="popup-title">Estimated AQI</h2>
    <dl class="popup-grid">
      <dt>AQI range</dt><dd>${details.range}</dd>
      <dt>Category</dt><dd>${escapeHtml(details.label)}</dd>
      <dt>Updated</dt><dd>${escapeHtml(formatTime(parseTimestamp(properties.Timestamp)))}</dd>
      <dt>Source</dt><dd>EPA AirNow</dd>
    </dl>
    <p class="estimate-disclaimer">AirNow contour areas estimate conditions between monitors. This is not a measurement at this location.</p>`;
}

function stationIcon(aqi, category) {
  const label = aqi ?? "—";
  const noDataClass = aqi === null ? " no-data" : "";
  return L.divIcon({
    className: "",
    html: `<div class="aqi-marker ${category.textClass}${noDataClass}" style="background:${category.color}" aria-label="AQI ${label}">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18]
  });
}

function normalizeFeature(feature, now) {
  const attributes = feature?.attributes ?? {};
  const longitude = Number(feature?.geometry?.x);
  const latitude = Number(feature?.geometry?.y);
  const timestamp = Number(attributes.DateTime_PST);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !isCurrent(timestamp, now)) return null;

  const aqi = isValidAqi(attributes.AQIValue) ? attributes.AQIValue : null;
  return {
    id: attributes.SiteId,
    attributes,
    latitude,
    longitude,
    timestamp,
    aqi,
    category: aqiDetails(aqi)
  };
}

function renderStations(features) {
  const now = Date.now();
  const latestBySite = new Map();
  for (const feature of features) {
    const station = normalizeFeature(feature, now);
    if (!station) continue;
    const key = station.id ?? `${station.latitude},${station.longitude}`;
    const existing = latestBySite.get(key);
    if (!existing || station.timestamp > existing.timestamp) latestBySite.set(key, station);
  }
  stations = [...latestBySite.values()];
  stationLayer.clearLayers();

  for (const station of stations) {
    const marker = L.marker([station.latitude, station.longitude], {
      icon: stationIcon(station.aqi, station.category),
      title: `${station.attributes.SiteName}: AQI ${station.aqi ?? "unavailable"}`,
      riseOnHover: true
    });
    marker.bindPopup(popupHtml(station));
    marker.addTo(stationLayer);
    station.marker = marker;
  }

  if (!stations.length) throw new Error("The service returned no current station readings.");
  const latest = Math.max(...stations.map((station) => station.timestamp));
  updatedElement.textContent = `Last updated ${formatTime(latest)} · ${stations.length} stations`;
}

async function loadStations() {
  errorElement.hidden = true;
  try {
    const response = await fetch(DATA_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Data request failed (${response.status})`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message || "The data service returned an error.");
    if (!Array.isArray(payload.features)) throw new Error("Unexpected data response.");
    renderStations(payload.features);
  } catch (error) {
    console.error("Unable to load Washington air-quality data:", error);
    errorElement.textContent = "Live air-quality data is temporarily unavailable. Retrying automatically.";
    errorElement.hidden = false;
    if (!stations.length) updatedElement.textContent = "Current readings unavailable";
  }
}

async function loadAirNowContours() {
  try {
    const response = await fetch(AIRNOW_CONTOUR_URL, { headers: { Accept: "application/geo+json, application/json" } });
    if (!response.ok) throw new Error(`AirNow contour request failed (${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload.features)) throw new Error("Unexpected AirNow contour response.");

    const currentFeatures = payload.features.filter((feature) => {
      const gridcode = Number(feature?.properties?.gridcode);
      const timestamp = parseTimestamp(feature?.properties?.Timestamp);
      return CONTOUR_CATEGORIES[gridcode] && isCurrent(timestamp);
    });
    if (!currentFeatures.length) throw new Error("AirNow returned no current Washington contours.");

    contourUpdatedTimestamp = Math.max(...currentFeatures.map((feature) => parseTimestamp(feature.properties.Timestamp)));
    airNowContourLayer.clearLayers();
    airNowContourLayer.addData({ type: "FeatureCollection", features: currentFeatures });
    layerSource.textContent = `EPA AirNow contours · ${formatTime(contourUpdatedTimestamp)}`;
    layerSource.dataset.error = "false";
  } catch (error) {
    console.error("Unable to load EPA AirNow AQI contours:", error);
    if (!isCurrent(contourUpdatedTimestamp)) {
      airNowContourLayer.clearLayers();
      contourUpdatedTimestamp = null;
    }
    layerSource.textContent = contourUpdatedTimestamp
      ? "AirNow refresh delayed · showing last current contours"
      : "EPA AirNow contours are temporarily unavailable";
    layerSource.dataset.error = "true";
  }
}

function distanceMiles(from, station) {
  return from.distanceTo(L.latLng(station.latitude, station.longitude)) / 1609.344;
}

function showLocationStatus(message) {
  locationStatus.textContent = message;
  locationStatus.hidden = false;
}

function handleLocationFound(event) {
  locateButton.disabled = false;
  const position = event.latlng;
  if (userMarker) userMarker.remove();
  userMarker = L.marker(position, {
    icon: L.divIcon({ className: "", html: '<div class="user-location" aria-label="Your location"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    zIndexOffset: 1000
  }).addTo(map).bindPopup("Your location");

  if (!stations.length) {
    map.setView(position, 10);
    showLocationStatus("Location found. Station data is not currently available.");
    return;
  }

  const nearest = stations.reduce((best, station) =>
    distanceMiles(position, station) < distanceMiles(position, best) ? station : best
  );
  const miles = distanceMiles(position, nearest);
  const group = L.featureGroup([userMarker, nearest.marker]);
  map.fitBounds(group.getBounds().pad(0.35), { maxZoom: 11 });
  nearest.marker.openPopup();
  showLocationStatus(`Nearest station: ${nearest.attributes.SiteName} (${miles.toFixed(1)} mi)`);
}

function handleLocationError(event) {
  locateButton.disabled = false;
  const denied = event.code === 1;
  showLocationStatus(denied
    ? "Location permission was denied. You can still explore all stations on the map."
    : "Your location could not be determined. Please check browser location settings.");
}

aqiLayerToggle.addEventListener("change", () => {
  if (aqiLayerToggle.checked) airNowContourLayer.addTo(map);
  else airNowContourLayer.remove();
});

stationLayerToggle.addEventListener("change", () => {
  if (stationLayerToggle.checked) stationLayer.addTo(map);
  else stationLayer.remove();
});

opacityControl.addEventListener("input", () => {
  contourOpacity = Number(opacityControl.value) / 100;
  airNowContourLayer.setStyle({ fillOpacity: contourOpacity });
});

locateButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showLocationStatus("This browser does not support geolocation.");
    return;
  }
  locateButton.disabled = true;
  locationStatus.hidden = true;
  map.locate({ enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
});

map.on("locationfound", handleLocationFound);
map.on("locationerror", handleLocationError);

loadStations();
loadAirNowContours();
setInterval(loadStations, REFRESH_MS);
setInterval(loadAirNowContours, REFRESH_MS);
