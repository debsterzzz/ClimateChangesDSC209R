// Initialize MapLibre
const map = new maplibregl.Map({
  container: "map",
  style: "data/style.json",
  center: [0, 20],
  zoom: 1.3
});

// Global Variables
let worldGeom;       // geometry-only world countries
let tempTable;       // temperature table (by ISO3)
let tempByISO = {};  // lookup: ISO3 -> properties row
let seaData;
let seaByYear = {};
let currentYear = 1992;
let mode = "temp"; // "temp" or "sea"

// -----------------------------
// COLOR SCALES
// -----------------------------
function getTempColor(v) {
  // Temperature anomaly scale (-2 to +3°C)
  const t = (v + 2) / 5;            // map [-2,3] -> [0,1]
  return d3.interpolateYlOrRd(Math.max(0, Math.min(t, 1)));
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
  // 1) World geometry (your climate_world_joined.json is basically this)
  fetch("data/climate_world_joined.json").then(r => r.json()),

  // 2) Temperature table (geometry = null, but has ISO3 + year columns)
  fetch("data/Indicator_3_1_Climate_Indicators_Annual_Mean_Global_Surface_Temperature_5943755526554557319.geojson")
    .then(r => r.json()),

  // 3) Sea-level data
  fetch("data/Indicator_3_3_melted_new_-7232464109204630623.geojson")
    .then(r => r.json())
]).then(([world, tempTableGeo, sea]) => {
  worldGeom = world;
  seaData = sea;
  tempTable = tempTableGeo;

  console.log("World geom (climate source):", worldGeom);
  console.log("Temp table:", tempTable);
  console.log("Sea level data:", seaData);

  // Build ISO3 -> temp-row lookup from the temp table
  tempTable.features.forEach(f => {
    const p = f.properties || {};
    const iso = (p.ISO3 || "").trim();
    if (iso) tempByISO[iso] = p;
  });

  processSeaLevels(seaData);

  map.on("load", () => {
    // 1) CLIMATE SOURCE + LAYER (on top of ocean, below labels)
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
          "#e0e0e0"          // light grey fallback if no data
        ],
        "fill-opacity": 0.75,
        "fill-outline-color": "#444"
      }
    });

    // 2) OCEAN MASK SOURCE + LAYER (below climate)
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
    }, "climate-fill");  // ocean drawn just under climate

    // Kick everything off
    setupInteraction();
    updateLegend();
    updateMap();
  });
});


// Convert sea-level data to year → average value
// ----------------------------
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

