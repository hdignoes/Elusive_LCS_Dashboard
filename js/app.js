let map;
let trackBaseLayer;
let trackSegmentLayer;
let hitSegmentLayer;
let historyPointLayer;
let timeMarkerLayer;
let currentMarker;
let selectedHistoryMarker;
let timeseriesChart;
let timeseriesYAxisChart;
let selectedHistoryPointIndex = null;
let hasCenteredOnInitialLatest = false;

let legendControl;
let mapControlsContainer;
let legendContainer;
let legendBodyContainer;
let legendTitleContainer;
let legendToggleButton;
let floatingPollutantSelect;

let routeLatLngs = [];
let timeseriesPointsRaw = [];
let timeseriesPoints = [];
let timeseriesDecimationActive = false;
let timeseriesRawCount = 0;
let timeseriesDisplayCount = 0;

let latestData = null;
let historyData = null;
let selectedPollutant = CONFIG.defaultPollutant;

const els = {
  status: document.getElementById("status-pill"),
  updated: document.getElementById("last-updated"),
  selectedReadingName: document.getElementById("selected-reading-name"),
  selectedReadingValue: document.getElementById("selected-reading-value"),
  selectedReadingMeta: document.getElementById("selected-reading-meta"),
  dataQualityList: document.getElementById("data-quality-list"),
  pollutantList: document.getElementById("pollutant-list"),
  timeseriesPanel: document.getElementById("timeseries-panel"),
  timeseriesToggle: document.getElementById("timeseries-toggle"),
  timeseriesSubtitle: document.getElementById("timeseries-subtitle"),
  timeseriesUnitLabel: document.getElementById("timeseries-unit-label"),
  timeseriesChart: document.getElementById("timeseries-chart"),
  timeseriesYAxisChart: document.getElementById("timeseries-y-axis-chart"),
  timeseriesChartInner: document.getElementById("timeseries-chart-inner"),
  currentPollutantsCard: document.getElementById("current-pollutants-card")
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  initMap();
  initPollutantControls();
  initTimeseriesPanel();
  applyResponsiveDefaults();

  window.addEventListener("resize", applyResponsiveDefaults);

  loadAllData();
  setInterval(loadAllData, CONFIG.refreshMs);
}

/* =========================================================
   Initialization
   ========================================================= */

function initMap() {
  map = L.map("map").setView(CONFIG.startView.center, CONFIG.startView.zoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  trackBaseLayer = L.layerGroup().addTo(map);
  trackSegmentLayer = L.layerGroup().addTo(map);
  hitSegmentLayer = L.layerGroup().addTo(map);
  historyPointLayer = L.layerGroup().addTo(map);
  timeMarkerLayer = L.layerGroup().addTo(map);

  initMapControls();
}

function initMapControls() {
  legendControl = L.control({
    position: "topright"
  });

  legendControl.onAdd = function () {
    mapControlsContainer = L.DomUtil.create("div", "map-control-stack");

    L.DomEvent.disableClickPropagation(mapControlsContainer);
    L.DomEvent.disableScrollPropagation(mapControlsContainer);

    const selectWrap = L.DomUtil.create("div", "map-select-control", mapControlsContainer);

    const selectLabel = L.DomUtil.create("label", "map-select-label", selectWrap);
    selectLabel.textContent = "Track pollutant";
    selectLabel.setAttribute("for", "map-pollutant-select");

    floatingPollutantSelect = L.DomUtil.create("select", "map-pollutant-select", selectWrap);
    floatingPollutantSelect.id = "map-pollutant-select";

    const buttonRow = L.DomUtil.create("div", "map-control-button-row", mapControlsContainer);

    const latestButton = L.DomUtil.create("button", "map-button", buttonRow);
    latestButton.type = "button";
    latestButton.textContent = "Latest";
    latestButton.setAttribute("aria-label", "Jump to latest vessel location");
    latestButton.addEventListener("click", focusLatestPoint);

    const fitButton = L.DomUtil.create("button", "map-button", buttonRow);
    fitButton.type = "button";
    fitButton.textContent = "Fit route";
    fitButton.setAttribute("aria-label", "Fit the full vessel route on the map");
    fitButton.addEventListener("click", fitRouteToMap);

    legendContainer = L.DomUtil.create("div", "map-legend", mapControlsContainer);

    const legendHeader = L.DomUtil.create("div", "map-legend-header", legendContainer);
    legendHeader.setAttribute("role", "button");
    legendHeader.setAttribute("tabindex", "0");
    legendHeader.setAttribute("aria-expanded", "true");

    legendTitleContainer = L.DomUtil.create("div", "map-legend-title", legendHeader);
    legendTitleContainer.textContent = "Legend";

    legendToggleButton = L.DomUtil.create("span", "map-legend-toggle", legendHeader);
    legendToggleButton.textContent = "▾";

    legendBodyContainer = L.DomUtil.create("div", "map-legend-body", legendContainer);

    const toggleLegend = () => {
      legendContainer.dataset.userToggled = "true";
      setLegendCollapsed(!legendContainer.classList.contains("collapsed"));
    };

    legendHeader.addEventListener("click", toggleLegend);

    legendHeader.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleLegend();
      }
    });

    return mapControlsContainer;
  };

  legendControl.addTo(map);
}

function initPollutantControls() {
  if (!floatingPollutantSelect) return;

  populatePollutantSelect(floatingPollutantSelect);

  floatingPollutantSelect.addEventListener("change", (event) => {
    setSelectedPollutant(event.target.value);
  });
}

function populatePollutantSelect(selectElement) {
  selectElement.innerHTML = "";

  const usedKeys = new Set();

  CONFIG.pollutantGroups.forEach((group) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;

    group.keys.forEach((key) => {
      const meta = CONFIG.pollutants[key];

      if (!meta) return;

      usedKeys.add(key);

      const option = document.createElement("option");
      option.value = key;
      option.textContent = meta.unit
        ? `${meta.label} (${meta.unit})`
        : meta.label;
      option.selected = key === selectedPollutant;

      optgroup.appendChild(option);
    });

    selectElement.appendChild(optgroup);
  });

  Object.entries(CONFIG.pollutants).forEach(([key, meta]) => {
    if (usedKeys.has(key)) return;

    const option = document.createElement("option");
    option.value = key;
    option.textContent = meta.unit
      ? `${meta.label} (${meta.unit})`
      : meta.label;
    option.selected = key === selectedPollutant;

    selectElement.appendChild(option);
  });
}

