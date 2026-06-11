let map;
let trackBaseLayer;
let trackSegmentLayer;
let hitSegmentLayer;
let timeMarkerLayer;
let currentMarker;
let selectedHistoryMarker;
let timeseriesChart;
let selectedHistoryPointIndex = null;

let legendControl;
let legendContainer;

let latestData = null;
let historyData = null;
let selectedPollutant = CONFIG.defaultPollutant;
let timeseriesPoints = [];

const els = {
  status: document.getElementById("status-pill"),
  location: document.getElementById("current-location"),
  updated: document.getElementById("last-updated"),
  pollutantSelect: document.getElementById("pollutant-select"),
  pollutantList: document.getElementById("pollutant-list"),
  timeseriesPanel: document.getElementById("timeseries-panel"),
  timeseriesToggle: document.getElementById("timeseries-toggle"),
  timeseriesSubtitle: document.getElementById("timeseries-subtitle"),
  timeseriesChart: document.getElementById("timeseries-chart"),
  timeseriesChartInner: document.getElementById("timeseries-chart-inner"),
  currentPollutantsCard: document.getElementById("current-pollutants-card")
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  initMap();
  initPollutantSelect();
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
  timeMarkerLayer = L.layerGroup().addTo(map);

  initMapLegend();
}

function initPollutantSelect() {
  Object.entries(CONFIG.pollutants).forEach(([key, meta]) => {
    const option = document.createElement("option");

    option.value = key;
    option.textContent = meta.label;
    option.selected = key === selectedPollutant;

    els.pollutantSelect.appendChild(option);
  });

  els.pollutantSelect.addEventListener("change", (event) => {
    selectedPollutant = event.target.value;

    renderTrack();
    renderLegend();
    renderTimeseriesChart();

    if (selectedHistoryMarker && selectedHistoryMarker._selectedPoint) {
      selectedHistoryMarker.bindPopup(
        makePopup(selectedHistoryMarker._selectedPoint, selectedPollutant)
      );
    }
  });
}

function initTimeseriesPanel() {
  if (!els.timeseriesPanel || !els.timeseriesToggle) return;

  els.timeseriesToggle.addEventListener("click", () => {
    const isCollapsed = els.timeseriesPanel.classList.toggle("collapsed");

    els.timeseriesToggle.textContent = isCollapsed ? "Show" : "Minimize";
    els.timeseriesToggle.setAttribute("aria-expanded", String(!isCollapsed));

    setTimeout(() => {
      if (timeseriesChart) {
        timeseriesChart.resize();
      }
    }, 0);
  });
}

