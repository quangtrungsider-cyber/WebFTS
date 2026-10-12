# Walkthrough: Fixing False Connection Status & Configuring Server Environment

This document summarizes the changes made to the WebATM frontend to eliminate the false "Connected" status illusion, and provides a comprehensive guide on how to configure and run the Vatm-Engine simulation server on a remote server.

## 1. Code Changes Made (Frontend Fixes)

We corrected the frontend's connection detection logic. Previously, the UI assumed it was successfully connected to a running Vatm-Engine simulator as soon as it received *any* `node_info` socket packet from the proxy—even if that packet reported `total_nodes: 0`.

We modified the following files to ensure a "Connected" state is only shown when there is at least one active simulation node:

### 📁 [ConnectionStatusService.ts](file:///d:/Coding/Dự%20án%20FTS/WebFTS%20v1/frontend/src/core/ConnectionStatusService.ts)
*   Updated `onNodeInfoReceived()` to accept a `totalNodes` parameter.
*   Added logic to only set `blueSkyConnected = true` if `totalNodes > 0`.
*   If `totalNodes === 0`, it correctly transitions the state to `false`, representing a disconnected status.

### 📁 [SocketManager.ts](file:///d:/Coding/Dự%20án%20FTS/WebFTS%20v1/frontend/src/core/SocketManager.ts)
*   Updated the `onNodeInfo` Socket.IO event handler to extract the `total_nodes` count from the incoming data packet.
*   Passed `totalNodes` to `connectionStatus.onNodeInfoReceived(totalNodes)`.
*   Synchronized the state manager connection status with `this.stateManager.setBlueSkyConnectionStatus(totalNodes > 0)`.

---

## 2. Root Cause of Scenario Launch Failure

1.  **Misleading Connection Banner**: The WebATM proxy uses ZeroMQ (ZMQ) under the hood. In ZMQ, `socket.connect()` is asynchronous and non-blocking, so it always succeeds immediately even if nothing is listening on the other side. This caused the backend to report a "connected" status back to the frontend, which falsely displayed `Connected to VATM server at localhost (No Data)`.
2.  **No Active Simulation Node**: Since the Vatm-Engine simulator server (`FTS Server/BlueSky.py`) was not running or not reachable by the Docker container, no active simulation nodes were detected (`Total Nodes: 0`). Without an active simulation node, commands like `IC scenario_name` have no target to execute on.

---

## 3. Server Deployment Configuration Guide

To resolve this issue and run scenarios on your remote server, follow these two setup steps.

### Step 1: Start the Vatm-Engine Simulator on the Server (Headless Mode)
Because remote servers typically lack a graphical user interface (GUI), the simulator must be executed headlessly:
1.  SSH into your server.
2.  Navigate to the `FTS Server` directory on the server.
3.  Ensure Python dependencies (`pyzmq`, `numpy`, `scipy`) are installed in the host's Python environment:
    ```bash
    pip3 install pyzmq numpy scipy
    ```
4.  Start the simulator in headless mode (we recommend running it inside a background tool like `tmux`, `screen`, or as a systemd service):
    ```bash
    python3 BlueSky.py --headless
    ```
    *The simulator will start up and listen for ZMQ connections on ports `11000` (publisher) and `11001` (subscriber).*

### Step 2: Configure Docker Network Bridging
Since WebATM runs inside a Docker container, using `localhost` inside the UI Settings dialog refers to the *container itself*, not the host machine where the simulator is running. Use one of the three options below to establish a connection:

#### Option A: Use the Server's LAN / Public IP Address (Recommended)
1.  Open the WebATM web interface in your browser (`mdm.vatm.vn:4443`).
2.  Click the **Settings (gear icon)** at the top right.
3.  Change **Server IP** from `localhost` to the actual IP address or domain name of your server (e.g. `mdm.vatm.vn` or `103.x.x.x`).
4.  Click **Connect**.

#### Option B: Use Docker's Default Bridge Gateway IP
1.  Open the **Settings** dialog in the WebATM Web UI.
2.  Change **Server IP** to `172.17.0.1` (the default gateway IP representing the host machine on Linux Docker networks).
3.  Click **Connect**.

#### Option C: Add `extra_hosts` to `docker-compose.yml`
If you want to use the default `host.docker.internal` on a Linux server, you must explicitly declare it in the compose file so Docker can resolve it:
1.  Edit `docker-compose.yml` on the server and add `extra_hosts` to the `webatm` service:
    ```yaml
    services:
      webatm:
        image: webatm:latest
        container_name: webatm-local
        restart: unless-stopped
        environment:
          - FLASK_ENV=production
          - HEARTBEAT_INTERVAL=30
          - BLUESKY_SERVER_HOST=host.docker.internal
          - WEB_HOST=0.0.0.0
        ports:
          - 8082:8082
        extra_hosts:
          - "host.docker.internal:host-gateway"
    ```
2.  Restart the container:
    ```bash
    docker compose down
    docker compose up -d
    ```
3.  In the WebATM Settings Web UI, connect to `host.docker.internal`.