function setSelectedPollutant(key) {
  if (!CONFIG.pollutants[key]) return;

  selectedPollutant = key;

  if (floatingPollutantSelect) {
    floatingPollutantSelect.value = key;
  }

  renderTrack();
  renderTimeMarkers();
  renderCurrentMarker();
  renderPanel();
  renderLegend();
  renderTimeseriesChart();

  if (selectedHistoryMarker && selectedHistoryMarker._selectedPoint) {
    selectedHistoryMarker.bindPopup(
      makePopup(selectedHistoryMarker._selectedPoint, selectedPollutant)
    );
  }
}

function initTimeseriesPanel() {
  if (!els.timeseriesPanel || !els.timeseriesToggle) return;

  els.timeseriesToggle.addEventListener("click", () => {
    const isCollapsed = els.timeseriesPanel.classList.toggle("collapsed");

    els.timeseriesPanel.dataset.userToggled = "true";
    els.timeseriesToggle.textContent = isCollapsed ? "Show" : "Minimize";
    els.timeseriesToggle.setAttribute("aria-expanded", String(!isCollapsed));

    requestAnimationFrame(resizeCharts);
  });
}

/* =========================================================
   Data loading
   ========================================================= */

async function loadAllData() {
  try {
    const [history, latest] = await Promise.all([
      fetchJson(CONFIG.dataUrls.history),
      fetchJson(CONFIG.dataUrls.latest)
    ]);

    historyData = history;
    latestData = normalizeLatestData(latest);
  } catch (error) {
    console.error("Data loading error:", error);

    els.status.textContent = "Data loading error";
    els.status.className = "status-pill error";
    return;
  }

  const failures = [];

  const renderSteps = [
    ["track", renderTrack],
    ["sunrise/sunset markers", renderTimeMarkers],
    ["current vessel marker", renderCurrentMarker],
    ["side panel", renderPanel],
    ["legend", renderLegend],
    ["time-series chart", renderTimeseriesChart],
    ["data status", renderDataQuality]
  ];

  renderSteps.forEach(([label, fn]) => {
    try {
      fn();
    } catch (error) {
      console.error(`Dashboard rendering error in ${label}:`, error);
      failures.push(label);
    }
  });

  try {
    setStatusFromTimestamp(latestData.timestamp);
  } catch (error) {
    console.error("Status rendering error:", error);
    failures.push("status");
  }

  if (failures.length > 0) {
    els.status.textContent = `Display issue: ${failures.join(", ")}`;
    els.status.className = "status-pill error";
  }
}

