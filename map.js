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

// NEW: global series
let globalTempByYear = {};       // year -> avg anomaly
let globalDisastersByYear = {};  // year -> total disasters

// We'll grab these from the slider later
let sliderMinYear = 1992;
let sliderMaxYear = 2010;

let isPlaying = false;
let playInterval = null;

// Initialize MapLibre
const map = new maplibregl.Map({
  container: "map",
  style: "data/style.json",
  center: [0, 20],
  zoom: 1.3
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

    setupInteraction();
    setActiveButton();
    updateLegend();
    updateMap(currentYear);
    updateSummary(currentYear);
  });
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
  if (props.sovereignt) {
    name = props.sovereignt;
  } else {
    name = (
      props.ADMIN ||
      props.ADMIN0_A3 ||
      props.NAME ||
      props.ADM0_A3 ||
      props.adm0_a3 ||
      props.SOV_A3 ||
      "Unknown"
    );
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
  if (isPlaying) return; // already playing

  const playBtn = document.getElementById("playPause");
  const yearSlider = document.getElementById("yearSlider");
  if (!playBtn || !yearSlider) return;

  isPlaying = true;
  playBtn.textContent = "Pause";

  playInterval = setInterval(() => {
    let nextYear = currentYear + 1;

    // Wrap back to start when we pass the max year
    if (nextYear > sliderMaxYear) {
      nextYear = sliderMinYear;
    }

    currentYear = nextYear;
    yearSlider.value = String(currentYear);
    document.getElementById("yearLabel").textContent = currentYear;

    updateMap(currentYear);
    updateLegend(currentYear);
    updateSummary(currentYear);
  }, 2500); // ms per year – tweak for speed if you want
}

function stopPlayback() {
  if (!isPlaying) return;

  isPlaying = false;
  const playBtn = document.getElementById("playPause");
  if (playBtn) {
    playBtn.textContent = "Play";
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
  };

  document.getElementById("modeSea").onclick = () => {
    mode = "sea";
    setActiveButton();
    updateMap(currentYear);
    updateLegend(currentYear);
    updateSummary(currentYear);
  };

  document.getElementById("modeDisaster").onclick = () => {
    mode = "disaster";
    setActiveButton();
    updateMap(currentYear);
    updateLegend(currentYear);
    updateSummary(currentYear);
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


function setupTooltip() {
  const tooltip = document.getElementById("tooltip");

  map.on("mousemove", "climate-fill", e => {
    if (mode !== "temp" && mode !== "disaster") {
      tooltip.style.display = "none";
      return;
    }

    const f = e.features[0];
    const props = f.properties;
    const name = getCountryName(props);

    let valueLabel;
    if (mode === "temp") {
      valueLabel = props.value != null ? `${props.value.toFixed(2)}°C` : "N/A";
    } else if (mode === "disaster") {
      valueLabel = props.value != null ? props.value.toString() : "N/A";
    }

    tooltip.style.display = "block";
    tooltip.innerHTML = `
      <div class="tooltip-title">${name}</div>
      <div class="tooltip-line">Year: <strong>${currentYear}</strong></div>
      <div class="tooltip-line">
        ${mode === "temp" ? "Temp Anomaly" : "Disasters"}:
        <strong>${valueLabel}</strong>
      </div>
    `;

    const evt = e.originalEvent;
    let x = evt.clientX + 12;
    let y = evt.clientY + 12;

    const tooltipRect = tooltip.getBoundingClientRect();

    if (x + tooltipRect.width > window.innerWidth) {
      x = evt.clientX - tooltipRect.width - 12;
    }
    if (y + tooltipRect.height > window.innerHeight) {
      y = evt.clientY - tooltipRect.height - 12;
    }

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  });

  map.on("mouseleave", "climate-fill", () => {
    tooltip.style.display = "none";
  });
  map.getCanvas().addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
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
// NEW: Global snapshot panel
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
