// --------------------
// Initialize MapLibre
// --------------------
const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json", // Open-source basemap
  center: [0, 20],
  zoom: 1.3
});

// Global Variables
let tempData, seaData;
let seaByYear = {};
let currentYear = 1990;
let mode = "temp"; // "temp" or "sea"

// Color Scales
function getTempColor(v) {
  // Temperature anomaly scale (-2 to +3°C)
  return d3.interpolateYlOrRd((v + 2) / 5);
}

function getSeaColor(v) {
  const t = (v - minSea) / (maxSea - minSea);
  return d3.interpolateBlues(Math.max(0, Math.min(t, 1)));
}

// Load GeoJSON Files
Promise.all([
  fetch("data/Indicator_3_1_Climate_Indicators_Annual_Mean_Global_Surface_Temperature_5943755526554557319.geojson")
    .then(r => r.json()),
  fetch("data/Indicator_3_3_melted_new_-7232464109204630623.geojson")
    .then(r => r.json())
])
.then(([temp, sea]) => {
  tempData = temp;
  seaData = sea;

  console.log("Temperature Data Loaded:", temp);
  console.log("Sea Level Data Loaded:", sea);
 // Extract global sea-level values by year
  processSeaLevels(seaData);

  map.on("load", () => {
    // Add one source — data swapped dynamically
    map.addSource("climate", {
      type: "geojson",
      data: tempData
    });

    // Add fill layer
    map.addLayer({
      id: "climate-fill",
      type: "fill",
      source: "climate",
      paint: {
        "fill-color": ["get", "value_color"],
        "fill-opacity": 0.8,
        "fill-outline-color": "#444"
      }
    });

    setupInteraction();
    updateMap();
  });
});

// Convert sea-level data to year → average value
// ----------------------------
function processSeaLevels(gdf) {
  const yearly = {};

  gdf.features.forEach(f => {
    const props = f.properties;
    const date = props.Date;      // "D10/17/1992"
    const val = props.Value;      // numeric

    if (!date || val == null) return;

    const year = parseInt(date.slice(-4)); // extract "1992"

    if (!yearly[year]) yearly[year] = [];
    yearly[year].push(val);
  });

  // Average the values per year
  Object.keys(yearly).forEach(year => {
    const arr = yearly[year];
    seaByYear[year] = arr.reduce((a, b) => a + b, 0) / arr.length;
  });

  console.log("Sea level (avg) by year:", seaByYear);
}



// Update the map based on current year + mode
function updateMap() {
  const src = map.getSource("climate");

// Update LAND (temp)

  const updated = {
    ...tempData,
    features: tempData.features.map(f => {
      const props = f.properties;
      const val = props[currentYear];

      let color = "#ccc";
      if (val !== null && val !== undefined && val !== "") 
        color = getTempColor(val) ;

      return {
        ...f,
        properties: {
          ...props,
          value: val,
          value_color: color
        }
      };
    })
  };

  src.setData(updated);

// Update OCEAN (sea-level)
  // ---------------------
  const seaVal = seaByYear[currentYear];
  const allVals = Object.values(seaByYear);
  const minSea = Math.min(...allVals);
  const maxSea = Math.max(...allVals);

  let oceanColor = "#aac6ff"; // fallback
  if (seaVal != null) {
    oceanColor = getSeaColor(seaVal, minSea, maxSea);
  }

  // Paint the WATER layer in the basemap
  try {
    map.setPaintProperty("water", "fill-color", oceanColor);
  } catch (e) {
    console.warn("Water layer not ready yet:", e);
  }
}



// Slider + Toggle Buttons
function setupInteraction() {
  const yearSlider = document.getElementById("yearSlider");
  const yearLabel = document.getElementById("yearLabel");

  yearSlider.oninput = e => {
    currentYear = +e.target.value;
    yearLabel.textContent = currentYear;
    updateMap();
  };

  document.getElementById("modeTemp").onclick = () => {
    mode = "temp";
    updateMap();
  };

  document.getElementById("modeSea").onclick = () => {
    mode = "sea";
    updateMap();
  };

  setupTooltip();
}

// Tooltip on Hover
function setupTooltip() {
  const tooltip = document.getElementById("tooltip");

  map.on("mousemove", "climate-fill", e => {
    const f = e.features[0];
    const props = f.properties;

    tooltip.style.display = mode === "temp" ? "block": "none";
    tooltip.style.left = e.point.x + 15 + "px";
    tooltip.style.top = e.point.y + 15 + "px";

    tooltip.innerHTML = `
      <strong>${props.ADMIN}</strong><br>
      Year: ${currentYear}<br>
      Temp Anomaly:
      <strong>${props.value != null ? props.value.toFixed(2) : "N/A"}</strong>
    `;
  });

  map.on("mouseleave", "climate-fill", () => {
    tooltip.style.display = "none";
  });
}
