const STORAGE_KEY_BASE = "bevcost_demo_";

const columns = [
  { data: "item", type: "text" },
  { data: "unit_cost", type: "numeric", numericFormat: { pattern: '0,0.00' } },
  { data: "qty", type: "numeric", numericFormat: { pattern: '0,0.[000]' } },
  { data: "total", type: "numeric", readOnly: true, numericFormat: { pattern: '0,0.00' } },
];

const colHeaders = ["Item", "Unit Cost", "Qty", "Total ($)"];

function calcRow(row) {
  const cost = parseFloat(row.unit_cost ?? 0) || 0;
  const qty  = parseFloat(row.qty ?? 0) || 0;
  return parseFloat((cost * qty).toFixed(2));
}

function recalcAll(data) {
  return (data || []).map(r => ({ ...r, total: calcRow(r) }));
}

function getStorageKey(locationId) {
  return STORAGE_KEY_BASE + locationId;
}

function loadData(locationId) {
  const raw = localStorage.getItem(getStorageKey(locationId));
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveData(locationId, data) {
  localStorage.setItem(getStorageKey(locationId), JSON.stringify(recalcAll(data)));
}

function createExampleRows() {
  return recalcAll([
    { item: "Vodka 750ml", unit_cost: 14.75, qty: 6 },
    { item: "Lime Juice 32oz", unit_cost: 4.76, qty: 3 },
    { item: "Oranges (100ct)", unit_cost: 52.50, qty: 1 },
  ]);
}

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
      // Recalculate totals if unit_cost or qty changed
      for (const [row, prop] of changes.map(c => [c[0], c[1]])) {
        if (prop === "unit_cost" || prop === "qty") {
          const r = data[row];
          r.total = calcRow(r);
        }
      }
      // Sync the rendered data
      hot.loadData(data);
    }
  });
}

function switchLocation(newLoc) {
  // Save current before switching
  saveData(currentLocation, hot.getSourceData());
  currentLocation = newLoc;
  initGrid(currentLocation);
}

locationSelect.addEventListener("change", e => switchLocation(e.target.value));

addRowBtn.addEventListener("click", () => {
  hot.alter("insert_row", hot.countRows());
});

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
