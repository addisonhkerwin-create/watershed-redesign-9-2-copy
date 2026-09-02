import * as maplibregl from "https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.mjs";

const TREATMENTS = {
  corn: { name: "Corn", field: "corn_pct_cropland_2022", unit: "cropland in corn", description: "Corn acreage as a share of total cropland in 2022.", colors: ["#fff176", "#fec44f", "#fd8d3c", "#f03b20", "#bd0026"] },
  soybean: { name: "Soybeans", field: "soybean_pct_cropland_2022", unit: "cropland in soybeans", description: "Soybean acreage as a share of total cropland in 2022.", colors: ["#e9bd45", "#d78a32", "#bd532d", "#98342f", "#682536"] },
  fertilizer: { name: "Fertilizer treatment", description: "Share of land in farms treated with commercial fertilizer, lime, and soil conditioners in 2022.", colors: ["#f0e883", "#9bc578", "#53a68a", "#16857e", "#005f70"] },
  manure: { name: "Manure treatment", description: "Share of land in farms treated with manure in 2022.", colors: ["#ccefd9", "#8bc3be", "#559ba9", "#32738f", "#284d73"] },
  weed_grass_brush_control: { name: "Weed/grass/brush control", description: "Share of land in farms treated to control weeds, grass, or brush in 2022.", colors: ["#eee2f2", "#c5b1d7", "#9a81bb", "#73569b", "#4e3578"] },
  insect_control: { name: "Insect control", description: "Share of land in farms treated to control insects in 2022.", colors: ["#fde0dd", "#f4b4c4", "#dc82ad", "#ba5594", "#852776"] }
};
const NO_DATA_COLOR = "#d1d0c8";
// Listed from topmost to bottommost; rendering uses the reverse order.
const LAYER_ORDER = ["corn", "soybean", "fertilizer", "insect_control", "manure", "weed_grass_brush_control"];
const layerState = Object.fromEntries(LAYER_ORDER.map(key => [key, { enabled: key === "fertilizer", opacity: 0.6 }]));
const statusCard = document.getElementById("status-card");
const statusText = document.getElementById("status-text");
const hoverName = document.getElementById("hover-name");
const hoverId = document.getElementById("hover-id");
const hoverValue = document.getElementById("hover-value");

let data;
let selectedId = null;
let featuresById;

function field(key) { return TREATMENTS[key].field || `${key}_pct_farmland_2022`; }
function setStatus(message, state = "loading") {
  statusText.textContent = message;
  statusCard.classList.toggle("is-ready", state === "ready");
  statusCard.classList.toggle("is-error", state === "error");
}
function showWatershed(id) {
  selectedId = id;
  const props = featuresById?.get(id)?.properties;
  hoverName.textContent = props?.name || "Hover or tap a watershed";
  hoverId.textContent = props ? `HUC6 ${props.id}` : "";
  hoverValue.textContent = !props ? "" : LAYER_ORDER.filter(key => layerState[key].enabled).map(key => {
    const value = props[field(key)];
    return `${TREATMENTS[key].name}: ${Number.isFinite(value) ? value.toFixed(2) + "% of " + (TREATMENTS[key].unit || "farmland treated") : "No data"}`;
  }).join("\n");
}

function updateAgriculture() {
  if (!data) return;
  for (const key of LAYER_ORDER) {
    const state = layerState[key];
    map.setLayoutProperty(`ag-${key}`, "visibility", state.enabled ? "visible" : "none");
    map.setPaintProperty(`ag-${key}`, "fill-opacity", state.opacity);
  }
  const enabled = LAYER_ORDER.filter(key => layerState[key].enabled).length;
  // The hit-test layer stays transparent so the basemap shows through all colors.
  map.setPaintProperty("huc6-fill", "fill-opacity", 0);
  setStatus(`${enabled} agricultural ${enabled === 1 ? "layer" : "layers"} selected · ${data.features.length} watersheds`, "ready");
  showWatershed(selectedId);
}

