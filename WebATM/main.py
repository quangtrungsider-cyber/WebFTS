"""Main entry point for WebATM."""

import os

# Eventlet's own DNS resolver (greendns) fails to resolve "localhost" on some
# Windows/Python combinations ("socket.gaierror: [Errno 11001] No address
# found"), which broke socketio.run() entirely under async_mode="eventlet".
# Falling back to the system resolver (still through eventlet's patched
# socket module) fixes it. Must be set before `import eventlet`.
os.environ.setdefault("EVENTLET_NO_GREENDNS", "yes")

try:
    import eventlet
    eventlet.monkey_patch()
except ImportError:
    pass

from .app import create_app
from .logger import get_logger

logger = get_logger()


def start_WebATM(hostname=None, port=8082, debug=False):
    """Start WebATM."""
    # Get BlueSky server hostname from environment variable or parameter
    bluesky_host = hostname or os.environ.get("BLUESKY_SERVER_HOST", "localhost")
    web_port = int(os.environ.get("WEB_PORT", port))
    web_host = os.environ.get("WEB_HOST", "0.0.0.0")

    # create the app
    app, socketio = create_app()

    # Set default server IP on the client but don't connect - wait for user to configure
    app.bluesky_proxy.server_ip = bluesky_host
    logger.info("BlueSky Proxy initialized (not connected to BlueSky server)")
    logger.info(f"Default BlueSky server IP set to: {bluesky_host}")
    logger.info("Ready - Connect to BlueSky server via WebATM")
    
    try:
        from .server.bluesky_server_status import is_port_listening
        import subprocess
        import sys

        if bluesky_host in ("localhost", "127.0.0.1") and not is_port_listening(11000):
            logger.info("BlueSky server not running locally. Auto-starting it...")

            # Locate FTS Server directory
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            bluesky_dir = os.path.join(base_dir, "FTS Server")

            if os.path.exists(os.path.join(bluesky_dir, "BlueSky.py")):
                env = os.environ.copy()
                env["PYTHONIOENCODING"] = "utf-8"
                # PYTHONIOENCODING only fixes stdout/stderr (print()); it does NOT change the
                # default encoding Python's own open(path, "w"/"r") falls back to when no
                # encoding= is given, which stays the OS locale codepage (cp1252 on this Windows
                # setup). Since this repo's own path contains a Vietnamese character, that default
                # crashes any such open() with UnicodeEncodeError -- confirmed via
                # bluesky/stack/simstack.py's IC command, which writes the current scenario path
                # to a plain-text cache file without specifying an encoding. PYTHONUTF8=1 forces
                # Python's UTF-8 mode, which fixes the open()-without-encoding default too (not
                # just print()), covering this whole class of bug in the headless subprocess.
                env["PYTHONUTF8"] = "1"

                subprocess.Popen(
                    [sys.executable, "BlueSky.py", "--headless"],
                    cwd=bluesky_dir,
                    env=env
                )
                logger.info("BlueSky server process started.")
            else:
                logger.warning(f"BlueSky.py not found in {bluesky_dir}")

        # Auto-connect to BlueSky server once it's ready
        import threading
        def _auto_connect():
            import time
            for attempt in range(15):
                time.sleep(2)
                try:
                    if is_port_listening(11000):
                        app.bluesky_proxy.start_client(hostname=bluesky_host)
                        from .proxy import register_subscribers
                        register_subscribers()
                        logger.info(f"Auto-connected to BlueSky server at {bluesky_host}")
                        return
                except Exception as e:
                    logger.warning(f"Auto-connect attempt {attempt+1} failed: {e}")
            logger.warning("Auto-connect gave up after 15 attempts")

        threading.Thread(target=_auto_connect, daemon=True).start()
    except Exception as e:
        logger.error(f"Failed to auto-start BlueSky server: {e}")

    try:
        logger.info(f"Starting WebATM on http://{web_host}:{web_port}")
        # Suppress Flask development server warning for local use
        os.environ["FLASK_ENV"] = "production"
        socketio.run(
            app,
            host=web_host,
            port=web_port,
            debug=debug,
            use_reloader=False,
            allow_unsafe_werkzeug=True,
        )
    finally:
        logger.info("Shutting down WebATM...")
        app.bluesky_proxy.stop_client("shutdown")
        logger.info("Shutdown complete")


if __name__ == "__main__":
    start_WebATM()
