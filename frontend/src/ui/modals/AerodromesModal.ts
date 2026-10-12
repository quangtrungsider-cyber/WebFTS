import { getActiveAirspaceMap, setAerodromeIds } from '../map/VietnamKmlAirspaceControls';
import { logger } from '../../utils/Logger';

interface AerodromesIndex {
  [icao: string]: {
    id: string;
    name: string;
    runways: { [designator: string]: string };
  };
}

export class AerodromesModal {
    private modalElement: HTMLElement | null = null;
    private initialized = false;
    private aerodromesIndex: AerodromesIndex | null = null;
    private checkedIds: Set<string> = new Set();

    // DOM Elements
    private searchInput!: HTMLInputElement;
    private listContainer!: HTMLElement;

    constructor() {
        try {
            const savedIds = localStorage.getItem('webfts_checked_aerodromes');
            if (savedIds) {
                const parsed = JSON.parse(savedIds) as string[];
                this.checkedIds = new Set(parsed);
            }
        } catch (e) {
            logger.error('AerodromesModal', 'Failed to load checked aerodromes from localStorage', e);
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
            localStorage.setItem('webfts_checked_aerodromes', JSON.stringify(Array.from(this.checkedIds)));
        } catch (e) {
            logger.error('AerodromesModal', 'Failed to save aerodromes state to localStorage', e);
        }
    }

    private createDOM() {
        this.modalElement = document.createElement('div');
        this.modalElement.className = 'aerodromes-modal';
        this.modalElement.style.cssText = `
            position: fixed; top: 100px; left: 350px; width: 360px; max-height: 80vh;
            background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(250, 204, 21, 0.2);
            border-radius: 8px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            display: none; flex-direction: column; z-index: 1000; color: #cbd5e1;
            font-family: system-ui, sans-serif; overflow: hidden; backdrop-filter: blur(8px);
        `;

        const header = document.createElement('div');
        header.className = 'aerodromes-modal-header';
        header.style.cssText = `
            padding: 10px 12px; background: rgba(30, 41, 59, 0.8); cursor: move;
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid rgba(250, 204, 21, 0.2); user-select: none;
        `;
        const title = document.createElement('div');
        title.innerHTML = '<b>🏢 Cảng Hàng không / Đường băng</b>';
        title.style.fontSize = '13px';
        title.style.color = '#facc15';
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px;';
        closeBtn.onpointerdown = (e) => e.stopPropagation();
        closeBtn.onclick = () => this.close();
        header.appendChild(title);
        header.appendChild(closeBtn);

        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'padding: 10px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid rgba(148, 163, 184, 0.1);';

        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.placeholder = 'Search airport or runway...';
        this.searchInput.style.cssText = 'width: 100%; padding: 6px 8px; background: #0f172a; color: #fff; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; font-size: 12px; box-sizing: border-box;';
        this.searchInput.oninput = () => this.renderList();
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
            btnShowSelected.style.background = showSelectedOnly ? 'rgba(250, 204, 21, 0.3)' : '';
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
        const header = this.modalElement.querySelector('.aerodromes-modal-header') as HTMLElement;
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
            const res = await fetch('/static/data/vatm_kmz/aerodromes_runways_index.json');
            if (res.ok) {
                this.aerodromesIndex = await res.json();
            }
        } catch (e) {
            logger.error('AerodromesModal', 'Failed to load aerodromes_runways_index.json', e);
        }
    }

    private renderList(showSelectedOnly: boolean = false) {
        if (!this.aerodromesIndex || !this.listContainer) return;
        this.listContainer.innerHTML = '';

        const query = this.searchInput.value.toLowerCase().trim();
        const airports = Object.keys(this.aerodromesIndex).sort();

        let totalRendered = 0;

        airports.forEach(apt => {
            const aptData = this.aerodromesIndex![apt];
            if (!aptData) return;

            let aptHasItems = false;
            
            const aptDiv = document.createElement('div');
            aptDiv.style.marginBottom = '6px';
            
            // Airport Header
            const aptTitleLbl = document.createElement('label');
            aptTitleLbl.style.cssText = 'display:flex; align-items:center; gap:6px; font-weight: 600; font-size: 13px; color: #facc15; padding: 4px 0; border-bottom: 1px solid rgba(148,163,184,0.1); margin-bottom: 4px; cursor: pointer;';
            
            const aptCb = document.createElement('input');
            aptCb.type = 'checkbox';
            aptCb.checked = this.checkedIds.has(aptData.id);
            aptCb.className = 'proc-item-checkbox';
            aptCb.dataset.ids = JSON.stringify([aptData.id]);
            aptCb.style.cssText = 'accent-color: #facc15;';
            
            aptCb.onchange = () => {
                if (aptCb.checked) {
                    this.checkedIds.add(aptData.id);
                } else {
                    this.checkedIds.delete(aptData.id);
                }
                this.saveState();
                this.updateMap();
            };

            const aptSpan = document.createElement('span');
            aptSpan.innerText = `🏢 ${apt}`;
            
            aptTitleLbl.appendChild(aptCb);
            aptTitleLbl.appendChild(aptSpan);
            aptDiv.appendChild(aptTitleLbl);

            const searchMatchApt = apt.toLowerCase().includes(query) || aptData.name.toLowerCase().includes(query);
            let showApt = false;
            
            if (showSelectedOnly) {
                if (aptCb.checked) showApt = true;
            } else if (!query || searchMatchApt) {
                showApt = true;
            }

            const runwaysDiv = document.createElement('div');
            runwaysDiv.style.marginLeft = '12px';
            runwaysDiv.style.marginBottom = '4px';

            const runwayKeys = Object.keys(aptData.runways).sort();
            runwayKeys.forEach(rwyName => {
                const rwyId = aptData.runways[rwyName];
                const isChecked = this.checkedIds.has(rwyId);

                const searchMatchRwy = rwyName.toLowerCase().includes(query);
                
                if (showSelectedOnly && !isChecked) return;
                if (query && !searchMatchApt && !searchMatchRwy) return;

                showApt = true;
                aptHasItems = true;
                totalRendered++;

                const lbl = document.createElement('label');
                lbl.style.cssText = 'display:flex; align-items:flex-start; gap:6px; font-size: 11px; color: #cbd5e1; cursor: pointer; padding: 2px 0; user-select: none;';
                
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = isChecked;
                cb.className = 'proc-item-checkbox';
                cb.dataset.ids = JSON.stringify([rwyId]);
                cb.style.cssText = 'margin: 1px 0 0 0; accent-color: #facc15;';
                
                cb.onchange = () => {
                    if (cb.checked) {
                        this.checkedIds.add(rwyId);
                    } else {
                        this.checkedIds.delete(rwyId);
                    }
                    this.saveState();
                    this.updateMap();
                };

                const span = document.createElement('span');
                span.innerText = `🛣️ RWY ${rwyName}`;
                
                lbl.appendChild(cb);
                lbl.appendChild(span);
                runwaysDiv.appendChild(lbl);
            });

            if (runwayKeys.length > 0) {
                aptDiv.appendChild(runwaysDiv);
            }

            if (showApt) {
                if (!aptHasItems) totalRendered++; // count airport header itself
                this.listContainer.appendChild(aptDiv);
            }
        });

        if (totalRendered === 0) {
            this.listContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: #64748b; font-size: 12px;">No aerodromes found.</div>';
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
            setAerodromeIds(map, Array.from(this.checkedIds));
        }
    }
}

export const aerodromesModal = new AerodromesModal();
