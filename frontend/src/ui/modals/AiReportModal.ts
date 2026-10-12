import { logger } from '../../utils/Logger';

export class AiReportModal {
    private modalElement: HTMLElement | null = null;
    private initialized = false;

    // DOM Elements
    private contentContainer!: HTMLElement;
    private uploadInput!: HTMLInputElement;

    public async open() {
        if (!this.initialized) {
            this.init();
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

    private init() {
        this.createDOM();
        this.makeDraggable();
        this.initialized = true;
    }

    private createDOM() {
        this.modalElement = document.createElement('div');
        this.modalElement.className = 'ai-report-modal';
        this.modalElement.style.cssText = `
            position: fixed; top: 100px; left: 350px; width: 450px; max-height: 80vh;
            background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 8px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            display: none; flex-direction: column; z-index: 1000; color: #cbd5e1;
            font-family: system-ui, sans-serif; overflow: hidden; backdrop-filter: blur(8px);
        `;

        const header = document.createElement('div');
        header.className = 'ai-report-modal-header';
        header.style.cssText = `
            padding: 10px 12px; background: rgba(30, 41, 59, 0.8); cursor: move;
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid rgba(16, 185, 129, 0.3); user-select: none;
        `;
        const title = document.createElement('div');
        title.innerHTML = '<b>🤖 AI Document Analysis</b>';
        title.style.fontSize = '13px';
        title.style.color = '#10b981';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px;';
        closeBtn.onpointerdown = (e) => e.stopPropagation();
        closeBtn.onclick = () => this.close();
        header.appendChild(title);
        header.appendChild(closeBtn);

        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'padding: 12px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid rgba(148, 163, 184, 0.1); background: rgba(15, 23, 42, 0.6);';

        const uploadLabel = document.createElement('label');
        uploadLabel.innerText = 'Upload Word Report (.docx):';
        uploadLabel.style.fontSize = '12px';
        uploadLabel.style.color = '#94a3b8';
        
        const uploadRow = document.createElement('div');
        uploadRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        this.uploadInput = document.createElement('input');
        this.uploadInput.type = 'file';
        this.uploadInput.accept = '.docx';
        this.uploadInput.style.cssText = 'flex: 1; font-size: 11px; color: #94a3b8;';
        
        const analyzeBtn = document.createElement('button');
        analyzeBtn.innerText = 'Analyze';
        analyzeBtn.style.cssText = 'padding: 4px 12px; background: #10b981; color: #fff; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;';
        
        analyzeBtn.onclick = () => this.handleUpload();

        uploadRow.appendChild(this.uploadInput);
        uploadRow.appendChild(analyzeBtn);
        toolbar.appendChild(uploadLabel);
        toolbar.appendChild(uploadRow);

        this.contentContainer = document.createElement('div');
        this.contentContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 12px; font-size: 12px; line-height: 1.5; color: #cbd5e1;';
        this.contentContainer.innerHTML = '<div style="color: #64748b; text-align: center; margin-top: 20px;">Upload a document to begin analysis.</div>';

        this.modalElement.appendChild(header);
        this.modalElement.appendChild(toolbar);
        this.modalElement.appendChild(this.contentContainer);
        document.body.appendChild(this.modalElement);
    }

    private makeDraggable() {
        if (!this.modalElement) return;
        const header = this.modalElement.querySelector('.ai-report-modal-header') as HTMLElement;
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

    private async handleUpload() {
        const file = this.uploadInput.files?.[0];
        if (!file) {
            alert('Please select a file first.');
            return;
        }

        this.contentContainer.innerHTML = '<div style="color: #10b981; text-align: center; margin-top: 20px;">🤖 AI is reading the document... please wait...</div>';

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/bluesky/analyze-report', {
                method: 'POST',
                body: formData
            });

            const result = await res.json();
            
            if (result.success && result.data) {
                this.renderResult(result.data);
            } else {
                this.contentContainer.innerHTML = `<div style="color: #ef4444;">Error: ${result.error || 'Failed to analyze'}</div>`;
            }
        } catch (e) {
            logger.error('AiReportModal', 'Analysis failed', e);
            this.contentContainer.innerHTML = `<div style="color: #ef4444;">Error: Network or server failure</div>`;
        }
    }

    private renderResult(data: any) {
        let html = `
            <div style="margin-bottom: 12px;">
                <div style="color: #10b981; font-weight: bold; margin-bottom: 4px; border-bottom: 1px solid rgba(16,185,129,0.3); padding-bottom: 4px;">📝 AI Summary</div>
                <div>${data.summary || 'No summary provided.'}</div>
            </div>
        `;

        if (data.airports && data.airports.length > 0) {
            html += `
                <div style="margin-bottom: 12px;">
                    <div style="color: #38bdf8; font-weight: bold; margin-bottom: 4px;">🏢 Mentioned Airports</div>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        ${data.airports.map((a: string) => `<span style="background: rgba(56, 189, 248, 0.2); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${a}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        if (data.conflicts && data.conflicts.length > 0) {
            html += `
                <div style="margin-bottom: 12px;">
                    <div style="color: #ef4444; font-weight: bold; margin-bottom: 4px;">⚠️ Aircraft Conflicts</div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${data.conflicts.map((c: any) => {
                            const sevColor = c.severity?.toLowerCase() === 'high' ? '#ef4444' : 
                                           c.severity?.toLowerCase() === 'medium' ? '#f59e0b' : '#3b82f6';
                            return `
                            <div style="background: rgba(239, 68, 68, 0.1); border-left: 3px solid ${sevColor}; padding: 6px 10px; border-radius: 4px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                                    <span style="font-weight: bold; color: #f87171;">${c.aircraft_1} ⚔️ ${c.aircraft_2}</span>
                                    <span style="font-size: 10px; padding: 2px 4px; background: ${sevColor}; color: #fff; border-radius: 3px;">${c.severity || 'Unknown'}</span>
                                </div>
                                <div style="color: #cbd5e1;">${c.description}</div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        if (data.notes && data.notes.length > 0) {
            html += `
                <div>
                    <div style="color: #facc15; font-weight: bold; margin-bottom: 4px;">📌 Safety Notes & Recommendations</div>
                    <ul style="margin: 0; padding-left: 20px; color: #e2e8f0;">
                        ${data.notes.map((n: string) => `<li style="margin-bottom: 4px;">${n}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        this.contentContainer.innerHTML = html;
    }
}

export const aiReportModal = new AiReportModal();