function initMapLegend() {
  legendControl = L.control({
    position: "topright"
  });

  legendControl.onAdd = function () {
    legendContainer = L.DomUtil.create("div", "map-legend");
    L.DomEvent.disableClickPropagation(legendContainer);
    L.DomEvent.disableScrollPropagation(legendContainer);
    return legendContainer;
  };

  legendControl.addTo(map);
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
    latestData = latest;
  } catch (error) {
    console.error("Data loading error:", error);

    els.status.textContent = "Data loading error";
    els.status.className = "status-pill error";
    return;
  }

  try {
    renderTrack();
    renderTimeMarkers();
    renderCurrentMarker();
    renderPanel();
    renderLegend();
    renderTimeseriesChart();

    setStatusFromTimestamp(latestData.timestamp);
  } catch (error) {
    console.error("Dashboard rendering error:", error);

    els.status.textContent = "Display error";
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

  const points = getSortedHistoryPointsAscending();
  const latLngs = points.map((point) => [point.lat, point.lon]);

  if (latLngs.length === 0) return;

  L.polyline(latLngs, {
    color: CONFIG.colors.trackBase,
    weight: 2,
    opacity: 0.28
  }).addTo(trackBaseLayer);

  renderPollutantTrackSegments(points);

  if (latLngs.length > 1 && !map._hasFitInitialBounds) {
    map.fitBounds(latLngs, {
      padding: [30, 30]
    });

    map._hasFitInitialBounds = true;
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
        panMap: false,
        openPopup: true
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

  if (!CONFIG.timeMarkers?.enabled) return;

  const points = getSortedHistoryPointsAscending();
  const markers = getNoonMidnightMarkers(points);

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
        `${marker.type === "noon" ? "Noon" : "Midnight"} — ${formatTimestamp(marker.point.properties.timestamp)}`,
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

function focusHistoryPoint(point, options = {}) {
  if (!point) return;

  const shouldPanMap = options.panMap !== false;
  const shouldOpenPopup = options.openPopup !== false;

  if (shouldPanMap) {
    map.setView([point.lat, point.lon], Math.max(map.getZoom(), 11), {
      animate: true
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
}

function selectHistoryPoint(point, options = {}) {
  if (!point) return;

  selectedHistoryPointIndex = point.index;

  focusHistoryPoint(point, options);
  renderTrack();
  updateTimeseriesHighlight();
}

/* =========================================================
   Panel rendering
   ========================================================= */

function renderPanel() {
  if (!latestData) return;

  const lat = Number(latestData.lat);
  const lon = Number(latestData.lon);

  if (els.location) {
    els.location.textContent =
      Number.isFinite(lat) && Number.isFinite(lon)
        ? `${lat.toFixed(5)}, ${lon.toFixed(5)}`
        : "Unknown";
  }

  els.updated.textContent = latestData.timestamp
    ? formatTimestamp(latestData.timestamp)
    : "Unknown";

  els.pollutantList.innerHTML = "";

  Object.entries(CONFIG.pollutants).forEach(([key, meta]) => {
    const value = latestData.pollutants?.[key];

    const row = document.createElement("div");
    row.className = "pollutant-row";

    const name = document.createElement("span");
    name.className = "pollutant-name";
    name.textContent = meta.label;

    const number = document.createElement("span");
    number.className = "pollutant-value";
    number.textContent = formatValue(value, meta.unit);

    row.appendChild(name);
    row.appendChild(number);

    els.pollutantList.appendChild(row);
  });
}

function renderLegend() {
  if (!legendContainer) return;

  const meta = CONFIG.pollutants[selectedPollutant];

  legendContainer.innerHTML = `
    <div class="map-legend-title">${meta.label}</div>
  `;

  meta.breaks.forEach((bin, index) => {
    const row = document.createElement("div");
    row.className = "legend-row";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = bin.color;

    const label = document.createElement("span");
    label.textContent = `${bin.label} ${meta.unit}`.trim();

    row.appendChild(swatch);
    row.appendChild(label);

    legendContainer.appendChild(row);
  });

  if (meta.note) {
    const note = document.createElement("div");
    note.className = "map-legend-note";
    note.textContent = "Display bands; not compliance averaging.";
    legendContainer.appendChild(note);
  }
}

/* =========================================================
   Time-series chart
   ========================================================= */

function renderTimeseriesChart() {
  if (!els.timeseriesChart || typeof Chart === "undefined") return;

  const pollutantMeta = CONFIG.pollutants[selectedPollutant];

  timeseriesPoints = getSortedHistoryPointsAscending();

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

  if (els.timeseriesSubtitle) {
    els.timeseriesSubtitle.textContent =
      `Showing ${pollutantMeta.label}. Scroll horizontally for long trips. Click a point to jump to the map.`;
  }

  if (timeseriesChart) {
    timeseriesChart.destroy();
  }

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
      resizeDelay: 100,
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
              return `${pollutantMeta.label}: ${formatValue(item.raw, pollutantMeta.unit)}`;
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
            maxTicksLimit: 12
          },
          grid: {
            display: false
          }
        },
        y: {
          title: {
            display: true,
            text: pollutantMeta.unit
              ? `${pollutantMeta.label} (${pollutantMeta.unit})`
              : pollutantMeta.label
          },
          ticks: {
            precision: 0
          }
        }
      },
      onClick: (event) => {
        const chartPoints = timeseriesChart.getElementsAtEventForMode(
          event,
          "nearest",
          {
            intersect: true
          },
          true
        );

        if (chartPoints.length === 0) return;

        const index = chartPoints[0].index;
        const point = timeseriesPoints[index];

        selectHistoryPoint(point, {
          panMap: true,
          openPopup: true
        });
      }
    },
    plugins: [noonMidnightChartPlugin]
  });

  updateTimeseriesHighlight();
}

function updateTimeseriesHighlight() {
  if (!timeseriesChart || !Array.isArray(timeseriesPoints)) return;

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
}

/* =========================================================
   Noon/midnight markers
   ========================================================= */

