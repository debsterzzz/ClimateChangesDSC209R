// Global Variables
let worldGeom;       // geometry-only world countries
let tempTable;       // temperature table (by ISO3)
let tempByISO = {};  // lookup: ISO3 -> properties row
let seaData;
let seaByYear = {};
let currentYear = 1992;
let mode = "temp"; // "temp" | "sea" | "disaster"

let disasterData;
let disasterByISO = {};
let disasterYears = new Set();

let globalTempByYear = {};       // year -> avg anomaly
let globalDisastersByYear = {};  // year -> total disasters

let sliderMinYear = 1992;
let sliderMaxYear = 2010;

let isPlaying = false;
let playInterval = null;

// NEW: lookup for country search (name/ISO -> { iso, bbox, displayName })
let countryLookup = {};

// Initialize MapLibre
const map = new maplibregl.Map({
  container: "map",
  style: "data/style.json",
  center: [0, 20],
  zoom: 1.6,
  renderWorldCopies: false
});

// -----------------------------
// COLOR SCALES
// -----------------------------
let TEMP_MIN = -0.5;  // tweak if needed
let TEMP_MAX = 1.5;   // tweak if needed

function getTempColor(v) {
  if (v == null) return "#e0e0e0";

  const t = (v - TEMP_MIN) / (TEMP_MAX - TEMP_MIN);
  const tt = Math.max(0, Math.min(1, t));

  // diverging: blue (cool) -> white -> red (warm)
  return d3.interpolateRdYlBu(1 - tt);
}

function getSeaColor(v, minSea, maxSea) {
  const t = (v - minSea) / (maxSea - minSea);
  return d3.interpolateBlues(Math.max(0, Math.min(t, 1)));
}

// -----------------------------
// TEMP TABLE LOOKUP
// -----------------------------
function getTempValue(props, year) {
  // props here are from the *temp table* (Indicator_3_1_...)
  const candidates = [
    String(year),   // "1992"
    "F" + year,     // "F1992"
    "Y" + year      // "Y1992" just in case
  ];

  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      const raw = props[key];
      if (raw == null || raw === "" || Number.isNaN(Number(raw))) return null;
      return Number(raw);
    }
  }
  return null;
}

// -----------------------------
// Helper: compute bbox for a feature geometry
// -----------------------------
function computeFeatureBBox(geometry) {
  if (!geometry) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function processCoords(coords) {
    coords.forEach(c => {
      if (Array.isArray(c[0])) {
        processCoords(c);
      } else {
        const [x, y] = c;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    });
  }

  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    processCoords(geometry.coordinates);
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return null;
  }
  return [[minX, minY], [maxX, maxY]];
}

// -----------------------------
// Helper: build lookup for country search
// -----------------------------
function buildCountryLookup() {
  if (!worldGeom || !worldGeom.features) return;

  countryLookup = {};

  worldGeom.features.forEach(f => {
    const props = f.properties || {};
    const iso = (
      props.ISO3 ||
      props.ISO_A3 ||
      props.ADM0_A3 ||
      props.adm0_a3 ||
      props.SOV_A3 ||
      props.sov_a3 ||
      ""
    ).trim();

    const name = getCountryName(props);
    const bbox = computeFeatureBBox(f.geometry);
    const names = [name, props.ADMIN, props.sovereignt, iso];

    names.forEach(n => {
      if (!n) return;
      const key = n.toLowerCase();
      if (!countryLookup[key]) {
        countryLookup[key] = { iso, bbox, displayName: name };
      }
    });
  });
}

// -----------------------------
// Helper: filter expression for highlight layer
// -----------------------------
function highlightFilterForISO(iso) {
  return [
    "==",
    [
      "coalesce",
      ["get", "ISO3"],
      ["get", "ISO_A3"],
      ["get", "ADM0_A3"],
      ["get", "adm0_a3"],
      ["get", "SOV_A3"],
      ["get", "sov_a3"]
    ],
    iso || ""
  ];
}

