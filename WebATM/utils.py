"""Utility functions for WebATM."""

from time import gmtime, strftime

import numpy as np

from .logger import get_logger

logger = get_logger()


def make_json_serializable(obj):
    """Convert object to JSON-serializable format.

    NaN/Infinity are converted to None: Python's json module happily emits
    the literal (non-standard) tokens NaN/Infinity by default, but a
    browser's strict JSON.parse() throws a SyntaxError on them -- which
    Socket.IO's client treats as a fatal protocol error and reacts to by
    tearing down and reconnecting the whole connection. Degenerate ASAS/MVP
    conflict-resolution geometry (e.g. two aircraft at ~zero separation)
    can produce a real NaN in asastrk/asastas/asasvs, and since that
    condition often persists across the reconnect, this previously showed
    up as an infinite connect/disconnect loop that never recovered on its
    own (confirmed live: "Total connected clients: 0" immediately after
    every "Web client connected", forever, whenever such a NaN was present
    in the aircraft data being emitted).
    """
    if isinstance(obj, np.ndarray):
        return [None if isinstance(v, float) and (v != v or v in (float("inf"), float("-inf"))) else v for v in obj.tolist()]
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        value = float(obj)
        return None if (value != value or value in (float("inf"), float("-inf"))) else value
    elif isinstance(obj, float):
        return None if (obj != obj or obj in (float("inf"), float("-inf"))) else obj
    elif isinstance(obj, bytes):
        return obj.decode('utf-8', errors='ignore')
    elif isinstance(obj, dict):
        # Handle BlueSky's serialized numpy arrays
        if b"numpy" in obj and b"data" in obj and b"type" in obj and b"shape" in obj:
            try:
                # This is a BlueSky serialized numpy array - deserialize it
                import struct

                dtype = (
                    obj[b"type"].decode()
                    if isinstance(obj[b"type"], bytes)
                    else obj[b"type"]
                )
                shape = obj[b"shape"]
                data_bytes = obj[b"data"]

                # Convert numpy dtype string to struct format
                dtype_map = {
                    "<f8": "d",  # double
                    "<f4": "f",  # float
                    "<i8": "q",  # long long
                    "<i4": "i",  # int
                    "|b1": "?",  # bool
                }

                if dtype in dtype_map:
                    format_char = dtype_map[dtype]
                    num_elements = 1
                    for dim in shape:
                        num_elements *= dim

                    # Unpack the binary data
                    values = list(
                        struct.unpack(f"<{num_elements}{format_char}", data_bytes)
                    )

                    # Return as list for JSON serialization (sanitize NaN/Infinity
                    # here too -- this struct.unpack path returns raw floats
                    # straight from BlueSky's own wire format, bypassing the
                    # np.floating/float branches above entirely)
                    return [
                        None if isinstance(v, float) and (v != v or v in (float("inf"), float("-inf"))) else v
                        for v in values
                    ]
                else:
                    logger.warning(
                        f"Utils: Unknown numpy dtype {dtype}, returning raw data"
                    )
                    return obj[b"data"].hex()  # Return as hex string if we can't parse

            except Exception as e:
                logger.warning(f"Utils: Error deserializing numpy array: {e}")
                # Fall back to converting dict normally
                pass

        # Normal dict processing
        return {
            (key.decode() if isinstance(key, bytes) else key): make_json_serializable(
                value
            )
            for key, value in obj.items()
        }
    elif isinstance(obj, (list, tuple)):
        return [make_json_serializable(item) for item in obj]
    elif hasattr(obj, "__dict__"):
        try:
            return make_json_serializable(vars(obj))
        except Exception:
            return str(obj)
    else:
        return obj


def i2txt(i, n):
    """Convert integer to string with leading zeros to make it n chars long"""
    return f"{i:0{n}d}"


def tim2txt(t):
    """Convert time to timestring: HH:MM:SS.hh"""
    return strftime("%H:%M:%S.", gmtime(t)) + i2txt(int((t - int(t)) * 100.0), 2)