async function fetchJson(url) {
  const fullUrl = `${url}?t=${Date.now()}`;

  const response = await fetch(fullUrl, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${fullUrl}: HTTP ${response.status}`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error(`Invalid JSON in ${url}: ${error.message}`);
  }
}

function normalizeLatestData(rawLatest) {
  if (!rawLatest || typeof rawLatest !== "object") {
    return {
      timestamp: null,
      lat: null,
      lon: null,
      pollutants: {}
    };
  }

  const properties = rawLatest.properties || rawLatest;
  const coords = rawLatest.geometry?.coordinates;

  const lonFromGeometry = Array.isArray(coords) ? coords[0] : null;
  const latFromGeometry = Array.isArray(coords) ? coords[1] : null;

  const pollutants = {
    ...(properties.pollutants || {})
  };

  Object.keys(CONFIG.pollutants).forEach((key) => {
    if (pollutants[key] === undefined && properties[key] !== undefined) {
      pollutants[key] = properties[key];
    }
  });

  return {
    timestamp:
      properties.timestamp ??
      properties.time ??
      properties.datetime ??
      properties.dateTime ??
      null,

    lat:
      properties.lat ??
      properties.latitude ??
      latFromGeometry ??
      null,

    lon:
      properties.lon ??
      properties.lng ??
      properties.longitude ??
      lonFromGeometry ??
      null,

    pollutants
  };
}

function getLatestPollutantValue(key) {
  if (!latestData) return null;

  if (latestData.pollutants && latestData.pollutants[key] !== undefined) {
    return latestData.pollutants[key];
  }

  if (latestData[key] !== undefined) {
    return latestData[key];
  }

  return null;
}

/* =========================================================
   Data helpers
   ========================================================= */

function getHistoryPoints() {
  if (!historyData || !Array.isArray(historyData.features)) {
    return [];
  }

  return historyData.features
    .filter((feature) => {
      const coords = feature.geometry?.coordinates;

      return (
        feature.geometry?.type === "Point" &&
        Array.isArray(coords) &&
        Number.isFinite(Number(coords[0])) &&
        Number.isFinite(Number(coords[1]))
      );
    })
    .map((feature, index) => {
      const [lon, lat] = feature.geometry.coordinates;

      return {
        index,
        lat: Number(lat),
        lon: Number(lon),
        properties: feature.properties || {}
      };
    });
}

function getSortedHistoryPointsAscending() {
  return getHistoryPoints()
    .map((point) => {
      return {
        ...point,
        time: Date.parse(point.properties.timestamp)
      };
    })
    .sort((a, b) => {
      const aHasTime = Number.isFinite(a.time);
      const bHasTime = Number.isFinite(b.time);

      if (aHasTime && bHasTime && a.time !== b.time) {
        return a.time - b.time;
      }

      return a.index - b.index;
    });
}

function getLatestBearing() {
  const points = getSortedHistoryPointsAscending().filter((point) => {
    return Number.isFinite(point.lat) && Number.isFinite(point.lon);
  });

  if (points.length < 2) {
    return null;
  }

  const from = points[points.length - 2];
  const to = points[points.length - 1];

  if (from.lat === to.lat && from.lon === to.lon) {
    return null;
  }

  return calculateBearing(from.lat, from.lon, to.lat, to.lon);
}

/* =========================================================
   Map rendering
   ========================================================= */

function renderTrack() {
  trackBaseLayer.clearLayers();
  trackSegmentLayer.clearLayers();
  hitSegmentLayer.clearLayers();
  historyPointLayer.clearLayers();

  const points = getSortedHistoryPointsAscending();

  routeLatLngs = points.map((point) => [point.lat, point.lon]);

  if (routeLatLngs.length === 0) return;

  L.polyline(routeLatLngs, {
    color: CONFIG.colors.trackBase,
    weight: 2,
    opacity: 0.28
  }).addTo(trackBaseLayer);

  renderPollutantTrackSegments(points);
  renderHistoryPointMarkers(points);

  if (!hasCenteredOnInitialLatest) {
    centerMapOnLatestPoint();
  }
}

function renderPollutantTrackSegments(points) {
  const pollutantMeta = CONFIG.pollutants[selectedPollutant];

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];

    const fromValue = Number(from.properties[selectedPollutant]);
    const toValue = Number(to.properties[selectedPollutant]);

    const usableValue =
      Number.isFinite(toValue)
        ? toValue
        : Number.isFinite(fromValue)
          ? fromValue
          : null;

    if (usableValue === null) continue;

    const segmentColor = getPollutantColor(usableValue, pollutantMeta);
    const isSelected =
      from.index === selectedHistoryPointIndex ||
      to.index === selectedHistoryPointIndex;

    const visibleSegment = L.polyline(
      [
        [from.lat, from.lon],
        [to.lat, to.lon]
      ],
      {
        color: segmentColor,
        weight: isSelected ? 9 : 6,
        opacity: isSelected ? 1 : 0.88,
        lineCap: "round",
        lineJoin: "round"
      }
    );

    visibleSegment.addTo(trackSegmentLayer);

    const hitSegment = L.polyline(
      [
        [from.lat, from.lon],
        [to.lat, to.lon]
      ],
      {
        color: "#000000",
        weight: 18,
        opacity: 0,
        interactive: true
      }
    );

    hitSegment.on("click", () => {
      selectHistoryPoint(to, {
        panMap: true,
        openPopup: true,
        zoomToPoint: true
      });
    });

    hitSegment.on("mouseover", () => {
      visibleSegment.setStyle({
        weight: isSelected ? 10 : 8,
        opacity: 1
      });
    });

    hitSegment.on("mouseout", () => {
      visibleSegment.setStyle({
        weight: isSelected ? 9 : 6,
        opacity: isSelected ? 1 : 0.88
      });
    });

    hitSegment.addTo(hitSegmentLayer);
  }
}

function renderTimeMarkers() {
  timeMarkerLayer.clearLayers();

  if (!CONFIG.sunMarkers?.enabled) return;

  const points = getSortedHistoryPointsAscending();
  const markers = getSunriseSunsetMarkers(points);

  markers.forEach((marker) => {
    const icon = makeTimeMarkerIcon(marker.type);

    const leafletMarker = L.marker([marker.point.lat, marker.point.lon], {
      icon
    });

    leafletMarker.on("click", () => {
      selectHistoryPoint(marker.point, {
        panMap: true,
        openPopup: true
      });
    });

    leafletMarker
      .bindTooltip(
        `${marker.type === "sunrise" ? "Sunrise" : "Sunset"} — ${formatTimestamp(marker.point.properties.timestamp)}`,
        {
          direction: "top",
          offset: [0, -12]
        }
      )
      .addTo(timeMarkerLayer);
  });
}

function renderCurrentMarker() {
  if (!latestData) return;

  const lat = Number(latestData.lat);
  const lon = Number(latestData.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const bearing = getLatestBearing();
  const arrowIcon = makeVesselArrowIcon(bearing);

  if (currentMarker) {
    currentMarker.setLatLng([lat, lon]);
    currentMarker.setIcon(arrowIcon);
  } else {
    currentMarker = L.marker([lat, lon], {
      icon: arrowIcon
    }).addTo(map);
  }

  const headingText = Number.isFinite(bearing)
    ? `${Math.round(bearing)}°`
    : "Unknown";

  currentMarker.bindPopup(`
    <strong>Current vessel location</strong><br>
    <strong>Heading</strong>: ${headingText}<br>
    <strong>Location</strong>: ${lat.toFixed(5)}, ${lon.toFixed(5)}
  `);
}

function fitRouteToMap() {
  if (!Array.isArray(routeLatLngs) || routeLatLngs.length === 0) return;

  if (routeLatLngs.length === 1) {
    map.setView(routeLatLngs[0], Math.max(map.getZoom(), 11), {
      animate: true
    });
    return;
  }

  map.fitBounds(routeLatLngs, {
    padding: [36, 36]
  });
}

function focusLatestPoint() {
  const lat = Number(latestData?.lat);
  const lon = Number(latestData?.lon);

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    map.setView([lat, lon], Math.max(map.getZoom(), 11), {
      animate: true
    });

    if (currentMarker) {
      currentMarker.openPopup();
    }

    return;
  }

  const points = getSortedHistoryPointsAscending();

  if (points.length > 0) {
    selectHistoryPoint(points[points.length - 1], {
      panMap: true,
      openPopup: true
    });
  }
}

function centerMapOnLatestPoint() {
  const lat = Number(latestData?.lat);
  const lon = Number(latestData?.lon);

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    map.setView([lat, lon], Math.max(map.getZoom(), 11), {
      animate: false
    });

    hasCenteredOnInitialLatest = true;
    return;
  }

  const points = getSortedHistoryPointsAscending();

  if (points.length > 0) {
    const latestPoint = points[points.length - 1];

    map.setView([latestPoint.lat, latestPoint.lon], Math.max(map.getZoom(), 11), {
      animate: false
    });

    hasCenteredOnInitialLatest = true;
  }
}

function renderHistoryPointMarkers(points) {
  const pollutantMeta = CONFIG.pollutants[selectedPollutant];

  points.forEach((point) => {
    const value = Number(point.properties[selectedPollutant]);

    const markerColor = Number.isFinite(value)
      ? getPollutantColor(value, pollutantMeta)
      : CONFIG.colors.unavailable;

    const isSelected = point.index === selectedHistoryPointIndex;

    const marker = L.circleMarker([point.lat, point.lon], {
      radius: isSelected ? 5 : 3,
      color: "#0f172a",
      weight: isSelected ? 2 : 1,
      opacity: 0.85,
      fillColor: markerColor,
      fillOpacity: isSelected ? 1 : 0.75,
      interactive: true
    });

    marker.on("click", () => {
      selectHistoryPoint(point, {
        panMap: true,
        openPopup: true,
        zoomToPoint: true
      });
    });

    marker.on("mouseover", () => {
      marker.setStyle({
        radius: isSelected ? 6 : 4,
        fillOpacity: 1
      });
    });

    marker.on("mouseout", () => {
      marker.setStyle({
        radius: isSelected ? 5 : 3,
        fillOpacity: isSelected ? 1 : 0.75
      });
    });

    marker.bindTooltip(formatTimestamp(point.properties.timestamp), {
      direction: "top",
      offset: [0, -8]
    });

    marker.addTo(historyPointLayer);
  });
}

function focusHistoryPoint(point, options = {}) {
  if (!point) return;

  const shouldPanMap = options.panMap !== false;
  const shouldOpenPopup = options.openPopup !== false;
  const shouldZoomToPoint = options.zoomToPoint === true;

  if (shouldPanMap) {
    const targetZoom = shouldZoomToPoint
      ? Math.max(map.getZoom(), 12)
      : Math.max(map.getZoom(), 11);

    map.setView([point.lat, point.lon], targetZoom, {
      animate: true,
      pan: {
        duration: 0.45
      }
    });
  }

  if (selectedHistoryMarker) {
    selectedHistoryMarker.setLatLng([point.lat, point.lon]);
  } else {
    selectedHistoryMarker = L.circleMarker([point.lat, point.lon], {
      radius: 9,
      color: "#0f172a",
      fillColor: "#ffffff",
      fillOpacity: 0.95,
      weight: 3,
      opacity: 1
    }).addTo(map);
  }

  selectedHistoryMarker._selectedPoint = point;
  selectedHistoryMarker.bindPopup(makePopup(point, selectedPollutant));

  if (shouldOpenPopup) {
    selectedHistoryMarker.openPopup();
  }

  selectedHistoryMarker.bringToFront();
}

function selectHistoryPoint(point, options = {}) {
  if (!point) return;

  selectedHistoryPointIndex = point.index;

  renderTrack();
  focusHistoryPoint(point, options);
  updateTimeseriesHighlight();
}

/* =========================================================
   Panel rendering
   ========================================================= */

function renderPanel() {
  if (!latestData) return;

  const pollutantMeta = CONFIG.pollutants[selectedPollutant];
  const selectedValue = getLatestPollutantValue(selectedPollutant);

  if (els.selectedReadingName) {
    els.selectedReadingName.textContent = `Current ${pollutantMeta.label}`;
  }

  if (els.selectedReadingValue) {
    els.selectedReadingValue.textContent = formatValue(
      selectedValue,
      pollutantMeta.unit,
      selectedPollutant
    );
  }

  if (els.selectedReadingMeta) {
    const groupLabel = pollutantMeta.group || "Variable";
    els.selectedReadingMeta.textContent = pollutantMeta.unit
      ? `${groupLabel} · ${pollutantMeta.unit}`
      : groupLabel;
  }

  els.updated.textContent = latestData?.timestamp
    ? formatTimestamp(latestData.timestamp)
    : "Unknown";

  els.pollutantList.innerHTML = "";

  Object.entries(CONFIG.pollutants).forEach(([key, meta]) => {
    const value = getLatestPollutantValue(key);

    const row = document.createElement("div");
    row.className = "pollutant-row";

    const name = document.createElement("span");
    name.className = "pollutant-name";
    name.textContent = meta.label;

    const number = document.createElement("span");
    number.className = "pollutant-value";
    number.textContent = formatValue(value, meta.unit, key);

    row.appendChild(name);
    row.appendChild(number);

    els.pollutantList.appendChild(row);
  });
}

function renderLegend() {
  if (!legendBodyContainer || !legendTitleContainer || !legendContainer) return;

  const meta = CONFIG.pollutants[selectedPollutant];

  const legendTitle = meta.unit
    ? `${meta.label} (${meta.unit})`
    : meta.label;

  legendTitleContainer.textContent = legendTitle;
  legendBodyContainer.innerHTML = "";

  meta.breaks.forEach((bin) => {
    const row = document.createElement("div");
    row.className = "legend-row";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = bin.color;

    const label = document.createElement("span");
    label.textContent = bin.label;

    row.appendChild(swatch);
    row.appendChild(label);

    legendBodyContainer.appendChild(row);
  });

  applyLegendResponsiveDefault();
}

function renderDataQuality() {
  if (!els.dataQualityList) return;

  els.dataQualityList.innerHTML = "";

  const lat = Number(latestData?.lat);
  const lon = Number(latestData?.lon);
  const points = getSortedHistoryPointsAscending();
  const selectedValue = getLatestPollutantValue(selectedPollutant);
  const ageInfo = getDataAgeInfo(latestData?.timestamp);

  addDataChip(
    Number.isFinite(lat) && Number.isFinite(lon) ? "GPS OK" : "No GPS",
    Number.isFinite(lat) && Number.isFinite(lon) ? "good" : "bad"
  );

  addDataChip(
    ageInfo.label,
    ageInfo.status
  );

  addDataChip(
    `${points.length} route points`,
    points.length > 0 ? "info" : "warn"
  );

  addDataChip(
    Number.isFinite(Number(selectedValue))
      ? `${CONFIG.pollutants[selectedPollutant].label} OK`
      : `${CONFIG.pollutants[selectedPollutant].label} missing`,
    Number.isFinite(Number(selectedValue)) ? "good" : "warn"
  );

  if (timeseriesDecimationActive) {
    addDataChip(
      `Chart optimized: ${timeseriesDisplayCount}/${timeseriesRawCount}`,
      "info"
    );
  }
}

function addDataChip(text, status) {
  const chip = document.createElement("span");
  chip.className = `data-chip ${status}`;
  chip.textContent = text;
  els.dataQualityList.appendChild(chip);
}

/* =========================================================
   Time-series chart
   ========================================================= */

function renderTimeseriesChart() {
  if (!els.timeseriesChart || !els.timeseriesYAxisChart || typeof Chart === "undefined") {
    return;
  }

  const pollutantMeta = CONFIG.pollutants[selectedPollutant];

  timeseriesPointsRaw = getSortedHistoryPointsAscending();

  const displayResult = makeDisplayTimeseriesPoints(
    timeseriesPointsRaw,
    selectedPollutant
  );

  timeseriesPoints = displayResult.points;
  timeseriesDecimationActive = displayResult.decimated;
  timeseriesRawCount = displayResult.rawCount;
  timeseriesDisplayCount = displayResult.displayCount;

  if (els.timeseriesChartInner) {
    const chartWidth = Math.max(
      CONFIG.chart.minWidthPx,
      timeseriesPoints.length * CONFIG.chart.pixelsPerPoint
    );

    els.timeseriesChartInner.style.width = `${chartWidth}px`;
  }

  const labels = timeseriesPoints.map((point) => {
    return point.properties.timestamp
      ? formatTimestampShort(point.properties.timestamp)
      : "Unknown";
  });

  const values = timeseriesPoints.map((point) => {
    const value = Number(point.properties[selectedPollutant]);
    return Number.isFinite(value) ? value : null;
  });

  const pointColors = timeseriesPoints.map((point) => {
    const value = Number(point.properties[selectedPollutant]);

    if (!Number.isFinite(value)) {
      return CONFIG.colors.unavailable;
    }

    return getPollutantColor(value, pollutantMeta);
  });

  const pointRadii = timeseriesPoints.map((point) => {
    return point.index === selectedHistoryPointIndex ? 7 : 2.5;
  });

  const pointHoverRadii = timeseriesPoints.map((point) => {
    return point.index === selectedHistoryPointIndex ? 9 : 6;
  });

  const pointBorderColors = timeseriesPoints.map(() => {
    return "#0f172a";
  });

  const pointBorderWidths = timeseriesPoints.map((point) => {
    return point.index === selectedHistoryPointIndex ? 3 : 1;
  });

  if (els.timeseriesUnitLabel) {
    els.timeseriesUnitLabel.textContent = pollutantMeta.unit || "";
  }

  if (els.timeseriesSubtitle) {
    const decimationText = timeseriesDecimationActive
      ? ` Optimized long-route view: ${timeseriesDisplayCount} of ${timeseriesRawCount} points plotted; peaks are preserved.`
      : "";

    els.timeseriesSubtitle.textContent =
      `Showing ${pollutantMeta.label}. Scroll horizontally for long trips. Click a point to jump to the map.${decimationText}`;
  }

  if (timeseriesChart) {
    timeseriesChart.destroy();
  }

  if (timeseriesYAxisChart) {
    timeseriesYAxisChart.destroy();
  }

  const yScaleOptions = makeTimeseriesYScaleOptions(pollutantMeta, values);

  timeseriesYAxisChart = new Chart(els.timeseriesYAxisChart, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: "rgba(0, 0, 0, 0)",
          backgroundColor: "rgba(0, 0, 0, 0)",
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      animation: false,
      events: [],
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: false
        }
      },
      scales: {
        x: {
          display: false,
          grid: {
            display: false
          }
        },
        y: {
          ...yScaleOptions,
          position: "left",
          title: {
            display: false
          },
          grid: {
            display: false
          },
          ticks: {
            ...yScaleOptions.ticks,
            mirror: false,
            padding: 4
          }
        }
      }
    }
  });

  timeseriesChart = new Chart(els.timeseriesChart, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: pollutantMeta.unit
            ? `${pollutantMeta.label} (${pollutantMeta.unit})`
            : pollutantMeta.label,
          data: values,
          borderColor: "#0f172a",
          backgroundColor: "rgba(15, 23, 42, 0.08)",
          borderWidth: 2,
          tension: 0.25,
          pointRadius: pointRadii,
          pointHoverRadius: pointHoverRadii,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointBorderColors,
          pointBorderWidth: pointBorderWidths,
          spanGaps: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      animation: false,
      layout: {
        padding: {
          bottom: 34
        }
      },
      interaction: {
        mode: "nearest",
        intersect: true
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const index = items[0].dataIndex;
              const point = timeseriesPoints[index];

              return point?.properties?.timestamp
                ? formatTimestamp(point.properties.timestamp)
                : "Unknown time";
            },
            label: (item) => {
              return `${pollutantMeta.label}: ${formatValue(item.raw, pollutantMeta.unit, selectedPollutant)}`;
            },
            afterLabel: (item) => {
              const point = timeseriesPoints[item.dataIndex];

              if (!point) return "";

              return `Location: ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 12,
            padding: 4
          },
          grid: {
            display: false
          }
        },
        y: {
          ...yScaleOptions,
          display: false,
          grid: {
            display: false
          }
        }
      },
      onClick: (event) => {
        const chartPoints = timeseriesChart.getElementsAtEventForMode(
          event,
          "nearest",
          {
            intersect: false,
            axis: "x"
          },
          true
        );
      
        if (chartPoints.length === 0) return;
      
        const index = chartPoints[0].index;
        const point = timeseriesPoints[index];
      
        if (!point) return;
      
        selectHistoryPoint(point, {
          panMap: true,
          openPopup: true,
          zoomToPoint: true
        });
      }
    },
    plugins: [dayBoundaryChartPlugin, sunEventChartPlugin]
  });

  updateTimeseriesHighlight();
}

