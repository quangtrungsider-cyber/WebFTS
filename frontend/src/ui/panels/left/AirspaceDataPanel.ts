/**
 * AirspaceDataPanel - Manages the hierarchical tree/accordion of procedures and holdings.
 * Fetches procedures_index.json and controls MapLibre GL layer filters dynamically.
 *
 * VATM FTS / Decision-support / Non-operational. Not for operational air traffic control use.
 */
import { BasePanel } from '../BasePanel';
import { StateManager } from '../../../core/StateManager';
import { logger } from '../../../utils/Logger';
import { getActiveAirspaceMap, updateActiveAirspaceFilters } from '../../map/VietnamKmlAirspaceControls';

interface AirspaceIndex {
  [airport: string]: {
    SID: { [name: string]: string[] };
    STAR: { [name: string]: string[] };
    IAP: { [name: string]: string[] };
    HOLDING: { [name: string]: string[] };
  };
}

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

export class AirspaceDataPanel extends BasePanel {
  private stateManager: StateManager | null = null;
  private airspaceIndex: AirspaceIndex | null = null;
  private boundaryIndex: BoundaryIndex | null = null;
  private checkedIds: Set<string> = new Set();
  
  // Track DOM element references
  private searchInput: HTMLInputElement | null = null;
  private clearSearchBtn: HTMLButtonElement | null = null;
  private selectAllBtn: HTMLButtonElement | null = null;
  private clearAllBtn: HTMLButtonElement | null = null;
  private treeContainer: HTMLElement | null = null;

  constructor() {
    super('.airspace-panel', 'airspace-content');
  }

  protected onInit(): void {
    logger.debug('AirspaceDataPanel', 'Initializing AirspaceDataPanel...');
    
    // Bind DOM controls
    this.searchInput = this.getElement('#airspace-search') as HTMLInputElement;
    this.clearSearchBtn = this.getElement('#airspace-clear-search') as HTMLButtonElement;
    this.selectAllBtn = this.getElement('#airspace-select-all') as HTMLButtonElement;
    this.clearAllBtn = this.getElement('#airspace-clear-all') as HTMLButtonElement;
    this.treeContainer = this.getElementById('airspace-tree-container');

    // Attach search handlers
    if (this.searchInput) {
      this.addEventListener(this.searchInput, 'input', () => this.handleSearch());
    }
    if (this.clearSearchBtn && this.searchInput) {
      this.addEventListener(this.clearSearchBtn, 'click', () => {
        this.searchInput!.value = '';
        this.handleSearch();
      });
    }

    // Attach bulk actions
    if (this.selectAllBtn) {
      this.addEventListener(this.selectAllBtn, 'click', () => this.selectAllVisible());
    }
    if (this.clearAllBtn) {
      this.addEventListener(this.clearAllBtn, 'click', () => this.clearAllSelections());
    }

    // Fetch and populate index
    this.loadAirspaceIndex();
  }

  public setStateManager(stateManager: StateManager): void {
    this.stateManager = stateManager;
  }

  private async loadAirspaceIndex(): Promise<void> {
    try {
      const [resProcedures, resBoundaries] = await Promise.all([
        fetch('/static/data/vatm_kmz/procedures_index.json'),
        fetch('/static/data/vatm_kmz/airspace_index.json')
      ]);

      if (!resProcedures.ok || !resBoundaries.ok) {
        throw new Error('Failed to load dynamic indices');
      }

      this.airspaceIndex = await resProcedures.json();
      this.boundaryIndex = await resBoundaries.json();
      this.renderTree();
    } catch (error) {
      logger.error('AirspaceDataPanel', 'Error loading airspace indices:', error);
      if (this.treeContainer) {
        this.treeContainer.innerHTML = `<div style="text-align:center;color:#ef4444;font-size:11px;padding:12px;">Failed to load airspace data.</div>`;
      }
    }
  }

