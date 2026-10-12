import { getActiveAirspaceMap } from '../map/VietnamKmlAirspaceControls';
import { setAerodromeLayoutIds, getActiveAerodromeLayoutIds } from '../map/AerodromeLayoutLayer';

export class AerodromeLayoutModal {
    private modalElement: HTMLElement | null = null;
    private initialized = false;
    private listContainer!: HTMLElement;
    private searchInput!: HTMLInputElement;
    private airports: any[] = [];
    private checkedIds: Set<string> = new Set();

    public async open() {
        if (!this.initialized) {
            await this.init();
        }
        if (this.modalElement) {
            // Restore from current active state just in case it changed externally
            this.checkedIds = new Set(getActiveAerodromeLayoutIds());
            this.modalElement.style.display = 'flex';
            this.renderList();
        }
    }

    public close() {
        if (this.modalElement) {
            this.modalElement.style.display = 'none';
        }
    }

    private async init() {
        // Load initial state from local storage
        try {
            const saved = localStorage.getItem('webfts_checked_aerodrome_layouts');
            if (saved) {
                const arr = JSON.parse(saved);
                if (Array.isArray(arr)) {
                    this.checkedIds = new Set(arr);
                }
            } else {
                this.checkedIds = new Set(['VVNB', 'VVTS', 'VVDN']);
            }
        } catch (e) {
            console.error("Failed to parse saved layout ids", e);
        }

        this.createDOM();
        await this.loadData();
        this.makeDraggable();
        this.initialized = true;
    }

    private createDOM() {
        this.modalElement = document.createElement('div');
        this.modalElement.className = 'aerodrome-layout-modal';
        this.modalElement.style.cssText = `
            position: fixed; top: 120px; right: 20px; width: 320px; max-height: 70vh;
            background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(56, 189, 248, 0.3);
            border-radius: 8px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            display: none; flex-direction: column; z-index: 1000; color: #cbd5e1;
            font-family: system-ui, sans-serif; overflow: hidden; backdrop-filter: blur(8px);
        `;

        const header = document.createElement('div');
        header.className = 'aerodrome-layout-header';
        header.style.cssText = `
            padding: 10px 12px; background: rgba(30, 41, 59, 0.8); cursor: move;
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid rgba(56, 189, 248, 0.2); user-select: none;
        `;
        const title = document.createElement('div');
        title.innerHTML = '<b>✈️ Sơ đồ mặt đất (Multi-select)</b>';
        title.style.fontSize = '13px';
        title.style.color = '#38bdf8';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px;';
        closeBtn.onpointerdown = (e) => {
            e.stopPropagation();
            this.close();
        };
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.close();
        };
        
        header.appendChild(title);
        header.appendChild(closeBtn);

        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'padding: 10px; border-bottom: 1px solid rgba(148, 163, 184, 0.1);';

        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.placeholder = 'Tìm sân bay (VD: VVTS, Noi Bai)...';
        this.searchInput.style.cssText = 'width: 100%; padding: 6px 8px; margin-bottom: 8px; background: #0f172a; color: #fff; border: 1px solid rgba(148,163,184,0.3); border-radius: 4px; font-size: 12px; box-sizing: border-box;';
        this.searchInput.oninput = () => this.renderList();
        
        const actionsRow = document.createElement('div');
        actionsRow.style.cssText = 'display: flex; gap: 8px;';
        
        const selectAllBtn = document.createElement('button');
        selectAllBtn.textContent = 'Chọn tất cả';
        selectAllBtn.style.cssText = 'flex: 1; padding: 4px; background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 4px; color: #38bdf8; font-size: 11px; cursor: pointer;';
        selectAllBtn.onclick = () => {
            this.airports.forEach(apt => this.checkedIds.add(apt.icao));
            this.updateMapAndStorage();
            this.renderList();
        };

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Bỏ chọn';
        clearBtn.style.cssText = 'flex: 1; padding: 4px; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 4px; color: #ef4444; font-size: 11px; cursor: pointer;';
        clearBtn.onclick = () => {
            this.checkedIds.clear();
            this.updateMapAndStorage();
            this.renderList();
        };

        actionsRow.appendChild(selectAllBtn);
        actionsRow.appendChild(clearBtn);

        toolbar.appendChild(this.searchInput);
        toolbar.appendChild(actionsRow);

        this.listContainer = document.createElement('div');
        this.listContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px; max-height: 350px;';

