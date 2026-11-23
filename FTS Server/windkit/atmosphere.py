"""ISA atmosphere and airspeed conversions.

Kept here as the single place these conversions live. They were previously
copied into each scenario generator, one copy got fixed and the others did
not, and scenarios went out with aircraft cruising at 750 kt true airspeed.

The formulas reproduce ``bluesky/tools/aero.py`` exactly, so a speed written
into a scenario converts back to the intended value inside the engine
(verified to 0.0 kt in the tests).
"""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike, NDArray

from .units import (
    BETA,
    FT,
    H_TROPOPAUSE,
    KTS,
    P0,
    R_AIR,
    RHO0,
    T0,
    T_STRAT,
)

__all__ = [
    "atmosphere",
    "tas_to_cas",
    "cas_to_tas",
    "gs_to_cas_kt",
]


def atmosphere(
    h_m: ArrayLike,
) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
    """ISA pressure (Pa), density (kg/m3) and temperature (K) at altitude."""
    h = np.asarray(h_m, dtype=float)
    temp = np.maximum(T0 + BETA * h, T_STRAT)
    rho_trop = RHO0 * (temp / T0) ** 4.256848030018761
    rho = rho_trop * np.exp(-np.maximum(0.0, h - H_TROPOPAUSE) / 6341.552161)
    return rho * R_AIR * temp, rho, temp


def tas_to_cas(tas_ms: ArrayLike, h_m: ArrayLike) -> NDArray[np.float64]:
    """True airspeed to calibrated airspeed, both m/s."""
    tas = np.asarray(tas_ms, dtype=float)
    p, rho, _ = atmosphere(h_m)
    qdyn = p * ((1.0 + rho * tas * tas / (7.0 * p)) ** 3.5 - 1.0)
    cas = np.sqrt(7.0 * P0 / RHO0 * ((qdyn / P0 + 1.0) ** (2.0 / 7.0) - 1.0))
    return np.where(tas < 0, -cas, cas)


def cas_to_tas(cas_ms: ArrayLike, h_m: ArrayLike) -> NDArray[np.float64]:
    """Calibrated airspeed to true airspeed, both m/s."""
    cas = np.asarray(cas_ms, dtype=float)
    p, rho, _ = atmosphere(h_m)
    qdyn = P0 * ((1.0 + RHO0 * cas * cas / (7.0 * P0)) ** 3.5 - 1.0)
    tas = np.sqrt(7.0 * p / rho * ((qdyn / p + 1.0) ** (2.0 / 7.0) - 1.0))
    return np.where(cas < 0, -tas, tas)


def gs_to_cas_kt(gs_kt: ArrayLike, alt_ft: ArrayLike) -> NDArray[np.float64]:
    """Ground speed in knots to the calibrated airspeed a scenario should carry.

    The engine reads the speed argument of CRE and MOVE as calibrated
    airspeed. With no wind field loaded it then sets ground speed equal to
    true airspeed, so writing ``tas_to_cas(gs)`` makes the simulated ground
    speed come out at the observed value. Feeding ground speed in directly
    inflates true airspeed by roughly 1.4 to 1.7 times at cruise.

    Note this makes the displayed true airspeed equal the real *ground*
    speed, not the aircraft's real true airspeed. Without wind data that is
    the choice that reproduces the real trajectory and timing, which is what
    sector occupancy and dwell time depend on.
    """
    gs = np.asarray(gs_kt, dtype=float)
    cas = tas_to_cas(gs * KTS, np.asarray(alt_ft, dtype=float) * FT) / KTS
    return np.where(gs <= 0.0, 0.0, cas)