function initializeAgriculture() {
  const controls = document.getElementById("agricultural-controls");
  for (const key of [...LAYER_ORDER].reverse()) {
    const values = data.features.map(f => f.properties[field(key)]).filter(Number.isFinite);
    const lower = values.length ? Math.min(...values) : 0;
    const upper = values.length ? Math.max(...values) : 1;
    TREATMENTS[key].lower = lower;
    TREATMENTS[key].upper = upper;
    TREATMENTS[key].count = values.length;
    const colors = TREATMENTS[key].colors;
    // Color anchors interpolate continuously; these are not discrete buckets.
    const stops = colors.flatMap((color, i) => [lower + (Math.max(upper - lower, 0.01) * i / (colors.length - 1)), color]);
    map.addLayer({ id: `ag-${key}`, type: "fill", source: "huc6",
      layout: { visibility: layerState[key].enabled ? "visible" : "none" },
      paint: { "fill-opacity": layerState[key].opacity,
        "fill-color": ["case", ["==", ["get", field(key)], null], "rgba(0,0,0,0)",
          ["interpolate", ["linear"], ["coalesce", ["get", field(key)], 0], ...stops]] }
    }, "huc6-outline");
  }
  for (const key of LAYER_ORDER) {
    const treatment = TREATMENTS[key];
    const state = layerState[key];
    const card = document.createElement("div");
    card.className = "ag-card";
    const label = document.createElement("label");
    label.className = "layer-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "layer-checkbox";
    checkbox.checked = state.enabled;
    label.append(checkbox, document.createTextNode(treatment.name));
    const sliderLabel = document.createElement("label");
    sliderLabel.className = "opacity-row";
    const slider = document.createElement("input");
    slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.step = "1";
    slider.value = String(state.opacity * 100);
    slider.disabled = !state.enabled;
    slider.setAttribute("aria-label", `${treatment.name} opacity`);
    sliderLabel.append(slider);
    const details = document.createElement("details");
    details.open = state.enabled;
    const summary = document.createElement("summary");
    summary.textContent = "Legend & measure";
    const ramp = document.createElement("div"); ramp.className = "legend-gradient";
    ramp.style.background = `linear-gradient(to right, ${treatment.colors.join(", ")})`;
    const endpoints = document.createElement("div"); endpoints.className = "legend-endpoints";
    const low = document.createElement("span"); low.textContent = `${treatment.lower}%`;
    const high = document.createElement("span"); high.textContent = `${treatment.upper}%`;
    endpoints.append(low, high);
    const note = document.createElement("p"); note.className = "data-note";
    note.textContent = `${treatment.description} ${treatment.count} watersheds with data. ${treatment.field ? "Crop acres ÷ total cropland" : "Treated acres ÷ land in farms"} × 100.`;
    details.append(summary, ramp, endpoints, note);
    checkbox.addEventListener("change", () => {
      state.enabled = checkbox.checked;
      slider.disabled = !state.enabled;
      details.open = state.enabled;
      updateAgriculture();
    });
    slider.addEventListener("input", () => {
      state.opacity = Number(slider.value) / 100;
      updateAgriculture();
    });
    card.append(label, sliderLabel, details);
    controls.append(card);
  }
  updateAgriculture();
}

