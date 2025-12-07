// Global Variables
let activeCountry = null; // { iso, name }
let selectedCountry = null; // { iso, name }
let worldGeom;       // geometry-only world countries
let tempTable;       // temperature table (by ISO3)
let tempByISO = {};  // lookup: ISO3 -> properties row
let seaData;
let seaByYear = {};
let currentYear = 1992;
let mode = "temp"; // "temp" | "sea" | "disaster"
let globalTrendMetric = "temp"; // which metric the global sparkline shows


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


// ===== Climate / Disaster / Policy Events (1992–2010) =====
// Each event can appear in specific modes; "all" means all modes.
const climateEvents = [
  // Temperature / volcano / ENSO
  {
    id: "pinatubo",
    year: 1992,
    title: "Post-Pinatubo Cooling",
    description: "After the 1991 Mt. Pinatubo eruption, aerosols cooled global temperatures for several years.",
    lat: 15.13,
    lon: 120.35,
    modes: ["temp"],
    iconType: "volcano"
  },
  {
    id: "el_nino_1998",
    year: 1998,
    title: "Record El Niño",
    description: "A powerful El Niño pushed global temperature anomalies to record highs in the late 1990s.",
    lat: 0,
    lon: -140,
    modes: ["temp"],
    iconType: "heat"
  },
  {
    id: "warmest_2005",
    year: 2005,
    title: "Warmest Year on Record (at the time)",
    description: "2005 set a new record for global mean temperature, later tied or surpassed by 2010.",
    lat: 0,
    lon: 0,
    modes: ["temp"],
    iconType: "global"
  },
  {
    id: "russian_heatwave_2010",
    year: 2010,
    title: "Russian Heatwave & Wildfires",
    description: "An extreme heatwave and wildfires struck western Russia, with tens of thousands of excess deaths.",
    lat: 55.75,
    lon: 37.62,
    modes: ["temp", "disaster"],
    iconType: "heat"
  },

  // Sea level / cryosphere
  {
    id: "larsen_b",
    year: 2002,
    title: "Larsen B Ice Shelf Collapse",
    description: "A large Antarctic ice shelf disintegrated, accelerating glacier flow and contributing to sea-level rise.",
    lat: -65,
    lon: -60,
    modes: ["sea"],
    iconType: "ice"
  },
  {
    id: "sea_ice_2007",
    year: 2007,
    title: "Record-Low Arctic Sea Ice",
    description: "Arctic sea ice reached a record-low minimum, highlighting rapid polar warming.",
    lat: 80,
    lon: 0,
    modes: ["sea"],
    iconType: "sea"
  },

  // Major disasters
  {
    id: "midwest_flood_1993",
    year: 1993,
    title: "Great Midwest Flood",
    description: "One of the costliest floods in U.S. history, driven by persistent heavy rainfall.",
    lat: 41,
    lon: -93,
    modes: ["disaster"],
    iconType: "flood"
  },
  {
    id: "red_river_1997",
    year: 1997,
    title: "Red River Flood",
    description: "Spring snowmelt and ice jams caused devastating flooding in the U.S.–Canada border region.",
    lat: 49,
    lon: -97,
    modes: ["disaster"],
    iconType: "flood"
  },
  {
    id: "mitch_1998",
    year: 1998,
    title: "Hurricane Mitch",
    description: "A catastrophic hurricane in Central America, among the deadliest Atlantic storms on record.",
    lat: 15,
    lon: -86,
    modes: ["disaster"],
    iconType: "hurricane"
  },
  {
    id: "europe_heatwave_2003",
    year: 2003,
    title: "European Heatwave",
    description: "An extreme summer heatwave led to tens of thousands of excess deaths across Europe.",
    lat: 46,
    lon: 8,
    modes: ["temp", "disaster"],
    iconType: "heat"
  },
  {
    id: "indian_ocean_tsunami_2004",
    year: 2004,
    title: "Indian Ocean Tsunami",
    description: "A massive earthquake-triggered tsunami devastated coastlines around the Indian Ocean.",
    lat: 3,
    lon: 95,
    modes: ["disaster"],
    iconType: "tsunami"
  },
  {
    id: "katrina_2005",
    year: 2005,
    title: "Hurricane Katrina",
    description: "Storm surge and levee failures caused catastrophic flooding in New Orleans and the U.S. Gulf Coast.",
    lat: 29.95,
    lon: -90.07,
    modes: ["disaster"],
    iconType: "hurricane"
  },
  {
    id: "sidr_2007",
    year: 2007,
    title: "Cyclone Sidr",
    description: "A severe tropical cyclone struck Bangladesh, causing heavy flooding and loss of life.",
    lat: 22,
    lon: 89,
    modes: ["disaster"],
    iconType: "hurricane"
  },
  {
    id: "nargis_2008",
    year: 2008,
    title: "Cyclone Nargis",
    description: "Cyclone Nargis devastated Myanmar, with over a hundred thousand fatalities.",
    lat: 16,
    lon: 95,
    modes: ["disaster"],
    iconType: "hurricane"
  },

  // Policy / global process (appears in all modes)
  {
    id: "rio_1992",
    year: 1992,
    title: "Rio Earth Summit",
    description: "The UN Framework Convention on Climate Change (UNFCCC) was established, launching global climate diplomacy.",
    lat: -22.91,
    lon: -43.17,
    modes: ["all"],
    iconType: "policy"
  },
  {
    id: "kyoto_1997",
    year: 1997,
    title: "Kyoto Protocol Signed",
    description: "Countries agreed to the first binding targets for greenhouse gas emissions.",
    lat: 35.02,
    lon: 135.77,
    modes: ["all"],
    iconType: "policy"
  },
  {
    id: "kyoto_in_force_2005",
    year: 2005,
    title: "Kyoto Protocol Enters into Force",
    description: "The Kyoto Protocol officially took effect, committing signatories to emission limits.",
    lat: 35.02,
    lon: 135.77,
    modes: ["all"],
    iconType: "policy"
  },
  {
    id: "copenhagen_2009",
    year: 2009,
    title: "Copenhagen Climate Summit",
    description: "A high-profile UN climate conference that raised expectations but failed to reach a binding treaty.",
    lat: 55.68,
    lon: 12.57,
    modes: ["all"],
    iconType: "policy"
  }
];

