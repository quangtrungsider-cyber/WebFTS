/**
 * SimulationNodesPanel - Manages the Simulation Nodes panel
 *
 * This panel handles:
 * - Displaying available simulation nodes
 * - Node selection and switching
 * - Node information display (status, time, server ID)
 * - Refresh and add node actions
 *
 * Communication with Python backend:
 * - Emits: 'get_nodes', 'set_active_node', 'add_nodes'
 * - Receives: 'node_info' event with NodeInfo data
 */

import { BasePanel } from '../BasePanel';
import { NodeInfo, NodeData } from '../../../data/types';
import { SocketManager } from '../../../core/SocketManager';
import { logger } from '../../../utils/Logger';

export class SimulationNodesPanel extends BasePanel {
    private socketManager: SocketManager | null = null;
    private nodeData: NodeInfo | null = null;

    // DOM elements
    private totalNodesSpan: HTMLElement | null = null;
    private activeNodeSpan: HTMLElement | null = null;
    private nodeSelector: HTMLSelectElement | null = null;
    private nodeList: HTMLElement | null = null;
    private refreshButton: HTMLElement | null = null;
    private addNodeButton: HTMLElement | null = null;

    constructor() {
        super('.node-panel', 'simulation-nodes-content');
    }

    /**
     * Initialize the panel and set up event listeners
     */
    protected onInit(): void {
        // Get DOM elements
        this.totalNodesSpan = this.getElementById('total-nodes');
        this.activeNodeSpan = this.getElementById('active-node-display');
        this.nodeSelector = this.getElementById('node-selector') as HTMLSelectElement;
        this.nodeList = this.getElementById('node-list');
        this.refreshButton = this.getElementById('refresh-nodes');
        this.addNodeButton = this.getElementById('add-node');

        // Set up event listeners
        this.setupEventListeners();

        logger.debug('SimulationNodesPanel', 'SimulationNodesPanel initialized');
    }

    /**
     * Set up event listeners for panel controls
     */
    private setupEventListeners(): void {
        // Node selector dropdown
        if (this.nodeSelector) {
            this.addEventListener(this.nodeSelector, 'change', (e) => {
                const target = e.target as HTMLSelectElement;
                this.switchNode(target.value);
            });
        }

        // Refresh button
        if (this.refreshButton) {
            this.addEventListener(this.refreshButton, 'click', () => {
                this.refreshNodes();
            });
        }

        // Add node button
        if (this.addNodeButton) {
            this.addEventListener(this.addNodeButton, 'click', () => {
                this.showAddNodeModal();
            });
        }

        // Node list event delegation for click and delete
        if (this.nodeList) {
            this.addEventListener(this.nodeList, 'click', (e) => {
                const target = e.target as HTMLElement;
                console.log("Node list clicked target:", target);
                
                // Check if delete button or trash icon inside it was clicked
                const deleteBtn = target.closest('.delete-node-btn');
                console.log("deleteBtn found:", deleteBtn);
                if (deleteBtn) {
                    e.stopPropagation();
                    const nodeItem = deleteBtn.closest('.node-item') as HTMLElement;
                    console.log("nodeItem for delete:", nodeItem);
                    if (nodeItem) {
                        const nodeId = nodeItem.dataset.nodeId;
                        console.log("nodeId for delete:", nodeId);
                        if (nodeId) {
                            this.deleteNode(nodeId);
                        }
                    }
                    return;
                }
                
                // Otherwise check if a node item was clicked
                const nodeItem = target.closest('.node-item') as HTMLElement;
                if (nodeItem) {
                    const nodeId = nodeItem.dataset.nodeId;
                    if (nodeId) {
                        this.switchNode(nodeId);
                    }
                }
            });
        }
    }

    /**
     * Set the socket manager for communication with backend
     */
    public setSocketManager(socketManager: SocketManager): void {
        this.socketManager = socketManager;

        // Subscribe to node_info events
        const socket = socketManager.getSocket();
        if (socket) {
            socket.on('node_info', (data: NodeInfo) => {
                this.handleNodeInfo(data);
            });
        }
    }

    /**
     * Handle node info updates from backend
     */
    private handleNodeInfo(data: NodeInfo): void {
        logger.debug('SimulationNodesPanel', 'Received node info:', data);

        // Store node data
        this.nodeData = data;

        // Update display
        this.updateNodeDisplay();
    }

    /**
     * Update the node display UI
     */
    private updateNodeDisplay(): void {
        if (!this.nodeData) return;

        // Update total nodes count
        if (this.totalNodesSpan) {
            this.totalNodesSpan.textContent = String(this.nodeData.total_nodes || 0);
        }

        // Update active node display
        this.updateActiveNodeDisplay();

        // Update node selector dropdown
        this.updateNodeSelector();

        // Update detailed node list
        this.updateNodeList();
    }

