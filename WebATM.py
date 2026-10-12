#!/usr/bin/env python
"""
Main BlueSky Web Application start script.

This web application provides a browser-based interface for BlueSky - The Open Air Traffic
Simulator developed by TU Delft (Delft University of Technology).
"""

import os
import sys

# Fix lỗi "charmap" trên Windows: terminal mặc định dùng cp1252 không encode
# được ký tự tiếng Việt trong đường dẫn khi Python in traceback.
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Must be set before `import eventlet`
os.environ.setdefault("EVENTLET_NO_GREENDNS", "yes")

try:
    import eventlet
    eventlet.monkey_patch()
except ImportError:
    pass


def main():
    """Start the BlueSky web client."""
    try:
        from WebATM.main import start_WebATM
        start_WebATM()
    except Exception:
        import traceback
        try:
            with open("webatm_crash.log", "w", encoding="utf-8") as f:
                traceback.print_exc(file=f)
        except Exception:
            pass
        traceback.print_exc()
        raise


if __name__ == "__main__":
    sys.exit(main())