// -----------------------------
// LOAD DATA
// -----------------------------
Promise.all([
  // 1) World geometry
  fetch("data/climate_world_joined.json").then(r => r.json()),

  // 2) Temperature table (geojson)
  fetch("data/Indicator_3_1_Climate_Indicators_Annual_Mean_Global_Surface_Temperature_5943755526554557319.geojson")
    .then(r => r.json()),

  // 3) Sea-level data
  fetch("data/Indicator_3_3_melted_new_-7232464109204630623.geojson")
    .then(r => r.json()),

  // 4) Disasters CSV (physical risks)
  d3.csv("data/Indicator_11_1_Physical_Risks_Climate_related_disasters_frequency_7212563912390016675.csv")
]).then(([world, tempTableGeo, sea, disasterCsv]) => {
  worldGeom = world;
  seaData = sea;
  tempTable = tempTableGeo;
  disasterData = disasterCsv;

  console.log("World geom (climate source):", worldGeom);
  console.log("Temp table:", tempTable);
  console.log("Sea level data:", seaData);
  console.log("Disaster frequency:", disasterData);

  // Get slider range from DOM
  const slider = document.getElementById("yearSlider");
  if (slider) {
    sliderMinYear = +slider.min;
    sliderMaxYear = +slider.max;
  }

  // Build ISO3 -> temp-row lookup from the temp table
  tempTable.features.forEach(f => {
    const p = f.properties || {};
    const iso = (p.ISO3 || "").trim();
    if (iso) tempByISO[iso] = p;
  });

  // Build ISO3 -> year -> disaster_count lookup + global totals
  buildDisasterLookup(disasterData);

  // Compute sea-level by year (global)
  processSeaLevels(seaData);

  // Compute global avg temperature anomaly per year
  computeGlobalTempSeries();

  map.on("load", () => {
    // CLIMATE SOURCE + LAYER
    map.addSource("climate", {
      type: "geojson",
      data: worldGeom
    });

    map.addLayer({
      id: "climate-fill",
      type: "fill",
      source: "climate",
      paint: {
        "fill-color": [
          "coalesce",
          ["get", "value_color"],
          "#e0e0e0"
        ],
        "fill-opacity": 0.75,
        "fill-outline-color": "#444"
      }
    });

    // OCEAN MASK SOURCE + LAYER
    map.addSource("ocean-mask", {
      type: "geojson",
      data: "data/oceans.geojson"
    });

    map.addLayer({
      id: "ocean-fill",
      type: "fill",
      source: "ocean-mask",
      paint: {
        "fill-color": "#aac6ff",
        "fill-opacity": 1.0
      }
    }, "climate-fill");

    // NEW: highlight outline layer
    map.addLayer({
      id: "country-highlight",
      type: "line",
      source: "climate",
      paint: {
        "line-color": "#ffcc00",
        "line-width": 2
      },
      filter: highlightFilterForISO("")
    });

    // Build lookup now that worldGeom is ready
    buildCountryLookup();

    setupInteraction();
    setupCountrySearch();
    setActiveButton();
    updateLegend();
    updateMap(currentYear);
    updateSummary(currentYear);
  });

  const years = d3.range(sliderMinYear, sliderMaxYear + 1);

  // === GLOBAL SPARKLINE ===
  // === GLOBAL SPARKLINE ===
  updateGlobalSparkline();

});

// -----------------------------
// Sea levels: year → avg value
// -----------------------------
function processSeaLevels(gdf) {
  const yearly = {};

  gdf.features.forEach(f => {
    const p = f.properties;
    const date = p.Date;      // "D10/17/1992"
    const val = p.Value;      // numeric

    if (!date || val == null) return;

    const year = parseInt(date.slice(-4)); // extract "1992"

    if (!yearly[year]) yearly[year] = [];
    yearly[year].push(val);
  });

  // Average the values per year
  Object.keys(yearly).forEach(y => {
    const arr = yearly[y];
    seaByYear[y] = arr.reduce((a, b) => a + b, 0) / arr.length;
  });

  console.log("Sea level (avg) by year:", seaByYear);
}

// -----------------------------
// Country name helper
// -----------------------------
function getCountryName(props) {
  // Prefer the territory / administered name
  let name =
    props.ADMIN ||
    props.NAME ||
    props.formal_en ||
    props.name_long ||
    props.BRK_NAME ||
    props.brk_name;

  // Fall back to sovereign name only if we have nothing better
  if (!name && props.sovereignt) {
    name = props.sovereignt;
  }

  if (!name) {
    name = "Unknown";
  }

  return name;
}


// -----------------------------
// Disasters: build lookup + global totals
// -----------------------------
function buildDisasterLookup(rows) {
  rows.forEach(row => {
    const indicator = (row.Indicator || row.indicator || "").toString();

    // Skip "Number of People Affected" rows completely
    if (indicator.includes("People Affected")) return;

    // Keep ONLY "Climate related disasters frequency, Number of Disasters: TOTAL"
    if (
      !indicator.includes("Number of Disasters") ||
      !indicator.includes("TOTAL")
    ) {
      return;
    }

    const iso = (row.ISO3 || row.ISO || row.ADM0_A3 || "").trim();
    if (!iso) return;

    if (!disasterByISO[iso]) disasterByISO[iso] = {};

    Object.keys(row).forEach(col => {
      const y = parseInt(col, 10);
      if (!Number.isNaN(y) && y >= 1900 && y <= 2100) {
        const val = row[col];
        if (val !== "" && val != null && !Number.isNaN(+val)) {
          const numVal = +val;

          // store per-country/year
          disasterByISO[iso][y] = numVal;
          disasterYears.add(y);

          // accumulate global totals per year
          if (!globalDisastersByYear[y]) globalDisastersByYear[y] = 0;
          globalDisastersByYear[y] += numVal;
        }
      }
    });
  });

  console.log(
    "Disaster years found:",
    Array.from(disasterYears).sort((a, b) => a - b)
  );
  console.log("Global disasters by year:", globalDisastersByYear);
}

