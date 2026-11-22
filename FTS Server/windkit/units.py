"""Unit constants and conversions for the wind module.

Internal convention follows the simulation engine exactly (see
``bluesky/tools/aero.py``): speeds in m/s, altitudes in m, angles in degrees.
Conversions to the units people actually read (knots, feet, flight levels)
are explicit at the boundary.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike, NDArray

# Same values the engine uses, so a round trip through either is exact.
KTS = 0.514444  # m/s per knot
FT = 0.3048  # m per foot
NM = 1852.0  # m per nautical mile

# ISA constants
P0 = 101325.0  # Pa, sea-level pressure
T0 = 288.15  # K, sea-level temperature
BETA = -0.0065  # K/m, tropospheric lapse rate
R_AIR = 287.05287  # J/(kg K)
G0 = 9.80665  # m/s2
H_TROPOPAUSE = 11000.0  # m
T_STRAT = 216.65  # K
P_TROPOPAUSE = 22632.0  # Pa, ISA pressure at 11 km


def kt_to_ms(v: ArrayLike) -> NDArray[np.float64]:
    """Knots to m/s."""
    return np.asarray(v, dtype=float) * KTS


def ms_to_kt(v: ArrayLike) -> NDArray[np.float64]:
    """m/s to knots."""
    return np.asarray(v, dtype=float) / KTS


def fl_to_m(fl: ArrayLike) -> NDArray[np.float64]:
    """Flight level (hundreds of feet) to metres of pressure altitude."""
    return np.asarray(fl, dtype=float) * 100.0 * FT


def m_to_fl(h: ArrayLike) -> NDArray[np.float64]:
    """Metres of pressure altitude to flight level."""
    return np.asarray(h, dtype=float) / (100.0 * FT)


def fl_to_pressure_pa(fl: ArrayLike) -> NDArray[np.float64]:
    """ISA pressure at a flight level, valid through the lower stratosphere.

    Cruise levels straddle the tropopause (FL360 sits almost exactly on it),
    so both regimes are handled rather than extrapolating the tropospheric
    formula upward.
    """
    h = fl_to_m(fl)
    trop = P0 * (1.0 + BETA * np.minimum(h, H_TROPOPAUSE) / T0) ** (
        -G0 / (BETA * R_AIR)
    )
    strat = P_TROPOPAUSE * np.exp(
        -G0 * (h - H_TROPOPAUSE) / (R_AIR * T_STRAT)
    )
    return np.where(h <= H_TROPOPAUSE, trop, strat)


def pressure_hpa_to_fl(p_hpa: ArrayLike) -> NDArray[np.float64]:
    """Isobaric level in hPa to flight level, the inverse of the above.

    Lets a GFS or ERA5 export indexed by pressure level be placed on the
    flight-level axis the rest of the module works in.
    """
    p = np.asarray(p_hpa, dtype=float) * 100.0
    h_trop = (T0 / BETA) * ((p / P0) ** (-BETA * R_AIR / G0) - 1.0)
    h_strat = H_TROPOPAUSE + (R_AIR * T_STRAT / G0) * np.log(P_TROPOPAUSE / p)
    return m_to_fl(np.where(p >= P_TROPOPAUSE, h_trop, h_strat))


def wrap360(deg: ArrayLike) -> NDArray[np.float64]:
    """Normalise an angle to [0, 360)."""
    return np.asarray(deg, dtype=float) % 360.0


def wrap180(deg: ArrayLike) -> NDArray[np.float64]:
    """Normalise an angle difference to (-180, 180]."""
    d = (np.asarray(deg, dtype=float) + 180.0) % 360.0 - 180.0
    return np.where(d == -180.0, 180.0, d)