        this.modalElement.appendChild(header);
        this.modalElement.appendChild(toolbar);
        this.modalElement.appendChild(this.listContainer);
        document.body.appendChild(this.modalElement);
    }

    private makeDraggable() {
        if (!this.modalElement) return;
        const header = this.modalElement.querySelector('.aerodrome-layout-header') as HTMLElement;
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
            this.modalElement!.style.right = 'auto';
        };

        header.onpointerup = (e: PointerEvent) => {
            isDragging = false;
            header.releasePointerCapture(e.pointerId);
        };
    }

    private async loadData() {
        try {
            // Get active dataset
            const activeRes = await fetch('/api/aerodrome-layout/active');
            if (!activeRes.ok) return;
            const activeData = await activeRes.json();
            
            if (!activeData.activeDatasetId) {
                this.listContainer.innerHTML = '<div style="color:#ef4444; font-size:12px; text-align:center; padding:10px;">Chưa có dataset nào được kích hoạt.</div>';
                return;
            }

            // Get airports
            const aptRes = await fetch(`/api/aerodrome-layout/datasets/${activeData.activeDatasetId}/airports`);
            if (!aptRes.ok) return;
            this.airports = await aptRes.json();
            this.renderList();
        } catch (e) {
            console.error("Failed to load aerodrome layout metadata", e);
        }
    }

    private updateMapAndStorage() {
        const arr = Array.from(this.checkedIds);
        localStorage.setItem('webfts_checked_aerodrome_layouts', JSON.stringify(arr));
        const map = getActiveAirspaceMap();
        if (map) {
            setAerodromeLayoutIds(map, arr);
        }
    }

    private renderList() {
        if (!this.listContainer) return;
        this.listContainer.innerHTML = '';

        if (this.airports.length === 0) {
            this.listContainer.innerHTML = '<div style="color:#64748b; font-size:12px; text-align:center; padding:10px;">Không có dữ liệu sân bay.</div>';
            return;
        }

        const query = this.searchInput.value.toLowerCase().trim();
        const filtered = this.airports.filter(apt => 
            (apt.icao && apt.icao.toLowerCase().includes(query)) ||
            (apt.name && apt.name.toLowerCase().includes(query))
        ).sort((a, b) => {
            // Sort checked items first
            const aChecked = this.checkedIds.has(a.icao) ? -1 : 1;
            const bChecked = this.checkedIds.has(b.icao) ? -1 : 1;
            if (aChecked !== bChecked) return aChecked - bChecked;
            return a.icao.localeCompare(b.icao);
        });

        filtered.forEach(apt => {
            const row = document.createElement('label');
            row.style.cssText = `
                padding: 6px 8px; margin-bottom: 4px; background: rgba(30, 41, 59, 0.5);
                border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 4px;
                cursor: pointer; display: flex; align-items: center; gap: 8px;
                transition: background 0.2s; user-select: none;
            `;
            
            const isChecked = this.checkedIds.has(apt.icao);
            if (isChecked) {
                row.style.background = 'rgba(56, 189, 248, 0.15)';
                row.style.borderColor = 'rgba(56, 189, 248, 0.4)';
            }
            
            row.onmouseover = () => {
                if (!this.checkedIds.has(apt.icao)) row.style.background = 'rgba(255, 255, 255, 0.05)';
            };
            row.onmouseout = () => {
                if (!this.checkedIds.has(apt.icao)) row.style.background = 'rgba(30, 41, 59, 0.5)';
            };

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = isChecked;
            checkbox.style.cursor = 'pointer';
            checkbox.onchange = (e) => {
                if (checkbox.checked) {
                    this.checkedIds.add(apt.icao);
                } else {
                    this.checkedIds.delete(apt.icao);
                }
                this.updateMapAndStorage();
                
                if (checkbox.checked) {
                    row.style.background = 'rgba(56, 189, 248, 0.15)';
                    row.style.borderColor = 'rgba(56, 189, 248, 0.4)';
                } else {
                    row.style.background = 'rgba(30, 41, 59, 0.5)';
                    row.style.borderColor = 'rgba(148, 163, 184, 0.1)';
                }
            };

            const textContainer = document.createElement('div');
            textContainer.style.cssText = 'display: flex; flex-direction: column; flex: 1;';
            
            const icaoLabel = document.createElement('span');
            icaoLabel.innerHTML = `<b>${apt.icao}</b>`;
            icaoLabel.style.color = isChecked ? '#38bdf8' : '#e2e8f0';
            icaoLabel.style.fontSize = '13px';
            
            const nameLabel = document.createElement('span');
            nameLabel.innerText = apt.name || '';
            nameLabel.style.fontSize = '11px';
            nameLabel.style.color = '#94a3b8';

            textContainer.appendChild(icaoLabel);
            textContainer.appendChild(nameLabel);

            row.appendChild(checkbox);
            row.appendChild(textContainer);

            this.listContainer.appendChild(row);
        });

        if (filtered.length === 0) {
            this.listContainer.innerHTML = '<div style="color:#64748b; font-size:12px; text-align:center; padding:10px;">Không tìm thấy sân bay.</div>';
        }
    }
}

export const aerodromeLayoutModal = new AerodromeLayoutModal();
