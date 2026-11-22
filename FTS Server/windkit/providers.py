"""Wind field providers.

Two interchangeable backends behind one interface:

* :class:`SyntheticUpperAirWindProvider` — an analytical upper-tropospheric
  field (westerlies, a jet core, Rossby waves). Needs no data files, is
  reproducible, and is cheap enough for reinforcement-learning rollouts.
* :class:`GriddedWindProvider` — quadrilinear interpolation over a 4D
  ``(time, level, lat, lon)`` grid, the shape a GFS or ERA5 export takes.

This is deliberately *not* a replacement for the engine's own
``bluesky.traffic.windfield.Windfield``. That class is 3D with no time axis
and interpolates horizontally by inverse distance over scattered points,
which suits hand-placed wind vectors. What is added here is the time
dimension, a regular-grid interpolator, an analytical field, and a shear
diagnostic.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray

from .units import KTS, fl_to_m, fl_to_pressure_pa

__all__ = [
    "WindVector",
    "WindFieldProvider",
    "SyntheticUpperAirWindProvider",
    "GriddedWindProvider",
]


@dataclass(frozen=True)
class WindVector:
    """Wind at a point, components in m/s."""

    u: NDArray[np.float64] | float
    """Blowing toward east."""
    v: NDArray[np.float64] | float
    """Blowing toward north."""
    shear: NDArray[np.float64] | float | None = None
    """Total shear magnitude in 1/s, or None when not requested. Combines
    vertical and horizontal gradients; high values mark probable clear-air
    turbulence near jet boundaries."""

    @property
    def speed(self) -> NDArray[np.float64] | float:
        return np.hypot(np.asarray(self.u), np.asarray(self.v))


def _b(*arrays: ArrayLike) -> list[NDArray[np.float64]]:
    """Broadcast inputs to a common shape as float arrays."""
    return list(np.broadcast_arrays(*[np.asarray(a, dtype=float) for a in arrays]))


def _unwrap(x: NDArray[np.float64]) -> NDArray[np.float64] | float:
    return float(x) if x.ndim == 0 else x


class WindFieldProvider(ABC):
    """Interface every wind backend implements."""

    @abstractmethod
    def _uv(
        self,
        lat: NDArray[np.float64],
        lon: NDArray[np.float64],
        fl: NDArray[np.float64],
        t: NDArray[np.float64],
    ) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        """Return (u, v) in m/s for broadcast-compatible arrays."""

    def get_wind(
        self,
        lat: ArrayLike,
        lon: ArrayLike,
        fl: ArrayLike,
        time: ArrayLike = 0.0,
        *,
        with_shear: bool = False,
    ) -> WindVector:
        """Wind at one point or at many points at once.

        Shear is opt-in because computing it costs four extra field
        evaluations, which matters on a per-tick path.
        """
        la, lo, f, t = _b(lat, lon, fl, time)
        u, v = self._uv(la, lo, f, t)
        shear = self._shear(la, lo, f, t) if with_shear else None
        return WindVector(
            _unwrap(u), _unwrap(v), None if shear is None else _unwrap(shear)
        )

    def _shear(
        self,
        lat: NDArray[np.float64],
        lon: NDArray[np.float64],
        fl: NDArray[np.float64],
        t: NDArray[np.float64],
        *,
        d_fl: float = 10.0,
        d_deg: float = 0.5,
    ) -> NDArray[np.float64]:
        """Shear magnitude by central differences, in 1/s.

        Done generically on top of ``_uv`` so every backend gets it, and so a
        gridded field and an analytical one are diagnosed the same way.
        """
        u_up, v_up = self._uv(lat, lon, fl + d_fl, t)
        u_dn, v_dn = self._uv(lat, lon, fl - d_fl, t)
        dz = float(fl_to_m(2.0 * d_fl))
        dudz, dvdz = (u_up - u_dn) / dz, (v_up - v_dn) / dz

        u_n, v_n = self._uv(lat + d_deg, lon, fl, t)
        u_s, v_s = self._uv(lat - d_deg, lon, fl, t)
        dy = 2.0 * d_deg * 111_320.0
        dudy, dvdy = (u_n - u_s) / dy, (v_n - v_s) / dy

        return np.sqrt(dudz**2 + dvdz**2 + dudy**2 + dvdy**2)


@dataclass
class SyntheticUpperAirWindProvider(WindFieldProvider):
    """Analytical upper-air field: westerlies, a jet core, Rossby waves.

    Defaults describe a Northern-Hemisphere winter pattern over South-East
    Asia: prevailing westerlies of a few tens of knots strengthening toward
    the tropopause, a subtropical jet core to the north, and a travelling
    long-wave pattern in the meridional component.
    """

    base_westerly_kt: float = 45.0
    """Zonal wind at the profile peak, away from the jet."""
    peak_fl: float = 360.0
    """Flight level where the westerlies peak (near the tropopause)."""
    profile_halfwidth_fl: float = 160.0
    """Vertical scale over which the westerlies fall off."""

    jet_lat_deg: float = 28.0
    jet_peak_kt: float = 130.0
    jet_halfwidth_deg: float = 6.0
    jet_thickness_fl: float = 60.0

    rossby_amplitude_kt: float = 18.0
    rossby_wavenumber: float = 3.0
    """Waves around a full circle of longitude."""
    rossby_period_s: float = 5.0 * 86400.0
    """Eastward travel time for one wavelength."""

    def _uv(self, lat, lon, fl, t):
        # Westerlies: Gaussian in height, peaking near the tropopause.
        vert = np.exp(-(((fl - self.peak_fl) / self.profile_halfwidth_fl) ** 2))
        u = self.base_westerly_kt * KTS * vert

        # Jet core: Gaussian in both latitude and height.
        jet = (
            self.jet_peak_kt
            * KTS
            * np.exp(-(((lat - self.jet_lat_deg) / self.jet_halfwidth_deg) ** 2))
            * np.exp(-(((fl - self.peak_fl) / self.jet_thickness_fl) ** 2))
        )
        u = u + jet

        # Rossby waves: a travelling sinusoid in the meridional component,
        # weighted by the same vertical profile so it fades out low down.
        phase = np.radians(self.rossby_wavenumber * lon) - (
            2.0 * np.pi * t / self.rossby_period_s
        )
        v = self.rossby_amplitude_kt * KTS * np.sin(phase) * vert
        return u, v


class GriddedWindProvider(WindFieldProvider):
    """Quadrilinear interpolation over a regular 4D wind grid.

    Axes must be ascending. ``u`` and ``v`` are shaped
    ``(time, level, lat, lon)`` in m/s. Queries outside the grid clamp to the
    edge rather than failing, so an aircraft leaving the domain keeps flying.

    Vertical interpolation runs in log-pressure when ``level_pressure_hpa``
    is supplied, which is the physically right spacing for isobaric model
    output, and linearly in flight level otherwise.
    """

    def __init__(
        self,
        times_s: ArrayLike,
        levels_fl: ArrayLike,
        lats_deg: ArrayLike,
        lons_deg: ArrayLike,
        u_ms: ArrayLike,
        v_ms: ArrayLike,
        *,
        level_pressure_hpa: ArrayLike | None = None,
    ) -> None:
        self.times = np.asarray(times_s, dtype=float)
        self.levels = np.asarray(levels_fl, dtype=float)
        self.lats = np.asarray(lats_deg, dtype=float)
        self.lons = np.asarray(lons_deg, dtype=float)
        self.u = np.asarray(u_ms, dtype=float)
        self.v = np.asarray(v_ms, dtype=float)

        want = (self.times.size, self.levels.size, self.lats.size, self.lons.size)
        if self.u.shape != want or self.v.shape != want:
            raise ValueError(
                f"u and v must be shaped (time, level, lat, lon) = {want}, "
                f"got {self.u.shape} and {self.v.shape}"
            )
        for name, ax in (
            ("times_s", self.times),
            ("levels_fl", self.levels),
            ("lats_deg", self.lats),
            ("lons_deg", self.lons),
        ):
            if ax.size > 1 and np.any(np.diff(ax) <= 0):
                raise ValueError(f"{name} must be strictly ascending")

        # Vertical interpolation coordinate. Pressure falls as altitude
        # rises, so negating the log keeps the axis ascending like the
        # others and removes any need to reverse the data.
        if level_pressure_hpa is not None:
            p = np.asarray(level_pressure_hpa, dtype=float)
            if p.shape != self.levels.shape:
                raise ValueError("level_pressure_hpa must match levels_fl")
            self._zc = -np.log(p)
            self._z_of_fl = lambda fl: -np.log(fl_to_pressure_pa(fl) / 100.0)
        else:
            self._zc = self.levels
            self._z_of_fl = lambda fl: np.asarray(fl, dtype=float)

        if self._zc.size > 1 and np.any(np.diff(self._zc) <= 0):
            raise ValueError("level_pressure_hpa must be strictly descending")

    @staticmethod
    def _stencil(axis: NDArray[np.float64], q: NDArray[np.float64]):
        """Bracketing indices and weight for each query, clamped at the edges.

        A length-one axis yields both indices equal and zero weight, so the
        interpolation below needs no special case for degenerate axes.
        """
        if axis.size == 1:
            z = np.zeros(np.shape(q), dtype=int)
            return z, z, np.zeros(np.shape(q))
        qc = np.clip(q, axis[0], axis[-1])
        i0 = np.clip(np.searchsorted(axis, qc, side="right") - 1, 0, axis.size - 2)
        w = (qc - axis[i0]) / (axis[i0 + 1] - axis[i0])
        return i0, i0 + 1, w

    def _uv(self, lat, lon, fl, t):
        it0, it1, wt = self._stencil(self.times, t)
        iz0, iz1, wz = self._stencil(self._zc, self._z_of_fl(fl))
        iy0, iy1, wy = self._stencil(self.lats, lat)
        ix0, ix1, wx = self._stencil(self.lons, lon)

        acc_u = np.zeros(np.shape(lat), dtype=float)
        acc_v = np.zeros(np.shape(lat), dtype=float)
        for ti, tw in ((it0, 1.0 - wt), (it1, wt)):
            for zi, zw in ((iz0, 1.0 - wz), (iz1, wz)):
                for yi, yw in ((iy0, 1.0 - wy), (iy1, wy)):
                    for xi, xw in ((ix0, 1.0 - wx), (ix1, wx)):
                        w = tw * zw * yw * xw
                        idx = (ti, zi, yi, xi)
                        acc_u = acc_u + w * self.u[idx]
                        acc_v = acc_v + w * self.v[idx]
        return acc_u, acc_v
