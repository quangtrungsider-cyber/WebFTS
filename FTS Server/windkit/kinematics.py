"""Wind triangle solvers.

Two directions, because a fast-time simulation needs both:

* :func:`solve_from_track` — the aircraft wants to follow a desired track
  (waypoint to waypoint) and we need the heading to steer and the resulting
  ground speed. The engine does not provide this direction.
* :func:`solve_from_heading` — a heading is commanded (vectoring, or an RL
  agent acting) and we need the resulting track and ground speed. This
  matches ``Traffic.update_groundspeed`` in the engine exactly, so results
  stay consistent with the simulation.

Conventions, matching both the engine and meteorological practice:

* ``u`` is the wind component blowing toward east, ``v`` toward north, m/s.
* Wind direction ``psi_w`` is the direction the wind blows *from*, degrees.
* Track and heading are degrees true, clockwise from north.
* x is east and y is north, so a bearing b has components
  ``(sin b, cos b)`` — note this is transposed from the usual maths
  convention and is why ``atan2`` takes east first.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray

from .units import wrap180, wrap360

__all__ = [
    "TrackSolution",
    "HeadingSolution",
    "uv_to_dir_speed",
    "dir_speed_to_uv",
    "solve_from_track",
    "solve_from_heading",
]


def _as_float(x: ArrayLike) -> NDArray[np.float64]:
    return np.asarray(x, dtype=float)


def _unwrap_scalar(*arrays: NDArray[np.float64]):
    """Return plain floats when every input was scalar, arrays otherwise.

    Keeps single-aircraft calls ergonomic without giving up vectorisation.
    """
    if all(a.ndim == 0 for a in arrays):
        return tuple(float(a) for a in arrays)
    return arrays


@dataclass(frozen=True)
class TrackSolution:
    """Result of flying a desired track through a wind field."""

    heading_deg: NDArray[np.float64] | float
    """True heading to steer."""
    wca_deg: NDArray[np.float64] | float
    """Wind correction angle, heading minus track."""
    gs_ms: NDArray[np.float64] | float
    """Ground speed along the desired track."""
    headwind_ms: NDArray[np.float64] | float
    """Component opposing the track; negative means a tailwind."""
    crosswind_ms: NDArray[np.float64] | float
    """Component across the track, positive from the right."""
    feasible: NDArray[np.bool_] | bool
    """False where the crosswind exceeds true airspeed, or where the
    resulting ground speed would be zero or negative — the track cannot be
    held. Values are clamped rather than returned as NaN."""


@dataclass(frozen=True)
class HeadingSolution:
    """Result of holding a heading through a wind field."""

    track_deg: NDArray[np.float64] | float
    gs_ms: NDArray[np.float64] | float
    drift_deg: NDArray[np.float64] | float
    """Track minus heading, the drift the wind imposes."""


def uv_to_dir_speed(
    u: ArrayLike, v: ArrayLike
) -> tuple[NDArray[np.float64] | float, NDArray[np.float64] | float]:
    """Wind components to meteorological direction (deg from) and speed."""
    u_a, v_a = _as_float(u), _as_float(v)
    direction = wrap360(np.degrees(np.arctan2(-u_a, -v_a)))
    speed = np.hypot(u_a, v_a)
    return _unwrap_scalar(np.asarray(direction), np.asarray(speed))


def dir_speed_to_uv(
    psi_w_deg: ArrayLike, speed: ArrayLike
) -> tuple[NDArray[np.float64] | float, NDArray[np.float64] | float]:
    """Meteorological direction (deg from) and speed to wind components."""
    psi = np.radians(_as_float(psi_w_deg))
    w = _as_float(speed)
    return _unwrap_scalar(np.asarray(-w * np.sin(psi)), np.asarray(-w * np.cos(psi)))


def solve_from_track(
    track_deg: ArrayLike,
    tas_ms: ArrayLike,
    u_ms: ArrayLike,
    v_ms: ArrayLike,
) -> TrackSolution:
    """Solve the wind triangle for a desired track.

    ``wca = arcsin(W sin(psi_w - track) / tas)`` and
    ``gs = tas cos(wca) - W cos(psi_w - track)``.

    When the crosswind exceeds true airspeed the arcsine has no solution:
    the aircraft cannot hold the track at all. Rather than emitting NaN into
    a running simulation, the sine is clamped to +/-1 (the heading closest to
    holding track) and ``feasible`` is set False so the caller can react.
    """
    chi = _as_float(track_deg)
    tas = _as_float(tas_ms)
    u, v = _as_float(u_ms), _as_float(v_ms)

    psi_w = wrap360(np.degrees(np.arctan2(-u, -v)))
    w = np.hypot(u, v)
    delta = np.radians(wrap180(psi_w - chi))

    crosswind = w * np.sin(delta)
    headwind = w * np.cos(delta)

    with np.errstate(divide="ignore", invalid="ignore"):
        sin_wca = np.where(tas > 0.0, crosswind / tas, 0.0)
    solvable = np.abs(sin_wca) <= 1.0
    wca = np.arcsin(np.clip(sin_wca, -1.0, 1.0))

    gs = tas * np.cos(wca) - headwind
    feasible = solvable & (gs > 0.0)
    gs = np.maximum(gs, 0.0)

    heading = wrap360(chi + np.degrees(wca))
    out = _unwrap_scalar(
        np.asarray(heading),
        np.asarray(np.degrees(wca)),
        np.asarray(gs),
        np.asarray(headwind),
        np.asarray(crosswind),
    )
    feas = bool(feasible) if np.ndim(feasible) == 0 else np.asarray(feasible)
    return TrackSolution(*out, feasible=feas)


def solve_from_heading(
    heading_deg: ArrayLike,
    tas_ms: ArrayLike,
    u_ms: ArrayLike,
    v_ms: ArrayLike,
) -> HeadingSolution:
    """Solve the wind triangle for a commanded heading.

    Straight vector addition, identical to the engine's own ground speed
    update, so a scenario driven through this solver and one driven through
    the engine agree.
    """
    psi = np.radians(_as_float(heading_deg))
    tas = _as_float(tas_ms)
    u, v = _as_float(u_ms), _as_float(v_ms)

    gs_east = tas * np.sin(psi) + u
    gs_north = tas * np.cos(psi) + v
    gs = np.hypot(gs_east, gs_north)
    track = wrap360(np.degrees(np.arctan2(gs_east, gs_north)))
    drift = wrap180(track - np.degrees(psi))

    out = _unwrap_scalar(np.asarray(track), np.asarray(gs), np.asarray(drift))
    return HeadingSolution(*out)