function getDisasterColor(v, minVal, maxVal) {
  if (v == null) return "#e0e0e0";
  if (maxVal === minVal) return d3.interpolateReds(1); // avoid div by zero

  const t = (v - minVal) / (maxVal - minVal);
  const tt = Math.max(0, Math.min(1, t));
  return d3.interpolateReds(tt);
}

// -----------------------------
// Global temperature series
// -----------------------------
function computeGlobalTempSeries() {
  const years = [];
  for (let y = sliderMinYear; y <= sliderMaxYear; y++) {
    years.push(y);
  }

  years.forEach(y => {
    const vals = [];

    Object.values(tempByISO).forEach(props => {
      const v = getTempValue(props, y);
      if (v != null) vals.push(v);
    });

    if (vals.length > 0) {
      const sum = vals.reduce((a, b) => a + b, 0);
      globalTempByYear[y] = sum / vals.length;
    } else {
      globalTempByYear[y] = null;
    }
  });

  console.log("Global avg temp anomaly by year:", globalTempByYear);
}

// -----------------------------
// MAP UPDATES
// -----------------------------
function updateMap(year = currentYear) {
  const src = map.getSource("climate");
  if (!src || !worldGeom) return;

  // ----- LAND: TEMPERATURE OR DISASTERS -----
  if (mode === "temp" || mode === "disaster") {
    // Precompute disaster min/max for the chosen year (for legend + color scale)
    let dMin = Infinity, dMax = -Infinity;
    if (mode === "disaster") {
      Object.values(disasterByISO).forEach(yearDict => {
        if (yearDict[year] != null) {
          const v = yearDict[year];
          if (v < dMin) dMin = v;
          if (v > dMax) dMax = v;
        }
      });
      if (!isFinite(dMin) || !isFinite(dMax)) {
        dMin = 0;
        dMax = 1;
      }
    }

    const updated = {
      ...worldGeom,
      features: worldGeom.features.map(f => {
        const props = f.properties || {};
        const iso = (props.ISO3 || props.ISO_A3 || props.ADM0_A3 || props.adm0_a3 || props.SOV_A3 || props.sov_a3 || "").trim();

        let value = null;
        let color = "#e0e0e0";

        if (mode === "temp") {
          const tempRow = iso ? tempByISO[iso] : null;
          value = tempRow ? getTempValue(tempRow, year) : null;
          color = value != null ? getTempColor(value) : "#e0e0e0";
        } else if (mode === "disaster") {
          value = iso && disasterByISO[iso] ? disasterByISO[iso][year] : null;
          color = getDisasterColor(value, dMin, dMax);
        }

        return {
          ...f,
          properties: {
            ...props,
            value,
            value_color: color
          }
        };
      })
    };

    src.setData(updated);
  }

  // ----- OCEAN: SEA LEVEL -----
  if (mode === "sea") {
    const seaVal = seaByYear[year];  // use the year argument
    const allVals = Object.values(seaByYear);
    const minSea = Math.min(...allVals);
    const maxSea = Math.max(...allVals);

    let oceanColor = "#aac6ff"; // fallback
    if (seaVal != null) {
      oceanColor = getSeaColor(seaVal, minSea, maxSea);
    }

    try {
      map.setPaintProperty("ocean-fill", "fill-color", oceanColor);
    } catch (e) {
      console.warn("Water layer not ready yet:", e);
    }
  }
}

function startPlayback() {
  if (isPlaying) return;

  const playBtnIcon = document.getElementById("playPauseIcon");
  const yearSlider = document.getElementById("yearSlider");
  if (!playBtnIcon || !yearSlider) return;

  isPlaying = true;

  // Switch to pause icon
  playBtnIcon.classList.remove("icon-play");
  playBtnIcon.classList.add("icon-pause");

  playInterval = setInterval(() => {
    let nextYear = currentYear + 1;

    if (nextYear > sliderMaxYear) {
      nextYear = sliderMinYear;
    }

    currentYear = nextYear;
    yearSlider.value = String(currentYear);
    document.getElementById("yearLabel").textContent = currentYear;

    updateMap(currentYear);
    updateLegend(currentYear);
    updateSummary(currentYear);
  }, 2500);
}

function stopPlayback() {
  if (!isPlaying) return;

  isPlaying = false;

  const playBtnIcon = document.getElementById("playPauseIcon");
  if (playBtnIcon) {
    // Switch to play icon
    playBtnIcon.classList.remove("icon-pause");
    playBtnIcon.classList.add("icon-play");
  }

  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
  }
}

