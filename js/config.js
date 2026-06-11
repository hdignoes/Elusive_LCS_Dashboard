const CONFIG = {
  dataUrls: {
    history: "data/history.geojson",
    latest: "data/latest.json"
  },

  refreshMs: 60_000,
  staleAfterMinutes: 30,

  displayTimeZone: "America/Vancouver",

  startView: {
    center: [49.2827, -123.1207],
    zoom: 7
  },

  chart: {
    minWidthPx: 760,
    pixelsPerPoint: 11
  },

  timeMarkers: {
    enabled: true,
    toleranceMinutes: 9,
    midnightColor: "#1e293b",
    noonColor: "#f59e0b"
  },

  colors: {
    unavailable: "#94a3b8",
    trackBase: "#0f172a",
    selected: "#ffffff"
  },

  pollutants: {
    CO: {
      label: "CO",
      unit: "ppm",
      note: "Display bands loosely based on WHO CO guidance and regional CO objectives.",
      breaks: [
        { max: 1, color: "#2c7bb6", label: "≤1" },
        { max: 3.5, color: "#abd9e9", label: "1–3.5" },
        { max: 5, color: "#ffffbf", label: "3.5–5" },
        { max: 8.7, color: "#fdae61", label: "5–8.7" },
        { max: 13, color: "#f46d43", label: "8.7–13" },
        { max: Infinity, color: "#d7191c", label: ">13" }
      ]
    },

    NO: {
      label: "NO",
      unit: "ppb",
      note: "No common ambient objective; bands are exploratory for vessel/source indication.",
      breaks: [
        { max: 2, color: "#2c7bb6", label: "≤2" },
        { max: 10, color: "#abd9e9", label: "2–10" },
        { max: 25, color: "#ffffbf", label: "10–25" },
        { max: 50, color: "#fdae61", label: "25–50" },
        { max: 100, color: "#f46d43", label: "50–100" },
        { max: Infinity, color: "#d7191c", label: ">100" }
      ]
    },

    NO2: {
      label: "NO₂",
      unit: "ppb",
      note: "Bands use WHO lower reference levels and CAAQS/Metro Vancouver 1-hour context.",
      breaks: [
        { max: 5, color: "#2c7bb6", label: "≤5" },
        { max: 13, color: "#abd9e9", label: "5–13" },
        { max: 25, color: "#ffffbf", label: "13–25" },
        { max: 42, color: "#fdae61", label: "25–42" },
        { max: 60, color: "#f46d43", label: "42–60" },
        { max: Infinity, color: "#d7191c", label: ">60" }
      ]
    },

    O3: {
      label: "O₃",
      unit: "ppb",
      note: "Bands use WHO lower reference levels plus CAAQS/Metro Vancouver 8-hour and 1-hour context.",
      breaks: [
        { max: 30, color: "#2c7bb6", label: "≤30" },
        { max: 50, color: "#abd9e9", label: "30–50" },
        { max: 60, color: "#ffffbf", label: "50–60" },
        { max: 82, color: "#fdae61", label: "60–82" },
        { max: 100, color: "#f46d43", label: "82–100" },
        { max: Infinity, color: "#d7191c", label: ">100" }
      ]
    },

    CO2: {
      label: "CO₂",
      unit: "ppm",
      note: "Context bands only; CO₂ is not a CAAQS/WHO ambient criteria pollutant.",
      breaks: [
        { max: 420, color: "#2c7bb6", label: "≤420" },
        { max: 600, color: "#abd9e9", label: "420–600" },
        { max: 800, color: "#ffffbf", label: "600–800" },
        { max: 1000, color: "#fdae61", label: "800–1000" },
        { max: 1500, color: "#f46d43", label: "1000–1500" },
        { max: Infinity, color: "#d7191c", label: ">1500" }
      ]
    },

    PM1: {
      label: "PM₁",
      unit: "µg/m³",
      note: "No common ambient objective; bands are heuristic and aligned roughly below PM₂.₅ context.",
      breaks: [
        { max: 2.5, color: "#2c7bb6", label: "≤2.5" },
        { max: 5, color: "#abd9e9", label: "2.5–5" },
        { max: 10, color: "#ffffbf", label: "5–10" },
        { max: 20, color: "#fdae61", label: "10–20" },
        { max: 35, color: "#f46d43", label: "20–35" },
        { max: Infinity, color: "#d7191c", label: ">35" }
      ]
    },

    PM2_5: {
      label: "PM₂.₅",
      unit: "µg/m³",
      note: "Bands include WHO 24-hour guidance and Metro Vancouver/B.C./CAAQS 24-hour context.",
      breaks: [
        { max: 5, color: "#2c7bb6", label: "≤5" },
        { max: 15, color: "#abd9e9", label: "5–15" },
        { max: 25, color: "#ffffbf", label: "15–25" },
        { max: 27, color: "#fdae61", label: "25–27" },
        { max: 50, color: "#f46d43", label: "27–50" },
        { max: Infinity, color: "#d7191c", label: ">50" }
      ]
    },

    PM10: {
      label: "PM₁₀",
      unit: "µg/m³",
      note: "Bands include WHO 24-hour guidance and B.C./Metro Vancouver PM₁₀ context.",
      breaks: [
        { max: 15, color: "#2c7bb6", label: "≤15" },
        { max: 30, color: "#abd9e9", label: "15–30" },
        { max: 45, color: "#ffffbf", label: "30–45" },
        { max: 50, color: "#fdae61", label: "45–50" },
        { max: 100, color: "#f46d43", label: "50–100" },
        { max: Infinity, color: "#d7191c", label: ">100" }
      ]
    },

    T: {
      label: "Temperature",
      unit: "°C",
      note: "Meteorological display bands only.",
      breaks: [
        { max: 0, color: "#2c7bb6", label: "≤0" },
        { max: 10, color: "#abd9e9", label: "0–10" },
        { max: 20, color: "#ffffbf", label: "10–20" },
        { max: 25, color: "#fdae61", label: "20–25" },
        { max: 30, color: "#f46d43", label: "25–30" },
        { max: Infinity, color: "#d7191c", label: ">30" }
      ]
    },

    RH: {
      label: "Relative humidity",
      unit: "%",
      note: "Meteorological display bands only.",
      breaks: [
        { max: 30, color: "#fdae61", label: "≤30" },
        { max: 50, color: "#ffffbf", label: "30–50" },
        { max: 70, color: "#abd9e9", label: "50–70" },
        { max: 85, color: "#2c7bb6", label: "70–85" },
        { max: 95, color: "#4575b4", label: "85–95" },
        { max: Infinity, color: "#313695", label: ">95" }
      ]
    },

    AQHI: {
      label: "AQHI",
      unit: "",
      note: "Uses standard AQHI-style low/moderate/high/very high display bands.",
      breaks: [
        { max: 1, color: "#67c1f1", label: "1" },
        { max: 3, color: "#4e95c7", label: "2–3" },
        { max: 6, color: "#e7eb38", label: "4–6" },
        { max: 7, color: "#e79647", label: "7" },
        { max: 10, color: "#d82732", label: "8–10" },
        { max: Infinity, color: "#8b2328", label: ">10" }
      ]
    }
  },

  defaultPollutant: "PM2_5"
};