const noonMidnightChartPlugin = {
  id: "noonMidnightMarkers",

  afterDatasetsDraw(chart) {
    if (!CONFIG.timeMarkers?.enabled) return;

    const { ctx, chartArea, scales } = chart;
    const xScale = scales.x;

    if (!xScale || !chartArea) return;

    const markers = getNoonMidnightMarkers(timeseriesPoints);

    ctx.save();

    markers.forEach((marker) => {
      const chartIndex = timeseriesPoints.findIndex((point) => {
        return point.index === marker.point.index;
      });

      if (chartIndex < 0) return;

      const x = xScale.getPixelForValue(chartIndex);
      const color =
        marker.type === "noon"
          ? CONFIG.timeMarkers.noonColor
          : CONFIG.timeMarkers.midnightColor;

      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.lineWidth = 1.5;
      ctx.setLineDash(marker.type === "noon" ? [5, 4] : []);
      ctx.strokeStyle = color;
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = "700 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(marker.type === "noon" ? "Noon" : "Mid", x, chartArea.top + 10);
    });

    ctx.restore();
  }
};

function getNoonMidnightMarkers(points) {
  const toleranceMinutes = CONFIG.timeMarkers?.toleranceMinutes ?? 9;
  const candidates = new Map();

  points.forEach((point) => {
    const timestamp = point.properties?.timestamp;
    const parts = getLocalTimeParts(timestamp);

    if (!parts) return;

    const totalMinutes = parts.hour * 60 + parts.minute + parts.second / 60;

    const noonOffset = Math.abs(totalMinutes - 720);
    const midnightOffset = Math.min(totalMinutes, Math.abs(1440 - totalMinutes));

    if (noonOffset <= toleranceMinutes) {
      addBestTimeMarkerCandidate(candidates, {
        key: `${parts.year}-${parts.month}-${parts.day}-noon`,
        type: "noon",
        offset: noonOffset,
        point
      });
    }

    if (midnightOffset <= toleranceMinutes) {
      const midnightDateKey =
        totalMinutes > 720
          ? `${parts.year}-${parts.month}-${Number(parts.day) + 1}`
          : `${parts.year}-${parts.month}-${parts.day}`;

      addBestTimeMarkerCandidate(candidates, {
        key: `${midnightDateKey}-midnight`,
        type: "midnight",
        offset: midnightOffset,
        point
      });
    }
  });

  return Array.from(candidates.values()).sort((a, b) => {
    const aTime = Date.parse(a.point.properties.timestamp);
    const bTime = Date.parse(b.point.properties.timestamp);

    return aTime - bTime;
  });
}

function addBestTimeMarkerCandidate(candidates, candidate) {
  const existing = candidates.get(candidate.key);

  if (!existing || candidate.offset < existing.offset) {
    candidates.set(candidate.key, candidate);
  }
}

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

/* =========================================================
   Popup and marker helpers
   ========================================================= */

function makePopup(point, pollutantKey) {
  const meta = CONFIG.pollutants[pollutantKey];
  const value = point.properties[pollutantKey];
  const timestamp = point.properties.timestamp;

  return `
    <strong>${meta.label}</strong>: ${formatValue(value, meta.unit)}<br>
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
  const label = type === "noon" ? "12" : "00";

  return L.divIcon({
    className: "time-marker",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
    html: `
      <div class="time-marker-wrap ${type}">
        ${label}
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
  if (!timestamp) {
    els.status.textContent = "No timestamp";
    els.status.className = "status-pill stale";
    return;
  }

  const updated = new Date(timestamp);
  const ageMinutes = (Date.now() - updated.getTime()) / 60000;

  if (!Number.isFinite(ageMinutes)) {
    els.status.textContent = "Invalid timestamp";
    els.status.className = "status-pill stale";
    return;
  }

  if (ageMinutes < -5) {
    els.status.textContent = "Sample route";
    els.status.className = "status-pill stale";
    return;
  }

  if (ageMinutes > CONFIG.staleAfterMinutes) {
    els.status.textContent = `Stale: ${Math.round(ageMinutes)} min old`;
    els.status.className = "status-pill stale";
  } else {
    els.status.textContent = "Live";
    els.status.className = "status-pill live";
  }
}

/* =========================================================
   Responsive defaults
   ========================================================= */

function applyResponsiveDefaults() {
  if (!els.currentPollutantsCard) return;

  if (window.innerWidth <= 800) {
    els.currentPollutantsCard.removeAttribute("open");
  } else {
    els.currentPollutantsCard.setAttribute("open", "");
  }
}

/* =========================================================
   Formatting helpers
   ========================================================= */

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

function formatValue(value, unit) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "—";
  }

  return `${roundValue(numeric)} ${unit}`.trim();
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