// -----------------------------
// SLIDER + BUTTONS + TOOLTIP
// -----------------------------
function setupInteraction() {
  const yearSlider = document.getElementById("yearSlider");
  let sliderTimeout;

  // Make sure we have up-to-date min/max from the slider
  sliderMinYear = +yearSlider.min;
  sliderMaxYear = +yearSlider.max;

  yearSlider.oninput = e => {
    // If the user moves the slider while it's playing, pause
    if (isPlaying) {
      stopPlayback();
    }

    clearTimeout(sliderTimeout);

    sliderTimeout = setTimeout(() => {
      const newYear = +e.target.value;
      if (!isNaN(newYear)) {
        currentYear = newYear;
        document.getElementById("yearLabel").textContent = newYear;
        updateMap(newYear);
        updateLegend(newYear);
        updateSummary(newYear);
      }
    }, 100);
  };

  document.getElementById("modeTemp").onclick = () => {
    mode = "temp";
    setActiveButton();
    updateMap(currentYear);
    updateLegend(currentYear);
    updateSummary(currentYear);
    updateGlobalSparkline();
  };

  document.getElementById("modeSea").onclick = () => {
    mode = "sea";
    setActiveButton();
    updateMap(currentYear);
    updateLegend(currentYear);
    updateSummary(currentYear);
    updateGlobalSparkline();
  };

  document.getElementById("modeDisaster").onclick = () => {
    mode = "disaster";
    setActiveButton();
    updateMap(currentYear);
    updateLegend(currentYear);
    updateSummary(currentYear);
    updateGlobalSparkline();
  };

  // Hook up Play / Pause button
  const playBtn = document.getElementById("playPause");
  if (playBtn) {
    playBtn.onclick = () => {
      if (isPlaying) {
        stopPlayback();
      } else {
        startPlayback();
      }
    };
  }

  setupTooltip();
}

// -----------------------------
// NEW: country search behavior
// -----------------------------
function setupCountrySearch() {
  const input = document.getElementById("countrySearch");
  const btn = document.getElementById("countrySearchBtn");
  if (!input || !btn) return;

  const handleSearch = () => {
    const raw = input.value.trim();
    if (!raw) return;

    const query = raw.toLowerCase();
    let match = countryLookup[query];

    if (!match) {
      const keys = Object.keys(countryLookup);
      const foundKey = keys.find(k => k.includes(query));
      if (foundKey) match = countryLookup[foundKey];
    }

    if (!match) {
      input.classList.add("not-found");
      setTimeout(() => input.classList.remove("not-found"), 1200);
      return;
    }

    input.classList.remove("not-found");

    const { iso, bbox, displayName } = match;

    if (bbox && isFinite(bbox[0][0]) && isFinite(bbox[0][1])) {
      map.fitBounds(bbox, { padding: 40, duration: 1000 });
    }

    if (map.getLayer("country-highlight")) {
      map.setFilter("country-highlight", highlightFilterForISO(iso));
    }

    updateCountrySparkline(iso, displayName);
  };

  btn.addEventListener("click", handleSearch);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") handleSearch();
  });
}

function setupTooltip() {
  const tooltip = document.getElementById("tooltip");
  const offset = 12;

  map.on("mousemove", e => {
    // Keep feature detection as-is
    const canvasRect = map.getCanvas().getBoundingClientRect();
    const xCanvas = e.originalEvent.clientX - canvasRect.left;
    const yCanvas = e.originalEvent.clientY - canvasRect.top;

    const features = map.queryRenderedFeatures([xCanvas, yCanvas], { layers: ["climate-fill"] });
    if (!features.length) {
      tooltip.style.display = "none";
      updateCountrySparkline(); // clear when leaving features
      return;
    }

    const f = features[0];
    const props = f.properties;
    const iso = props.ISO3 || props.ISO_A3 || props.ADM0_A3 || props.adm0_a3 || props.SOV_A3 || "";
    const name = getCountryName(props);

    let valueLabel;
    if (mode === "temp") {
      valueLabel = props.value != null ? `${props.value.toFixed(2)}°C` : "N/A";
    } else if (mode === "disaster") {
      valueLabel = props.value != null ? props.value : "N/A";
    } else {
      valueLabel = "N/A";
    }

    tooltip.style.display = "block";
    tooltip.innerHTML = `
        <div><strong>${name}</strong></div>
        <div>Year: <strong>${currentYear}</strong></div>
        <div>${mode === "temp" ? "Temp" : (mode === "disaster" ? "Disasters" : "Value")}: <strong>${valueLabel}</strong></div>
    `;

    let xTooltip = e.originalEvent.clientX + offset;
    let yTooltip = e.originalEvent.clientY - canvasRect.top + offset;

    const tooltipRect = tooltip.getBoundingClientRect();

    if (xTooltip + tooltipRect.width > window.innerWidth) {
      xTooltip = e.originalEvent.clientX - tooltipRect.width - offset;
    }
    if (yTooltip + tooltipRect.height > window.innerHeight) {
      yTooltip = window.innerHeight - tooltipRect.height - offset;
    }

    tooltip.style.left = `${xTooltip}px`;
    tooltip.style.top = `${yTooltip}px`;

    updateCountrySparkline(iso, name);
  });

  map.on("mouseleave", "climate-fill", () => {
    tooltip.style.display = "none";
    updateCountrySparkline();
  });

  map.getCanvas().addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
    updateCountrySparkline();
  });
}

