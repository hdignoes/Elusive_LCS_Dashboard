let map;
let trackBaseLayer;
let trackSegmentLayer;
let hitSegmentLayer;
let historyPointLayer;
let timeMarkerLayer;
let currentMarker;
let selectedHistoryMarker;
let timeseriesChart;
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
let visibleYScaleAnimationFrame = null;
let shouldScrollTimeseriesToLatest = true;
let lastYAxisDomain = null;
let gpsQualitySummary = makeEmptyGpsQualitySummary();

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
  timeseriesScroll: document.querySelector(".timeseries-scroll"),
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

  lastYAxisDomain = null;
  shouldScrollTimeseriesToLatest = true;

  renderTimeseriesChart();

  if (selectedHistoryMarker && selectedHistoryMarker._selectedPoint) {
    selectedHistoryMarker.bindPopup(
      makePopup(selectedHistoryMarker._selectedPoint, selectedPollutant),
      {
        autoPan: false
      }
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

  if (els.timeseriesScroll) {
    els.timeseriesScroll.addEventListener(
      "scroll",
      requestVisibleYScaleUpdate,
      { passive: true }
    );

    els.timeseriesScroll.addEventListener(
      "wheel",
      disableTimeseriesAutoFollow,
      { passive: true }
    );

    els.timeseriesScroll.addEventListener(
      "touchstart",
      disableTimeseriesAutoFollow,
      { passive: true }
    );

    els.timeseriesScroll.addEventListener(
      "mousedown",
      disableTimeseriesAutoFollow
    );
  }
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
  const sortedPoints = getHistoryPoints()
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

  return annotateGpsQuality(sortedPoints);
}

function makeEmptyGpsQualitySummary() {
  return {
    totalPoints: 0,
    usablePoints: 0,
    staleCoordinatePoints: 0,
    invalidJumpSegments: 0,
    longStationaryRuns: 0,
    latestPointIsStale: false,
    latestUsableTimestamp: null
  };
}

function getGpsQualityConfig() {
  return {
    repeatedCoordinateStaleAfterMinutes: 45,
    stationaryDistanceToleranceMeters: 5,
    maxReasonableSpeedKnots: 35,
    ...(CONFIG.gpsQuality || {})
  };
}

function annotateGpsQuality(points) {
  const config = getGpsQualityConfig();
  const summary = makeEmptyGpsQualitySummary();

  const annotatedPoints = points.map((point) => {
    return {
      ...point,
      gpsQuality: {
        coordinateStale: false,
        invalidJumpFromPrevious: false,
        staleReason: null,
        stationaryRunMinutes: 0,
        speedFromPreviousKnots: null
      }
    };
  });

  if (annotatedPoints.length === 0) {
    gpsQualitySummary = summary;
    return annotatedPoints;
  }

  let stationaryRunStartIndex = 0;
  let countedCurrentRunAsLong = false;

  for (let i = 0; i < annotatedPoints.length; i += 1) {
    const point = annotatedPoints[i];

    if (i > 0) {
      const previous = annotatedPoints[i - 1];
      const elapsedHours = (point.time - previous.time) / 3600000;

      if (Number.isFinite(elapsedHours) && elapsedHours > 0) {
        const distanceNm = calculateDistanceMeters(
          previous.lat,
          previous.lon,
          point.lat,
          point.lon
        ) / 1852;

        const speedKnots = distanceNm / elapsedHours;
        point.gpsQuality.speedFromPreviousKnots = speedKnots;

        if (speedKnots > config.maxReasonableSpeedKnots) {
          point.gpsQuality.invalidJumpFromPrevious = true;
          summary.invalidJumpSegments += 1;
        }
      }

      const stationaryRunStart = annotatedPoints[stationaryRunStartIndex];
      const runDriftMeters = calculateDistanceMeters(
        stationaryRunStart.lat,
        stationaryRunStart.lon,
        point.lat,
        point.lon
      );

      if (runDriftMeters > config.stationaryDistanceToleranceMeters) {
        stationaryRunStartIndex = i;
        countedCurrentRunAsLong = false;
      }
    }

    const stationaryRunStart = annotatedPoints[stationaryRunStartIndex];
    const runMinutes = (point.time - stationaryRunStart.time) / 60000;

    if (Number.isFinite(runMinutes) && runMinutes >= 0) {
      point.gpsQuality.stationaryRunMinutes = runMinutes;
    }

    if (
      Number.isFinite(runMinutes) &&
      runMinutes >= config.repeatedCoordinateStaleAfterMinutes
    ) {
      point.gpsQuality.coordinateStale = true;
      point.gpsQuality.staleReason =
        `GPS coordinate repeated for ${Math.round(runMinutes)} min`;

      if (!countedCurrentRunAsLong) {
        summary.longStationaryRuns += 1;
        countedCurrentRunAsLong = true;
      }
    }
  }

  summary.totalPoints = annotatedPoints.length;
  summary.staleCoordinatePoints = annotatedPoints.filter((point) => {
    return point.gpsQuality.coordinateStale;
  }).length;
  summary.usablePoints = annotatedPoints.filter(isPointGpsUsable).length;
  summary.latestPointIsStale = annotatedPoints.length > 0
    ? !isPointGpsUsable(annotatedPoints[annotatedPoints.length - 1])
    : false;

  const latestUsablePoint = [...annotatedPoints]
    .reverse()
    .find(isPointGpsUsable);

  summary.latestUsableTimestamp = latestUsablePoint?.properties?.timestamp || null;

  gpsQualitySummary = summary;
  return annotatedPoints;
}

function isPointGpsUsable(point) {
  return (
    point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    !point.gpsQuality?.coordinateStale &&
    !point.gpsQuality?.invalidJumpFromPrevious
  );
}

function isRouteSegmentUsable(from, to) {
  return (
    isPointGpsUsable(from) &&
    isPointGpsUsable(to) &&
    !to.gpsQuality?.invalidJumpFromPrevious
  );
}

function getRouteChunks(points) {
  const chunks = [];
  let currentChunk = [];

  points.forEach((point) => {
    if (!isPointGpsUsable(point)) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
      }

      return;
    }

    if (currentChunk.length === 0) {
      currentChunk.push(point);
      return;
    }

    const previous = currentChunk[currentChunk.length - 1];

    if (isRouteSegmentUsable(previous, point)) {
      currentChunk.push(point);
      return;
    }

    chunks.push(currentChunk);
    currentChunk = [point];
  });

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function getLatestUsableHistoryPoint() {
  const points = getSortedHistoryPointsAscending();

  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (isPointGpsUsable(points[i])) {
      return points[i];
    }
  }

  return null;
}

