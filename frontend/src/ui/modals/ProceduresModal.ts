import { getActiveAirspaceMap, setProcedureIds } from '../map/VietnamKmlAirspaceControls';
import { logger } from '../../utils/Logger';

interface ProceduresIndex {
  [airport: string]: {
    SID: { [name: string]: string[] };
    STAR: { [name: string]: string[] };
    IAP: { [name: string]: string[] };
    HOLDING: { [name: string]: string[] };
  };
}

export class ProceduresModal {
    private modalElement: HTMLElement | null = null;
    private initialized = false;
    private proceduresIndex: ProceduresIndex | null = null;
    private checkedIds: Set<string> = new Set();

    // DOM Elements
    private airportSelect!: HTMLSelectElement;
    private typeSelect!: HTMLSelectElement;
    private searchInput!: HTMLInputElement;
    private listContainer!: HTMLElement;

    constructor() {
        try {
            const savedIds = localStorage.getItem('webfts_checked_procedures');
            if (savedIds) {
                const parsed = JSON.parse(savedIds) as string[];
                this.checkedIds = new Set(parsed);
            }
        } catch (e) {
            logger.error('ProceduresModal', 'Failed to load checked procedures from localStorage', e);
        }
    }

    public async open() {
        if (!this.initialized) {
            await this.init();
        }
        if (this.modalElement) {
            this.modalElement.style.display = 'flex';
        }
    }

    public close() {
        if (this.modalElement) {
            this.modalElement.style.display = 'none';
        }
    }

    private async init() {
        this.createDOM();
        await this.loadData();
        this.renderList();
        this.makeDraggable();
        this.initialized = true;
    }

    private saveState() {
        try {
            localStorage.setItem('webfts_checked_procedures', JSON.stringify(Array.from(this.checkedIds)));
            if (this.airportSelect) {
                localStorage.setItem('webfts_selected_airport', this.airportSelect.value);
            }
        } catch (e) {
            logger.error('ProceduresModal', 'Failed to save procedures state to localStorage', e);
        }
    }

    private createDOM() {
        this.modalElement = document.createElement('div');
        this.modalElement.className = 'procedures-modal';
        this.modalElement.style.cssText = `
            position: fixed; top: 100px; left: 350px; width: 360px; max-height: 80vh;
            background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 8px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            display: none; flex-direction: column; z-index: 1000; color: #cbd5e1;
            font-family: system-ui, sans-serif; overflow: hidden; backdrop-filter: blur(8px);
        `;

        const header = document.createElement('div');
        header.className = 'procedures-modal-header';
        header.style.cssText = `
            padding: 10px 12px; background: rgba(30, 41, 59, 0.8); cursor: move;
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid rgba(148, 163, 184, 0.2); user-select: none;
        `;
        const title = document.createElement('div');
        title.innerHTML = '<b>🛫 Procedures Manager</b>';
        title.style.fontSize = '13px';
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px;';
        closeBtn.onpointerdown = (e) => e.stopPropagation(); // Prevent dragging when clicking close
        closeBtn.onclick = () => this.close();
        header.appendChild(title);
        header.appendChild(closeBtn);

        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'padding: 10px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid rgba(148, 163, 184, 0.1);';

        const filterRow = document.createElement('div');
        filterRow.style.cssText = 'display: flex; gap: 8px;';

        this.airportSelect = document.createElement('select');
        this.airportSelect.style.cssText = 'flex: 1; padding: 6px; background: #0f172a; color: #fff; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; font-size: 12px;';
        this.airportSelect.innerHTML = '<option value="ALL">All Airports</option>';
        this.airportSelect.onchange = () => {
            this.saveState();
            this.renderList();
        };

        this.typeSelect = document.createElement('select');
        this.typeSelect.style.cssText = 'flex: 1; padding: 6px; background: #0f172a; color: #fff; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; font-size: 12px;';
        this.typeSelect.innerHTML = `
            <option value="ALL">All Types</option>
            <option value="SID">SID (Departure)</option>
            <option value="STAR">STAR (Arrival)</option>
            <option value="IAP">IAP (Approach)</option>
            <option value="HOLDING">Holding</option>
        `;
        this.typeSelect.onchange = () => this.renderList();

        filterRow.appendChild(this.airportSelect);
        filterRow.appendChild(this.typeSelect);

        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.placeholder = 'Search procedures...';
        this.searchInput.style.cssText = 'width: 100%; padding: 6px 8px; background: #0f172a; color: #fff; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; font-size: 12px; box-sizing: border-box;';
        this.searchInput.oninput = () => this.renderList();

        toolbar.appendChild(filterRow);
        toolbar.appendChild(this.searchInput);

        this.listContainer = document.createElement('div');
        this.listContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px; max-height: 400px;';

        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 8px; border-top: 1px solid rgba(148, 163, 184, 0.1); display: flex; gap: 6px; background: rgba(30, 41, 59, 0.5);';
        
        const btnSelectVisible = document.createElement('button');
        btnSelectVisible.innerText = 'Select visible';
        btnSelectVisible.className = 'nav-btn';
        btnSelectVisible.style.cssText = 'flex: 1; font-size: 11px; padding: 4px; cursor: pointer;';
        btnSelectVisible.onclick = () => this.bulkAction('selectVisible');
        
        const btnClearAll = document.createElement('button');
        btnClearAll.innerText = 'Clear all';
        btnClearAll.className = 'nav-btn';
        btnClearAll.style.cssText = 'flex: 1; font-size: 11px; padding: 4px; cursor: pointer;';
        btnClearAll.onclick = () => this.bulkAction('clearAll');
        
        const btnShowSelected = document.createElement('button');
        btnShowSelected.innerText = 'Show selected';
        btnShowSelected.className = 'nav-btn';
        btnShowSelected.style.cssText = 'flex: 1; font-size: 11px; padding: 4px; cursor: pointer;';
        let showSelectedOnly = false;
        btnShowSelected.onclick = () => {
            showSelectedOnly = !showSelectedOnly;
            btnShowSelected.style.background = showSelectedOnly ? 'rgba(56, 189, 248, 0.3)' : '';
            this.renderList(showSelectedOnly);
        };

        footer.appendChild(btnSelectVisible);
        footer.appendChild(btnClearAll);
        footer.appendChild(btnShowSelected);

        this.modalElement.appendChild(header);
        this.modalElement.appendChild(toolbar);
        this.modalElement.appendChild(this.listContainer);
        this.modalElement.appendChild(footer);
        document.body.appendChild(this.modalElement);
    }