// -----------------------------
// LEGEND
// -----------------------------
function updateLegend(year = currentYear) {
  const legend = document.getElementById("legend");
  legend.innerHTML = ""; // clear

  const title = document.createElement("div");
  title.className = "legend-title";

  const bar = document.createElement("div");
  bar.className = "legend-bar";

  const labels = document.createElement("div");
  labels.className = "legend-labels";

  let minLabel, maxLabel;

  if (mode === "temp") {
    title.textContent = "Temperature Anomaly (°C)";

    bar.style.background = `
      linear-gradient(to right,
        ${d3.interpolateRdYlBu(1)},
        ${d3.interpolateRdYlBu(0.75)},
        ${d3.interpolateRdYlBu(0.5)},
        ${d3.interpolateRdYlBu(0.25)},
        ${d3.interpolateRdYlBu(0)}
      )
    `;

    minLabel = `${TEMP_MIN.toFixed(1)}°C`;
    maxLabel = `${TEMP_MAX.toFixed(1)}°C`;
  }
  else if (mode === "sea") {
    title.textContent = "Global Sea Level (mm)";

    const vals = Object.values(seaByYear);
    const minSea = Math.min(...vals);
    const maxSea = Math.max(...vals);

    bar.style.background = `
      linear-gradient(to right,
        ${d3.interpolateBlues(0)},
        ${d3.interpolateBlues(0.25)},
        ${d3.interpolateBlues(0.5)},
        ${d3.interpolateBlues(0.75)},
        ${d3.interpolateBlues(1)})
    `;

    minLabel = `${minSea.toFixed(0)} mm`;
    maxLabel = `${maxSea.toFixed(0)} mm`;
  }
  else if (mode === "disaster") {
    title.textContent = "Number of Climate-Related Disasters (per country)";

    bar.style.background = `
      linear-gradient(to right,
        ${d3.interpolateReds(0)},
        ${d3.interpolateReds(0.25)},
        ${d3.interpolateReds(0.5)},
        ${d3.interpolateReds(0.75)},
        ${d3.interpolateReds(1)})
    `;

    // Use min/max for this year for labels (approx)
    let dMin = Infinity, dMax = -Infinity;
    Object.values(disasterByISO).forEach(yearDict => {
      if (yearDict[year] != null) {
        const v = yearDict[year];
        if (v < dMin) dMin = v;
        if (v > dMax) dMax = v;
      }
    });
    if (!isFinite(dMin) || !isFinite(dMax)) {
      dMin = 0;
      dMax = 1;
    }

    minLabel = `${dMin.toFixed(0)}`;
    maxLabel = `${dMax.toFixed(0)}`;
  }

  labels.innerHTML = `
    <span>${minLabel}</span>
    <span>${maxLabel}</span>
  `;

  legend.appendChild(title);
  legend.appendChild(bar);
  legend.appendChild(labels);
}

// -----------------------------
// ACTIVE BUTTON STATE
// -----------------------------
function setActiveButton() {
  const tempBtn = document.getElementById("modeTemp");
  const seaBtn = document.getElementById("modeSea");
  const disBtn = document.getElementById("modeDisaster");

  tempBtn.classList.remove("active");
  seaBtn.classList.remove("active");
  disBtn.classList.remove("active");

  if (mode === "temp") tempBtn.classList.add("active");
  else if (mode === "sea") seaBtn.classList.add("active");
  else if (mode === "disaster") disBtn.classList.add("active");
}

// -----------------------------
// Global snapshot panel
// -----------------------------
function updateSummary(year = currentYear) {
  const tempEl = document.getElementById("summary-temp");
  const seaEl = document.getElementById("summary-sea");
  const disEl = document.getElementById("summary-disasters");
  const yearEl = document.getElementById("summary-year");

  if (!tempEl || !seaEl || !disEl || !yearEl) return;

  yearEl.textContent = year;

  const tempVal = globalTempByYear[year];
  const seaVal = seaByYear[year];
  const disVal = globalDisastersByYear[year];

  tempEl.textContent =
    tempVal != null ? `${tempVal.toFixed(2)} °C` : "No data";

  seaEl.textContent =
    seaVal != null ? `${seaVal.toFixed(0)} mm` : "No data";

  disEl.textContent =
    disVal != null ? disVal.toString() : "No data";
}