function makeDisplayTimeseriesPoints(rawPoints, pollutantKey) {
  const rawCount = rawPoints.length;
  const decimationConfig = CONFIG.chartDecimation || {};

  if (
    !decimationConfig.enabled ||
    rawCount <= decimationConfig.thresholdPoints ||
    rawCount <= decimationConfig.targetPoints
  ) {
    return {
      points: rawPoints,
      decimated: false,
      rawCount,
      displayCount: rawCount
    };
  }

  const targetPoints = Math.max(100, decimationConfig.targetPoints);
  const bucketSize = Math.ceil(rawCount / targetPoints);
  const keep = new Map();

  function keepPoint(point) {
    if (point) {
      keep.set(point.index, point);
    }
  }

  keepPoint(rawPoints[0]);
  keepPoint(rawPoints[rawPoints.length - 1]);

  if (selectedHistoryPointIndex !== null) {
    keepPoint(rawPoints.find((point) => point.index === selectedHistoryPointIndex));
  }

  getMidnightBoundaryMarkers(rawPoints).forEach((marker) => {
    keepPoint(marker.point);
  });

  getSunriseSunsetMarkers(rawPoints).forEach((marker) => {
    keepPoint(marker.point);
  });

  for (let start = 0; start < rawPoints.length; start += bucketSize) {
    const bucket = rawPoints.slice(start, start + bucketSize);

    if (bucket.length === 0) continue;

    keepPoint(bucket[0]);
    keepPoint(bucket[bucket.length - 1]);

    let minPoint = null;
    let maxPoint = null;
    let minValue = Infinity;
    let maxValue = -Infinity;

    bucket.forEach((point) => {
      const value = Number(point.properties[pollutantKey]);

      if (!Number.isFinite(value)) return;

      if (value < minValue) {
        minValue = value;
        minPoint = point;
      }

      if (value > maxValue) {
        maxValue = value;
        maxPoint = point;
      }
    });

    keepPoint(minPoint);
    keepPoint(maxPoint);
  }

  const displayPoints = Array.from(keep.values()).sort((a, b) => {
    const aTime = Date.parse(a.properties.timestamp);
    const bTime = Date.parse(b.properties.timestamp);

    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return aTime - bTime;
    }

    return a.index - b.index;
  });

  return {
    points: displayPoints,
    decimated: true,
    rawCount,
    displayCount: displayPoints.length
  };
}

