"""Upper-air wind field and wind triangle kinematics for WebFTS.

Internal units are SI and match the simulation engine: speeds m/s,
altitudes m, angles degrees. Convert at the edges with the helpers in
:mod:`windkit.units`.

    >>> from windkit import SyntheticUpperAirWindProvider, solve_from_track
    >>> from windkit.units import kt_to_ms, ms_to_kt
    >>> wind = SyntheticUpperAirWindProvider()
    >>> w = wind.get_wind(lat=13.0, lon=109.0, fl=320)
    >>> sol = solve_from_track(track_deg=90.0, tas_ms=kt_to_ms(460),
    ...                        u_ms=w.u, v_ms=w.v)
    >>> round(float(ms_to_kt(sol.gs_ms)))  # westerlies help an eastbound leg
    502
"""

from __future__ import annotations

from .atmosphere import atmosphere, cas_to_tas, gs_to_cas_kt, tas_to_cas
from .kinematics import (
    HeadingSolution,
    TrackSolution,
    dir_speed_to_uv,
    solve_from_heading,
    solve_from_track,
    uv_to_dir_speed,
)
from .providers import (
    GriddedWindProvider,
    SyntheticUpperAirWindProvider,
    WindFieldProvider,
    WindVector,
)

__all__ = [
    "atmosphere",
    "tas_to_cas",
    "cas_to_tas",
    "gs_to_cas_kt",
    "WindVector",
    "WindFieldProvider",
    "SyntheticUpperAirWindProvider",
    "GriddedWindProvider",
    "TrackSolution",
    "HeadingSolution",
    "solve_from_track",
    "solve_from_heading",
    "uv_to_dir_speed",
    "dir_speed_to_uv",
]