    /**
     * Update the active node display
     */
    private updateActiveNodeDisplay(): void {
        if (!this.activeNodeSpan || !this.nodeData) return;

        if (this.nodeData.active_node) {
            const activeNodeData = this.nodeData.nodes[this.nodeData.active_node];
            if (activeNodeData) {
                // Show server ID in hex format
                const serverDisplay = activeNodeData.server_id_hex ||
                                    activeNodeData.server_id ||
                                    'Unknown';
                this.activeNodeSpan.textContent = serverDisplay;
            } else {
                this.activeNodeSpan.textContent = 'Unknown';
            }
        } else {
            this.activeNodeSpan.textContent = 'None';
        }
    }

    /**
     * Update the node selector dropdown
     */
    private updateNodeSelector(): void {
        if (!this.nodeSelector || !this.nodeData) return;

        // Clear existing options
        this.nodeSelector.innerHTML = '';

        if (this.nodeData.total_nodes === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No nodes available';
            this.nodeSelector.appendChild(option);
            this.nodeSelector.disabled = true;
        } else {
            this.nodeSelector.disabled = false;

            // Add nodes to selector
            Object.entries(this.nodeData.nodes).forEach(([nodeId, nodeData]) => {
                const option = document.createElement('option');
                option.value = nodeId;

                const alias = this.getNodeAlias(nodeData);
                const scenario = this.getScenarioName(nodeData.status);
                option.textContent = `${alias} - ${scenario}`;

                if (nodeId === this.nodeData!.active_node) {
                    option.selected = true;
                }

                this.nodeSelector!.appendChild(option);
            });
        }
    }

    /**
     * Update the detailed node list
     */
    private updateNodeList(): void {
        if (!this.nodeList || !this.nodeData) return;

        // Clear existing list
        this.nodeList.innerHTML = '';

        if (!this.nodeData.nodes) return;

        // Add node items
        Object.entries(this.nodeData.nodes).forEach(([nodeId, nodeData]) => {
            const nodeItem = this.createNodeItem(nodeId, nodeData);
            if (this.nodeList) {
                this.nodeList.appendChild(nodeItem);
            }
        });
    }

    /**
     * Create a node item element
     */
    private createNodeItem(nodeId: string, nodeData: NodeData): HTMLElement {
        const nodeItem = document.createElement('div');
        nodeItem.className = 'node-item';
        nodeItem.dataset.nodeId = nodeId;

        // Mark active node
        if (nodeId === this.nodeData?.active_node) {
            nodeItem.classList.add('active-node');
        }

        const alias = this.getNodeAlias(nodeData);
        const scenario = this.getScenarioName(nodeData.status);
        const currentTime = nodeData.time || '--:--:--';
        const displayNodeId = String(nodeId || 'Unknown');

        // Build node item HTML
        nodeItem.innerHTML = `
            <div class="node-header">
                <strong>${alias}</strong>
                <div class="node-actions" style="display: flex; align-items: center; gap: 5px; position: relative; z-index: 10;">
                    ${nodeId === this.nodeData?.active_node ? '<span class="active-badge">Active</span>' : ''}
                    <button class="delete-node-btn" title="Xóa node" 
                            style="background: none; border: none; color: #ff4d4d; cursor: pointer; padding: 6px; font-size: 13px; position: relative; z-index: 20; display: inline-flex; align-items: center; justify-content: center; transition: transform 0.15s ease-in-out;"
                            onmouseover="this.style.transform='scale(1.3)'; this.style.color='#ff1a1a';" 
                            onmouseout="this.style.transform='scale(1)'; this.style.color='#ff4d4d';">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="node-details">
                <div>Status: ${scenario}</div>
                <div>Time: ${currentTime}</div>
                <div>Node ID: ${displayNodeId}</div>
            </div>
        `;

        return nodeItem;
    }

    /**
     * Get user-friendly node alias
     */
    private getNodeAlias(nodeData: NodeData): string {
        const nodeNum = nodeData.node_num || 1;
        return `Node ${nodeNum}`;
    }

    /**
     * Get scenario display name
     */
    private getScenarioName(status: string | undefined): string {
        if (!status || status === 'init') {
            return 'Ready';
        }
        return status;
    }

    /**
     * Switch to a different node
     */
    private switchNode(nodeId: string): void {
        if (!nodeId || !this.socketManager) {
            return;
        }

        const socket = this.socketManager.getSocket();
        if (!socket || !socket.connected) {
            logger.warn('SimulationNodesPanel', 'Cannot switch node: not connected');
            return;
        }

        // Get friendly node name for logging
        const nodeData = this.nodeData?.nodes[nodeId];
        const friendlyName = nodeData ? `Node ${nodeData.node_num || 1}` : nodeId;

        logger.info('SimulationNodesPanel', 'Switching to node:', friendlyName);

        // Emit node switch event to backend
        socket.emit('set_active_node', { node_id: nodeId });

        // Log to console (if available)
        this.logToConsole(`Switching to node: ${friendlyName}`);
    }

