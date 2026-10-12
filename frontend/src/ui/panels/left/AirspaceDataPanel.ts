import { BasePanel } from '../BasePanel';
import { StateManager } from '../../../core/StateManager';
import { logger } from '../../../utils/Logger';

export class AirspaceDataPanel extends BasePanel {
  private stateManager: StateManager | null = null;
  
  constructor() {
    super('.airspace-panel', 'airspace-content');
  }

  protected onInit(): void {
    logger.debug('AirspaceDataPanel', 'Initializing AirspaceDataPanel...');
    const panelContent = this.getElement('#airspace-content');
    if (!panelContent) return;

    // We insert the buttons at the beginning of the panel content
    
    // 1. Procedures Modal Button
    const procBtn = document.createElement('button');
    procBtn.id = 'btn-procedures-modal';
    procBtn.className = 'nav-btn';
    procBtn.style.cssText = 'width: 100%; margin-bottom: 8px; font-weight: bold; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);';
    procBtn.innerHTML = '🛫 Quản lý Phương thức';
    this.addEventListener(procBtn, 'click', () => {
        import('../../modals/ProceduresModal').then(m => {
            m.proceduresModal.open();
        });
    });
    panelContent.insertBefore(procBtn, panelContent.firstChild);

    // 2. Boundaries Modal Button
    const boundBtn = document.createElement('button');
    boundBtn.id = 'btn-boundaries-modal';
    boundBtn.className = 'nav-btn';
    boundBtn.style.cssText = 'width: 100%; margin-bottom: 8px; font-weight: bold; background: rgba(167, 139, 250, 0.15); color: #a78bfa; border: 1px solid rgba(167, 139, 250, 0.3);';
    boundBtn.innerHTML = '🛰️ Quản lý Phân khu';
    this.addEventListener(boundBtn, 'click', () => {
        import('../../modals/BoundariesModal').then(m => {
            m.boundariesModal.open();
        });
    });
    panelContent.insertBefore(boundBtn, procBtn.nextSibling);
    // 3. Aerodromes Modal Button
    const aeroBtn = document.createElement('button');
    aeroBtn.id = 'btn-aerodromes-modal';
    aeroBtn.className = 'nav-btn';
    aeroBtn.style.cssText = 'width: 100%; margin-bottom: 8px; font-weight: bold; background: rgba(250, 204, 21, 0.15); color: #facc15; border: 1px solid rgba(250, 204, 21, 0.3);';
    aeroBtn.innerHTML = '🏢 Cảng Hàng không / Đường băng';
    this.addEventListener(aeroBtn, 'click', () => {
        import('../../modals/AerodromesModal').then(m => {
            m.aerodromesModal.open();
        });
    });
    panelContent.insertBefore(aeroBtn, boundBtn.nextSibling);
    // 4. AI Report Modal Button
    const aiBtn = document.createElement('button');
    aiBtn.id = 'btn-ai-report-modal';
    aiBtn.className = 'nav-btn';
    aiBtn.style.cssText = 'width: 100%; margin-bottom: 8px; font-weight: bold; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);';
    aiBtn.innerHTML = '🤖 Phân tích Báo cáo (AI)';
    this.addEventListener(aiBtn, 'click', () => {
        import('../../modals/AiReportModal').then(m => {
            m.aiReportModal.open();
        });
    });
    panelContent.insertBefore(aiBtn, aeroBtn.nextSibling);

  }

  public setStateManager(stateManager: StateManager): void {
    this.stateManager = stateManager;
  }

  public update(data?: any): void {
    // No background updates needed
  }

  protected onDestroy(): void {
    // Nothing to destroy
  }
}