    private makeDraggable() {
        if (!this.modalElement) return;
        const header = this.modalElement.querySelector('.procedures-modal-header') as HTMLElement;
        let isDragging = false;
        let startX: number, startY: number, initialLeft: number, initialTop: number;

        header.onpointerdown = (e: PointerEvent) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = this.modalElement!.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            header.setPointerCapture(e.pointerId);
        };

        header.onpointermove = (e: PointerEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            this.modalElement!.style.left = `${initialLeft + dx}px`;
            this.modalElement!.style.top = `${initialTop + dy}px`;
        };

        header.onpointerup = (e: PointerEvent) => {
            isDragging = false;
            header.releasePointerCapture(e.pointerId);
        };
    }

    private async loadData() {
        try {
            const res = await fetch(`/static/data/vatm_kmz/procedures_index.json?v=${Date.now()}`);
            if (res.ok) {
                this.proceduresIndex = await res.json();
                const airports = Object.keys(this.proceduresIndex || {}).sort();
                airports.forEach(apt => {
                    const opt = document.createElement('option');
                    opt.value = apt;
                    opt.innerText = apt;
                    this.airportSelect.appendChild(opt);
                });

                // Load saved airport selection
                const savedAirport = localStorage.getItem('webfts_selected_airport');
                if (savedAirport && this.airportSelect) {
                    this.airportSelect.value = savedAirport;
                }

                this.pruneStaleCheckedIds();
            }
        } catch (e) {
            logger.error('ProceduresModal', 'Failed to load procedures_index.json', e);
        }
    }

    // Persisted checkedIds are raw feature ids, saved independently of the
    // index. If procedures_index.json is later rebuilt (e.g. to drop
    // chart-annotation features like "Controlling obstacle" markers, or to
    // rename/regroup a procedure), an id a user previously checked can still
    // exist in the underlying .geojson and keep rendering on the map even
    // though it's no longer reachable through any checkbox -- because
    // setProcedureIds() filters by raw id, not by current index membership.
    // Drop anything not present in the freshly loaded index so a stale
    // browser-side selection can't outlive the data it came from.
    private pruneStaleCheckedIds() {
        if (!this.proceduresIndex || this.checkedIds.size === 0) return;

        const validIds = new Set<string>();
        Object.values(this.proceduresIndex).forEach(aptData => {
            (['SID', 'STAR', 'IAP', 'HOLDING'] as const).forEach(type => {
                Object.values(aptData[type] || {}).forEach(ids => {
                    ids.forEach(id => validIds.add(id));
                });
            });
        });

        const before = this.checkedIds.size;
        this.checkedIds.forEach(id => {
            if (!validIds.has(id)) {
                this.checkedIds.delete(id);
            }
        });

        if (this.checkedIds.size !== before) {
            this.saveState();
            this.updateMap();
        }
    }

    private renderList(showSelectedOnly: boolean = false) {
        if (!this.proceduresIndex || !this.listContainer) return;
        this.listContainer.innerHTML = '';

        const selAirport = this.airportSelect.value;
        const selType = this.typeSelect.value;
        const query = this.searchInput.value.toLowerCase().trim();

        const airports = selAirport === 'ALL' ? Object.keys(this.proceduresIndex).sort() : [selAirport];

        const types: Array<'SID'|'STAR'|'IAP'|'HOLDING'> = selType === 'ALL' 
            ? ['SID', 'STAR', 'IAP', 'HOLDING'] 
            : [selType as any];

        let totalRendered = 0;

        airports.forEach(apt => {
            const aptData = this.proceduresIndex![apt];
            if (!aptData) return;

            let aptHasItems = false;
            const aptDiv = document.createElement('div');
            aptDiv.style.marginBottom = '6px';
            
            const aptTitle = document.createElement('div');
            aptTitle.style.cssText = 'font-weight: 600; font-size: 13px; color: #38bdf8; padding: 4px 0; border-bottom: 1px solid rgba(148,163,184,0.1); margin-bottom: 4px;';
            aptTitle.innerText = `🏢 ${apt}`;
            aptDiv.appendChild(aptTitle);

            types.forEach(type => {
                const procDict = aptData[type];
                if (!procDict) return;

                const procNames = Object.keys(procDict).sort();
                let typeHasItems = false;
                
                const typeDiv = document.createElement('div');
                typeDiv.style.marginLeft = '12px';
                typeDiv.style.marginBottom = '4px';

                const typeTitle = document.createElement('div');
                typeTitle.style.cssText = 'font-weight: 500; font-size: 11px; color: #cbd5e1; padding: 2px 0;';
                typeTitle.innerText = type;
                typeDiv.appendChild(typeTitle);

                procNames.forEach(pName => {
                    const ids = procDict[pName];
                    const isChecked = ids.some(id => this.checkedIds.has(id));

                    if (showSelectedOnly && !isChecked) return;
                    if (query && !pName.toLowerCase().includes(query)) return;

                    typeHasItems = true;
                    aptHasItems = true;
                    totalRendered++;

                    const lbl = document.createElement('label');
                    lbl.style.cssText = 'display:flex; align-items:flex-start; gap:6px; font-size: 11px; color: #94a3b8; cursor: pointer; padding: 2px 0; user-select: none;';
                    
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.checked = isChecked;
                    cb.className = 'proc-item-checkbox';
                    cb.dataset.ids = JSON.stringify(ids);
                    cb.style.cssText = 'margin: 1px 0 0 0; accent-color: #38bdf8;';
                    
                    cb.onchange = () => {
                        if (cb.checked) {
                            ids.forEach(id => this.checkedIds.add(id));
                        } else {
                            ids.forEach(id => this.checkedIds.delete(id));
                        }
                        this.saveState();
                        this.updateMap();
                    };

                    const span = document.createElement('span');
                    span.innerText = pName;
                    
                    lbl.appendChild(cb);
                    lbl.appendChild(span);
                    typeDiv.appendChild(lbl);
                });

                if (typeHasItems) {
                    aptDiv.appendChild(typeDiv);
                }
            });

            if (aptHasItems) {
                this.listContainer.appendChild(aptDiv);
            }
        });

        if (totalRendered === 0) {
            this.listContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: #64748b; font-size: 12px;">No procedures found.</div>';
        }
    }

    private bulkAction(action: 'selectVisible' | 'clearAll') {
        if (action === 'clearAll') {
            this.checkedIds.clear();
        } else if (action === 'selectVisible') {
            const checkboxes = this.listContainer.querySelectorAll('.proc-item-checkbox') as NodeListOf<HTMLInputElement>;
            checkboxes.forEach(cb => {
                cb.checked = true;
                const ids = JSON.parse(cb.dataset.ids || '[]');
                ids.forEach((id: string) => this.checkedIds.add(id));
            });
        }
        
        this.saveState();
        this.renderList();
        this.updateMap();
    }

    private updateMap() {
        const map = getActiveAirspaceMap();
        if (map) {
            setProcedureIds(map, Array.from(this.checkedIds));
        }
    }
}

export const proceduresModal = new ProceduresModal();