const map = new maplibregl.Map({
  container: "map", style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  center: [-97.5, 38.5], zoom: 3.3, attributionControl: false
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
map.on("load", async () => {
  try {
    // Keep the contextual basemap neutral; draw ordinary water above watershed fills.
    map.setPaintProperty("background", "background-color", "#ececec");
    for (const layer of map.getStyle().layers) {
      if (layer.type === "fill" && ["landcover", "landuse", "park"].includes(layer["source-layer"])) {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    }
    map.setPaintProperty("water", "fill-color", "#dfe5e7");
    map.setPaintProperty("waterway", "line-color", "#8da9b5");
    map.setPaintProperty("waterway", "line-width", ["interpolate", ["linear"], ["zoom"], 3, 0.7, 8, 1.1, 14, 2]);
    setStatus("Loading watersheds and treatment data…");
    const response = await fetch("./data/huc6-treatments.geojson");
    if (!response.ok) throw new Error(`Data request failed (${response.status})`);
    const loaded = await response.json();
    if (!loaded.features?.length) throw new Error("The watershed file contains no features");
    map.addSource("huc6", { type: "geojson", data: loaded });
    map.addLayer({ id: "huc6-fill", type: "fill", source: "huc6",
      paint: { "fill-color": NO_DATA_COLOR, "fill-opacity": 0 } }, "waterway");
    map.addLayer({ id: "huc6-outline", type: "line", source: "huc6", paint: {
      "line-color": "#34443a", "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.45, 6, 1.2],
      "line-opacity": 0.28
    } }, "waterway");
    data = loaded;
    featuresById = new Map(data.features.map(f => [f.properties.id, f]));
    initializeAgriculture();
    initializeBaseWater();
    initializeWaterways();
    initializeStories();
    map.on("mouseenter", "huc6-fill", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "huc6-fill", () => {
      map.getCanvas().style.cursor = "";
      // Retain the last watershed so switching treatments updates its value.
    });
    const inspect = event => {
      const id = event.features?.[0]?.properties?.id;
      if (id) showWatershed(String(id).padStart(6, "0"));
    };
    map.on("mousemove", "huc6-fill", inspect);
    map.on("click", "huc6-fill", inspect);
  } catch (error) {
    console.error(error);
    setStatus(`Could not load treatment data: ${error.message}. Open this folder with Live Server and check your internet connection.`, "error");
  }
});


const WATERWAYS = {
  nutrient: { color: "#4b1f6f", count: 11611 },
  pesticide: { color: "#8a1458", count: 1312 }
};
function initializeWaterways() {
  for (const [key, config] of Object.entries(WATERWAYS)) {
    const toggle = document.getElementById(`toggle-${key}`);
    const status = document.getElementById(`${key}-status`);
    let loaded = false;
    let loading = false;
    toggle.disabled = false;
    status.textContent = `${config.count.toLocaleString()} features · off`;
    toggle.addEventListener("change", async () => {
      if (loading) return;
      if (!loaded && toggle.checked) {
        loading = true;
        toggle.disabled = true;
        status.textContent = "Loading waterways…";
        try {
          const response = await fetch(`./data/${key}-waterways.geojson`);
          if (!response.ok) throw new Error(`Request failed (${response.status})`);
          const collection = await response.json();
          if (collection.features?.length !== config.count) throw new Error("Unexpected waterway count");
          map.addSource(key, { type: "geojson", data: collection });
          // Insert nutrients beneath pesticides regardless of the order they are enabled.
          const before = key === "nutrient" && map.getLayer("pesticide-water") ? "pesticide-water" : undefined;
          const paint = {
            "line-color": config.color,
            "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.65, 7, 3.3, 12, 5.25],
            "line-opacity": 0.95
          };
          if (key === "pesticide") paint["line-dasharray"] = [2, 2];
          map.addLayer({ id: `${key}-water`, type: "line", source: key,
            layout: { visibility: "visible" }, paint }, before);
          loaded = true;
        } catch (error) {
          toggle.checked = false;
          if (map.getSource(key) && !map.getLayer(`${key}-water`)) map.removeSource(key);
          status.textContent = "Could not load waterways. Check your connection and toggle again to retry.";
          console.error(error);
          return;
        } finally {
          loading = false;
          toggle.disabled = false;
        }
      }
      if (loaded) map.setLayoutProperty(`${key}-water`, "visibility", toggle.checked ? "visible" : "none");
      status.textContent = `${config.count.toLocaleString()} features · ${toggle.checked ? "on" : "off"}`;
    });
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
  }
}


async function initializeStories() {
  const status = document.getElementById("stories-status");
  try {
    const response = await fetch("./data/story-markers.json");
    if (!response.ok) throw new Error("Could not load stories");
    const stories = await response.json();
    const markers = stories.map(story => {
      const content = document.createElement("article");
      const title = document.createElement("h3");
      title.textContent = story.name;
      content.append(title);
      for (const text of [story.state_region, story.marker_type, story.story, story.sts_angle]) {
        const paragraph = document.createElement("p");
        paragraph.textContent = text;
        content.append(paragraph);
      }
      const url = new URL(story.source_url);
      if (url.protocol === "https:" || url.protocol === "http:") {
        const link = document.createElement("a");
        link.href = url.href;
        link.textContent = story.source || "Read source";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        content.append(link);
      }
      const button = document.createElement("button");
      button.className = "story-marker";
      button.type = "button";
      button.textContent = "";
      button.setAttribute("aria-label", `Read story: ${story.name}`);
      const popup = new maplibregl.Popup({ offset: 8, maxWidth: "360px" }).setDOMContent(content);
      return new maplibregl.Marker({ element: button })
        .setLngLat([story.longitude, story.latitude]).setPopup(popup);
    });
    for (const marker of markers) marker.addTo(map);
    status.textContent = `${stories.length} permanent story locations`;
  } catch (error) {
    status.textContent = "Could not load stories. Refresh the page to retry.";
    console.error(error);
  }
}


async function initializeBaseWater() {
  const status = document.getElementById("base-water-status");
  try {
    const base = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
    const datasets = await Promise.all(["ne_50m_lakes.geojson", "ne_50m_rivers_lake_centerlines.geojson"].map(async name => {
      const response = await fetch(base + name);
      if (!response.ok) throw new Error(`Background water download failed (${response.status})`);
      const collection = await response.json();
      if (!collection.features?.length) throw new Error("Background water data is empty");
      return collection;
    }));
    const before = map.getLayer("nutrient-water") ? "nutrient-water"
      : map.getLayer("pesticide-water") ? "pesticide-water" : undefined;
    map.addSource("ordinary-lakes", { type: "geojson", data: datasets[0], attribution: "Natural Earth" });
    map.addSource("ordinary-rivers", { type: "geojson", data: datasets[1], attribution: "Natural Earth" });
    map.addLayer({ id: "ordinary-lakes-fill", type: "fill", source: "ordinary-lakes",
      paint: { "fill-color": "#b8ced8", "fill-opacity": 1 } }, before);
    map.addLayer({ id: "ordinary-lakes-edge", type: "line", source: "ordinary-lakes",
      paint: { "line-color": "#688fa3", "line-width": 0.8 } }, before);
    map.addLayer({ id: "ordinary-rivers-line", type: "line", source: "ordinary-rivers",
      filter: ["!=", ["get", "featurecla"], "Lake Centerline"],
      paint: { "line-color": "#688fa3", "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1, 5, 1.6, 9, 2.2], "line-opacity": 0.9 } }, before);
    status.textContent = "Major rivers and lakes loaded · always visible";
  } catch (error) {
    status.textContent = "Background rivers and lakes could not load. Check your internet connection and refresh.";
    console.error(error);
  }
}