  private renderTree(): void {
    if (!this.treeContainer || !this.airspaceIndex) return;

    this.treeContainer.innerHTML = '';
    
    const treeFragment = document.createDocumentFragment();

    // 1. Render Holdings Section (Khu chờ)
    const holdingSection = this.createRootSection('⏱ Holdings (Khu chờ)', 'holdings');
    this.renderHoldingsNode(holdingSection.contentArea);
    treeFragment.appendChild(holdingSection.element);

    // 2. Render Procedures Section (Phương thức bay)
    const procSection = this.createRootSection('🛬 Procedures (Phương thức bay)', 'procedures');
    this.renderProceduresNode(procSection.contentArea);
    treeFragment.appendChild(procSection.element);

    // 3. Render ACC, TMA, CTR Boundaries Section (Phân khu & Vùng tiếp cận)
    if (this.boundaryIndex) {
      const boundarySection = this.createRootSection('🛰️ Boundaries (Phân khu & Vùng tiếp cận)', 'boundaries');
      this.renderBoundariesNode(boundarySection.contentArea);
      treeFragment.appendChild(boundarySection.element);
    }

    this.treeContainer.appendChild(treeFragment);
    this.updateAllFolderSelectionStates();
  }

  private createRootSection(title: string, key: string): { element: HTMLElement; contentArea: HTMLElement } {
    const details = document.createElement('details');
    details.className = `tree-root-details tree-section-${key}`;
    details.open = true; // Open by default for visibility
    details.style.marginBottom = '8px';

    const summary = document.createElement('summary');
    summary.className = 'tree-root-summary';
    summary.style.cssText = 'font:700 12px system-ui,sans-serif;color:#94a3b8;cursor:pointer;padding:4px 6px;background:rgba(15,23,42,.35);border-radius:6px;user-select:none;display:flex;align-items:center;gap:4px;border:1px solid rgba(148,163,184,.1);';
    summary.textContent = title;

    const content = document.createElement('div');
    content.className = 'tree-root-content';
    content.style.paddingLeft = '8px';
    content.style.marginTop = '4px';

    details.appendChild(summary);
    details.appendChild(content);

    return { element: details, contentArea: content };
  }