function getNearestUsableHistoryPoint(point) {
  if (!point) return null;

  const points = getSortedHistoryPointsAscending();
  const targetTime = Number.isFinite(point.time)
    ? point.time
    : Date.parse(point.properties?.timestamp);

  let bestPoint = null;
  let bestOffset = Infinity;

  points.forEach((candidate) => {
    if (!isPointGpsUsable(candidate)) return;

    const candidateTime = Number.isFinite(candidate.time)
      ? candidate.time
      : Date.parse(candidate.properties?.timestamp);

    if (!Number.isFinite(candidateTime) || !Number.isFinite(targetTime)) return;

    const offset = Math.abs(candidateTime - targetTime);

    if (offset < bestOffset) {
      bestOffset = offset;
      bestPoint = candidate;
    }
  });

  return bestPoint;
}

function getLatestBearing() {
  const points = getSortedHistoryPointsAscending();

  for (let i = points.length - 1; i > 0; i -= 1) {
    const from = points[i - 1];
    const to = points[i];

    if (!isRouteSegmentUsable(from, to)) continue;
    if (from.lat === to.lat && from.lon === to.lon) continue;

    return calculateBearing(from.lat, from.lon, to.lat, to.lon);
  }

  return null;
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
  const routeChunks = getRouteChunks(points);

  routeLatLngs = routeChunks.flatMap((chunk) => {
    return chunk.map((point) => [point.lat, point.lon]);
  });

  routeChunks.forEach((chunk) => {
    if (chunk.length < 2) return;

    L.polyline(
      chunk.map((point) => [point.lat, point.lon]),
      {
        color: CONFIG.colors.trackBase,
        weight: 2,
        opacity: 0.28
      }
    ).addTo(trackBaseLayer);
  });

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

    if (!isRouteSegmentUsable(from, to)) continue;

    const fromValue = Number(from.properties[selectedPollutant]);
    const toValue = Number(to.properties[selectedPollutant]);

    const hasFromValue = Number.isFinite(fromValue);
    const hasToValue = Number.isFinite(toValue);

    const usableValue = hasToValue
      ? toValue
      : hasFromValue
        ? fromValue
        : null;

    const hasPollutantData = usableValue !== null;

    const segmentColor = hasPollutantData
      ? getPollutantColor(usableValue, pollutantMeta)
      : CONFIG.colors.unavailable;

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
        opacity: hasPollutantData
          ? isSelected ? 1 : 0.88
          : 0.42,
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
        opacity: hasPollutantData ? 1 : 0.65
      });
    });

    hitSegment.on("mouseout", () => {
      visibleSegment.setStyle({
        weight: isSelected ? 9 : 6,
        opacity: hasPollutantData
          ? isSelected ? 1 : 0.88
          : 0.42
      });
    });

    hitSegment.addTo(hitSegmentLayer);
  }
}

