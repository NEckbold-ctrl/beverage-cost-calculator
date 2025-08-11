// --- BevCost Spreadsheet (v3) — Bottle Size + Pour Cost + Suggested Price + Target Highlight --- //
document.getElementById('ver')?.append("v3");

const STORAGE_KEY_BASE = "bevcost_demo_";
const ML_PER_OZ = 29.5735;

const els = {
  grid: document.getElementById("grid"),
  locationSelect: document.getElementById("locationSelect"),
  addRowBtn: document.getElementById("addRowBtn"),
  saveBtn: document.getElementById("saveBtn"),
  resetBtn: document.getElementById("resetBtn"),
  targetPct: document.getElementById("targetPct"),
  rounding: document.getElementById("rounding"),
};

const BOTTLE_OPTIONS = [
  { label: "750 ml", value: 750 },
  { label: "1 L", value: 1000 },
];

const columns = [
  { data: "item", type: "text" },
  {
    data: "bottle_ml",
    type: "dropdown",
    source: BOTTLE_OPTIONS.map(o => o.label),
    strict: true, allowInvalid: false,
    renderer: (instance, td, row, col, prop, value) => {
      const n = parseInt(String(value).replace(/\D/g, ""), 10);
      const label = n === 1000 ? "1 L" : "750 ml";
      Handsontable.renderers.TextRenderer(instance, td, row, col, prop, label);
    },
    editor: Handsontable.editors.DropdownEditor,
  },
  { data: "unit_cost", type: "numeric", numericFormat: { pattern: "0,0.00" } }, // Bottle cost ($)
  { data: "pour_oz", type: "numeric", numericFormat: { pattern: "0,0.[00]" } }, // Pour size (oz)
  { data: "menu_price", type: "numeric", numericFormat: { pattern: "0,0.00" } }, // Your current price ($)
  { data: "cost_per_pour", type: "numeric", readOnly: true, numericFormat: { pattern: "0,0.00" } },
  { 
    data: "pour_cost_pct",
    type: "numeric", readOnly: true,
    renderer: (instance, td, row, col, prop, value) => {
      const target = getTargetPct();
      const pct = Number(value) || 0;
      td.style.color = pct > target ? "#fca5a5" : "#a7f3d0";
      Handsontable.renderers.TextRenderer(instance, td, row, col, prop, pct ? `${pct.toFixed(1)}%` : "");
    }
  },
  { data: "suggested_price", type: "numeric", readOnly: true, numericFormat: { pattern: "0,0.00" } }, // to hit target
];

const colHeaders = [
  "Item",
  "Bottle Size",
  "Bottle Cost ($)",
  "Pour Size (oz)",
  "Menu Price ($)",
  "Cost / Pour ($)",
  "Pour Cost %",
  "Suggested Menu Price ($)",
];

function normalizeBottleMl(value) {
  if (typeof value === "number") return value === 1000 ? 1000 : 750;
  const n = parseInt(String(value).replace(/\D/g, ""), 10);
  if (!n) return 750;
  return n === 1000 ? 1000 : 750;
}

function getTargetPct(){
  const v = parseFloat(els.targetPct?.value ?? "11.5");
  return isFinite(v) && v > 0 ? v : 11.5;
}

function getRounding(){
  const val = parseFloat(els.rounding?.value ?? "0.25");
  return isFinite(val) ? val : 0.25;
}

function roundToIncrement(amount, increment){
  if (!increment || increment <= 0) return amount;
  return Math.round(amount / increment) * increment;
}

function calcRow(row) {
  const bottle_ml = normalizeBottleMl(row.bottle_ml);
  const bottle_cost = parseFloat(row.unit_cost ?? 0) || 0;
  const pour_oz = parseFloat(row.pour_oz ?? 0) || 0;
  const menu_price = parseFloat(row.menu_price ?? 0) || 0;

  const pour_ml = pour_oz * ML_PER_OZ;
  let cost_per_pour = 0, pour_cost_pct = 0, suggested_price = 0;

  if (bottle_ml > 0 && pour_ml > 0) {
    cost_per_pour = bottle_cost * (pour_ml / bottle_ml);
    if (menu_price > 0) {
      pour_cost_pct = (cost_per_pour / menu_price) * 100;
    }
    const target = getTargetPct();
    if (target > 0) {
      const rawPrice = cost_per_pour / (target / 100);
      const inc = getRounding();
      suggested_price = inc ? roundToIncrement(rawPrice, inc) : rawPrice;
    }
  }

  return {
    cost_per_pour: Number(cost_per_pour.toFixed(2)),
    pour_cost_pct: Number(pour_cost_pct.toFixed(1)),
    suggested_price: Number(suggested_price.toFixed(2)),
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
      suggested_price: computed.suggested_price,
    };
  });
}