  private renderHoldingsNode(container: HTMLElement): void {
    if (!this.airspaceIndex) return;

    const airports = ['VVTS', 'VVNB', 'VVDN'];
    const aptNames: { [key: string]: string } = {
      'VVTS': 'Tân Sơn Nhất',
      'VVNB': 'Nội Bài',
      'VVDN': 'Đà Nẵng'
    };

    airports.forEach(apt => {
      const holdings = this.airspaceIndex![apt]?.HOLDING || {};
      const holdingKeys = Object.keys(holdings).sort();
      if (holdingKeys.length === 0) return;

      const details = document.createElement('details');
      details.className = 'tree-airport-details';
      details.style.margin = '4px 0';

      const summary = document.createElement('summary');
      summary.className = 'tree-airport-summary';
      summary.style.cssText = 'font:600 11px system-ui,sans-serif;color:#cbd5e1;cursor:pointer;padding:2px 4px;user-select:none;';
      summary.innerHTML = `<span class="folder-select-indicator">⬜</span> 🛫 ${apt} - ${aptNames[apt]} <span class="node-count-label" style="color:#64748b;font-size:9.5px;">(0/${holdingKeys.length})</span>`;

      const content = document.createElement('div');
      content.style.paddingLeft = '14px';

      // Bind folder selection toggle (clicking folder icon/checkbox select indicator toggles all children)
      const indicator = summary.querySelector('.folder-select-indicator') as HTMLElement;
      this.addEventListener(indicator, 'click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleFolderRecursive(content, !this.isFolderFullyChecked(content));
      });

      holdingKeys.forEach(hName => {
        const featIds = holdings[hName];
        const leaf = this.createLeafNode(hName, featIds);
        content.appendChild(leaf);
      });

      details.appendChild(summary);
      details.appendChild(content);
      container.appendChild(details);
    });
  }

  private renderProceduresNode(container: HTMLElement): void {
    if (!this.airspaceIndex) return;

    const airports = ['VVTS', 'VVNB', 'VVDN'];
    const aptNames: { [key: string]: string } = {
      'VVTS': 'Tân Sơn Nhất',
      'VVNB': 'Nội Bài',
      'VVDN': 'Đà Nẵng'
    };

    airports.forEach(apt => {
      const aptData = this.airspaceIndex![apt] || {};
      const sids = aptData.SID || {};
      const stars = aptData.STAR || {};
      const iaps = aptData.IAP || {};

      const totalProcs = Object.keys(sids).length + Object.keys(stars).length + Object.keys(iaps).length;
      if (totalProcs === 0) return;

      const details = document.createElement('details');
      details.className = 'tree-airport-details';
      details.style.margin = '4px 0';

      const summary = document.createElement('summary');
      summary.className = 'tree-airport-summary';
      summary.style.cssText = 'font:600 11px system-ui,sans-serif;color:#cbd5e1;cursor:pointer;padding:2px 4px;user-select:none;';
      summary.innerHTML = `<span class="folder-select-indicator">⬜</span> 🏢 ${apt} - ${aptNames[apt]} <span class="node-count-label" style="color:#64748b;font-size:9.5px;">(0/${totalProcs})</span>`;

      const content = document.createElement('div');
      content.style.paddingLeft = '12px';

      const indicator = summary.querySelector('.folder-select-indicator') as HTMLElement;
      this.addEventListener(indicator, 'click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleFolderRecursive(content, !this.isFolderFullyChecked(content));
      });

      // Render SID, STAR, IAP sub-folders
      const types: Array<{ key: 'SID' | 'STAR' | 'IAP'; label: string; color: string }> = [
        { key: 'SID', label: '🛫 SID (Departure)', color: '#22c55e' },
        { key: 'STAR', label: '🛬 STAR (Arrival)', color: '#22d3ee' },
        { key: 'IAP', label: '🛬 IAP (Approach)', color: '#d946ef' }
      ];

      types.forEach(t => {
        const procs = aptData[t.key] || {};
        const procKeys = Object.keys(procs).sort();
        if (procKeys.length === 0) return;

        const subDetails = document.createElement('details');
        subDetails.className = 'tree-type-details';
        subDetails.style.margin = '2px 0';

        const subSummary = document.createElement('summary');
        subSummary.className = 'tree-type-summary';
        subSummary.style.cssText = `font:500 10.5px system-ui,sans-serif;color:${t.color};cursor:pointer;padding:2px 4px;user-select:none;`;
        subSummary.innerHTML = `<span class="folder-select-indicator">⬜</span> ${t.label} <span class="node-count-label" style="color:#64748b;font-size:9px;">(0/${procKeys.length})</span>`;

        const subContent = document.createElement('div');
        subContent.style.paddingLeft = '14px';

        const subIndicator = subSummary.querySelector('.folder-select-indicator') as HTMLElement;
        this.addEventListener(subIndicator, 'click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleFolderRecursive(subContent, !this.isFolderFullyChecked(subContent));
        });

        procKeys.forEach(pName => {
          const featIds = procs[pName];
          const leaf = this.createLeafNode(pName, featIds);
          subContent.appendChild(leaf);
        });

        subDetails.appendChild(subSummary);
        subDetails.appendChild(subContent);
        content.appendChild(subDetails);
      });

      details.appendChild(summary);
      details.appendChild(content);
      container.appendChild(details);
    });
  }

  private renderBoundariesNode(container: HTMLElement): void {
    if (!this.boundaryIndex) return;

    // 3.1 ACC Group
    const accData = this.boundaryIndex.ACC || {};
    const accSubcats = Object.keys(accData).sort();
    if (accSubcats.length > 0) {
      const details = document.createElement('details');
      details.className = 'tree-airport-details';
      details.style.margin = '4px 0';

      const summary = document.createElement('summary');
      summary.className = 'tree-airport-summary';
      summary.style.cssText = 'font:600 11px system-ui,sans-serif;color:#a78bfa;cursor:pointer;padding:2px 4px;user-select:none;';
      summary.innerHTML = `<span class="folder-select-indicator">⬜</span> 🛰️ Đường Dài & Phân Khu (ACC) <span class="node-count-label" style="color:#64748b;font-size:9.5px;">(0/0)</span>`;

      const content = document.createElement('div');
      content.style.paddingLeft = '12px';

      const indicator = summary.querySelector('.folder-select-indicator') as HTMLElement;
      this.addEventListener(indicator, 'click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleFolderRecursive(content, !this.isFolderFullyChecked(content));
      });

      let totalAccItems = 0;

      accSubcats.forEach(sub => {
        const subSec = accData[sub] || {};
        const subSecKeys = Object.keys(subSec).sort();
        if (subSecKeys.length === 0) return;

        totalAccItems += subSecKeys.length;

        const subDetails = document.createElement('details');
        subDetails.className = 'tree-type-details';
        subDetails.style.margin = '2px 0';

        const subSummary = document.createElement('summary');
        subSummary.className = 'tree-type-summary';
        subSummary.style.cssText = `font:500 10.5px system-ui,sans-serif;color:#c084fc;cursor:pointer;padding:2px 4px;user-select:none;`;
        subSummary.innerHTML = `<span class="folder-select-indicator">⬜</span> 🏢 ${sub} <span class="node-count-label" style="color:#64748b;font-size:9px;">(0/${subSecKeys.length})</span>`;

        const subContent = document.createElement('div');
        subContent.style.paddingLeft = '14px';

        const subIndicator = subSummary.querySelector('.folder-select-indicator') as HTMLElement;
        this.addEventListener(subIndicator, 'click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleFolderRecursive(subContent, !this.isFolderFullyChecked(subContent));
        });

        subSecKeys.forEach(name => {
          const ids = subSec[name];
          const leaf = this.createLeafNode(name, ids);
          subContent.appendChild(leaf);
        });

        subDetails.appendChild(subSummary);
        subDetails.appendChild(subContent);
        content.appendChild(subDetails);
      });

      const totalCountLabel = summary.querySelector('.node-count-label') as HTMLElement;
      if (totalCountLabel) {
        totalCountLabel.textContent = `(0/${totalAccItems})`;
      }

      details.appendChild(summary);
      details.appendChild(content);
      container.appendChild(details);
    }

    // 3.2 TMA Group
    const tmaData = this.boundaryIndex.TMA || {};
    const tmaKeys = Object.keys(tmaData).sort();
    if (tmaKeys.length > 0) {
      const details = document.createElement('details');
      details.className = 'tree-airport-details';
      details.style.margin = '4px 0';

      const summary = document.createElement('summary');
      summary.className = 'tree-airport-summary';
      summary.style.cssText = 'font:600 11px system-ui,sans-serif;color:#38bdf8;cursor:pointer;padding:2px 4px;user-select:none;';
      summary.innerHTML = `<span class="folder-select-indicator">⬜</span> 🛰️ Tiếp Cận Sân Bay (TMA) <span class="node-count-label" style="color:#64748b;font-size:9.5px;">(0/${tmaKeys.length})</span>`;

      const content = document.createElement('div');
      content.style.paddingLeft = '14px';

      const indicator = summary.querySelector('.folder-select-indicator') as HTMLElement;
      this.addEventListener(indicator, 'click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleFolderRecursive(content, !this.isFolderFullyChecked(content));
      });

      tmaKeys.forEach(name => {
        const ids = tmaData[name];
        const leaf = this.createLeafNode(name, ids);
        content.appendChild(leaf);
      });

      details.appendChild(summary);
      details.appendChild(content);
      container.appendChild(details);
    }

    // 3.3 CTR Group
    const ctrData = this.boundaryIndex.CTR || {};
    const ctrKeys = Object.keys(ctrData).sort();
    if (ctrKeys.length > 0) {
      const details = document.createElement('details');
      details.className = 'tree-airport-details';
      details.style.margin = '4px 0';

      const summary = document.createElement('summary');
      summary.className = 'tree-airport-summary';
      summary.style.cssText = 'font:600 11px system-ui,sans-serif;color:#60a5fa;cursor:pointer;padding:2px 4px;user-select:none;';
      summary.innerHTML = `<span class="folder-select-indicator">⬜</span> 🛰️ Khu Vực Sân Bay (CTR) <span class="node-count-label" style="color:#64748b;font-size:9.5px;">(0/${ctrKeys.length})</span>`;

      const content = document.createElement('div');
      content.style.paddingLeft = '14px';

      const indicator = summary.querySelector('.folder-select-indicator') as HTMLElement;
      this.addEventListener(indicator, 'click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleFolderRecursive(content, !this.isFolderFullyChecked(content));
      });

      ctrKeys.forEach(name => {
        const ids = ctrData[name];
        const leaf = this.createLeafNode(name, ids);
        content.appendChild(leaf);
      });

      details.appendChild(summary);
      details.appendChild(content);
      container.appendChild(details);
    }
  }

  private createLeafNode(name: string, ids: string[]): HTMLElement {
    const label = document.createElement('label');
    label.className = 'tree-leaf-label';
    label.style.cssText = 'display:flex;align-items:flex-start;gap:6px;padding:3px 6px;margin:2px 0;border-radius:4px;cursor:pointer;font-size:10.5px;color:#94a3b8;line-height:1.3;transition:all 0.15s ease-in-out;user-select:none;';
    
    // Custom premium hover effect in CSS style
    label.onmouseenter = () => { label.style.background = 'rgba(148,163,184,.08)'; label.style.color = '#f1f5f9'; };
    label.onmouseleave = () => { label.style.background = 'none'; label.style.color = '#94a3b8'; };

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'tree-leaf-checkbox';
    checkbox.dataset.ids = JSON.stringify(ids);
    checkbox.style.cssText = 'margin-top:2px;cursor:pointer;accent-color:#14b8a6;';

    this.addEventListener(checkbox, 'change', () => {
      this.handleLeafSelectionChange(checkbox, ids);
    });

    const text = document.createElement('span');
    text.className = 'tree-leaf-text';
    text.textContent = name;

    label.appendChild(checkbox);
    label.appendChild(text);

    return label;
  }

  private handleLeafSelectionChange(checkbox: HTMLInputElement, ids: string[]): void {
    if (checkbox.checked) {
      ids.forEach(id => this.checkedIds.add(id));
    } else {
      ids.forEach(id => this.checkedIds.delete(id));
    }
    
    this.updateAllFolderSelectionStates();
    this.dispatchFilterUpdateToMap();
  }

  /**
   * Recursively checks or unchecks all leaf nodes inside a folder.
   */
  private toggleFolderRecursive(folderContent: HTMLElement, check: boolean): void {
    const checkboxes = folderContent.querySelectorAll('.tree-leaf-checkbox') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach(cb => {
      if (cb.checked !== check && cb.style.display !== 'none') { // only toggle visible checkboxes!
        cb.checked = check;
        const ids = JSON.parse(cb.dataset.ids || '[]') as string[];
        if (check) {
          ids.forEach(id => this.checkedIds.add(id));
        } else {
          ids.forEach(id => this.checkedIds.delete(id));
        }
      }
    });

    this.updateAllFolderSelectionStates();
    this.dispatchFilterUpdateToMap();
  }

  private isFolderFullyChecked(folderContent: HTMLElement): boolean {
    const checkboxes = folderContent.querySelectorAll('.tree-leaf-checkbox') as NodeListOf<HTMLInputElement>;
    if (checkboxes.length === 0) return false;
    
    let checkedCount = 0;
    checkboxes.forEach(cb => {
      if (cb.checked) checkedCount++;
    });
    return checkedCount === checkboxes.length;
  }

  /**
   * Traverses up the DOM, recalculating checking count labels and check indicators.
   */
  private updateAllFolderSelectionStates(): void {
    if (!this.treeContainer) return;

    // 1. Process Type folders (SID, STAR, IAP)
    const typeDetails = this.treeContainer.querySelectorAll('.tree-type-details');
    typeDetails.forEach(td => {
      const summary = td.querySelector('.tree-type-summary') as HTMLElement;
      const content = td.querySelector('div') as HTMLElement;
      this.updateFolderIndicatorAndCount(summary, content);
    });

    // 2. Process Airport folders
    const aptDetails = this.treeContainer.querySelectorAll('.tree-airport-details');
    aptDetails.forEach(ad => {
      const summary = ad.querySelector('.tree-airport-summary') as HTMLElement;
      const content = ad.querySelector('div') as HTMLElement;
      this.updateFolderIndicatorAndCount(summary, content);
    });
  }

  private updateFolderIndicatorAndCount(summary: HTMLElement, content: HTMLElement): void {
    const checkboxes = content.querySelectorAll('.tree-leaf-checkbox') as NodeListOf<HTMLInputElement>;
    const indicator = summary.querySelector('.folder-select-indicator') as HTMLElement;
    const countLabel = summary.querySelector('.node-count-label') as HTMLElement;
    
    if (checkboxes.length === 0) return;

    let checkedCount = 0;
    checkboxes.forEach(cb => {
      if (cb.checked) checkedCount++;
    });

    if (countLabel) {
      countLabel.textContent = `(${checkedCount}/${checkboxes.length})`;
    }

    if (indicator) {
      if (checkedCount === 0) {
        indicator.textContent = '⬜';
        indicator.style.color = '#64748b';
      } else if (checkedCount === checkboxes.length) {
        indicator.textContent = '✅';
        indicator.style.color = '#14b8a6';
      } else {
        indicator.textContent = '⏹️';
        indicator.style.color = '#f59e0b';
      }
    }
  }

  /**
   * Live real-time search logic. Hides nodes that don't match, and expands folders with matches.
   */
  private handleSearch(): void {
    if (!this.searchInput || !this.treeContainer) return;

    const query = this.searchInput.value.toLowerCase().trim();

    // Reset tree highlights if query is empty
    if (!query) {
      const allLabels = this.treeContainer.querySelectorAll('.tree-leaf-label') as NodeListOf<HTMLElement>;
      allLabels.forEach(l => {
        l.style.display = '';
        const text = l.querySelector('.tree-leaf-text') as HTMLElement;
        if (text) text.style.fontWeight = 'normal';
      });

      const allDetails = this.treeContainer.querySelectorAll('details') as NodeListOf<HTMLDetailsElement>;
      allDetails.forEach(d => {
        d.style.display = '';
      });
      return;
    }

    // Process leaf nodes
    const allDetails = this.treeContainer.querySelectorAll('.tree-airport-details, .tree-type-details') as NodeListOf<HTMLDetailsElement>;
    
    // Hide everything by default
    allDetails.forEach(d => {
      d.style.display = 'none';
    });

    const allLeaves = this.treeContainer.querySelectorAll('.tree-leaf-label') as NodeListOf<HTMLElement>;
    allLeaves.forEach(leaf => {
      const name = leaf.textContent?.toLowerCase() || '';
      const text = leaf.querySelector('.tree-leaf-text') as HTMLElement;

      if (name.includes(query)) {
        leaf.style.display = '';
        if (text) text.style.fontWeight = 'bold';
        
        // Traverse up to show parent details elements and expand them
        let parent = leaf.parentElement;
        while (parent && parent !== this.treeContainer) {
          if (parent.tagName.toLowerCase() === 'details') {
            const details = parent as HTMLDetailsElement;
            details.style.display = '';
            details.open = true;
          }
          parent = parent.parentElement;
        }
      } else {
        leaf.style.display = 'none';
        if (text) text.style.fontWeight = 'normal';
      }
    });
  }

  /**
   * Bulk checks all visible (non-filtered) checkboxes in the tree.
   */
  private selectAllVisible(): void {
    if (!this.treeContainer) return;

    const checkboxes = this.treeContainer.querySelectorAll('.tree-leaf-checkbox') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach(cb => {
      const label = cb.parentElement as HTMLElement;
      // Only select visible ones!
      if (label && label.style.display !== 'none') {
        cb.checked = true;
        const ids = JSON.parse(cb.dataset.ids || '[]') as string[];
        ids.forEach(id => this.checkedIds.add(id));
      }
    });

    this.updateAllFolderSelectionStates();
    this.dispatchFilterUpdateToMap();
  }

  /**
   * Bulk clears all selections.
   */
  private clearAllSelections(): void {
    if (!this.treeContainer) return;

    const checkboxes = this.treeContainer.querySelectorAll('.tree-leaf-checkbox') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach(cb => {
      cb.checked = false;
    });

    this.checkedIds.clear();
    this.updateAllFolderSelectionStates();
    this.dispatchFilterUpdateToMap();
  }

  /**
   * Calls the high-performance filter updater in the map controls.
   */
  private dispatchFilterUpdateToMap(): void {
    const map = getActiveAirspaceMap();
    if (!map) {
      logger.warn('AirspaceDataPanel', 'Active map instance is not ready yet.');
      return;
    }

    const activeIds = Array.from(this.checkedIds);
    updateActiveAirspaceFilters(map, activeIds);
    logger.debug('AirspaceDataPanel', `Dispatched filter update to MapLibre layer set. Active count: ${activeIds.length} features.`);
  }

  public update(data?: any): void {
    // Left sidebar updates are primarily user-driven, no background simulation loops needed.
  }

  protected onDestroy(): void {
    this.checkedIds.clear();
  }
}