function renderTimeMarkers() {
  timeMarkerLayer.clearLayers();

  if (!CONFIG.sunMarkers?.enabled) return;

  const points = getSortedHistoryPointsAscending().filter(isPointGpsUsable);
  const markers = getSunriseSunsetMarkers(points);

  markers.forEach((marker) => {
    const icon = makeTimeMarkerIcon(marker.type);

    const leafletMarker = L.marker([marker.point.lat, marker.point.lon], {
      icon
    });

    leafletMarker.on("click", () => {
      selectHistoryPoint(marker.point, {
        panMap: true,
        openPopup: true,
        zoomToPoint: true
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
  const points = getSortedHistoryPointsAscending();
  const latestPoint = points.length > 0
    ? points[points.length - 1]
    : null;

  const fallbackLat = Number(latestData?.lat);
  const fallbackLon = Number(latestData?.lon);

  const lat = latestPoint
    ? latestPoint.lat
    : fallbackLat;

  const lon = latestPoint
    ? latestPoint.lon
    : fallbackLon;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const isGpsStale = latestPoint
    ? !isPointGpsUsable(latestPoint)
    : false;

  const bearing = getLatestBearing();

  const arrowIcon = makeVesselArrowIcon(bearing, {
    stale: isGpsStale
  });

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

  const timestamp = latestPoint?.properties?.timestamp || latestData?.timestamp;

  const staleBadge = isGpsStale
    ? ` <span class="popup-stale-badge">GPS stale</span>`
    : "";

  currentMarker.bindPopup(`
    <strong>Current vessel location</strong>${staleBadge}<br>
    <strong>Heading</strong>: ${headingText}<br>
    <strong>Time</strong>: ${timestamp ? formatTimestamp(timestamp) : "Unknown"}<br>
    <strong>Location</strong>: ${lat.toFixed(5)}, ${lon.toFixed(5)}
  `);
}

function makeVesselArrowIcon(bearing, options = {}) {
  const rotation = Number.isFinite(bearing) ? bearing : 0;
  const opacity = Number.isFinite(bearing) ? 1 : 0.55;
  const isStale = options.stale === true;

  return L.divIcon({
    className: "vessel-arrow-icon",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
    html: `
      <div
        class="vessel-arrow-wrap ${isStale ? "stale" : ""}"
        style="transform: rotate(${rotation}deg); opacity: ${opacity};"
        title="${isStale ? "GPS stale" : "Current vessel location"}"
      >
        <div class="vessel-arrow"></div>
        ${isStale ? '<div class="vessel-stale-label">STALE</div>' : ""}
      </div>
    `
  });
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
  const latestUsablePoint = getLatestUsableHistoryPoint();

  if (latestUsablePoint) {
    map.setView([latestUsablePoint.lat, latestUsablePoint.lon], Math.max(map.getZoom(), 11), {
      animate: true
    });

    if (currentMarker) {
      currentMarker.openPopup();
    }

    return;
  }

  const lat = Number(latestData?.lat);
  const lon = Number(latestData?.lon);

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    map.setView([lat, lon], Math.max(map.getZoom(), 11), {
      animate: true
    });

    if (currentMarker) {
      currentMarker.openPopup();
    }
  }
}

function centerMapOnLatestPoint() {
  const latestUsablePoint = getLatestUsableHistoryPoint();

  if (latestUsablePoint) {
    map.setView([latestUsablePoint.lat, latestUsablePoint.lon], Math.max(map.getZoom(), 11), {
      animate: false
    });

    hasCenteredOnInitialLatest = true;
    return;
  }

  const lat = Number(latestData?.lat);
  const lon = Number(latestData?.lon);

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    map.setView([lat, lon], Math.max(map.getZoom(), 11), {
      animate: false
    });

    hasCenteredOnInitialLatest = true;
  }
}


function renderHistoryPointMarkers(points) {
  const pollutantMeta = CONFIG.pollutants[selectedPollutant];

  points.forEach((point) => {
    if (!isPointGpsUsable(point)) return;

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


function focusHistoryPoint(locationPoint, options = {}, sourcePoint = locationPoint) {
  if (!locationPoint) return;

  const shouldPanMap = options.panMap !== false;
  const shouldOpenPopup = options.openPopup !== false;
  const shouldZoomToPoint = options.zoomToPoint === true;

  if (shouldPanMap) {
    const targetZoom = shouldZoomToPoint
      ? Math.max(map.getZoom(), 12)
      : Math.max(map.getZoom(), 11);

    map.setView([locationPoint.lat, locationPoint.lon], targetZoom, {
      animate: true,
      pan: {
        duration: 0.45
      }
    });
  }

  if (selectedHistoryMarker) {
    selectedHistoryMarker.setLatLng([locationPoint.lat, locationPoint.lon]);
  } else {
    selectedHistoryMarker = L.circleMarker([locationPoint.lat, locationPoint.lon], {
      radius: 9,
      color: "#0f172a",
      fillColor: "#ffffff",
      fillOpacity: 0.95,
      weight: 3,
      opacity: 1
    }).addTo(map);
  }

  selectedHistoryMarker._selectedPoint = sourcePoint;
  selectedHistoryMarker.bindPopup(makePopup(sourcePoint, selectedPollutant, locationPoint), {
    autoPan: false
  });

  if (shouldOpenPopup) {
    selectedHistoryMarker.openPopup();
  }

  selectedHistoryMarker.bringToFront();
}

function selectHistoryPoint(point, options = {}) {
  if (!point) return;

  selectedHistoryPointIndex = point.index;

  renderTrack();

  const locationPoint = isPointGpsUsable(point)
    ? point
    : getNearestUsableHistoryPoint(point);

  if (locationPoint) {
    focusHistoryPoint(locationPoint, options, point);
  }

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

  const statuses = [
    getCurrentGpsStatus(),
    ...getCurrentSensorStatuses()
  ];

  statuses.forEach((item) => {
    addDataChip(item.label, item.status);
  });
}

function getCurrentSensorStatuses() {
  return getStatusSensorKeys().map((key) => {
    return getCurrentSensorStatus(key);
  });
}

function getStatusSensorKeys() {
  const orderedKeys = [];

  CONFIG.pollutantGroups.forEach((group) => {
    group.keys.forEach((key) => {
      if (!CONFIG.pollutants[key]) return;
      if (key === "AQHI") return;

      if (!orderedKeys.includes(key)) {
        orderedKeys.push(key);
      }
    });
  });

  return orderedKeys;
}

function getCurrentSensorStatus(key) {
  const meta = CONFIG.pollutants[key];
  const label = meta?.label || key;

  if (!latestData) {
    return {
      label: `${label} offline`,
      status: "bad"
    };
  }

  const value = getLatestPollutantValue(key);
  const numericValue = Number(value);
  const ageStatus = getPacketAgeStatus(latestData.timestamp);

  if (ageStatus.status === "bad") {
    return {
      label: `${label} offline`,
      status: "bad"
    };
  }

  if (!Number.isFinite(numericValue)) {
    return {
      label: `${label} problem`,
      status: "bad"
    };
  }

  if (numericValue === 0) {
    return {
      label: `${label} problem`,
      status: "bad"
    };
  }

  if (ageStatus.status === "warn") {
    return {
      label: `${label} stale`,
      status: "warn"
    };
  }

  return {
    label: `${label} OK`,
    status: "good"
  };
}

function getCurrentGpsStatus() {
  if (!latestData) {
    return {
      label: "GPS offline",
      status: "bad"
    };
  }

  const ageStatus = getPacketAgeStatus(latestData.timestamp);

  if (ageStatus.status === "bad") {
    return {
      label: "GPS offline",
      status: "bad"
    };
  }

  const lat = Number(latestData.lat);
  const lon = Number(latestData.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      label: "GPS problem",
      status: "bad"
    };
  }

  const points = getSortedHistoryPointsAscending();
  const latestPoint = points.length > 0
    ? points[points.length - 1]
    : null;

  if (latestPoint?.gpsQuality?.invalidJumpFromPrevious) {
    return {
      label: "GPS problem",
      status: "bad"
    };
  }

  if (
    ageStatus.status === "warn" ||
    latestPoint?.gpsQuality?.coordinateStale
  ) {
    return {
      label: "GPS stale",
      status: "warn"
    };
  }

  return {
    label: "GPS OK",
    status: "good"
  };
}

function getPacketAgeStatus(timestamp) {
  const ageMinutes = getTimestampAgeMinutes(timestamp);
  const config = getStatusAgeConfig();

  if (!Number.isFinite(ageMinutes)) {
    return {
      status: "bad",
      ageMinutes
    };
  }

  if (ageMinutes > config.problemAfterMinutes) {
    return {
      status: "bad",
      ageMinutes
    };
  }

  if (ageMinutes > config.staleAfterMinutes) {
    return {
      status: "warn",
      ageMinutes
    };
  }

  return {
    status: "good",
    ageMinutes
  };
}

function getStatusAgeConfig() {
  return {
    staleAfterMinutes:
      CONFIG.sensorStatus?.staleAfterMinutes ??
      CONFIG.staleAfterMinutes ??
      30,

    problemAfterMinutes:
      CONFIG.sensorStatus?.problemAfterMinutes ??
      120
  };
}

function getTimestampAgeMinutes(timestamp) {
  const parsedTime = Date.parse(timestamp);

  if (!Number.isFinite(parsedTime)) {
    return Infinity;
  }

  return (Date.now() - parsedTime) / 60000;
}

function findPreviousDistinctGpsPoint(points, latestPoint) {
  const toleranceMeters = CONFIG.gpsQuality?.sameCoordinateToleranceMeters ?? 5;

  for (let i = points.length - 2; i >= 0; i -= 1) {
    const point = points[i];

    const distanceMeters = calculateStatusDistanceMeters(
      point.lat,
      point.lon,
      latestPoint.lat,
      latestPoint.lon
    );

    if (Number.isFinite(distanceMeters) && distanceMeters > toleranceMeters) {
      return point;
    }
  }

  return null;
}

function getRepeatedCoordinateStatus(points, latestPoint) {
  const toleranceMeters = CONFIG.gpsQuality?.sameCoordinateToleranceMeters ?? 5;
  const staleAfterMinutes = CONFIG.gpsQuality?.staleCoordinateAfterMinutes ?? 45;

  const latestTime = Date.parse(latestPoint.properties.timestamp);

  if (!Number.isFinite(latestTime)) {
    return {
      ok: false
    };
  }

  let firstRepeatedTime = latestTime;

  for (let i = points.length - 2; i >= 0; i -= 1) {
    const point = points[i];

    const distanceMeters = calculateStatusDistanceMeters(
      point.lat,
      point.lon,
      latestPoint.lat,
      latestPoint.lon
    );

    if (!Number.isFinite(distanceMeters) || distanceMeters > toleranceMeters) {
      break;
    }

    const pointTime = Date.parse(point.properties.timestamp);

    if (Number.isFinite(pointTime)) {
      firstRepeatedTime = pointTime;
    }
  }

  const repeatedMinutes = (latestTime - firstRepeatedTime) / 60000;

  return {
    ok: repeatedMinutes < staleAfterMinutes
  };
}

function getGpsJumpStatus(previousPoint, latestPoint) {
  const maxSpeedKnots = CONFIG.gpsQuality?.maxReasonableSpeedKnots ?? 35;

  const previousTime = Date.parse(previousPoint.properties.timestamp);
  const latestTime = Date.parse(latestPoint.properties.timestamp);

  if (!Number.isFinite(previousTime) || !Number.isFinite(latestTime)) {
    return {
      ok: false
    };
  }

  const elapsedHours = (latestTime - previousTime) / 3600000;

  if (elapsedHours <= 0) {
    return {
      ok: false
    };
  }

  const distanceMeters = calculateStatusDistanceMeters(
    previousPoint.lat,
    previousPoint.lon,
    latestPoint.lat,
    latestPoint.lon
  );

  const distanceNauticalMiles = distanceMeters / 1852;
  const speedKnots = distanceNauticalMiles / elapsedHours;

  return {
    ok: speedKnots <= maxSpeedKnots
  };
}

function calculateStatusDistanceMeters(lat1, lon1, lat2, lon2) {
  const radiusMeters = 6371000;

  const phi1 = degreesToRadians(Number(lat1));
  const phi2 = degreesToRadians(Number(lat2));
  const deltaPhi = degreesToRadians(Number(lat2) - Number(lat1));
  const deltaLambda = degreesToRadians(Number(lon2) - Number(lon1));

  if (
    !Number.isFinite(phi1) ||
    !Number.isFinite(phi2) ||
    !Number.isFinite(deltaPhi) ||
    !Number.isFinite(deltaLambda)
  ) {
    return NaN;
  }

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radiusMeters * c;
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

  const yScaleOptions = makeTimeseriesYScaleOptions(
    pollutantMeta,
    values,
    {
      forceDomain: true
    }
  );

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
        intersect: false,
        axis: "x"
      },
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
    plugins: [dayBoundaryChartPlugin, sunEventChartPlugin, hoverGuidePlugin, fixedYAxisPlugin]
  });

  requestAnimationFrame(() => {
    if (shouldScrollTimeseriesToLatest) {
      scrollTimeseriesToLatest();
    } else {
      updateVisibleYScale();
    }

    updateTimeseriesHighlight();
  });
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

function makeTimeseriesYScaleOptions(pollutantMeta, values, options = {}) {
  const forceDomain = options.forceDomain === true;

  const numericValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const observedMin = numericValues.length > 0
    ? Math.min(...numericValues)
    : 0;

  const observedMax = numericValues.length > 0
    ? Math.max(...numericValues)
    : 1;

  let axisMin;
  let axisMax;

  if (selectedPollutant === "T") {
    const padding = Math.max((observedMax - observedMin) * 0.2, 1);
    axisMin = niceAxisFloor(observedMin - padding);
    axisMax = niceAxisCeiling(observedMax + padding);

    if (axisMin === axisMax) {
      axisMin -= 1;
      axisMax += 1;
    }
  } else if (selectedPollutant === "AQHI") {
    axisMin = 0;
    axisMax = Math.max(10, Math.ceil(observedMax + 0.5));
  } else if (selectedPollutant === "RH") {
    axisMin = 0;
    axisMax = 100;
  } else {
    axisMin = 0;
    axisMax = niceAxisCeiling(observedMax * 1.18);
  }

  axisMax = Math.max(axisMax, axisMin + 1);

  return {
    [forceDomain ? "min" : "suggestedMin"]: axisMin,
    [forceDomain ? "max" : "suggestedMax"]: axisMax,
    ticks: {
      precision: 0,
      maxTicksLimit: selectedPollutant === "AQHI" ? 6 : 5,
      callback: (value) => {
        if (selectedPollutant === "AQHI") {
          return Math.round(value);
        }

        return formatYAxisTick(Number(value));
      }
    }
  };
}

function niceAxisCeiling(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;

  let niceNormalized;

  if (normalized <= 1) {
    niceNormalized = 1;
  } else if (normalized <= 2) {
    niceNormalized = 2;
  } else if (normalized <= 2.5) {
    niceNormalized = 2.5;
  } else if (normalized <= 5) {
    niceNormalized = 5;
  } else {
    niceNormalized = 10;
  }

  return niceNormalized * magnitude;
}

function niceAxisFloor(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value === 0) {
    return 0;
  }

  const sign = Math.sign(value);
  const absoluteValue = Math.abs(value);
  const exponent = Math.floor(Math.log10(absoluteValue));
  const magnitude = 10 ** exponent;

  if (sign < 0) {
    return Math.floor(value / magnitude) * magnitude;
  }

  return Math.floor(value / magnitude) * magnitude;
}

function requestVisibleYScaleUpdate() {
  if (visibleYScaleAnimationFrame !== null) return;

  visibleYScaleAnimationFrame = requestAnimationFrame(() => {
    visibleYScaleAnimationFrame = null;
    updateVisibleYScale();
  });
}

function updateVisibleYScale() {
  if (!timeseriesChart || !Array.isArray(timeseriesPoints)) {
    return;
  }

  const pollutantMeta = CONFIG.pollutants[selectedPollutant];

  const allValues = timeseriesPoints.map((point) => {
    const value = Number(point.properties[selectedPollutant]);
    return Number.isFinite(value) ? value : null;
  });

  const scaledWindowValues = getVisibleTimeseriesValues(allValues);

  const proposedYScaleOptions = makeTimeseriesYScaleOptions(
    pollutantMeta,
    scaledWindowValues,
    {
      forceDomain: true
    }
  );

  const stabilizedYScaleOptions = stabilizeYAxisDomain(proposedYScaleOptions);

  applyYScaleOptions(timeseriesChart, stabilizedYScaleOptions);
  timeseriesChart.update("none");
  drawFixedYAxis(timeseriesChart);
}

function stabilizeYAxisDomain(yScaleOptions) {
  const nextMin = Number(yScaleOptions.min);
  const nextMax = Number(yScaleOptions.max);

  if (!Number.isFinite(nextMin) || !Number.isFinite(nextMax)) {
    return yScaleOptions;
  }

  if (!lastYAxisDomain) {
    lastYAxisDomain = {
      min: nextMin,
      max: nextMax
    };

    return yScaleOptions;
  }

  const currentRange = Math.max(lastYAxisDomain.max - lastYAxisDomain.min, 1);
  const minChange = Math.abs(nextMin - lastYAxisDomain.min);
  const maxChange = Math.abs(nextMax - lastYAxisDomain.max);
  const changeThreshold = currentRange * 0.12;

  const shouldExpand =
    nextMax > lastYAxisDomain.max ||
    nextMin < lastYAxisDomain.min;

  const shouldContract =
    minChange > changeThreshold ||
    maxChange > changeThreshold;

  if (shouldExpand || shouldContract) {
    lastYAxisDomain = {
      min: nextMin,
      max: nextMax
    };
  }

  return {
    ...yScaleOptions,
    min: lastYAxisDomain.min,
    max: lastYAxisDomain.max
  };
}

function getVisibleTimeseriesValues(values) {
  if (!timeseriesChart || !els.timeseriesScroll || !Array.isArray(timeseriesPoints)) {
    return values;
  }

  const xScale = timeseriesChart.scales.x;

  if (!xScale) {
    return values;
  }

  const visibleLeft = els.timeseriesScroll.scrollLeft;
  const visibleWidth = els.timeseriesScroll.clientWidth;
  const visibleRight = visibleLeft + visibleWidth;

  const scaleMultiplier = 1.5;
  const extraWidth = visibleWidth * (scaleMultiplier - 1);
  const scaledLeft = visibleLeft - extraWidth / 2;
  const scaledRight = visibleRight + extraWidth / 2;

  const visibleValues = [];

  timeseriesPoints.forEach((point, index) => {
    const x = xScale.getPixelForValue(index);

    if (x >= scaledLeft && x <= scaledRight) {
      const value = Number(point.properties[selectedPollutant]);

      if (Number.isFinite(value)) {
        visibleValues.push(value);
      }
    }
  });

  if (visibleValues.length > 0) {
    return visibleValues;
  }

  return values;
}

function scrollTimeseriesToLatest() {
  if (!els.timeseriesScroll) return;

  els.timeseriesScroll.scrollLeft = Math.max(
    0,
    els.timeseriesScroll.scrollWidth - els.timeseriesScroll.clientWidth
  );

  updateVisibleYScale();
}

function disableTimeseriesAutoFollow() {
  shouldScrollTimeseriesToLatest = false;
}

function applyYScaleOptions(chart, yScaleOptions) {
  if (!chart?.options?.scales?.y) return;

  const yScale = chart.options.scales.y;

  delete yScale.min;
  delete yScale.max;
  delete yScale.suggestedMin;
  delete yScale.suggestedMax;

  if (yScaleOptions.min !== undefined) {
    yScale.min = yScaleOptions.min;
  }

  if (yScaleOptions.max !== undefined) {
    yScale.max = yScaleOptions.max;
  }

  if (yScaleOptions.suggestedMin !== undefined) {
    yScale.suggestedMin = yScaleOptions.suggestedMin;
  }

  if (yScaleOptions.suggestedMax !== undefined) {
    yScale.suggestedMax = yScaleOptions.suggestedMax;
  }

  yScale.ticks = {
    ...yScale.ticks,
    ...yScaleOptions.ticks
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
  drawFixedYAxis(timeseriesChart);
}

/* =========================================================
   Chart plugins
   ========================================================= */

const hoverGuidePlugin = {
  id: "hoverGuide",

  afterDraw(chart) {
    const activeElements = chart.getActiveElements();

    if (!activeElements || activeElements.length === 0) return;

    const active = activeElements[0];
    const point = timeseriesPoints[active.index];

    if (!point) return;

    const { ctx, chartArea, scales } = chart;
    const xScale = scales.x;

    if (!xScale || !chartArea) return;

    const x = xScale.getPixelForValue(active.index);

    if (x < chartArea.left || x > chartArea.right) return;

    const meta = CONFIG.pollutants[selectedPollutant];
    const rawValue = Number(point.properties[selectedPollutant]);

    const reading = Number.isFinite(rawValue)
      ? formatValue(rawValue, meta.unit, selectedPollutant)
      : "—";

    const timestamp = point.properties.timestamp
      ? formatTimestampShort(point.properties.timestamp)
      : "Unknown time";

    const text = `${timestamp} · ${meta.label}: ${reading}`;

    ctx.save();

    ctx.strokeStyle = "rgba(15, 23, 42, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();

    ctx.setLineDash([]);

    ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    const paddingX = 7;
    const boxHeight = 22;
    const gap = 8;

    const scrollLeft = els.timeseriesScroll
      ? els.timeseriesScroll.scrollLeft
      : 0;

    const viewportWidth = els.timeseriesScroll
      ? els.timeseriesScroll.clientWidth
      : chartArea.right - chartArea.left;

    const visibleLeft = Math.max(chartArea.left, scrollLeft);
    const visibleRight = Math.min(chartArea.right, scrollLeft + viewportWidth);
    const visibleMidpoint = visibleLeft + (visibleRight - visibleLeft) / 2;

    const textWidth = ctx.measureText(text).width;
    const boxWidth = textWidth + paddingX * 2;

    const shouldPlaceLeft = x > visibleMidpoint;

    let boxX = shouldPlaceLeft
      ? x - boxWidth - gap
      : x + gap;

    const minBoxX = visibleLeft + 4;
    const maxBoxX = visibleRight - boxWidth - 4;

    if (boxX < minBoxX) {
      boxX = minBoxX;
    }

    if (boxX > maxBoxX) {
      boxX = maxBoxX;
    }

    const boxY = chartArea.top + 8;

    ctx.fillStyle = "rgba(248, 250, 252, 0.96)";
    ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
    ctx.lineWidth = 1;

    drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 7);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(text, boxX + paddingX, boxY + boxHeight / 2);

    ctx.restore();
  }
};

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const fixedYAxisPlugin = {
  id: "fixedYAxis",

  afterDraw(chart) {
    drawFixedYAxis(chart);
  }
};

function drawFixedYAxis(chart) {
  const canvas = els.timeseriesYAxisChart;

  if (!canvas || !chart?.scales?.y || !chart.chartArea) return;

  const rect = canvas.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) return;

  const devicePixelRatio = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.round(rect.width * devicePixelRatio));
  const targetHeight = Math.max(1, Math.round(rect.height * devicePixelRatio));

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  const ctx = canvas.getContext("2d");

  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const yScale = chart.scales.y;
  const chartArea = chart.chartArea;

  const axisX = rect.width - 10;
  const labelX = axisX - 7;

  ctx.save();

  ctx.strokeStyle = "rgba(100, 116, 139, 0.22)";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(axisX, chartArea.top);
  ctx.lineTo(axisX, chartArea.bottom);
  ctx.stroke();

  ctx.font = "600 12px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(15, 23, 42, 0.68)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  yScale.ticks.forEach((tick) => {
    const value = Number(tick.value);

    if (!Number.isFinite(value)) return;

    const y = yScale.getPixelForValue(value);

    if (y < chartArea.top - 1 || y > chartArea.bottom + 1) return;

    ctx.strokeStyle = "rgba(100, 116, 139, 0.18)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(axisX - 4, y);
    ctx.lineTo(axisX, y);
    ctx.stroke();

    ctx.fillText(formatYAxisTick(value), labelX, y);
  });

  ctx.restore();
}