function makeTimeseriesYScaleOptions(pollutantMeta, values) {
  const numericValues = values.filter((value) => {
    return Number.isFinite(Number(value));
  });

  const finiteBreaks = pollutantMeta.breaks
    .map((item) => item.max)
    .filter((value) => Number.isFinite(value));

  let minValue = numericValues.length > 0
    ? Math.min(...numericValues)
    : finiteBreaks.length > 0
      ? Math.min(...finiteBreaks)
      : 0;

  let maxValue = numericValues.length > 0
    ? Math.max(...numericValues)
    : finiteBreaks.length > 0
      ? Math.max(...finiteBreaks)
      : 1;

  if (selectedPollutant === "AQHI") {
    return {
      suggestedMin: 0,
      suggestedMax: Math.max(10, maxValue + 1),
      ticks: {
        precision: 0,
        stepSize: 1,
        maxTicksLimit: 6,
        callback: (value) => {
          return Math.round(value);
        }
      }
    };
  }

  if (minValue === maxValue) {
    minValue -= 1;
    maxValue += 1;
  }

  const padding = (maxValue - minValue) * 0.12;

  return {
    suggestedMin: Math.max(0, minValue - padding),
    suggestedMax: maxValue + padding,
    ticks: {
      precision: 0,
      maxTicksLimit: 5
    }
  };
}