let eventMarkers = [];

function getEventEmoji(ev) {
  const map = {
    volcano: "🌋",
    heat: "🔥",
    sea: "🌊",
    flood: "💧",
    hurricane: "🌀",
    tsunami: "🌊",
    ice: "🧊",
    policy: "📜",
    global: "🌍"
  };
  return map[ev.iconType] || "★";
}

function eventAppliesToMode(ev, currentMode) {
  if (!ev.modes || ev.modes.length === 0) return true;
  if (ev.modes.includes("all")) return true;
  return ev.modes.includes(currentMode);
}



// Initialize MapLibre
const map = new maplibregl.Map({
  container: "map",
  style: "data/style.json",
  center: [0, 20],
  zoom: 1.3,
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
  if (maxSea === minSea) {
    return d3.interpolateBlues(0.5);
  }
  let t = (v - minSea) / (maxSea - minSea);
  t = Math.max(0, Math.min(t, 1));

  // Slightly boost contrast so differences pop more
  const boosted = Math.pow(t, 0.75);

  return d3.interpolateBlues(boosted);
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
// Small helper for search normalization
const COUNTRY_STOP_WORDS = new Set([
  "kingdom",
  "republic",
  "federative",
  "islamic",
  "democratic",
  "people",
  "people's",
  "states",
  "state",
  "united",
  "of",
  "the"
]);

function normalizeCountrySearchString(str) {
  return str
    .toLowerCase()
    .split(/[\s,.'-]+/)
    .filter(w => w && !COUNTRY_STOP_WORDS.has(w))
    .join(" ");
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

    const name = getCountryName(props);  // now cleaned
    const bbox = computeFeatureBBox(f.geometry);

    const adminName = props.ADMIN || "";
    const sovereignName = props.sovereignt || "";
    const isMainCountry =
      adminName &&
      sovereignName &&
      adminName.toLowerCase() === sovereignName.toLowerCase();

    // Base names we always want
    const names = [name, adminName, iso];

    // Only add the sovereign name as a key if this is the main country
    if (isMainCountry && sovereignName) {
      names.push(sovereignName);
    }

    names.forEach(n => {
      if (!n) return;
      const key = n.toLowerCase();

      if (isMainCountry) {
        // main country can override any previous entry (territories)
        countryLookup[key] = { iso, bbox, displayName: name };
      } else {
        // territories: only fill in if nothing exists yet
        if (!countryLookup[key]) {
          countryLookup[key] = { iso, bbox, displayName: name };
        }
      }
    });
  });

  // --- Manual aliases for common forms and nicknames ---
  const aliasToCanonical = {
    // UK/US shortcuts
    "uk": "united kingdom",
    "u.k.": "united kingdom",
    "u.k": "united kingdom",
    "england": "united kingdom",

    "us": "united states",
    "u.s.": "united states",
    "u.s": "united states",
    "usa": "united states",
    "u.s.a.": "united states",

    // Long → short
    "united states of america": "united states",
    "united mexican states": "mexico",
    "argentine republic": "argentina",
    "french republic": "france",
    "russian federation": "russia",
    "bolivarian republic of venezuela": "venezuela",
    "federal republic of germany": "germany",
    "arab republic of egypt": "egypt",
    "hashemite kingdom of jordan": "jordan",
    "kingdom of sweden": "sweden",
    "kingdom of denmark": "denmark",
    "kingdom of norway": "norway",
    "kingdom of saudi arabia": "saudi arabia",
    "kingdom of the netherlands": "netherlands",
    "people's republic of china": "china",
    "socialist republic of viet nam": "vietnam",
    "democratic people's republic of korea": "north korea",
    "republic of korea": "south korea",
    "italian republic": "italy",
    "hellenic republic": "greece",
    "czech republic": "czechia",

    // Friendly aliases → cleaned names
    "south korea": "south korea",
    "north korea": "north korea",
    "czechia": "czechia"
  };

  Object.entries(aliasToCanonical).forEach(([alias, canonical]) => {
    const canonicalKey = canonical.toLowerCase();
    const base = countryLookup[canonicalKey];
    if (base) {
      countryLookup[alias.toLowerCase()] = base;
    }
  });

  // --- Populate datalist (autocomplete) options here (HTML added in step 3) ---
    const datalist = document.getElementById("countryOptions");
  if (datalist) {
    datalist.innerHTML = "";
    const seen = new Set();
    const labels = [];

    Object.keys(countryLookup).forEach(k => {
      const entry = countryLookup[k];
      if (!entry || !entry.displayName) return;
      const label = entry.displayName;
      if (seen.has(label)) return;
      seen.add(label);
      labels.push(label);
    });

    labels.sort((a, b) => a.localeCompare(b));

    labels.forEach(label => {
      const opt = document.createElement("option");
      opt.value = label;
      datalist.appendChild(opt);
    });
  }

}



// -----------------------------
// Helper: filter expression for highlight layer
// -----------------------------
function highlightFilterForISO(iso) {
  return [
    "==",
    ["get", "iso_code"],
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
    setupEventMarkers();
    setupInteraction();
    setupCountrySearch();
    setActiveButton();
    updateLegend();
    updateMap(currentYear);
    updateSummary(currentYear);
 

  // NEW: initial annotations
    updateAnnotations(currentYear);
  });

  const years = d3.range(sliderMinYear, sliderMaxYear + 1);

  
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
// Clean up official / long names to human-friendly labels
function cleanCountryName(name) {
  if (!name) return "Unknown";

  let trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // --- Exact mappings for common long official names ---
  const exactMap = {
    "united states of america": "United States",
    "united mexican states": "Mexico",
    "argentine republic": "Argentina",
    "french republic": "France",
    "russian federation": "Russia",
    "federal republic of germany": "Germany",
    "bolivarian republic of venezuela": "Venezuela",
    "arab republic of egypt": "Egypt",
    "hashemite kingdom of jordan": "Jordan",
    "kingdom of sweden": "Sweden",
    "kingdom of denmark": "Denmark",
    "kingdom of norway": "Norway",
    "kingdom of saudi arabia": "Saudi Arabia",
    "kingdom of the netherlands": "Netherlands",
    "people's republic of china": "China",
    "socialist republic of viet nam": "Vietnam",
    "democratic people's republic of korea": "North Korea",
    "republic of korea": "South Korea",
    "italian republic": "Italy",
    "hellenic republic": "Greece",
    "czech republic": "Czechia"
  };

  if (exactMap[lower]) {
    return exactMap[lower];
  }

  // --- Generic prefix stripping ---
  const prefixPatterns = [
    "republic of ",
    "islamic republic of ",
    "democratic republic of ",
    "federative republic of ",
    "bolivarian republic of ",
    "independent state of ",
    "united republic of ",
    "commonwealth of ",
    "state of ",
    "kingdom of ",
    "people's republic of "
  ];

  for (const p of prefixPatterns) {
    if (lower.startsWith(p)) {
      const stripped = trimmed.slice(p.length).trim();
      if (stripped) return stripped;
    }
  }

  // Fall back to the original, nicely-trimmed name
  return trimmed;
}

// Prefer simple, human-friendly names
function getCountryName(props) {
  // Prefer ADMIN/NAME/name_long first (these are usually "France", "Sweden", etc.)
  let raw =
    props.ADMIN ||
    props.NAME ||
    props.name_long ||
    props.formal_en ||
    props.brk_name ||
    props.sovereignt;

  if (!raw) return "Unknown";
  return cleanCountryName(raw);
}

function getISOFromProps(props) {
  // First, prefer normalized ISO if present (from updateMap)
  if (props.iso_code) {
    const isoNorm = String(props.iso_code).trim();
    if (isoNorm) return isoNorm;
  }

  // Then try the raw ISO fields from the joined data
  let iso = (
    props.ISO3 ||
    props.ISO_A3 ||
    props.ADM0_A3 ||
    props.adm0_a3 ||
    props.SOV_A3 ||
    props.sov_a3 ||
    ""
  ).trim();

  // If still missing, fall back to lookup by cleaned name
  if (!iso && countryLookup && Object.keys(countryLookup).length > 0) {
    const name = getCountryName(props);
    const entry = countryLookup[name.toLowerCase()];
    if (entry && entry.iso) {
      iso = entry.iso;
    }
  }

  return iso;
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

  // ----- LAND: ALL MODES (color depends on mode) -----
  // Precompute disaster min/max only if needed
  let dMin = 0;
  let dMax = 1;
  if (mode === "disaster") {
    dMin = Infinity;
    dMax = -Infinity;
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
      const iso = getISOFromProps(props);

      let value = null;
      // Neutral default for land when not using temp/disaster color
      let color = "#e0e0e0";

      if (mode === "temp") {
        const tempRow = iso ? tempByISO[iso] : null;
        value = tempRow ? getTempValue(tempRow, year) : null;
        color = value != null ? getTempColor(value) : "#e0e0e0";
      } else if (mode === "disaster") {
        value = iso && disasterByISO[iso] ? disasterByISO[iso][year] : null;
        color = getDisasterColor(value, dMin, dMax);
      } else if (mode === "sea") {
        // In sea-level mode, keep countries in neutral color
        value = null;
      }

      return {
      ...f,
      properties: {
        ...props,
        iso_code: iso,       // 🔹 ensure highlight layer can filter on this
        value,
        value_color: color
      }
    };

    })
  };

  src.setData(updated);

  // ----- OCEAN: SEA LEVEL -----
  // Default ocean color when NOT in sea-level mode
  let oceanColor = "#aac6ff";

    if (mode === "sea") {
    const seaVal = seaByYear[year];
    const vals = [];
    for (let y = sliderMinYear; y <= sliderMaxYear; y++) {
      if (seaByYear[y] != null) vals.push(seaByYear[y]);
    }
    const minSea = Math.min(...vals);
    const maxSea = Math.max(...vals);

    if (seaVal != null) {
      oceanColor = getSeaColor(seaVal, minSea, maxSea);
    }
  }


  try {
    map.setPaintProperty("ocean-fill", "fill-color", oceanColor);
  } catch (e) {
    console.warn("Water layer not ready yet:", e);
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
     updateGlobalSparkline();
    updateAnnotations(currentYear);  // NEW
    if (activeCountry && activeCountry.iso) {
      updateCountrySparkline(activeCountry.iso, activeCountry.name);
      refreshActiveTooltip();
    }

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
        updateGlobalSparkline();
        updateAnnotations(newYear);   // NEW
        if (activeCountry && activeCountry.iso) {
          updateCountrySparkline(activeCountry.iso, activeCountry.name);
          refreshActiveTooltip();
        }

      }
    }, 100);
  };

    document.getElementById("modeTemp").onclick = () => {
    mode = "temp";
    globalTrendMetric = "temp";
    setActiveButton();
    updateMap(currentYear);
    updateLegend(currentYear);
    updateSummary(currentYear);
    updateGlobalSparkline();
    updateAnnotations(currentYear); // NEW
  };

  document.getElementById("modeSea").onclick = () => {
    mode = "sea";
    globalTrendMetric = "sea";
    setActiveButton();
    updateMap(currentYear);
    updateLegend(currentYear);
    updateSummary(currentYear);
    updateGlobalSparkline();
    updateAnnotations(currentYear); // NEW
  };

  document.getElementById("modeDisaster").onclick = () => {
    mode = "disaster";
    globalTrendMetric = "disaster";
    setActiveButton();
    updateMap(currentYear);
    updateLegend(currentYear);
    updateSummary(currentYear);
    updateGlobalSparkline();
    updateAnnotations(currentYear); // NEW
  };

    // Global trend dropdown: changing it also changes the map mode
  const trendSelect = document.getElementById("globalTrendSelect");