    /**
     * Beautiful custom confirmation dialog
     */
    private showConfirmModal(message: string, onConfirm: () => void): void {
        const modal = document.getElementById('confirm-modal');
        const msgEl = document.getElementById('confirm-modal-message');
        const closeBtn = document.getElementById('confirm-modal-close');
        const cancelBtn = document.getElementById('confirm-modal-cancel');
        const submitBtn = document.getElementById('confirm-modal-submit');

        if (!modal || !msgEl || !submitBtn) return;

        msgEl.textContent = message;
        modal.style.display = 'flex';

        const closeModal = () => {
            modal.style.display = 'none';
            cleanupListeners();
        };

        const handleConfirm = () => {
            onConfirm();
            closeModal();
        };

        const handleCancel = () => {
            closeModal();
        };

        const cleanupListeners = () => {
            closeBtn?.removeEventListener('click', handleCancel);
            cancelBtn?.removeEventListener('click', handleCancel);
            submitBtn.removeEventListener('click', handleConfirm);
        };

        closeBtn?.addEventListener('click', handleCancel);
        cancelBtn?.addEventListener('click', handleCancel);
        submitBtn.addEventListener('click', handleConfirm);
    }

    /**
     * Delete a node
     */
    private deleteNode(nodeId: string): void {
        if (!this.socketManager) {
            logger.warn('SimulationNodesPanel', 'Cannot delete node: SocketManager not set');
            return;
        }

        const socket = this.socketManager.getSocket();
        if (!socket || !socket.connected) {
            logger.warn('SimulationNodesPanel', 'Cannot delete node: not connected');
            this.logToConsole('ERROR: Not connected to VATM server', true);
            return;
        }

        const nodeData = this.nodeData?.nodes[nodeId];
        const friendlyName = nodeData ? `Node ${nodeData.node_num || 1}` : nodeId;

        this.showConfirmModal(`Bạn có chắc chắn muốn xóa ${friendlyName}?`, () => {
            logger.info('SimulationNodesPanel', 'Deleting node:', friendlyName);
            socket.emit('delete_node', { node_id: nodeId });
            this.logToConsole(`Xóa thành công: ${friendlyName}`);
        });
    }

    /**
     * Refresh node list from backend
     */
    public refreshNodes(): void {
        if (!this.socketManager) {
            logger.warn('SimulationNodesPanel', 'Cannot refresh nodes: SocketManager not set');
            return;
        }

        const socket = this.socketManager.getSocket();
        if (!socket || !socket.connected) {
            logger.warn('SimulationNodesPanel', 'Cannot refresh nodes: not connected');
            this.logToConsole('ERROR: Not connected to VATM server', true);
            return;
        }

        logger.info('SimulationNodesPanel', 'Refreshing node list');
        socket.emit('get_nodes');
        this.logToConsole('Refreshing node list...');
    }

    /**
     * Add a new node to the simulation
     */
    private showAddNodeModal(): void {
        if (!this.socketManager) {
            logger.warn('SimulationNodesPanel', 'Cannot add node: SocketManager not set');
            return;
        }

        const socket = this.socketManager.getSocket();
        if (!socket || !socket.connected) {
            logger.warn('SimulationNodesPanel', 'Cannot add node: not connected');
            this.logToConsole('ERROR: Not connected to VATM server', true);
            return;
        }

        logger.info('SimulationNodesPanel', 'Adding new node');
        socket.emit('add_nodes', { count: 1 });
        this.logToConsole('Adding new simulation node...');
    }

    /**
     * Log message to console (if console is available)
     */
    private logToConsole(message: string, isError: boolean = false): void {
        // Access global console UI if available
        const consoleUI = (window as any).console_ui;
        if (consoleUI && typeof consoleUI.addMessage === 'function') {
            consoleUI.addMessage(message, isError ? 'console-error' : undefined);
        }
    }

    /**
     * Update panel with new data
     */
    public update(data?: NodeInfo): void {
        if (data) {
            this.handleNodeInfo(data);
        }
    }

    /**
     * Get current node data
     */
    public getNodeData(): NodeInfo | null {
        return this.nodeData;
    }

    /**
     * Get active node ID
     */
    public getActiveNode(): string | null {
        return this.nodeData?.active_node || null;
    }

    /**
     * Clear all node states, selection, and UI elements.
     * Called on disconnection or reconnection to server.
     */
    public clearState(): void {
        logger.info('SimulationNodesPanel', 'Clearing simulation node UI and state');
        this.nodeData = null;
        
        // Reset count
        if (this.totalNodesSpan) {
            this.totalNodesSpan.textContent = '0';
        }
        
        // Reset active node span
        if (this.activeNodeSpan) {
            this.activeNodeSpan.textContent = 'None';
        }
        
        // Clear node selector
        if (this.nodeSelector) {
            this.nodeSelector.innerHTML = '<option value="">No nodes available</option>';
            this.nodeSelector.disabled = true;
        }
        
        // Clear node list UI
        if (this.nodeList) {
            this.nodeList.innerHTML = '';
        }
    }

    /**
     * Cleanup
     */
    protected onDestroy(): void {
        // Unsubscribe from socket events
        if (this.socketManager) {
            const socket = this.socketManager.getSocket();
            if (socket) {
                socket.off('node_info');
            }
        }

        this.nodeData = null;
        this.socketManager = null;
    }
}