function formatYAxisTick(value) {
  if (selectedPollutant === "AQHI") {
    return String(Math.round(value));
  }

  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 100) {
    return value.toFixed(0);
  }

  if (absoluteValue >= 10) {
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  }

  if (absoluteValue >= 1) {
    return value.toFixed(1);
  }

  if (absoluteValue === 0) {
    return "0";
  }

  return value.toPrecision(2);
}

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

  ctx.beginPath();
  ctx.moveTo(-9, 4);
  ctx.lineTo(9, 4);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 4, 5.5, Math.PI, 0, false);
  ctx.fill();
  ctx.stroke();

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


function makePopup(point, pollutantKey, locationPoint = point) {
  const meta = CONFIG.pollutants[pollutantKey];
  const value = point.properties[pollutantKey];
  const timestamp = point.properties.timestamp;
  const usingFallbackLocation = locationPoint && locationPoint.index !== point.index;

  const gpsLine = usingFallbackLocation
    ? "<br><strong>GPS</strong>: coordinate at selected time was flagged stale; showing nearest valid GPS fix"
    : point.gpsQuality?.coordinateStale
      ? `<br><strong>GPS</strong>: ${point.gpsQuality.staleReason || "coordinate flagged stale"}`
      : "";

  const lat = Number(locationPoint?.lat ?? point.lat);
  const lon = Number(locationPoint?.lon ?? point.lon);

  return `
    <strong>${meta.label}</strong>: ${formatValue(value, meta.unit, pollutantKey)}<br>
    <strong>Time</strong>: ${timestamp ? formatTimestamp(timestamp) : "Unknown"}<br>
    <strong>Location</strong>: ${lat.toFixed(5)}, ${lon.toFixed(5)}${gpsLine}
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
  const gpsStatus = getCurrentGpsStatus();

  const gpsSuffix = gpsStatus.status === "good"
    ? ""
    : ` · ${gpsStatus.label}`;

  els.status.textContent = `${info.label}${gpsSuffix}`;

  const shouldShowWarning =
    info.status !== "good" ||
    gpsStatus.status !== "good";

  els.status.className = shouldShowWarning
    ? "status-pill stale"
    : "status-pill live";
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

  requestVisibleYScaleUpdate();
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


function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadiusMeters = 6371000;
  const phi1 = degreesToRadians(lat1);
  const phi2 = degreesToRadians(lat2);
  const deltaPhi = degreesToRadians(lat2 - lat1);
  const deltaLambda = degreesToRadians(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

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