function updateTimeseriesHighlight() {
  if (!timeseriesChart || !Array.isArray(timeseriesPoints)) return;

  const selectedIsDisplayed = timeseriesPoints.some((point) => {
    return point.index === selectedHistoryPointIndex;
  });

  if (
    timeseriesDecimationActive &&
    selectedHistoryPointIndex !== null &&
    !selectedIsDisplayed
  ) {
    renderTimeseriesChart();
    return;
  }

  const dataset = timeseriesChart.data.datasets[0];

  dataset.pointRadius = timeseriesPoints.map((point) => {
    return point.index === selectedHistoryPointIndex ? 7 : 2.5;
  });

  dataset.pointHoverRadius = timeseriesPoints.map((point) => {
    return point.index === selectedHistoryPointIndex ? 9 : 6;
  });

  dataset.pointBorderColor = timeseriesPoints.map(() => {
    return "#0f172a";
  });

  dataset.pointBorderWidth = timeseriesPoints.map((point) => {
    return point.index === selectedHistoryPointIndex ? 3 : 1;
  });

  const chartIndex = timeseriesPoints.findIndex((point) => {
    return point.index === selectedHistoryPointIndex;
  });

  if (chartIndex >= 0) {
    timeseriesChart.setActiveElements([
      {
        datasetIndex: 0,
        index: chartIndex
      }
    ]);
  } else {
    timeseriesChart.setActiveElements([]);
  }

  timeseriesChart.update("none");

  if (timeseriesYAxisChart) {
    timeseriesYAxisChart.update("none");
  }
}

/* =========================================================
   Day-boundary chart markers
   ========================================================= */

const dayBoundaryChartPlugin = {
  id: "dayBoundaryMarkers",

  afterDatasetsDraw(chart) {
    if (!CONFIG.dayBoundaryLines?.enabled) return;

    const { ctx, chartArea, scales } = chart;
    const xScale = scales.x;

    if (!xScale || !chartArea) return;

    const markers = getMidnightBoundaryMarkers(timeseriesPoints);

    ctx.save();

    markers.forEach((marker) => {
      const chartIndex = timeseriesPoints.findIndex((point) => {
        return point.index === marker.point.index;
      });

      if (chartIndex < 0) return;

      const x = xScale.getPixelForValue(chartIndex);

      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.strokeStyle = CONFIG.dayBoundaryLines.lineColor;
      ctx.stroke();

      const label = formatBoundaryDate(marker.point.properties.timestamp);
      const nearRightEdge = x > chartArea.right - 48;

      ctx.fillStyle = CONFIG.dayBoundaryLines.textColor;
      ctx.font = "700 10px system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.textAlign = nearRightEdge ? "right" : "left";

      ctx.fillText(
        label,
        nearRightEdge ? x - 4 : x + 4,
        chartArea.top + 4
      );
    });

    ctx.restore();
  }
};

const sunEventChartPlugin = {
  id: "sunEventMarkers",

  afterDraw(chart) {
    if (!CONFIG.sunMarkers?.enabled) return;

    const { ctx, chartArea, scales } = chart;
    const xScale = scales.x;

    if (!xScale || !chartArea) return;

    const markers = getSunriseSunsetMarkers(timeseriesPoints);

    if (!markers.length) return;

    ctx.save();

    markers.forEach((marker) => {
      const chartIndex = timeseriesPoints.findIndex((point) => {
        return point.index === marker.point.index;
      });

      if (chartIndex < 0) return;

      const x = xScale.getPixelForValue(chartIndex);
      const y = chartArea.bottom + 22;

      if (x < chartArea.left || x > chartArea.right) return;

      drawSunEventIcon(ctx, x, y, marker.type);
    });

    ctx.restore();
  }
};

function drawSunEventIcon(ctx, x, y, type) {
  const isSunrise = type === "sunrise";

  ctx.save();
  ctx.translate(x, y);

  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#334155";
  ctx.fillStyle = isSunrise ? "#facc15" : "#fb923c";

  // Horizon
  ctx.beginPath();
  ctx.moveTo(-9, 4);
  ctx.lineTo(9, 4);
  ctx.stroke();

  // Sun half-circle
  ctx.beginPath();
  ctx.arc(0, 4, 5.5, Math.PI, 0, false);
  ctx.fill();
  ctx.stroke();

  // Rays
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(0, -4);
  ctx.moveTo(-7, -4);
  ctx.lineTo(-5, -2);
  ctx.moveTo(7, -4);
  ctx.lineTo(5, -2);
  ctx.moveTo(-10, 0);
  ctx.lineTo(-7, 1);
  ctx.moveTo(10, 0);
  ctx.lineTo(7, 1);
  ctx.stroke();

  // Direction arrow
  ctx.beginPath();

  if (isSunrise) {
    ctx.moveTo(0, 10);
    ctx.lineTo(0, 6);
    ctx.moveTo(-3, 8);
    ctx.lineTo(0, 5);
    ctx.lineTo(3, 8);
  } else {
    ctx.moveTo(0, 6);
    ctx.lineTo(0, 10);
    ctx.moveTo(-3, 8);
    ctx.lineTo(0, 11);
    ctx.lineTo(3, 8);
  }

  ctx.stroke();
  ctx.restore();
}

/* =========================================================
   Sunrise / sunset and day-boundary helpers
   ========================================================= */

function getSunriseSunsetMarkers(points) {
  const toleranceMinutes = CONFIG.sunMarkers?.toleranceMinutes ?? 45;
  const grouped = groupPointsByLocalDate(points);
  const markers = [];

  Object.values(grouped).forEach((dayPoints) => {
    if (!dayPoints.length) return;

    const referencePoint = dayPoints[Math.floor(dayPoints.length / 2)];
    const localParts = getLocalTimeParts(referencePoint.properties.timestamp);

    if (!localParts) return;

    const sunTimes = getSunTimesForDate(
      Number(localParts.year),
      Number(localParts.month),
      Number(localParts.day),
      referencePoint.lat,
      referencePoint.lon
    );

    if (!sunTimes) return;

    const sunrisePoint = findNearestPointToLocalMinutes(
      dayPoints,
      sunTimes.sunriseMinutes,
      toleranceMinutes
    );

    const sunsetPoint = findNearestPointToLocalMinutes(
      dayPoints,
      sunTimes.sunsetMinutes,
      toleranceMinutes
    );

    if (sunrisePoint) {
      markers.push({
        type: "sunrise",
        point: sunrisePoint
      });
    }

    if (sunsetPoint) {
      markers.push({
        type: "sunset",
        point: sunsetPoint
      });
    }
  });

  return markers.sort((a, b) => {
    return Date.parse(a.point.properties.timestamp) - Date.parse(b.point.properties.timestamp);
  });
}

