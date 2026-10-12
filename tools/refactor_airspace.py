import os
import re

frontend_dir = os.path.join(os.getcwd(), 'frontend', 'src')
airspace_panel_path = os.path.join(frontend_dir, 'ui', 'panels', 'left', 'AirspaceDataPanel.ts')
kml_controls_path = os.path.join(frontend_dir, 'ui', 'map', 'VietnamKmlAirspaceControls.ts')

# 1. Update AirspaceDataPanel.ts
with open(airspace_panel_path, 'r', encoding='utf-8') as f:
    panel_content = f.read()

# Remove Holdings and Procedures rendering from renderTree
panel_content = re.sub(
    r'    // 1\. Render Holdings Section.*?// 3\. Render ACC',
    r'    // 1. Render ACC',
    panel_content,
    flags=re.DOTALL
)

# Remove the actual methods
panel_content = re.sub(
    r'  private renderHoldingsNode.*?private renderBoundariesNode',
    r'  private renderBoundariesNode',
    panel_content,
    flags=re.DOTALL
)

# Insert the "Procedures" button right before the tree container in the constructor/init
# Actually, it's better to add it to index.html or create it dynamically in AirspaceDataPanel
# Let's add it dynamically in onInit
on_init_insert = """
    // Add Procedures Modal button
    const procBtn = document.createElement('button');
    procBtn.id = 'btn-procedures-modal';
    procBtn.className = 'nav-btn';
    procBtn.style.cssText = 'width: 100%; margin-bottom: 8px; font-weight: bold; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);';
    procBtn.innerHTML = '🛫 Procedures Manager';
    if (this.treeContainer && this.treeContainer.parentElement) {
        this.treeContainer.parentElement.insertBefore(procBtn, this.treeContainer.parentElement.firstChild);
    }
    this.addEventListener(procBtn, 'click', () => {
        import('../../modals/ProceduresModal').then(m => {
            m.proceduresModal.open();
        });
    });
"""
panel_content = panel_content.replace('// Attach search handlers', on_init_insert + '\n    // Attach search handlers')

with open(airspace_panel_path, 'w', encoding='utf-8') as f:
    f.write(panel_content)

# 2. Update VietnamKmlAirspaceControls.ts
with open(kml_controls_path, 'r', encoding='utf-8') as f:
    kml_content = f.read()

# Replace setupDynamicProcedureAndHoldingLayers
new_setup = """
async function setupDynamicProcedureAndHoldingLayers(map: maplibregl.Map): Promise<void> {
  let airports = ['VVTS', 'VVNB', 'VVDN'];
  try {
    const res = await fetch('/static/data/vatm_kmz/procedures_index.json');
    if (res.ok) {
        const data = await res.json();
        airports = Object.keys(data);
    }
  } catch(e) {
    console.error("Failed to fetch procedures index for map layers", e);
  }

  const dynamicSources: {id: string, data: string, type: string}[] = [
    { id: "vatm-kmz-holding", data: "/static/data/vatm_kmz/vatm_holding_areas.geojson", type: "holding" },
    { id: "vatm-kmz-acc-fir", data: "/static/data/vatm_kmz/vatm_acc_fir_sectors.geojson", type: "acc" },
    { id: "vatm-kmz-tma-ctr", data: "/static/data/vatm_kmz/vatm_tma_ctr.geojson", type: "tma" }
  ];

  airports.forEach(apt => {
    dynamicSources.push({
      id: `vatm-kmz-proc-${apt.toLowerCase()}`,
      data: `/static/data/vatm_kmz/procedures_by_airport/vatm_procedures_${apt}.geojson`,
      type: "proc"
    });
  });

  dynamicSources.forEach(src => {
    if (!map.getSource(src.id)) {
      map.addSource(src.id, { type: "geojson", data: src.data });
    }
"""

kml_content = re.sub(
    r'function setupDynamicProcedureAndHoldingLayers.*?dynamicSources\.forEach\(src => \{.*?if \(\!map\.getSource\(src\.id\)\) \{.*?map\.addSource\(src\.id, \{ type: "geojson", data: src\.data \}\);.*?\}',
    new_setup,
    kml_content,
    flags=re.DOTALL
)

# Update updateActiveAirspaceFilters
# The activeIds are passed from either the modal or the sidebar. We need a way to combine them or 
# maintain a global state. Actually, it's better if `updateActiveAirspaceFilters` merges the given activeIds with existing?
# No, let's keep a module-level set of active IDs, or just accept the array and apply it. 
# Wait, if ProceduresModal and AirspaceDataPanel both call updateActiveAirspaceFilters, 
# one will overwrite the other's filters! 
# Let's add a global state in VietnamKmlAirspaceControls.ts
state_inject = """
let globalActiveAirspaceIds: Set<string> = new Set();
let globalActiveProcedureIds: Set<string> = new Set();

export function setAirspaceBoundaryIds(map: maplibregl.Map, ids: string[]): void {
    globalActiveAirspaceIds = new Set(ids);
    applyActiveFilters(map);
}

export function setProcedureIds(map: maplibregl.Map, ids: string[]): void {
    globalActiveProcedureIds = new Set(ids);
    applyActiveFilters(map);
}

export function updateActiveAirspaceFilters(map: maplibregl.Map, activeIds: string[]): void {
    // Legacy support for AirspaceDataPanel which passes boundary IDs here
    setAirspaceBoundaryIds(map, activeIds);
}

function applyActiveFilters(map: maplibregl.Map): void {
  const allActiveIds = [...Array.from(globalActiveAirspaceIds), ...Array.from(globalActiveProcedureIds)];
  
  // We need to know all airport source IDs to update them
  const dynamicSourceIds = [
    "vatm-kmz-holding",
    "vatm-kmz-acc-fir",
    "vatm-kmz-tma-ctr"
  ];
  
  // Find all proc sources dynamically
  const style = map.getStyle();
  if (style && style.sources) {
      Object.keys(style.sources).forEach(src => {
          if (src.startsWith("vatm-kmz-proc-") && !dynamicSourceIds.includes(src)) {
              dynamicSourceIds.push(src);
          }
      });
  }

  const filterExpr = ["in", ["get", "id"], ["literal", allActiveIds]] as any;

  dynamicSourceIds.forEach(srcId => {
"""

kml_content = re.sub(
    r'export function updateActiveAirspaceFilters.*?dynamicSourceIds\.forEach\(srcId => \{',
    state_inject,
    kml_content,
    flags=re.DOTALL
)

with open(kml_controls_path, 'w', encoding='utf-8') as f:
    f.write(kml_content)

print("Refactor complete.")