function updateGlobalSparkline() {
  const svg = d3.select("#globalSparkline");
  if (svg.empty()) return;

  svg.selectAll("*").remove();

  const width = +svg.attr("width") || 300;
  const height = +svg.attr("height") || 80;

  const margin = { top: 20, right: 10, bottom: 20, left: 46 };
  const years = d3.range(sliderMinYear, sliderMaxYear + 1);

  // Always show temperature anomalies here (matches the title)
  const data = years.map(y => ({
    year: y,
    value: globalTempByYear[y]
  })).filter(d => d.value != null);

  if (data.length === 0) return;

  const x = d3.scaleLinear()
    .domain(d3.extent(years))
    .range([margin.left, width - margin.right]);

  const y = d3.scaleLinear()
    .domain([d3.min(data, d => d.value), d3.max(data, d => d.value)])
    .range([height - margin.bottom, margin.top]);

  // ========================
  // TRENDLINE (draw first)
  // ========================
  if (data.length > 1) {
    const n = data.length;
    const sumX = d3.sum(data, d => d.year);
    const sumY = d3.sum(data, d => d.value);
    const sumXY = d3.sum(data, d => d.year * d.value);
    const sumX2 = d3.sum(data, d => d.year * d.year);
    const denom = n * sumX2 - sumX * sumX;

    if (denom !== 0) {
      const slope = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;

      const trendData = [
        { year: data[0].year, value: slope * data[0].year + intercept },
        { year: data[data.length - 1].year, value: slope * data[data.length - 1].year + intercept }
      ];

      const trendLine = d3.line()
        .x(d => x(d.year))
        .y(d => y(d.value));

      svg.append("path")
        .datum(trendData)
        .attr("fill", "none")
        .attr("stroke", "#003f5c")      // dark blue
        .attr("stroke-width", 2.5)
        .attr("stroke-dasharray", "6,4")
        .attr("opacity", 0.85)
        .attr("d", trendLine);
    }
  }

  // ========================
  // MAIN LINE (global temp)
  // ========================
  const mainLine = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.value))
    .curve(d3.curveMonotoneX);

  svg.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "#d73027")  // bright red
    .attr("stroke-width", 2.5)
    .attr("d", mainLine);

  // X-axis labels (start/end years)
  svg.append("text")
    .attr("x", margin.left)
    .attr("y", height - 4)
    .attr("font-size", 10)
    .text(sliderMinYear);

  svg.append("text")
    .attr("x", width - margin.right)
    .attr("y", height - 4)
    .attr("font-size", 10)
    .attr("text-anchor", "end")
    .text(sliderMaxYear);

  // Y-axis labels (min/max)
  const maxVal = d3.max(data, d => d.value);
  const minVal = d3.min(data, d => d.value);

  svg.append("text")
    .attr("x", 4)
    .attr("y", margin.top + 4)
    .attr("font-size", 10)
    .text(`${maxVal.toFixed(2)}°C`);

  svg.append("text")
    .attr("x", 4)
    .attr("y", height - margin.bottom + 2)
    .attr("font-size", 10)
    .text(`${minVal.toFixed(2)}°C`);

  // Title inside SVG (to match country charts)
  svg.append("text")
    .attr("x", margin.left)
    .attr("y", margin.top - 6)
    .attr("font-size", 12)
    .attr("fill", "#333")
    .text("Global Temperature Anomaly Trend");
}



