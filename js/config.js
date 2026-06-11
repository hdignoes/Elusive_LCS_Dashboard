const AQHI_PLUS_COLORS = {
  veryLow: "#67c1f1",
  low: "#4e95c7",
  lowModerate: "#396798",
  moderate: "#e7eb38",
  moderateHigh: "#f1cb2e",
  high: "#e79647",
  highVeryHigh: "#dd6869",
  veryHigh: "#d82732",
  severe: "#bf2733",
  extreme: "#8b2328"
};

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

  chartDecimation: {
    enabled: true,
    thresholdPoints: 2000,
    targetPoints: 1200
  },

  mapControls: {
    legendCollapsedOnDesktop: false,
    legendCollapsedOnMobile: true
  },

  sunMarkers: {
    enabled: true,
    toleranceMinutes: 45
  },

  dayBoundaryLines: {
    enabled: true,
    toleranceMinutes: 20,
    lineColor: "#334155",
    textColor: "#334155"
  },

  colors: {
    unavailable: "#94a3b8",
    trackBase: "#0f172a",
    selected: "#ffffff"
  },

  pollutantGroups: [
    {
      label: "Air pollutants",
      keys: ["AQHI", "PM2_5", "PM1", "PM10", "O3", "NO2", "NO", "CO", "CO2"]
    },
    {
      label: "Meteorology",
      keys: ["T", "RH"]
    }
  ],

  pollutants: {
    CO: {
      label: "CO",
      unit: "ppm",
      group: "Air pollutants",
      note: "Display bands loosely based on WHO CO guidance and regional CO objectives.",
      breaks: [
        { max: 1, color: AQHI_PLUS_COLORS.veryLow, label: "≤1" },
        { max: 3.5, color: AQHI_PLUS_COLORS.low, label: "1–3.5" },
        { max: 5, color: AQHI_PLUS_COLORS.moderate, label: "3.5–5" },
        { max: 8.7, color: AQHI_PLUS_COLORS.high, label: "5–8.7" },
        { max: 13, color: AQHI_PLUS_COLORS.veryHigh, label: "8.7–13" },
        { max: Infinity, color: AQHI_PLUS_COLORS.extreme, label: ">13" }
      ]
    },

    NO: {
      label: "NO",
      unit: "ppb",
      group: "Air pollutants",
      note: "No common ambient objective; bands are exploratory for vessel/source indication.",
      breaks: [
        { max: 2, color: AQHI_PLUS_COLORS.veryLow, label: "≤2" },
        { max: 10, color: AQHI_PLUS_COLORS.low, label: "2–10" },
        { max: 25, color: AQHI_PLUS_COLORS.moderate, label: "10–25" },
        { max: 50, color: AQHI_PLUS_COLORS.high, label: "25–50" },
        { max: 100, color: AQHI_PLUS_COLORS.veryHigh, label: "50–100" },
        { max: Infinity, color: AQHI_PLUS_COLORS.extreme, label: ">100" }
      ]
    },

    NO2: {
      label: "NO₂",
      unit: "ppb",
      group: "Air pollutants",
      note: "Bands use WHO lower reference levels and CAAQS/Metro Vancouver 1-hour context.",
      breaks: [
        { max: 5, color: AQHI_PLUS_COLORS.veryLow, label: "≤5" },
        { max: 13, color: AQHI_PLUS_COLORS.low, label: "5–13" },
        { max: 25, color: AQHI_PLUS_COLORS.moderate, label: "13–25" },
        { max: 42, color: AQHI_PLUS_COLORS.high, label: "25–42" },
        { max: 60, color: AQHI_PLUS_COLORS.veryHigh, label: "42–60" },
        { max: Infinity, color: AQHI_PLUS_COLORS.extreme, label: ">60" }
      ]
    },

    O3: {
      label: "O₃",
      unit: "ppb",
      group: "Air pollutants",
      note: "Bands use WHO lower reference levels plus CAAQS/Metro Vancouver 8-hour and 1-hour context.",
      breaks: [
        { max: 30, color: AQHI_PLUS_COLORS.veryLow, label: "≤30" },
        { max: 50, color: AQHI_PLUS_COLORS.low, label: "30–50" },
        { max: 60, color: AQHI_PLUS_COLORS.moderate, label: "50–60" },
        { max: 82, color: AQHI_PLUS_COLORS.high, label: "60–82" },
        { max: 100, color: AQHI_PLUS_COLORS.veryHigh, label: "82–100" },
        { max: Infinity, color: AQHI_PLUS_COLORS.extreme, label: ">100" }
      ]
    },

    CO2: {
      label: "CO₂",
      unit: "ppm",
      group: "Air pollutants",
      note: "Context bands only; CO₂ is not a CAAQS/WHO ambient criteria pollutant.",
      breaks: [
        { max: 420, color: AQHI_PLUS_COLORS.veryLow, label: "≤420" },
        { max: 600, color: AQHI_PLUS_COLORS.low, label: "420–600" },
        { max: 800, color: AQHI_PLUS_COLORS.moderate, label: "600–800" },
        { max: 1000, color: AQHI_PLUS_COLORS.high, label: "800–1000" },
        { max: 1500, color: AQHI_PLUS_COLORS.veryHigh, label: "1000–1500" },
        { max: Infinity, color: AQHI_PLUS_COLORS.extreme, label: ">1500" }
      ]
    },

    PM1: {
      label: "PM₁",
      unit: "µg/m³",
      group: "Air pollutants",
      note: "No common ambient objective; bands are heuristic and aligned roughly below PM₂.₅ context.",
      breaks: [
        { max: 2.5, color: AQHI_PLUS_COLORS.veryLow, label: "≤2.5" },
        { max: 5, color: AQHI_PLUS_COLORS.low, label: "2.5–5" },
        { max: 10, color: AQHI_PLUS_COLORS.moderate, label: "5–10" },
        { max: 20, color: AQHI_PLUS_COLORS.high, label: "10–20" },
        { max: 35, color: AQHI_PLUS_COLORS.veryHigh, label: "20–35" },
        { max: Infinity, color: AQHI_PLUS_COLORS.extreme, label: ">35" }
      ]
    },

    PM2_5: {
      label: "PM₂.₅",
      unit: "µg/m³",
      group: "Air pollutants",
      note: "Bands include WHO 24-hour guidance and Metro Vancouver/B.C./CAAQS 24-hour context.",
      breaks: [
        { max: 5, color: AQHI_PLUS_COLORS.veryLow, label: "≤5" },
        { max: 15, color: AQHI_PLUS_COLORS.low, label: "5–15" },
        { max: 25, color: AQHI_PLUS_COLORS.moderate, label: "15–25" },
        { max: 27, color: AQHI_PLUS_COLORS.moderateHigh, label: "25–27" },
        { max: 50, color: AQHI_PLUS_COLORS.highVeryHigh, label: "27–50" },
        { max: Infinity, color: AQHI_PLUS_COLORS.extreme, label: ">50" }
      ]
    },

    PM10: {
      label: "PM₁₀",
      unit: "µg/m³",
      group: "Air pollutants",
      note: "Bands include WHO 24-hour guidance and B.C./Metro Vancouver PM₁₀ context.",
      breaks: [
        { max: 15, color: AQHI_PLUS_COLORS.veryLow, label: "≤15" },
        { max: 30, color: AQHI_PLUS_COLORS.low, label: "15–30" },
        { max: 45, color: AQHI_PLUS_COLORS.moderate, label: "30–45" },
        { max: 50, color: AQHI_PLUS_COLORS.high, label: "45–50" },
        { max: 100, color: AQHI_PLUS_COLORS.veryHigh, label: "50–100" },
        { max: Infinity, color: AQHI_PLUS_COLORS.extreme, label: ">100" }
      ]
    },

    T: {
      label: "Temperature",
      unit: "°C",
      group: "Meteorology",
      note: "Meteorological display bands only.",
      breaks: [
        { max: 0, color: AQHI_PLUS_COLORS.lowModerate, label: "≤0" },
        { max: 10, color: AQHI_PLUS_COLORS.low, label: "0–10" },
        { max: 20, color: AQHI_PLUS_COLORS.veryLow, label: "10–20" },
        { max: 25, color: AQHI_PLUS_COLORS.moderate, label: "20–25" },
        { max: 30, color: AQHI_PLUS_COLORS.high, label: "25–30" },
        { max: Infinity, color: AQHI_PLUS_COLORS.extreme, label: ">30" }
      ]
    },

    RH: {
      label: "Relative humidity",
      unit: "%",
      group: "Meteorology",
      note: "Meteorological display bands only.",
      breaks: [
        { max: 30, color: AQHI_PLUS_COLORS.high, label: "≤30" },
        { max: 50, color: AQHI_PLUS_COLORS.moderate, label: "30–50" },
        { max: 70, color: AQHI_PLUS_COLORS.veryLow, label: "50–70" },
        { max: 85, color: AQHI_PLUS_COLORS.low, label: "70–85" },
        { max: 95, color: AQHI_PLUS_COLORS.lowModerate, label: "85–95" },
        { max: Infinity, color: AQHI_PLUS_COLORS.highVeryHigh, label: ">95" }
      ]
    },

    AQHI: {
      label: "AQHI",
      unit: "",
      group: "Air pollutants",
      note: "Uses AQHI Plus-style display bands.",
      breaks: [
        { max: 1, color: AQHI_PLUS_COLORS.veryLow, label: "1" },
        { max: 3, color: AQHI_PLUS_COLORS.low, label: "2–3" },
        { max: 4, color: AQHI_PLUS_COLORS.moderate, label: "4" },
        { max: 6, color: AQHI_PLUS_COLORS.moderateHigh, label: "5–6" },
        { max: 7, color: AQHI_PLUS_COLORS.high, label: "7" },
        { max: 8, color: AQHI_PLUS_COLORS.highVeryHigh, label: "8" },
        { max: 10, color: AQHI_PLUS_COLORS.veryHigh, label: "9–10" },
        { max: Infinity, color: AQHI_PLUS_COLORS.extreme, label: ">10" }
      ]
    }
  },

  defaultPollutant: "PM2_5"
};