if (trendSelect) {
  // Ensure initial value matches the current metric
  trendSelect.value = globalTrendMetric;

  trendSelect.onchange = e => {
    const val = e.target.value;
    if (val === "temp" || val === "sea" || val === "disaster") {
      // Only change which metric the global sparkline shows
      globalTrendMetric = val;
      updateGlobalSparkline();
    }
  };
}


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

    const clearBtn = document.getElementById("clearSelection");
  if (clearBtn) {
    clearBtn.onclick = () => {
      // Stop playback if running
      stopPlayback && stopPlayback();

      // Clear selection & active country
      selectedCountry = null;
      activeCountry = null;

      // Remove highlight
      if (map.getLayer("country-highlight")) {
        map.setFilter("country-highlight", highlightFilterForISO(""));
      }

      // Clear sparklines + stats
      updateCountrySparkline();

      // Hide tooltip
      const tooltip = document.getElementById("tooltip");
      if (tooltip) tooltip.style.display = "none";

      
            // Reset view to initial center/zoom/orientation
      map.flyTo({
        center: [0, 20],
        zoom: 1.3,
        pitch: 0,
        bearing: 0
      });

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
    const normQuery = normalizeCountrySearchString(raw);

    let match = null;

    // 1) Direct lookup (includes aliases like "uk", "usa")
    if (countryLookup[query]) {
      match = countryLookup[query];
    }

    const keys = Object.keys(countryLookup);

    // 2) Exact match on normalized strings (ignoring "republic of", "kingdom", etc.)
    if (!match && normQuery) {
      const foundKey = keys.find(k => {
        return normalizeCountrySearchString(k) === normQuery;
      });
      if (foundKey) {
        match = countryLookup[foundKey];
      }
    }

    // 3) Prefer names that START with the raw query (e.g. "fra" → "france")
    if (!match) {
      const foundKey = keys.find(k => k.startsWith(query));
      if (foundKey) {
        match = countryLookup[foundKey];
      }
    }

    // 4) Fallback: any name that CONTAINS the raw query
    if (!match) {
      const foundKey = keys.find(k => k.includes(query));
      if (foundKey) {
        match = countryLookup[foundKey];
      }
    }

    // 5) Last resort: normalized "contains" (so "argentina" finds "argentine republic")
    if (!match && normQuery) {
      const foundKey = keys.find(k => {
        return normalizeCountrySearchString(k).includes(normQuery);
      });
      if (foundKey) {
        match = countryLookup[foundKey];
      }
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

// Lock selection just like a click
selectedCountry = { iso, name: displayName };
activeCountry = { ...selectedCountry };

updateCountrySparkline(iso, displayName);
refreshActiveTooltip && refreshActiveTooltip();

  };



  btn.addEventListener("click", handleSearch);

    input.addEventListener("keydown", e => {
      if (e.key === "Enter") handleSearch();
    });

    // 🔹 NEW: run search when user chooses an option from the datalist
    input.addEventListener("change", () => {
      handleSearch();
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

  if (selectedCountry && selectedCountry.iso) {
    // Fall back to the locked selection
    activeCountry = { ...selectedCountry };
    updateCountrySparkline(selectedCountry.iso, selectedCountry.name);
    refreshActiveTooltip && refreshActiveTooltip();
    } else {
    // No selection → clear
    activeCountry = null;
    updateCountrySparkline();
    }

    return;
    }



    const f = features[0];
    const props = f.properties;
    const iso = getISOFromProps(props);
    const name = getCountryName(props);
    activeCountry = { iso: (iso || "").trim(), name };



    let valueLabel;
    if (mode === "temp") {
      valueLabel = props.value != null ? `${props.value.toFixed(2)}°C` : "N/A";
    } else if (mode === "disaster") {
      valueLabel = props.value != null ? props.value : "N/A";
    } else {
      valueLabel = "N/A";
    }

        const metricLabel =
          mode === "temp"
            ? "Temperature anomaly"
            : mode === "disaster"
            ? "Disasters"
            : "Sea level (global)";

        // In sea-level mode, show global sea level for the year
        let displayValue = valueLabel;
        if (mode === "sea") {
          const seaVal = seaByYear[currentYear];
          displayValue = seaVal != null ? `${seaVal.toFixed(0)} mm` : "N/A";
        }

        tooltip.style.display = "block";
        tooltip.innerHTML = `
          <div class="tooltip-header">
            <span class="tooltip-country">${name}</span>
            <span class="tooltip-year">Year ${currentYear}</span>
          </div>
          <div class="tooltip-row">
            <span class="tooltip-metric-label">${metricLabel}:</span>
            <span class="tooltip-metric-value">${displayValue}</span>
          </div>
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

    if (selectedCountry && selectedCountry.iso) {
      activeCountry = { ...selectedCountry };
      updateCountrySparkline(selectedCountry.iso, selectedCountry.name);
      refreshActiveTooltip && refreshActiveTooltip();
      } else {
      activeCountry = null;
      updateCountrySparkline();
      }
    });

  map.getCanvas().addEventListener("mouseleave", () => {
    tooltip.style.display = "none";

    if (selectedCountry && selectedCountry.iso) {
      activeCountry = { ...selectedCountry };
      updateCountrySparkline(selectedCountry.iso, selectedCountry.name);
      refreshActiveTooltip && refreshActiveTooltip();
    } else {
      activeCountry = null;
      updateCountrySparkline();
    }
  });

//   map.on("click", "climate-fill", e => {
//   const canvasRect = map.getCanvas().getBoundingClientRect();
//   const xCanvas = e.originalEvent.clientX - canvasRect.left;
//   const yCanvas = e.originalEvent.clientY - canvasRect.top;

//   const features = map.queryRenderedFeatures([xCanvas, yCanvas], {
//     layers: ["climate-fill"]
//   });
//   if (!features.length) return;

//   const f = features[0];
//   const props = f.properties || {};
//   const iso = getISOFromProps(props);
//   const name = getCountryName(props);

//   if (!iso) return;

//   // Toggle behavior: if clicking the same country again, clear selection
//   if (selectedCountry && selectedCountry.iso === iso) {
//     selectedCountry = null;
//     activeCountry = null;

//     if (map.getLayer("country-highlight")) {
//       map.setFilter("country-highlight", highlightFilterForISO(""));
//     }

//     updateCountrySparkline();
//     const tooltipEl = document.getElementById("tooltip");
//     if (tooltipEl) tooltipEl.style.display = "none";
//     return;
//   }

//   // New selection
//   selectedCountry = { iso, name };
//   activeCountry = { ...selectedCountry };

//   if (map.getLayer("country-highlight")) {
//     map.setFilter("country-highlight", highlightFilterForISO(iso));
//   }

//   updateCountrySparkline(iso, name);
//   refreshActiveTooltip && refreshActiveTooltip();
// });


}

function setupEventMarkers() {
  if (!map) return;

  climateEvents.forEach(ev => {
    const el = document.createElement("div");
    el.className = "annotation-marker " + (ev.iconType || "");
    el.textContent = getEventEmoji(ev);

    // Popup content: title + description
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 18,
      maxWidth: "260px"
    }).setHTML(`
      <div class="annotation-popup">
        <div class="annotation-popup-title">${ev.title}</div>
        <div class="annotation-popup-desc">${ev.description}</div>
      </div>
    `);

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([ev.lon, ev.lat])
      .addTo(map);

    // Hover behavior: show popup on mouseenter, hide on mouseleave
    el.addEventListener("mouseenter", () => {
      popup.setLngLat([ev.lon, ev.lat]).addTo(map);
    });
    el.addEventListener("mouseleave", () => {
      popup.remove();
    });

    eventMarkers.push(marker);
    ev._marker = marker;

    // Start hidden; updateAnnotations decides what to show by year + mode
    marker.getElement().style.display = "none";
  });
}


function updateAnnotations(year = currentYear) {
  const panel = document.getElementById("annotationPanel");
  const yearSpan = document.getElementById("annotationYear");
  const listEl = document.getElementById("annotationList");
  if (!panel || !yearSpan || !listEl) return;

  yearSpan.textContent = year;

  // Which events are active in this year + mode?
  const activeEvents = climateEvents.filter(ev =>
    ev.year === year && eventAppliesToMode(ev, mode)
  );

  // Show/hide markers
  climateEvents.forEach(ev => {
    if (!ev._marker) return;
    const el = ev._marker.getElement();
    if (!el) return;

    if (ev.year === year && eventAppliesToMode(ev, mode)) {
      el.style.display = "flex";
    } else {
      el.style.display = "none";
    }
  });

  // Populate panel
  listEl.innerHTML = "";
  if (!activeEvents.length) {
    const p = document.createElement("p");
    p.className = "annotation-empty";
    p.innerHTML =
      'No major annotated events for this year/mode. Try another year or mode!';
    listEl.appendChild(p);
    return;
  }

  activeEvents.forEach(ev => {
    const row = document.createElement("div");
    row.className = "annotation-event";

    const iconSpan = document.createElement("span");
    iconSpan.className = "annotation-icon " + (ev.iconType || "");
    iconSpan.textContent = getEventEmoji(ev);

    const textDiv = document.createElement("div");
    textDiv.className = "annotation-text";

    const titleEl = document.createElement("div");
    titleEl.className = "annotation-title";
    titleEl.textContent = ev.title;

    const descEl = document.createElement("div");
    descEl.className = "annotation-desc";
    descEl.textContent = ev.description;

    textDiv.appendChild(titleEl);
    textDiv.appendChild(descEl);

    row.appendChild(iconSpan);
    row.appendChild(textDiv);
    listEl.appendChild(row);
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

    const vals = [];
    for (let y = sliderMinYear; y <= sliderMaxYear; y++) {
      if (seaByYear[y] != null) vals.push(seaByYear[y]);
    }
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
    title.textContent = "Climate-Related Disasters";

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

function refreshActiveTooltip() {
  const tooltip = document.getElementById("tooltip");
  if (!tooltip || tooltip.style.display === "none") return;
  if (!activeCountry || !activeCountry.iso) return;

  const iso = activeCountry.iso;
  const name = activeCountry.name || "Unknown";

  let valueLabel = "N/A";
  if (mode === "temp") {
    const tempRow = tempByISO[iso];
    const v = tempRow ? getTempValue(tempRow, currentYear) : null;
    valueLabel = v != null ? `${v.toFixed(2)}°C` : "N/A";
  } else if (mode === "disaster") {
    const yearDict = disasterByISO[iso] || {};
    const v = yearDict[currentYear];
    valueLabel = v != null ? v : "N/A";
  } else {
    valueLabel = "N/A";
  }

  tooltip.innerHTML = `
    <div><strong>${name}</strong></div>
    <div>Year: <strong>${currentYear}</strong></div>
    <div>${mode === "temp" ? "Temp" : (mode === "disaster" ? "Disasters" : "Value")}: <strong>${valueLabel}</strong></div>
  `;
}


function updateGlobalSparkline() {
  const svg = d3.select("#globalSparkline");
  if (svg.empty()) return;

  svg.selectAll("*").remove();

  const width = +svg.attr("width") || 300;
  const height = +svg.attr("height") || 120;

  const margin = { top: 20, right: 10, bottom: 20, left: 46 };
  const years = d3.range(sliderMinYear, sliderMaxYear + 1);

  // Determine which metric to show
  const metric = globalTrendMetric || "temp";

  let rawData = years.map(y => {
    if (metric === "temp") {
      return { year: y, value: globalTempByYear[y] };
    } else if (metric === "sea") {
      return { year: y, value: seaByYear[y] };
    } else if (metric === "disaster") {
      return { year: y, value: globalDisastersByYear[y] };
    } else {
      return { year: y, value: null };
    }
  });

  const data = rawData.filter(d => d.value != null && !Number.isNaN(d.value));
  if (!data.length) return;

  // Sync dropdown + title text
  const selectEl = document.getElementById("globalTrendSelect");
  if (selectEl && selectEl.value !== metric) {
    selectEl.value = metric;
  }

  const titleEl = document.getElementById("globalSparklineTitle");
  if (titleEl) {
    if (metric === "temp") {
      titleEl.textContent = "Global Temperature Anomaly Trend";
    } else if (metric === "sea") {
      titleEl.textContent = "Global Sea Level Trend";
    } else if (metric === "disaster") {
      titleEl.textContent = "Global Climate Disaster Trend";
    }
  }

  const x = d3.scaleLinear()
    .domain(d3.extent(years))
    .range([margin.left, width - margin.right]);

  const valExtent = d3.extent(data, d => d.value);
  let yMin = valExtent[0];
  let yMax = valExtent[1];

  if (yMin === yMax) {
    // Avoid flatline domain
    const pad = Math.abs(yMin || 1) * 0.1;
    yMin -= pad;
    yMax += pad;
  }

  const y = d3.scaleLinear()
    .domain([yMin, yMax])
    .range([height - margin.bottom, margin.top]);

  // ========================
  // TRENDLINE (linear regression)
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
        .attr("stroke", "#003f5c")
        .attr("stroke-width", 2.0)
        .attr("stroke-dasharray", "6,4")
        .attr("opacity", 0.85)
        .attr("d", trendLine);
    }
  }

  // ========================
  // MAIN LINE + YEAR MARKER
  // ========================
  const mainLine = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.value))
    .curve(d3.curveMonotoneX);

  const strokeColor =
    metric === "temp"
      ? "#d73027"      // red for temp
      : metric === "sea"
      ? "#0057b7"      // blue for sea
      : "#e07a00";     // orange for disasters

  svg.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", strokeColor)
    .attr("stroke-width", 2.5)
    .attr("d", mainLine);

  // --- current-year vertical marker + highlight dot ---
  if (currentYear >= sliderMinYear && currentYear <= sliderMaxYear) {
    const markerX = x(currentYear);

    // Vertical line
    svg.append("line")
      .attr("x1", markerX)
      .attr("x2", markerX)
      .attr("y1", margin.top)
      .attr("y2", height - margin.bottom)
      .attr("stroke", "#555")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,2");

    // Highlight dot on the curve, if we have data for this year
    const yearPoint = data.find(d => d.year === currentYear);
    if (yearPoint && yearPoint.value != null) {
      svg.append("circle")
        .attr("cx", x(yearPoint.year))
        .attr("cy", y(yearPoint.value))
        .attr("r", 3.5)
        .attr("fill", "#ffffff")
        .attr("stroke", strokeColor)
        .attr("stroke-width", 1.5);
    }
  }

  

  // X-axis labels
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

  const formatVal = v => {
    if (metric === "temp") {
      return `${v.toFixed(2)}°C`;
    } else if (metric === "sea") {
      return `${v.toFixed(0)} mm`;
    } else if (metric === "disaster") {
      return `${v.toFixed(0)}`;
    }
    return v.toString();
  };

  svg.append("text")
    .attr("x", 4)
    .attr("y", margin.top + 4)
    .attr("font-size", 10)
    .text(formatVal(maxVal));

  svg.append("text")
    .attr("x", 4)
    .attr("y", height - margin.bottom + 2)
    .attr("font-size", 10)
    .text(formatVal(minVal));
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

    const yDomainMin = Math.min(0, tempMin);
    const yDomainMax = tempMax;

    const yScaleTemp = d3.scaleLinear()
      .domain([yDomainMin, yDomainMax])
      .range([tempHeight - margin.bottom, margin.top]);

    const tempLine = d3.line()
      .x(d => xScaleTemp(d.year))
      .y(d => yScaleTemp(d.value))
      .curve(d3.curveMonotoneX);

    // --- NEW: zero-baseline (dotted) so you can see above/below 0°C ---
    if (0 >= yDomainMin && 0 <= yDomainMax) {
      tempSvg.append("line")
        .attr("x1", margin.left)
        .attr("x2", tempWidth - margin.right)
        .attr("y1", yScaleTemp(0))
        .attr("y2", yScaleTemp(0))
        .attr("stroke", "#999")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3");
    }



    
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

    // --- NEW: zero-baseline (dotted) at 0 events/yr ---
    disSvg.append("line")
      .attr("x1", margin.left)
      .attr("x2", disWidth - margin.right)
      .attr("y1", yScaleDis(0))
      .attr("y2", yScaleDis(0))
      .attr("stroke", "#999")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3");


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

  const globalStartYear = sliderMinYear;
  const globalEndYear   = sliderMaxYear;

  // --------------------------------
  // Temperature story (clean phrasing)
  // --------------------------------
  if (countryTempData.length > 1) {
    const first = countryTempData[0];
    const last  = countryTempData[countryTempData.length - 1];
    const tempChange = last.value - first.value;

    const globalStart = globalTempByYear[globalStartYear];
    const globalEnd   = globalTempByYear[globalEndYear];
    const globalChange =
      globalStart != null && globalEnd != null
        ? globalEnd - globalStart
        : null;

    let sentence = `From ${first.year} to ${last.year}, the average temperature anomaly in ${name} `;

    // Country change wording
    if (tempChange >= 0) {
      sentence += `increased by ${tempChange.toFixed(2)}°C`;
    } else {
      sentence += `decreased by ${Math.abs(tempChange).toFixed(2)}°C`;
    }

    // Global comparison
    if (globalChange != null) {
      const diff = tempChange - globalChange;

      if (Math.abs(globalChange) > 0.001) {
        const relPct = (diff / Math.abs(globalChange)) * 100;
        const absPct = Math.abs(relPct).toFixed(0);
        const globalStr = `${globalChange >= 0 ? globalChange.toFixed(2) : "-" + Math.abs(globalChange).toFixed(2)}°C`;

        if (Math.abs(relPct) < 15) {
          sentence += `, which is fairly similar to the global change (${globalStr}).`;
        } else {
          const direction = relPct > 0 ? "higher" : "lower";
          sentence += `, which is about ${absPct}% ${direction} than the global change (${globalStr}).`;
        }
      } else {
        sentence += `, which is larger than the small global change over this period.`;
      }
    }

    lines.push(sentence);
  }

  // --------------------------------
  // Disasters story (country only)
  // --------------------------------
  if (countryDisasterData.length > 1) {
    const firstD = countryDisasterData[0];
    const lastD  = countryDisasterData[countryDisasterData.length - 1];
    const rawChange = lastD.value - firstD.value;

    let sentence = `During this time period, reported climate-related disasters in ${name} `;

    if (firstD.value > 0) {
      const pctChange = (rawChange / firstD.value) * 100;
      const absPct = Math.abs(pctChange).toFixed(0);

      if (pctChange >= 0) {
        sentence += `increased by about ${absPct}%.`;
      } else {
        sentence += `decreased by about ${absPct}%.`;
      }
    } else {
      // Handle starting at 0 gracefully
      sentence += `went from ${firstD.value.toFixed(
        0
      )} to ${lastD.value.toFixed(
        0
      )} events per year between ${firstD.year} and ${lastD.year}.`;
    }

    lines.push(sentence);
  }


  statsEl.textContent = lines.join(" ");
}


}