// -----------------------------
// NEW: Country sparkline + narrative (mini Option B)
// -----------------------------
function updateCountrySparkline(iso, name) {
  const countryContainer = document.getElementById("countrySparklineContainer");
  const countryTitle = document.getElementById("countrySparklineTitle");
  const tempSvg = d3.select("#countryTempSparkline");
  const disSvg = d3.select("#countryDisasterSparkline");
  const statsEl = document.getElementById("countryStats");

  if (!countryContainer || !tempSvg.node() || !disSvg.node()) return;

  // Clear & hide if no ISO (e.g., mouse leaves map)
  if (!iso || iso === "") {
    tempSvg.selectAll("*").remove();
    disSvg.selectAll("*").remove();
    if (statsEl) statsEl.textContent = "";
    countryContainer.style.display = "none";

    if (map.getLayer("country-highlight")) {
      map.setFilter("country-highlight", highlightFilterForISO(""));
    }
    return;
  }

  const years = d3.range(sliderMinYear, sliderMaxYear + 1);

  // --- Dimensions: a bit taller + larger margins ---
  const tempWidth  = +tempSvg.attr("width")  || 300;
  const tempHeight = +tempSvg.attr("height") || 80;
  const disWidth   = +disSvg.attr("width")   || 300;
  const disHeight  = +disSvg.attr("height")  || 80;

  const margin = { top: 20, right: 10, bottom: 20, left: 46 };

  const xScaleTemp = d3.scaleLinear()
    .domain(d3.extent(years))
    .range([margin.left, tempWidth - margin.right]);

  const xScaleDis = d3.scaleLinear()
    .domain(d3.extent(years))
    .range([margin.left, disWidth - margin.right]);

  // --- Build country data series ---
  const tempRow = tempByISO[iso];
  const countryTempData = years.map(y => ({
    year: y,
    value: tempRow ? getTempValue(tempRow, y) : null
  })).filter(d => d.value != null);

  const disDict = disasterByISO[iso] || {};
  const countryDisasterData = years.map(y => ({
    year: y,
    value: disDict[y] != null ? disDict[y] : null
  })).filter(d => d.value != null);

  // If absolutely no data, show message
  if (countryTempData.length === 0 && countryDisasterData.length === 0) {
    tempSvg.selectAll("*").remove();
    disSvg.selectAll("*").remove();
    countryContainer.style.display = "block";
    if (countryTitle) countryTitle.textContent = `${name} — Climate Story`;
    if (statsEl) statsEl.textContent = "No country-level data available for this period.";
    return;
  }

  countryContainer.style.display = "block";
  if (countryTitle) {
    countryTitle.textContent = `${name} — Climate Story`;
  }

  // =========================
  // Temperature sparkline
  // =========================
  tempSvg.selectAll("*").remove();
  if (countryTempData.length > 0) {
    const tempValues = countryTempData.map(d => d.value);
    const tempMin = d3.min(tempValues);
    const tempMax = d3.max(tempValues);
    const yScaleTemp = d3.scaleLinear()
      .domain([Math.min(0, tempMin), tempMax])
      .range([tempHeight - margin.bottom, margin.top]);

    const tempLine = d3.line()
      .x(d => xScaleTemp(d.year))
      .y(d => yScaleTemp(d.value))
      .curve(d3.curveMonotoneX);


    
    // Main line (temperature anomaly) – bright red
    tempSvg.append("path")
      .datum(countryTempData)
      .attr("fill", "none")
      .attr("stroke", "#d73027")
      .attr("stroke-width", 2)
      .attr("d", tempLine);

    // Linear trendline – dark blue, dashed (much more contrast)
    if (countryTempData.length > 1) {
      const n = countryTempData.length;
      const sumX = d3.sum(countryTempData, d => d.year);
      const sumY = d3.sum(countryTempData, d => d.value);
      const sumXY = d3.sum(countryTempData, d => d.year * d.value);
      const sumX2 = d3.sum(countryTempData, d => d.year * d.year);
      const denom = n * sumX2 - sumX * sumX;

      if (denom !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;

        const trendData = [
          {
            year: countryTempData[0].year,
            value: slope * countryTempData[0].year + intercept
          },
          {
            year: countryTempData[countryTempData.length - 1].year,
            value: slope * countryTempData[countryTempData.length - 1].year + intercept
          }
        ];

        const trendLine = d3.line()
          .x(d => xScaleTemp(d.year))
          .y(d => yScaleTemp(d.value));

        // TRENDLINE (draw BEFORE main line to always be visible)
        tempSvg.append("path")
          .datum(trendData)
          .attr("fill", "none")
          .attr("stroke", "#003f5c")
          .attr("stroke-width", 2.5)
          .attr("stroke-dasharray", "6,4")
          .attr("opacity", 0.85);

      }
    }

    // Current-year marker line (no text, avoids clutter)
    if (currentYear >= sliderMinYear && currentYear <= sliderMaxYear) {
      const markerX = xScaleTemp(currentYear);
      tempSvg.append("line")
        .attr("x1", markerX)
        .attr("x2", markerX)
        .attr("y1", margin.top)
        .attr("y2", tempHeight - margin.bottom)
        .attr("stroke", "#555")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2,2");
    }

    // X-axis: start / end years
    tempSvg.append("text")
      .attr("x", margin.left)
      .attr("y", tempHeight - 4)
      .attr("font-size", 10)
      .text(sliderMinYear);

    tempSvg.append("text")
      .attr("x", tempWidth - margin.right)
      .attr("y", tempHeight - 4)
      .attr("font-size", 10)
      .attr("text-anchor", "end")
      .text(sliderMaxYear);

    // Y-axis: min & max values on left, spaced out vertically
    tempSvg.append("text")
      .attr("x", 4)
      .attr("y", margin.top + 4)
      .attr("font-size", 10)
      .text(`${tempMax.toFixed(2)}°C`);

    tempSvg.append("text")
      .attr("x", 4)
      .attr("y", tempHeight - margin.bottom + 2)
      .attr("font-size", 10)
      .text(`${tempMin.toFixed(2)}°C`);

    // Chart title inside SVG, above the data area
    tempSvg.append("text")
      .attr("x", margin.left)
      .attr("y", margin.top - 6)
      .attr("font-size", 11)
      .attr("fill", "#333")
      .text("Temperature anomaly (°C)");
  }

  // =========================
  // Disasters sparkline
  // =========================
  disSvg.selectAll("*").remove();
  if (countryDisasterData.length > 0) {
    const disValues = countryDisasterData.map(d => d.value);
    const disMax = d3.max(disValues);
    const yScaleDis = d3.scaleLinear()
      .domain([0, disMax])
      .range([disHeight - margin.bottom, margin.top]);

    const disLine = d3.line()
      .x(d => xScaleDis(d.year))
      .y(d => yScaleDis(d.value))
      .curve(d3.curveMonotoneX);

    // Main line – orange, distinct from temp red + trendline blue
    disSvg.append("path")
      .datum(countryDisasterData)
      .attr("fill", "none")
      .attr("stroke", "#f39c12")
      .attr("stroke-width", 2)
      .attr("d", disLine);

    // Current-year marker
    if (currentYear >= sliderMinYear && currentYear <= sliderMaxYear) {
      const markerX = xScaleDis(currentYear);
      disSvg.append("line")
        .attr("x1", markerX)
        .attr("x2", markerX)
        .attr("y1", margin.top)
        .attr("y2", disHeight - margin.bottom)
        .attr("stroke", "#555")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2,2");
    }

    // X-axis years
    disSvg.append("text")
      .attr("x", margin.left)
      .attr("y", disHeight - 4)
      .attr("font-size", 10)
      .text(sliderMinYear);

    disSvg.append("text")
      .attr("x", disWidth - margin.right)
      .attr("y", disHeight - 4)
      .attr("font-size", 10)
      .attr("text-anchor", "end")
      .text(sliderMaxYear);

    // Y-axis max label
    disSvg.append("text")
      .attr("x", 4)
      .attr("y", margin.top + 4)
      .attr("font-size", 10)
      .text(`${disMax.toFixed(0)} events/yr`);

    // Chart title
    disSvg.append("text")
      .attr("x", margin.left)
      .attr("y", margin.top - 6)
      .attr("font-size", 11)
      .attr("fill", "#333")
      .text("Climate-related disasters (per year)");
  }

  // =========================
  // Narrative stats text
  // =========================
  if (statsEl) {
    const lines = [];

    // Temperature story
    if (countryTempData.length > 1) {
      const first = countryTempData[0];
      const last = countryTempData[countryTempData.length - 1];
      const tempChange = last.value - first.value;

      const globalStart = globalTempByYear[first.year];
      const globalEnd = globalTempByYear[last.year];
      const globalChange =
        globalStart != null && globalEnd != null
          ? globalEnd - globalStart
          : null;

      let sentence = `From ${first.year} to ${last.year}, the average temperature anomaly in ${name} `;
      if (tempChange >= 0) {
        sentence += `increased by ${tempChange.toFixed(2)}°C`;
      } else {
        sentence += `decreased by ${Math.abs(tempChange).toFixed(2)}°C`;
      }

      if (globalChange != null) {
        sentence += `. Over the same period, the global average changed by ${
          globalChange >= 0
            ? `${globalChange.toFixed(2)}°C`
            : `-${Math.abs(globalChange).toFixed(2)}°C`
        }`;

        const diff = tempChange - globalChange;
        if (Math.abs(globalChange) > 0.001) {
          const relPct = (diff / Math.abs(globalChange)) * 100;
          if (Math.abs(relPct) < 15) {
            sentence += `, which is fairly close to the global change.`;
          } else {
            const direction = relPct > 0 ? "higher" : "lower";
            sentence += `, which is about ${Math.abs(relPct).toFixed(
              0
            )}% ${direction} than the global change.`;
          }
        } else {
          sentence += `, which is larger than the small global change over this period.`;
        }
      } else {
        sentence += `.`;
      }

      lines.push(sentence);
    }

    // Disasters story
    if (countryDisasterData.length > 1) {
      const firstD = countryDisasterData[0];
      const lastD = countryDisasterData[countryDisasterData.length - 1];
      const rawChange = lastD.value - firstD.value;

      let sentence = `Reported climate-related disasters in ${name} `;
      if (firstD.value > 0) {
        const pctChange = (rawChange / firstD.value) * 100;
        if (pctChange >= 0) {
          sentence += `increased by about ${Math.abs(pctChange).toFixed(0)}%`;
        } else {
          sentence += `decreased by about ${Math.abs(pctChange).toFixed(0)}%`;
        }

        const globalStartD = globalDisastersByYear[firstD.year];
        const globalEndD = globalDisastersByYear[lastD.year];
        if (globalStartD != null && globalEndD != null && globalStartD > 0) {
          const globalPct =
            ((globalEndD - globalStartD) / globalStartD) * 100;
          sentence += `, while the global number of disasters changed by roughly ${Math.abs(
            globalPct
          ).toFixed(0)}% over the same years.`;
        } else {
          sentence += ` over the same period.`;
        }
      } else {
        sentence += `changed from ${firstD.value.toFixed(
          0
        )} to ${lastD.value.toFixed(0)} events per year over the same period.`;
      }

      lines.push(sentence);
    }

    statsEl.textContent = lines.join(" ");
  }
}