import { getActiveAirspaceMap, setAirspaceBoundaryIds } from '../map/VietnamKmlAirspaceControls';
import { logger } from '../../utils/Logger';

interface BoundaryIndex {
  ACC: {
    [subcat: string]: {
      [name: string]: string[];
    };
  };
  TMA: {
    [name: string]: string[];
  };
  CTR: {
    [name: string]: string[];
  };
}

export class BoundariesModal {
    private modalElement: HTMLElement | null = null;
    private initialized = false;
    private boundaryIndex: BoundaryIndex | null = null;
    private checkedIds: Set<string> = new Set();
    private showSelectedOnly: boolean = false;

    // DOM Elements
    private typeSelect!: HTMLSelectElement;
    private searchInput!: HTMLInputElement;
    private listContainer!: HTMLElement;

    constructor() {
        try {
            const saved = localStorage.getItem('webfts_checked_boundaries');
            if (saved) {
                const parsed = JSON.parse(saved) as string[];
                this.checkedIds = new Set(parsed);
            } else {
                this.checkedIds = new Set([
                    'VATM_000587', 'VATM_000588', 'VATM_000589', 'VATM_000590', 'VATM_000591',
                    'VATM_000592', 'VATM_000593', 'VATM_000594', 'VATM_000595', 'VATM_000596',
                    'VATM_000597', 'VATM_000598', 'VATM_000599', 'VATM_000600', 'VATM_000601',
                    'VATM_000602', 'VATM_000603', 'VATM_000604', 'VATM_000605', 'VATM_000606',
                    'VATM_000607', 'VATM_000608'
                ]);
            }
        } catch (e) {
            logger.error('BoundariesModal', 'Failed to load checked boundaries from localStorage', e);
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

    private createDOM() {
        this.modalElement = document.createElement('div');
        this.modalElement.className = 'boundaries-modal';
        this.modalElement.style.cssText = `
            position: fixed; top: 120px; left: 370px; width: 360px; max-height: 80vh;
            background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 8px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            display: none; flex-direction: column; z-index: 1000; color: #cbd5e1;
            font-family: system-ui, sans-serif; overflow: hidden; backdrop-filter: blur(8px);
        `;

        const header = document.createElement('div');
        header.className = 'boundaries-modal-header';
        header.style.cssText = `
            padding: 10px 12px; background: rgba(30, 41, 59, 0.8); cursor: move;
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid rgba(148, 163, 184, 0.2); user-select: none;
        `;
        const title = document.createElement('div');
        title.innerHTML = '<b>🛰️ Boundaries Manager</b>';
        title.style.fontSize = '13px';
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px;';
        closeBtn.onpointerdown = (e) => e.stopPropagation();
        closeBtn.onclick = () => this.close();
        header.appendChild(title);
        header.appendChild(closeBtn);

        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'padding: 10px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid rgba(148, 163, 184, 0.1);';

        const filterRow = document.createElement('div');
        filterRow.style.cssText = 'display: flex; gap: 8px;';

        this.typeSelect = document.createElement('select');
        this.typeSelect.style.cssText = 'flex: 1; padding: 6px; background: #0f172a; color: #fff; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; font-size: 12px;';
        this.typeSelect.innerHTML = `
            <option value="ALL">All Types</option>
            <option value="ACC">ACC (Đường dài)</option>
            <option value="TMA">TMA (Tiếp cận)</option>
            <option value="CTR">CTR (Khu vực sân bay)</option>
        `;
        this.typeSelect.onchange = () => this.renderList();

        filterRow.appendChild(this.typeSelect);

        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.placeholder = 'Search boundaries...';
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
        btnShowSelected.onclick = () => {
            this.showSelectedOnly = !this.showSelectedOnly;
            btnShowSelected.style.background = this.showSelectedOnly ? 'rgba(167, 139, 250, 0.3)' : '';
            this.renderList();
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
        const header = this.modalElement.querySelector('.boundaries-modal-header') as HTMLElement;
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
            const res = await fetch('/static/data/vatm_kmz/airspace_index.json');
            if (res.ok) {
                this.boundaryIndex = await res.json();
            }
        } catch (e) {
            logger.error('BoundariesModal', 'Failed to load airspace_index.json', e);
        }
    }

    private saveCheckedIds() {
        try {
            localStorage.setItem('webfts_checked_boundaries', JSON.stringify(Array.from(this.checkedIds)));
        } catch (e) {
            logger.error('BoundariesModal', 'Failed to save checked boundaries to localStorage', e);
        }
    }

    private createCheckboxItem(name: string, ids: string[], query: string): HTMLElement | null {
        const isChecked = ids.some(id => this.checkedIds.has(id));

        if (this.showSelectedOnly && !isChecked) return null;
        if (query && !name.toLowerCase().includes(query)) return null;

        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex; align-items:flex-start; gap:6px; font-size: 11px; color: #94a3b8; cursor: pointer; padding: 2px 0; user-select: none;';
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = isChecked;
        cb.className = 'bound-item-checkbox';
        cb.dataset.ids = JSON.stringify(ids);
        cb.style.cssText = 'margin: 1px 0 0 0; accent-color: #a78bfa;';
        
        cb.onchange = () => {
            if (cb.checked) {
                ids.forEach(id => this.checkedIds.add(id));
            } else {
                ids.forEach(id => this.checkedIds.delete(id));
            }
            this.saveCheckedIds();
            this.updateMap();
        };

        const span = document.createElement('span');
        span.innerText = name;
        
        lbl.appendChild(cb);
        lbl.appendChild(span);
        return lbl;
    }

    private createGroupHeader(titleText: string, color: string, fontSize: string, allIds: string[]): HTMLElement {
        const lbl = document.createElement('label');
        lbl.style.cssText = `display:flex; align-items:center; gap:6px; font-weight: 600; font-size: ${fontSize}; color: ${color}; padding: 4px 0; border-bottom: 1px solid rgba(148,163,184,0.1); margin-bottom: 4px; cursor: pointer; user-select: none;`;
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        
        const allChecked = allIds.length > 0 && allIds.every(id => this.checkedIds.has(id));
        const someChecked = allIds.some(id => this.checkedIds.has(id));
        cb.checked = allChecked;
        if (someChecked && !allChecked) {
            cb.indeterminate = true;
        }
        cb.style.cssText = 'margin: 0; accent-color: #a78bfa;';
        
        cb.onchange = () => {
            const willCheck = cb.checked;
            if (willCheck) {
                allIds.forEach(id => this.checkedIds.add(id));
            } else {
                allIds.forEach(id => this.checkedIds.delete(id));
            }
            this.saveCheckedIds();
            this.updateMap();
            
            const scroll = this.listContainer.scrollTop;
            this.renderList();
            this.listContainer.scrollTop = scroll;
        };

        const span = document.createElement('span');
        span.innerText = titleText;
        
        lbl.appendChild(cb);
        lbl.appendChild(span);
        return lbl;
    }

    private renderList() {
        if (!this.boundaryIndex || !this.listContainer) return;
        this.listContainer.innerHTML = '';

        const selType = this.typeSelect.value;
        const query = this.searchInput.value.toLowerCase().trim();

        const types: Array<'ACC'|'TMA'|'CTR'> = selType === 'ALL' 
            ? ['ACC', 'TMA', 'CTR'] 
            : [selType as any];

        let totalRendered = 0;

        types.forEach(type => {
            const typeData = this.boundaryIndex![type];
            if (!typeData) return;

            const typeDiv = document.createElement('div');
            typeDiv.style.marginBottom = '8px';
            
            let typeHasItems = false;
            let typeAllIds: string[] = [];

            if (type === 'ACC') {
                const accData = typeData as any;
                const subcats = Object.keys(accData).sort();
                
                subcats.forEach(sub => {
                    const subSec = accData[sub];
                    const subNames = Object.keys(subSec).sort();
                    
                    const subDiv = document.createElement('div');
                    subDiv.style.marginLeft = '8px';
                    subDiv.style.marginBottom = '6px';
                    
                    let subHasItems = false;
                    let subAllIds: string[] = [];

                    const childrenContainer = document.createElement('div');

                    subNames.forEach(name => {
                        const ids = subSec[name];
                        const item = this.createCheckboxItem(name, ids, query);
                        if (item) {
                            childrenContainer.appendChild(item);
                            subAllIds.push(...ids);
                            subHasItems = true;
                        }
                    });

                    if (subHasItems) {
                        const subHeader = this.createGroupHeader(sub, '#cbd5e1', '12px', subAllIds);
                        subHeader.style.fontWeight = '500';
                        subDiv.appendChild(subHeader);
                        subDiv.appendChild(childrenContainer);
                        
                        typeDiv.appendChild(subDiv);
                        typeAllIds.push(...subAllIds);
                        typeHasItems = true;
                    }
                });

            } else {
                // TMA and CTR
                const tmaCtrData = typeData as { [name: string]: string[] };
                const names = Object.keys(tmaCtrData).sort();
                
                const childrenContainer = document.createElement('div');

                names.forEach(name => {
                    const ids = tmaCtrData[name];
                    const item = this.createCheckboxItem(name, ids, query);
                    if (item) {
                        childrenContainer.appendChild(item);
                        typeAllIds.push(...ids);
                        typeHasItems = true;
                    }
                });
                
                if (typeHasItems) {
                    typeDiv.appendChild(childrenContainer);
                }
            }

            if (typeHasItems) {
                const typeHeader = this.createGroupHeader(`🛰️ ${type} Boundaries`, '#a78bfa', '13px', typeAllIds);
                typeDiv.insertBefore(typeHeader, typeDiv.firstChild);
                this.listContainer.appendChild(typeDiv);
                totalRendered++;
            }

        });

        if (totalRendered === 0) {
            this.listContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: #64748b; font-size: 12px;">No boundaries found.</div>';
        }
    }

    private bulkAction(action: 'selectVisible' | 'clearAll') {
        if (action === 'clearAll') {
            this.checkedIds.clear();
        } else if (action === 'selectVisible') {
            const checkboxes = this.listContainer.querySelectorAll('.bound-item-checkbox') as NodeListOf<HTMLInputElement>;
            checkboxes.forEach(cb => {
                cb.checked = true;
                const ids = JSON.parse(cb.dataset.ids || '[]');
                ids.forEach((id: string) => this.checkedIds.add(id));
            });
        }
        
        this.saveCheckedIds();
        this.renderList();
        this.updateMap();
    }

    private updateMap() {
        const map = getActiveAirspaceMap();
        console.log('[BoundariesModal] updateMap called, map=', map, 'checkedIds=', Array.from(this.checkedIds));
        if (map) {
            setAirspaceBoundaryIds(map, Array.from(this.checkedIds));
        } else {
            console.warn('[BoundariesModal] updateMap: no active map instance!');
        }
    }
}

export const boundariesModal = new BoundariesModal();