function getMidnightBoundaryMarkers(points) {
  const toleranceMinutes = CONFIG.dayBoundaryLines?.toleranceMinutes ?? 20;
  const grouped = groupPointsByLocalDate(points);
  const markers = [];

  Object.values(grouped).forEach((dayPoints) => {
    const midnightPoint = findNearestPointToLocalMinutes(dayPoints, 0, toleranceMinutes);

    if (midnightPoint) {
      markers.push({
        type: "midnight",
        point: midnightPoint
      });
    }
  });

  return markers.sort((a, b) => {
    return Date.parse(a.point.properties.timestamp) - Date.parse(b.point.properties.timestamp);
  });
}

function groupPointsByLocalDate(points) {
  const grouped = {};

  points.forEach((point) => {
    const parts = getLocalTimeParts(point.properties.timestamp);

    if (!parts) return;

    const key = `${parts.year}-${parts.month}-${parts.day}`;

    if (!grouped[key]) {
      grouped[key] = [];
    }

    grouped[key].push(point);
  });

  return grouped;
}

function findNearestPointToLocalMinutes(points, targetMinutes, toleranceMinutes) {
  let bestPoint = null;
  let bestOffset = Infinity;

  points.forEach((point) => {
    const parts = getLocalTimeParts(point.properties.timestamp);

    if (!parts) return;

    const localMinutes = parts.hour * 60 + parts.minute + parts.second / 60;

    const offset = Math.min(
      Math.abs(localMinutes - targetMinutes),
      Math.abs(localMinutes - targetMinutes + 1440),
      Math.abs(localMinutes - targetMinutes - 1440)
    );

    if (offset < bestOffset) {
      bestOffset = offset;
      bestPoint = point;
    }
  });

  return bestOffset <= toleranceMinutes ? bestPoint : null;
}

function getSunTimesForDate(year, month, day, lat, lon) {
  const sunriseUtcHours = calculateSunTimeUtcHours(year, month, day, lat, lon, true);
  const sunsetUtcHours = calculateSunTimeUtcHours(year, month, day, lat, lon, false);

  if (sunriseUtcHours === null || sunsetUtcHours === null) {
    return null;
  }

  const sunriseMinutes = utcHoursToLocalMinutes(year, month, day, sunriseUtcHours);
  const sunsetMinutes = utcHoursToLocalMinutes(year, month, day, sunsetUtcHours);

  return {
    sunriseMinutes,
    sunsetMinutes
  };
}

function calculateSunTimeUtcHours(year, month, day, latitude, longitude, isSunrise) {
  const zenith = 90.8333;
  const N = dayOfYear(year, month, day);
  const lngHour = longitude / 15;

  const t = isSunrise
    ? N + ((6 - lngHour) / 24)
    : N + ((18 - lngHour) / 24);

  const M = (0.9856 * t) - 3.289;

  let L =
    M +
    (1.916 * Math.sin(degreesToRadians(M))) +
    (0.020 * Math.sin(2 * degreesToRadians(M))) +
    282.634;

  L = normalizeDegrees(L);

  let RA = radiansToDegrees(Math.atan(0.91764 * Math.tan(degreesToRadians(L))));
  RA = normalizeDegrees(RA);

  const Lquadrant = Math.floor(L / 90) * 90;
  const RAquadrant = Math.floor(RA / 90) * 90;

  RA = RA + (Lquadrant - RAquadrant);
  RA = RA / 15;

  const sinDec = 0.39782 * Math.sin(degreesToRadians(L));
  const cosDec = Math.cos(Math.asin(sinDec));

  const cosH =
    (Math.cos(degreesToRadians(zenith)) - (sinDec * Math.sin(degreesToRadians(latitude)))) /
    (cosDec * Math.cos(degreesToRadians(latitude)));

  if (cosH > 1 || cosH < -1) {
    return null;
  }

  let H = isSunrise
    ? 360 - radiansToDegrees(Math.acos(cosH))
    : radiansToDegrees(Math.acos(cosH));

  H = H / 15;

  const T = H + RA - (0.06571 * t) - 6.622;
  let UT = T - lngHour;

  UT = ((UT % 24) + 24) % 24;

  return UT;
}

function utcHoursToLocalMinutes(year, month, day, utcHours) {
  const hours = Math.floor(utcHours);
  const minutes = Math.floor((utcHours - hours) * 60);
  const seconds = Math.round((((utcHours - hours) * 60) - minutes) * 60);

  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  const parts = getLocalTimeParts(utcDate.toISOString());

  if (!parts) return null;

  return parts.hour * 60 + parts.minute + parts.second / 60;
}