// Migration from old schema (item, unit_cost, qty, total)
function migrateIfNeeded(rows) {
  if (!Array.isArray(rows)) return [];
  const hasNew = rows.some(r => "pour_oz" in r || "menu_price" in r || "suggested_price" in r);
  if (hasNew) return rows;
  return rows.map(r => ({
    item: r.item ?? "",
    bottle_ml: 750,
    unit_cost: Number(r.unit_cost ?? 0),
    pour_oz: 1.5,
    menu_price: "",
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
    { item: "Vodka",          bottle_ml: 750,  unit_cost: 14.75, pour_oz: 1.5, menu_price: 9  },
    { item: "Tequila Blanco", bottle_ml: 1000, unit_cost: 21.00, pour_oz: 1.5, menu_price: 11 },
    { item: "Limoncello",     bottle_ml: 750,  unit_cost: 24.70, pour_oz: 1.0, menu_price: 8  },
  ]);
}

let hot;
let currentLocation = els.locationSelect.value;

function applyRowHighlights(instance){
  const target = getTargetPct();
  instance.addHookOnce('afterRender', () => {
    const count = instance.countRows();
    for (let r = 0; r < count; r++) {
      const data = instance.getSourceDataAtRow(r);
      const pct = Number(data?.pour_cost_pct);
      for (let c = 0; c < instance.countCols(); c++) {
        const td = instance.getCell(r, c);
        if (!td) continue;
        td.classList.remove('htInvalidCost','htGoodCost');
        if (!isNaN(pct) && pct > 0) {
          if (pct > target) td.classList.add('htInvalidCost');
          else td.classList.add('htGoodCost');
        }
      }
    }
  });
}

function initGrid(locationId) {
  const initialData = loadData(locationId);
  if (hot) hot.destroy();

  hot = new Handsontable(els.grid, {
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
      let needsReload = false;
      for (const [rowIndex, prop, , newVal] of changes) {
        if (["unit_cost", "pour_oz", "menu_price", "bottle_ml"].includes(prop)) {
          if (prop === "bottle_ml") data[rowIndex].bottle_ml = normalizeBottleMl(newVal);
          const r = data[rowIndex];
          const c = calcRow(r);
          r.cost_per_pour = c.cost_per_pour;
          r.pour_cost_pct = c.pour_cost_pct;
          r.suggested_price = c.suggested_price;
          needsReload = true;
        }
      }
      if (needsReload) {
        hot.loadData(data);
        applyRowHighlights(hot);
      }
    },
    afterRender() {
      applyRowHighlights(hot);
    }
  });
}

function switchLocation(newLoc) {
  saveData(currentLocation, hot.getSourceData());
  currentLocation = newLoc;
  initGrid(currentLocation);
}

// Events
els.locationSelect.addEventListener("change", e => switchLocation(e.target.value));
els.addRowBtn.addEventListener("click", () => hot.alter("insert_row", hot.countRows()));
els.saveBtn.addEventListener("click", () => {
  saveData(currentLocation, hot.getSourceData());
  alert("Saved locally for: " + currentLocation);
});
els.resetBtn.addEventListener("click", () => {
  if (!confirm("Reset this location's sheet to example rows?")) return;
  const rows = createExampleRows();
  hot.loadData(rows);
  saveData(currentLocation, rows);
  applyRowHighlights(hot);
});
els.targetPct.addEventListener("change", () => {
  const data = recalcAll(hot.getSourceData());
  hot.loadData(data);
  applyRowHighlights(hot);
});
els.rounding.addEventListener("change", () => {
  const data = recalcAll(hot.getSourceData());
  hot.loadData(data);
  applyRowHighlights(hot);
});

// Boot
initGrid(currentLocation);

