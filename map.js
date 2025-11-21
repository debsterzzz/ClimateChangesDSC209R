mapboxgl.accessToken = "pk.eyJ1IjoiZGVic3Rlcnp6eiIsImEiOiJjbWh6bG0zZ2QwbXB4MmxvbXIwYjFsdDVjIn0.sgktxgtMW3K5gz86SJ-oVA";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/light-v11",
  center: [0, 20],
  zoom: 1.3
});

// Global Variables
let tempData, seaData;
let currentYear = 1990;
let mode = "temp"; // "temp" or "sea"

// Color Scales
function getTempColor(v) {
  // Temperature anomaly scale (-2 to +3°C)
  return d3.interpolateYlOrRd((v + 2) / 5);
}

function getSeaColor(v) {
  // Sea level change scale (0–200 mm)
  return d3.interpolateBlues(Math.min(v / 200, 1));
}

// Load GeoJSON Files
Promise.all([
  fetch("data/Indicator_3_1_Climate_Indicators_Annual_Mean_Global_Surface_Temperature_5943755526554557319.geojson").then(r => r.json()),
  fetch("data/Indicator_3_3_melted_new_-7232464109204630623.geojson").then(r => r.json())
])
.then(([temp, sea]) => {
  tempData = temp;
  seaData = sea;

  console.log("Temperature Data Loaded:", temp);
  console.log("Sea Level Data Loaded:", sea);

  map.on("load", () => {
    // Add a single source — we will swap data inside it
    map.addSource("climate", {
      type: "geojson",
      data: tempData
    });

    // Add the choropleth layer
    map.addLayer({
      id: "climate-fill",
      type: "fill",
      source: "climate",
      paint: {
        "fill-color": ["get", "value_color"],
        "fill-opacity": 0.8,
        "fill-outline-color": "#555"
      }
    });

    setupInteraction();
    updateMap();
  });
});

// Update the map based on current year + mode
function updateMap() {
  const src = map.getSource("climate");

  // Choose dataset
  const dataset = (mode === "temp") ? tempData : seaData;

  const updated = {
    ...dataset,
    features: dataset.features.map(f => {
      const props = f.properties;
      const val = props[currentYear]; // value for the selected year

      let color = "#ccc";
      if (val !== null && val !== undefined && val !== "") {
        color = (mode === "temp") ? getTempColor(val) : getSeaColor(val);
      }

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

  // Update the map layer data
  src.setData(updated);
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

    tooltip.style.display = "block";
    tooltip.style.left = e.point.x + 15 + "px";
    tooltip.style.top = e.point.y + 15 + "px";

    tooltip.innerHTML = `
      <strong>${props.ADMIN}</strong><br>
      Year: ${currentYear}<br>
      ${mode === "temp" ? "Temp Anomaly" : "Sea Level"}:
      <strong>${props.value !== undefined && props.value !== null ? props.value.toFixed(2) : "N/A"}</strong>
    `;
  });

  map.on("mouseleave", "climate-fill", () => {
    tooltip.style.display = "none";
  });
}