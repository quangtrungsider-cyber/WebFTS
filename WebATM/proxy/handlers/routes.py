"""Route data handler for aircraft route visualization."""

import time

from ...logger import get_logger
from ...utils import make_json_serializable

logger = get_logger()


def get_bluesky_proxy():
    """Get the current BlueSky proxy instance."""
    from .. import get_bluesky_proxy as _get_proxy

    return _get_proxy()


def on_routedata_received(data):
    """Handle route data updates for aircraft."""
    proxy = get_bluesky_proxy()
    if not proxy:
        return

    # Ignore data if reconnection is not allowed (we're disconnected)
    if not proxy.allow_reconnection:
        return

    # Extract aircraft ID from the route data
    route_aircraft_id = (
        getattr(data, "acid", None) or data.get("acid")
        if hasattr(data, "get")
        else getattr(data, "acid", None)
    )
    if not route_aircraft_id:
        logger.debug("Route data ignored - no aircraft ID found")
        return

    logger.info(f"ROUTEDATA received for {route_aircraft_id}, connected_clients={proxy.connected_clients}")

    # Removed the traffic_data filter that discarded ROUTEDATA if the aircraft ID
    # wasn't yet in proxy.traffic_data. This ensures routes created before the
    # aircraft is fully active (or before ACDATA arrives) are properly cached.

    # Mark successful data reception
    proxy.last_successful_update = time.time()

    # Convert to JSON-serializable format
    route_data = make_json_serializable(data)

    # Cache per-aircraft so new browser clients get it on connect
    if not hasattr(proxy, "route_data_cache"):
        proxy.route_data_cache = {}
    proxy.route_data_cache[route_aircraft_id] = route_data

    # Emit to connected clients
    if proxy.socketio and proxy.connected_clients > 0:
        try:
            proxy.socketio.emit("routedata", route_data)
            logger.info(f"ROUTEDATA emitted for {route_aircraft_id} to {proxy.connected_clients} clients")
        except Exception as e:
            logger.error(f"Error emitting ROUTEDATA for {route_aircraft_id}: {e}")
    else:
        logger.info(f"ROUTEDATA for {route_aircraft_id} NOT emitted (no clients): cached for later delivery")
