"""
Acceleration/deceleration-limited point-mass kinematics for ground-taxi
MOVE-command generation, for use with BlueSky (which has no taxi model of
its own -- see below).

Adopted from OpenTaxi (github.com/ATMRI-NTU/OpenTaxi, MIT licensed,
`opentaxi/aircraft.py`'s `motion_update()`): a plain point-mass model with
hard accel/decel limits and a speed floor of 0, not an aerodynamic/thrust
model. This module borrows that ~30-line *concept*, not OpenTaxi's code --
OpenTaxi itself is tightly coupled to GraphML/UTM projection and matplotlib,
and its own pathfinding hits the same graph-disconnected-parking-spot
problem this project already has with real apt.dat data, so there was
nothing else worth reusing from it directly.

Why this exists: this session's VVDN_1HR_MULTI_GATE_DEP_35R.scn work found,
by live-simulation testing (bs.init(mode='sim', detached=True) + manual
bs.sim.step() + reading bs.traf.gs), that BlueSky's own BADA/performance
model goes numerically unstable at any commanded speed below ~4kt (CRE or
MOVE, at any point) -- a 1-line scenario (CRE ...,0,2) alone reproduces a
free-running acceleration to hundreds of knots within ~2 seconds; ...,0,4
is stable indefinitely. That happens because BlueSky solves real lift/drag
equations that have a singularity there; a plain point-mass model (this
module) has nothing to blow up, so it can safely represent 0-8kt taxi
speeds that MOVE then just replays into BlueSky -- BlueSky's own physics
never has to touch anything below the confirmed-safe floor.

Usage:
    from WebATM.server.taxi_kinematics import integrate_path

    # waypoints: real taxiway nodes with a target speed to be AT by the time
    # the aircraft reaches each one (turns get a low target, straight
    # stretches get cruise) -- e.g. from AptDatTaxiGraph.route()
    waypoints = [
        (16.048686, 108.201668, 20.0),  # first entry's target is unused
        (16.048253, 108.201906, 20.0),
        (16.047298, 108.202052, 8.0),   # a turn -- slow down approaching it
        (16.047177, 108.201317, 20.0),  # cruise again after the turn
        ...
    ]
    samples = integrate_path(waypoints, v0_kt=5.0)
    for t_rel, lat, lon, hdg, spd_kt in samples:
        # emit f"{fmt_t(t0 + t_rel)}>MOVE {acid},{lat:.6f},{lon:.6f},0,{hdg:.1f},{spd_kt:.1f}"
        ...
"""

from __future__ import annotations

import math

_R_EARTH_M = 6371000.0
_KT_TO_MPS = 1852.0 / 3600.0

# Confirmed-by-testing BlueSky floor (see module docstring): never emit a
# speed below this, regardless of what a caller requests as a target.
DEFAULT_MIN_SPEED_KT = 5.0

# OpenTaxi's own defaults (aircraft.py) -- gentle, real-world-plausible taxi
# accel/decel; not independently re-verified against a citable real-world
# source, but a reasonable starting point, and callers can override either.
DEFAULT_MAX_ACC_MPS2 = 0.2
DEFAULT_MAX_DEC_MPS2 = 0.5


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * _R_EARTH_M * math.asin(math.sqrt(a))


def _bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def _lerp_point(lat1: float, lon1: float, lat2: float, lon2: float, f: float) -> tuple[float, float]:
    return (lat1 + (lat2 - lat1) * f, lon1 + (lon2 - lon1) * f)


def integrate_path(
    waypoints: list[tuple[float, float, float]],
    v0_kt: float,
    dt: float = 2.0,
    max_acc_mps2: float = DEFAULT_MAX_ACC_MPS2,
    max_dec_mps2: float = DEFAULT_MAX_DEC_MPS2,
    min_speed_kt: float = DEFAULT_MIN_SPEED_KT,
) -> list[tuple[float, float, float, float, float]]:
    """Simulate accel/decel-limited motion along a polyline of waypoints,
    each carrying the speed the aircraft should be AT by the time it
    reaches that point (braking/accelerating smoothly beforehand -- not
    instantly -- using a lookahead check: brake now only if holding off
    any longer would require exceeding max_dec_mps2 to still hit the
    target by the time the point is reached).

    Arguments:
    - waypoints: [(lat, lon, target_spd_kt), ...], >= 2 entries. First
      entry's target_spd_kt is ignored (v0_kt is the true starting speed).
    - v0_kt: actual starting speed at waypoints[0].
    - dt: seconds between emitted samples.
    - max_acc_mps2 / max_dec_mps2: hard kinematic limits.
    - min_speed_kt: hard floor -- see module docstring for why this
      defaults to 5.0 and should not be lowered below ~4 for BlueSky use.

    Returns [(t_rel_s, lat, lon, hdg_deg, spd_kt), ...], dt apart, starting
    at t_rel_s=dt (the caller already has t=0 as waypoints[0]'s own state,
    e.g. via CRE).
    """
    if len(waypoints) < 2:
        raise ValueError("integrate_path needs at least 2 waypoints")

    floor = min_speed_kt * _KT_TO_MPS

    seg_len = []
    seg_hdg = []
    for i in range(len(waypoints) - 1):
        lat1, lon1, _ = waypoints[i]
        lat2, lon2, _ = waypoints[i + 1]
        seg_len.append(_haversine_m(lat1, lon1, lat2, lon2))
        seg_hdg.append(_bearing_deg(lat1, lon1, lat2, lon2))

    n_segs = len(seg_len)
    samples = []
    t = 0.0
    v = max(v0_kt * _KT_TO_MPS, floor)
    seg_idx = 0
    dist_into_seg = 0.0

    while seg_idx < n_segs:
        target_v = max(waypoints[seg_idx + 1][2] * _KT_TO_MPS, floor)
        d_remaining = max(seg_len[seg_idx] - dist_into_seg, 1e-6)

        if target_v < v - 1e-6:
            required_dec = (v * v - target_v * target_v) / (2.0 * d_remaining)
            a = -max_dec_mps2 if required_dec >= max_dec_mps2 else 0.0
        elif target_v > v + 1e-6:
            a = max_acc_mps2
        else:
            a = 0.0

        v_next = max(floor, v + a * dt)
        d_step = ((v + v_next) / 2.0) * dt
        v = v_next
        t += dt

        remaining_step = d_step
        while seg_idx < n_segs and remaining_step >= (seg_len[seg_idx] - dist_into_seg):
            remaining_step -= (seg_len[seg_idx] - dist_into_seg)
            dist_into_seg = 0.0
            seg_idx += 1
        if seg_idx >= n_segs:
            lat, lon = waypoints[-1][0], waypoints[-1][1]
            hdg = seg_hdg[-1]
            samples.append((t, lat, lon, hdg, v / _KT_TO_MPS))
            break

        dist_into_seg += remaining_step
        length = seg_len[seg_idx]
        f = 0.0 if length < 1e-6 else min(1.0, dist_into_seg / length)
        lat, lon = _lerp_point(waypoints[seg_idx][0], waypoints[seg_idx][1],
                                waypoints[seg_idx + 1][0], waypoints[seg_idx + 1][1], f)
        hdg = seg_hdg[seg_idx]
        samples.append((t, lat, lon, hdg, v / _KT_TO_MPS))

    return samples