function getCountryName(props) {
  if (props.sovereignt) {
    name = props.sovereignt
  }
  else {
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
  return name
}

const featureValues = {};

function updateMap(year = currentYear) {
  const src = map.getSource("climate");
  if (!src || !worldGeom) return;

  // ----- LAND (temperature) -----
  if (mode === "temp") {
    const updated = {
      ...worldGeom,
      features: worldGeom.features.map(f => {
        const props = f.properties || {};

        const iso = (props.ISO3 || props.ISO_A3 || props.ADM0_A3 || props.adm0_a3 || props.SOV_A3 || props.sov_a3 || "").trim();
        const tempRow = iso ? tempByISO[iso] : null;
        const targetVal = tempRow ? getTempValue(tempRow, year) : null;

        // Smooth interpolation
        const prevVal = featureValues[iso]?.value ?? targetVal ?? 0;
        const smoothVal = targetVal != null ? lerp(prevVal, targetVal, 0.2) : null;

        // Store the last drawn value
        featureValues[iso] = { value: smoothVal };

        const color = smoothVal != null ? getTempColor(smoothVal) : "#e0e0e0";

        return {
          ...f,
          properties: {
            ...props,
            value: smoothVal,
            value_color: color
          }
        };
      })
    };

    src.setData(updated);
  }

  if (mode == "sea") {
    // ----- OCEAN (sea level) -----
    const seaVal = seaByYear[currentYear];
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

// Smooth interpolation helper
function lerp(a, b, t) {
  return a + (b - a) * t;
}

let yearAnimationId = null;

function animateYear(oldYear, newYear, duration = 500) {
  if (yearAnimationId) cancelAnimationFrame(yearAnimationId);
  const start = performance.now();

  function step(timestamp) {
    const elapsed = timestamp - start;
    let t = Math.min(elapsed / duration, 1);

    const current = oldYear + (newYear - oldYear) * t;

    // Only update the map if year changed (integer)
    const displayYear = Math.round(current);
    document.getElementById("yearLabel").textContent = displayYear;

    updateMap(displayYear);
    updateLegend(displayYear);

    if (t < 1) {
      yearAnimationId = requestAnimationFrame(step);
    } else {
      currentYear = newYear;
      yearAnimationId = null;
    }
  }

  yearAnimationId = requestAnimationFrame(step);
}


// Slider + Toggle Buttons
function setupInteraction() {
  const yearSlider = document.getElementById("yearSlider");
  let sliderTimeout;

  yearSlider.oninput = e => {
    // Clear previous timeout if user keeps dragging
    clearTimeout(sliderTimeout);

    sliderTimeout = setTimeout(() => {
      const newYear = +e.target.value;          // parse value as number
      if (!isNaN(newYear)) {                     // sanity check
        animateYear(currentYear, newYear, 500); // pass old + new year
      }
    }, 150);

  };

  document.getElementById("modeTemp").onclick = () => {
    mode = "temp";
    setActiveButton();
    updateMap();
    updateLegend();

  };

  document.getElementById("modeSea").onclick = () => {
    mode = "sea";
    setActiveButton();
    updateMap();
    updateLegend();

  };

  setupTooltip();
}

// Tooltip on Hover
function setupTooltip() {
  const tooltip = document.getElementById("tooltip");

  map.on("mousemove", "climate-fill", e => {
    const tooltip = document.getElementById("tooltip");

    if (mode !== "temp") {
      tooltip.style.display = "none";
      return;
    }

    const f = e.features[0];
    const props = f.properties;
    const name = getCountryName(props)

    tooltip.style.display = "block";
    tooltip.innerHTML = `
    <strong>${name}</strong><br>
    Year: ${currentYear}<br>
    Temp Anomaly: <strong>${props.value != null ? props.value.toFixed(2) : "N/A"}</strong>
  `;

    // Convert map coordinates to page coordinates
    const canvas = map.getCanvas();
    const canvasRect = canvas.getBoundingClientRect();

    // e.point is relative to canvas
    let x = canvasRect.left + e.point.x + 10;
    let y = canvasRect.top + e.point.y + 10;

    const tooltipRect = tooltip.getBoundingClientRect();

    // Prevent tooltip from overflowing window edges
    if (x + tooltipRect.width > window.innerWidth) {
      x = canvasRect.left + e.point.x - tooltipRect.width - 10;
    }
    if (y + tooltipRect.height > window.innerHeight) {
      y = canvasRect.top + e.point.y - tooltipRect.height - 10;
    }

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  });
  // Hide tooltip when leaving map or layer
  map.on("mouseleave", "climate-fill", () => tooltip.style.display = "none");
  map.getCanvas().addEventListener("mouseleave", () => tooltip.style.display = "none");
}


//------------------------------------------
// LEGEND RENDERING
//------------------------------------------
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
        ${d3.interpolateYlOrRd(0)}, 
        ${d3.interpolateYlOrRd(0.25)}, 
        ${d3.interpolateYlOrRd(0.5)},
        ${d3.interpolateYlOrRd(0.75)},
        ${d3.interpolateYlOrRd(1)})
    `;

    minLabel = "-2°C";
    maxLabel = "+3°C";
  }

  else if (mode === "sea") {
    title.textContent = "Global Sea Level (mm)";

    // Get sea-level range dynamically
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

  labels.innerHTML = `
    <span>${minLabel}</span>
    <span>${maxLabel}</span>
  `;

  legend.appendChild(title);
  legend.appendChild(bar);
  legend.appendChild(labels);
}


function setActiveButton() {
  const tempBtn = document.getElementById("modeTemp");
  const seaBtn = document.getElementById("modeSea");

  if (mode === "temp") {
    tempBtn.classList.add("active");
    seaBtn.classList.remove("active");
  } else {
    seaBtn.classList.add("active");
    tempBtn.classList.remove("active");
  }
}