function dayOfYear(year, month, day) {
  const start = Date.UTC(year, 0, 0);
  const current = Date.UTC(year, month - 1, day);

  return Math.floor((current - start) / 86400000);
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function formatBoundaryDate(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleDateString([], {
    timeZone: CONFIG.displayTimeZone,
    month: "short",
    day: "numeric"
  });
}

/* =========================================================
   Popup and marker helpers
   ========================================================= */

function makePopup(point, pollutantKey) {
  const meta = CONFIG.pollutants[pollutantKey];
  const value = point.properties[pollutantKey];
  const timestamp = point.properties.timestamp;

  return `
    <strong>${meta.label}</strong>: ${formatValue(value, meta.unit, pollutantKey)}<br>
    <strong>Time</strong>: ${timestamp ? formatTimestamp(timestamp) : "Unknown"}<br>
    <strong>Location</strong>: ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}
  `;
}

function makeVesselArrowIcon(bearing) {
  const rotation = Number.isFinite(bearing) ? bearing : 0;
  const opacity = Number.isFinite(bearing) ? 1 : 0.55;

  return L.divIcon({
    className: "vessel-arrow-icon",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
    html: `
      <div
        class="vessel-arrow-wrap"
        style="transform: rotate(${rotation}deg); opacity: ${opacity};"
      >
        <div class="vessel-arrow"></div>
      </div>
    `
  });
}

function makeTimeMarkerIcon(type) {
  const sunriseSvg = `
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <line x1="4" y1="22" x2="28" y2="22"></line>
      <path d="M9 22a7 7 0 0 1 14 0"></path>
      <line x1="16" y1="5" x2="16" y2="10"></line>
      <line x1="7" y1="10" x2="10.5" y2="13.5"></line>
      <line x1="25" y1="10" x2="21.5" y2="13.5"></line>
      <line x1="3" y1="17" x2="8" y2="18"></line>
      <line x1="29" y1="17" x2="24" y2="18"></line>
      <polyline points="13,26 16,23 19,26"></polyline>
    </svg>
  `;

  const sunsetSvg = `
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <line x1="4" y1="22" x2="28" y2="22"></line>
      <path class="sun-fill" d="M9 22a7 7 0 0 1 14 0Z"></path>
      <line x1="16" y1="5" x2="16" y2="10"></line>
      <line x1="7" y1="10" x2="10.5" y2="13.5"></line>
      <line x1="25" y1="10" x2="21.5" y2="13.5"></line>
      <line x1="3" y1="17" x2="8" y2="18"></line>
      <line x1="29" y1="17" x2="24" y2="18"></line>
      <polyline points="13,24 16,27 19,24"></polyline>
    </svg>
  `;

  const svg = type === "sunrise" ? sunriseSvg : sunsetSvg;

  return L.divIcon({
    className: "time-marker",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -16],
    html: `
      <div class="time-marker-wrap ${type}">
        ${svg}
      </div>
    `
  });
}

/* =========================================================
   Visual encoding
   ========================================================= */

function getPollutantColor(value, pollutantMeta) {
  if (!Number.isFinite(value) || !pollutantMeta?.breaks) {
    return CONFIG.colors.unavailable;
  }

  const bin = pollutantMeta.breaks.find((item) => {
    return value <= item.max;
  });

  return bin?.color || CONFIG.colors.unavailable;
}

/* =========================================================
   Status handling
   ========================================================= */

function setStatusFromTimestamp(timestamp) {
  const info = getDataAgeInfo(timestamp);

  els.status.textContent = info.label;
  els.status.className = `status-pill ${info.pillClass}`;
}

function getDataAgeInfo(timestamp) {
  if (!timestamp) {
    return {
      label: "No timestamp",
      status: "warn",
      pillClass: "stale"
    };
  }

  const updated = new Date(timestamp);
  const ageMinutes = (Date.now() - updated.getTime()) / 60000;

  if (!Number.isFinite(ageMinutes)) {
    return {
      label: "Invalid timestamp",
      status: "warn",
      pillClass: "stale"
    };
  }

  if (ageMinutes < -5) {
    return {
      label: "Sample route",
      status: "warn",
      pillClass: "stale"
    };
  }

  if (ageMinutes > CONFIG.staleAfterMinutes) {
    return {
      label: `Stale: ${Math.round(ageMinutes)} min old`,
      status: "warn",
      pillClass: "stale"
    };
  }

  return {
    label: `Live · ${Math.max(0, Math.round(ageMinutes))} min old`,
    status: "good",
    pillClass: "live"
  };
}

/* =========================================================
   Responsive defaults
   ========================================================= */

function applyResponsiveDefaults() {
  const isMobile = window.innerWidth <= 800;

  if (els.currentPollutantsCard) {
    els.currentPollutantsCard.removeAttribute("open");
  }

  if (els.timeseriesPanel && els.timeseriesToggle) {
    const userHasToggled = els.timeseriesPanel.dataset.userToggled === "true";

    if (isMobile && !userHasToggled) {
      els.timeseriesPanel.classList.add("collapsed");
      els.timeseriesToggle.textContent = "Show";
      els.timeseriesToggle.setAttribute("aria-expanded", "false");
    }

    if (!isMobile && !userHasToggled) {
      els.timeseriesPanel.classList.remove("collapsed");
      els.timeseriesToggle.textContent = "Minimize";
      els.timeseriesToggle.setAttribute("aria-expanded", "true");
    }
  }

  applyLegendResponsiveDefault();
  requestAnimationFrame(resizeCharts);
}

function applyLegendResponsiveDefault() {
  if (!legendContainer) return;

  const userHasToggled = legendContainer.dataset.userToggled === "true";

  if (userHasToggled) return;

  const isMobile = window.innerWidth <= 800;
  const shouldCollapse = isMobile
    ? CONFIG.mapControls.legendCollapsedOnMobile
    : CONFIG.mapControls.legendCollapsedOnDesktop;

  setLegendCollapsed(shouldCollapse);
}

function setLegendCollapsed(shouldCollapse) {
  if (!legendContainer || !legendToggleButton) return;

  legendContainer.classList.toggle("collapsed", Boolean(shouldCollapse));
  legendToggleButton.textContent = shouldCollapse ? "▸" : "▾";

  const header = legendContainer.querySelector(".map-legend-header");

  if (header) {
    header.setAttribute("aria-expanded", String(!shouldCollapse));
  }
}

function resizeCharts() {
  if (timeseriesChart) {
    timeseriesChart.resize();
  }

  if (timeseriesYAxisChart) {
    timeseriesYAxisChart.resize();
  }
}

/* =========================================================
   Formatting helpers
   ========================================================= */

function getLocalTimeParts(timestamp) {
  if (!timestamp) return null;

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.displayTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => {
      return [part.type, part.value];
    })
  );

  let hour = Number(parts.hour);

  if (hour === 24) {
    hour = 0;
  }

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString([], {
    timeZone: CONFIG.displayTimeZone,
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatTimestampShort(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString([], {
    timeZone: CONFIG.displayTimeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatValue(value, unit, pollutantKey = null) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "—";
  }

  if (pollutantKey === "AQHI") {
    const aqhi = Math.round(numeric);
    return `${aqhi} (${getAqhiCategory(aqhi)})`;
  }

  return `${roundValue(numeric)} ${unit}`.trim();
}

function getAqhiCategory(aqhi) {
  if (aqhi <= 3) return "Low";
  if (aqhi <= 6) return "Med";
  return "High";
}

function roundValue(value) {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);

  return value.toFixed(2);
}

/* =========================================================
   Geometry helpers
   ========================================================= */

function calculateBearing(lat1, lon1, lat2, lon2) {
  const phi1 = degreesToRadians(lat1);
  const phi2 = degreesToRadians(lat2);
  const deltaLambda = degreesToRadians(lon2 - lon1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);

  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const bearing = radiansToDegrees(Math.atan2(y, x));

  return (bearing + 360) % 360;
}

function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}

function radiansToDegrees(radians) {
  return radians * 180 / Math.PI;
}