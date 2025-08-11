// --- BevCost Spreadsheet (v2) — Bottle Size + Pour Cost + Migration --- //

const STORAGE_KEY_BASE = "bevcost_demo_";
const ML_PER_OZ = 29.5735;

const BOTTLE_OPTIONS = [
  { label: "750 ml", value: 750 },
  { label: "1 L", value: 1000 },
];

// --- Column model --- //
const columns = [
  { data: "item", type: "text" },
  {
    data: "bottle_ml",
    type: "dropdown",
    source: BOTTLE_OPTIONS.map(o => o.label),
    strict: true,
    allowInvalid: false,
    renderer: (instance, td, row, col, prop, value) => {
      const n = parseInt(String(value).replace(/\D/g, ""), 10);
      const label = n === 1000 ? "1 L" : "750 ml";
      Handsontable.renderers.TextRenderer(instance, td, row, col, prop, label);
    },
    editor: Handsontable.editors.DropdownEditor,
  },
  { data: "unit_cost", type: "numeric", numericFormat: { pattern: "0,0.00" } }, // Bottle cost ($)
  { data: "pour_oz", type: "numeric", numericFormat: { pattern: "0,0.[00]" } }, // Pour size (oz)
  { data: "menu_price", type: "numeric", numericFormat: { pattern: "0,0.00" } }, // Menu price ($)
  { data: "cost_per_pour", type: "numeric", readOnly: true, numericFormat: { pattern: "0,0.00" } },
  {
    data: "pour_cost_pct",
    type: "numeric",
    readOnly: true,
    numericFormat: { pattern: "0,0.[0]%" },
    renderer: (instance, td, row, col, prop, value) => {
      const pct = Number(value) || 0;
      td.style.color = pct > 11.5 ? "#fca5a5" : "#a7f3d0"; // red if over target, green if under
      Handsontable.renderers.TextRenderer(instance, td, row, col, prop, pct ? `${pct.toFixed(1)}%` : "");
    }
  },
];

const colHeaders = [
  "Item",
  "Bottle Size",
  "Bottle Cost ($)",
  "Pour Size (oz)",
  "Menu Price ($)",
  "Cost / Pour ($)",
  "Pour Cost %",
];

// --- Helpers --- //
function normalizeBottleMl(value) {
  if (typeof value === "number") return value === 1000 ? 1000 : 750;
  const n = parseInt(String(value).replace(/\D/g, ""), 10);
  if (!n) return 750;
  return n === 1000 ? 1000 : 750;
}

function calcRow(row) {
  const bottle_ml = normalizeBottleMl(row.bottle_ml);
  const bottle_cost = parseFloat(row.unit_cost ?? 0) || 0;
  const pour_oz = parseFloat(row.pour_oz ?? 0) || 0;
  const menu_price = parseFloat(row.menu_price ?? 0) || 0;

  const pour_ml = pour_oz * ML_PER_OZ;
  if (bottle_ml <= 0 || pour_ml <= 0) return { cost_per_pour: 0, pour_cost_pct: 0 };

  const cost_per_pour = bottle_cost * (pour_ml / bottle_ml);
  const pour_cost_pct = menu_price > 0 ? (cost_per_pour / menu_price) * 100 : 0;

  return {
    cost_per_pour: Number(cost_per_pour.toFixed(2)),
    pour_cost_pct: Number(pour_cost_pct.toFixed(1)),
  };
}

function recalcAll(data) {
  return (data || []).map(r => {
    const computed = calcRow(r);
    return {
      ...r,
      bottle_ml: normalizeBottleMl(r.bottle_ml),
      cost_per_pour: computed.cost_per_pour,
      pour_cost_pct: computed.pour_cost_pct,
    };
  });
}

// --- Migration from old schema (Item, Unit Cost, Qty, Total) --- //
function migrateIfNeeded(rows) {
  if (!Array.isArray(rows)) return [];
  const looksOld = rows.some(r =>
    r && ("qty" in r || "total" in r) && !("pour_oz" in r) && !("menu_price" in r)
  );
  if (!looksOld) return rows;

  // Convert: keep item & unit_cost; default bottle 750ml, pour 1.5 oz; leave menu_price blank
  return rows.map(r => ({
    item: r.item ?? "",
    bottle_ml: 750,
    unit_cost: Number(r.unit_cost ?? 0),
    pour_oz: 1.5,
    menu_price: "",
    ...calcRow({
      bottle_ml: 750,
      unit_cost: Number(r.unit_cost ?? 0),
      pour_oz: 1.5,
      menu_price: 0
    })
  }));
}

function getStorageKey(locationId) {
  return STORAGE_KEY_BASE + locationId;
}

function loadData(locationId) {
  const raw = localStorage.getItem(getStorageKey(locationId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const migrated = migrateIfNeeded(parsed);
    return recalcAll(migrated);
  } catch {
    return [];
  }
}

function saveData(locationId, data) {
  localStorage.setItem(getStorageKey(locationId), JSON.stringify(recalcAll(data)));
}

function createExampleRows() {
  return recalcAll([
    { item: "Vodka", bottle_ml: 750,  unit_cost: 14.75, pour_oz: 1.5, menu_price: 9 },
    { item: "Tequila Blanco", bottle_ml: 1000, unit_cost: 21.00, pour_oz: 1.5, menu_price: 11 },
    { item: "Limoncello", bottle_ml: 750, unit_cost: 24.70, pour_oz: 1.0, menu_price: 8 },
  ]);
}

// --- DOM & Grid --- //
const gridEl = document.getElementById("grid");
const locationSelect = document.getElementById("locationSelect");
const addRowBtn = document.getElementById("addRowBtn");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");

let hot;
let currentLocation = locationSelect.value;

function initGrid(locationId) {
  const initialData = loadData(locationId);
  if (hot) hot.destroy();

  hot = new Handsontable(gridEl, {
    data: initialData.length ? initialData : createExampleRows(),
    columns,
    colHeaders,
    rowHeaders: true,
    licenseKey: "non-commercial-and-evaluation",
    contextMenu: true,
    stretchH: "all",
    height: "auto",
    manualColumnResize: true,
    manualRowResize: true,
    afterChange(changes, source) {
      if (!changes || source === "loadData") return;
      const data = hot.getSourceData();

      for (const [rowIndex, prop, , newVal] of changes) {
        if (["unit_cost", "pour_oz", "menu_price", "bottle_ml"].includes(prop)) {
          if (prop === "bottle_ml") data[rowIndex].bottle_ml = normalizeBottleMl(newVal);
          const r = data[rowIndex];
          const c = calcRow(r);
          r.cost_per_pour = c.cost_per_pour;
          r.pour_cost_pct = c.pour_cost_pct;
        }
      }
      hot.loadData(data);
    }
  });
}

function switchLocation(newLoc) {
  saveData(currentLocation, hot.getSourceData());
  currentLocation = newLoc;
  initGrid(currentLocation);
}

locationSelect.addEventListener("change", e => switchLocation(e.target.value));
addRowBtn.addEventListener("click", () => hot.alter("insert_row", hot.countRows()));
saveBtn.addEventListener("click", () => {
  saveData(currentLocation, hot.getSourceData());
  alert("Saved locally for: " + currentLocation);
});
resetBtn.addEventListener("click", () => {
  if (!confirm("Reset this location's sheet to example rows?")) return;
  const rows = createExampleRows();
  hot.loadData(rows);
  saveData(currentLocation, rows);
});

initGrid(currentLocation);
