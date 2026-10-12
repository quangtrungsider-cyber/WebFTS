"""
Offline conflict/separation scheduling for pre-computed taxi trajectories,
for use with BlueSky MOVE-command scenario generation.

Adapted from OpenTaxi's `opentaxi/controller.py` (`Opt_StopGo`, MIT
licensed): priority-ordered (first-come-first-served) separation checking,
where a lower-priority aircraft found within `min_separation_m` of a
higher-priority one is made to hold until clear. OpenTaxi runs this as a
LIVE per-tick controller inside its own simulation loop (it has direct
access to every aircraft's current position and full future path each
step). This project's BlueSky scenarios are pre-computed offline (a whole
.scn file is generated before anything runs), so this module reimplements
the same FCFS/minimum-separation idea as a one-shot scheduling pass instead:
process aircraft in priority order, and for each one, repeatedly insert a
hold into ITS OWN trajectory (computed by `taxi_kinematics.integrate_path`)
wherever it would come within `min_separation_m` of an already-scheduled
(higher-priority) aircraft's trajectory at the same absolute time, until no
such conflict remains along its route.

This exists because a purely-fixed-time-offset departure schedule (e.g.
"push back every 2.5 minutes") has no guarantee that two aircraft sharing
the same taxiway trunk are ever actually far enough apart -- exactly the
"tau bay chong len nhau" (aircraft overlapping) symptom observed when
running VVDN_1HR_MULTI_GATE_DEP_35R.scn.

Usage:
    from WebATM.server.taxi_kinematics import integrate_path
    from WebATM.server.taxi_separation import schedule_with_separation

    entries = []  # (acid, t0, samples) in priority order (earliest t0 first)
    for acid, t0, waypoints, v0_kt in departures:
        samples = integrate_path(waypoints, v0_kt, dt=dt)
        entries.append((acid, t0, samples))

    scheduled = schedule_with_separation(entries, dt=dt, min_separation_m=100.0)
    for acid, t0, samples, total_hold_s in scheduled:
        # emit MOVE lines using t0 + t_rel for each sample, as before --
        # samples may now be longer (holds inserted) than the input.
        ...
"""

from __future__ import annotations

import math

_R_EARTH_M = 6371000.0


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * _R_EARTH_M * math.asin(math.sqrt(a))


def _sample_at(samples: list[tuple], t0: float, t_abs: float, dt: float):
    """Nearest-index lookup of (lat, lon) for this aircraft's trajectory at
    absolute time t_abs, or None if t_abs falls outside its active window
    (before creation or after its trajectory ends -- meaning it's not a
    factor at that moment)."""
    if not samples:
        return None
    t_rel = t_abs - t0
    if t_rel < 0:
        return None  # not created yet
    idx = round(t_rel / dt) - 1  # samples[0] corresponds to t_rel == dt
    if idx < 0:
        idx = 0
    if idx >= len(samples):
        return None  # already finished/departed this ground trajectory
    _, lat, lon, _, _ = samples[idx]
    return lat, lon


def _insert_hold(samples: list[tuple], at_index: int, hold_s: float, dt: float, hold_spd_kt: float):
    """Insert `hold_s` seconds of holding in place at samples[at_index]'s
    position, then shift every subsequent sample's t_rel later by hold_s.
    Returns the new sample list."""
    if at_index < 0:
        at_index = 0
    if at_index >= len(samples):
        at_index = len(samples) - 1
    t_hold, lat, lon, hdg, _spd = samples[at_index]
    n_hold_steps = max(1, round(hold_s / dt))
    hold_samples = [(t_hold + k * dt, lat, lon, hdg, hold_spd_kt) for k in range(1, n_hold_steps + 1)]
    shifted_rest = [(t + n_hold_steps * dt, la, lo, h, s) for (t, la, lo, h, s) in samples[at_index + 1:]]
    return samples[: at_index + 1] + hold_samples + shifted_rest


def _first_conflict_index(
    t0: float,
    samples: list[tuple],
    finalized: list[tuple[str, float, list[tuple]]],
    dt: float,
    min_separation_m: float,
) -> int | None:
    """Index into `samples` of the first point where this aircraft would be
    within min_separation_m of any already-finalized (higher-priority)
    aircraft, or None if the whole path is clear."""
    for idx, (t_rel, lat, lon, _hdg, _spd) in enumerate(samples):
        t_abs = t0 + t_rel
        for _acid, other_t0, other_samples in finalized:
            other_pos = _sample_at(other_samples, other_t0, t_abs, dt)
            if other_pos is None:
                continue
            if _haversine_m(lat, lon, *other_pos) < min_separation_m:
                return idx
    return None


def _safe_hold_index(
    t0: float,
    samples: list[tuple],
    conflict_idx: int,
    finalized: list[tuple[str, float, list[tuple]]],
    dt: float,
    min_separation_m: float,
    hold_window_s: float,
) -> int | None:
    """Back up from `conflict_idx` to find an index where waiting in place
    would NOT itself be within min_separation_m of any finalized aircraft
    at any point during a hold of up to hold_window_s -- i.e., a genuinely
    safe place to sit, not just "one sample before the point that was too
    close". Without this, a hold gets inserted at a position that is ITSELF
    inside the other aircraft's approach corridor (both converging on the
    same shared taxiway trunk), so no amount of additional wait there ever
    clears the conflict -- confirmed by testing: naively holding one index
    back needed 3000+s (50 min) without ever resolving a ~95m conflict
    between two aircraft converging on the same trunk from different gates.

    Returns None if NO index down to and including 0 is safe -- this means
    the whole remaining route is inside some finalized aircraft's corridor
    for the entire hold_window_s, so no mid-route hold can help; the caller
    must delay this aircraft's pushback time (t0) instead. Returning 0 as
    an unverified fallback here was the second scheduler bug found by live
    testing: it looks identical to "index 0 is verified safe" to the
    caller, so the same no-op hold got reinserted at the same spot every
    iteration forever (VDN909 still 0.7m from VDN908 after 3000s of
    accumulated "hold").
    """
    n_checks = max(1, int(hold_window_s // dt))

    def is_safe(idx: int) -> bool:
        t_rel_hold, lat, lon, _hdg, _spd = samples[idx]
        for k in range(n_checks):
            t_abs = t0 + t_rel_hold + k * dt
            for _acid, other_t0, other_samples in finalized:
                other_pos = _sample_at(other_samples, other_t0, t_abs, dt)
                if other_pos is not None and _haversine_m(lat, lon, *other_pos) < min_separation_m:
                    return False
        return True

    for hold_idx in range(max(0, conflict_idx - 1), -1, -1):
        if is_safe(hold_idx):
            return hold_idx
    return None


def schedule_with_separation(
    entries: list[tuple[str, float, list[tuple]]],
    dt: float,
    min_separation_m: float = 100.0,
    hold_increment_s: float = 10.0,
    max_iterations: int = 300,
    hold_window_s: float = 200.0,
) -> list[tuple[str, float, list[tuple], float]]:
    """FCFS separation scheduling. `entries` must already be in priority
    order (earlier = higher priority, e.g. sorted by pushback time t0) --
    earlier aircraft are never delayed for later ones, matching real-world
    "first to push back has right of way" ground-ops convention (also
    OpenTaxi's own priority rule, adapted from "closer to destination").

    Returns [(acid, t0, samples, total_hold_s), ...] in the same order,
    where samples may have extra hold-points inserted (and later samples'
    t_rel shifted later) versus the input.
    """
    finalized: list[tuple[str, float, list[tuple]]] = []
    result = []
    for acid, t0, samples in entries:
        total_hold = 0.0
        for _ in range(max_iterations):
            conflict_idx = _first_conflict_index(t0, samples, finalized, dt, min_separation_m)
            if conflict_idx is None:
                break
            hold_idx = None if conflict_idx == 0 else _safe_hold_index(
                t0, samples, conflict_idx, finalized, dt, min_separation_m, hold_window_s
            )
            if hold_idx is None:
                # Either the violation is at/before the very first
                # post-creation sample, or no position anywhere along the
                # route so far is safe to sit at for hold_window_s (the
                # whole remaining route is inside some finalized aircraft's
                # corridor) -- either way, no mid-route hold can help, so
                # delay this aircraft's whole pushback (t0) instead.
                # Equivalent to inserting the hold "at the gate".
                t0 += hold_increment_s
            else:
                hold_kt = samples[hold_idx][4]
                samples = _insert_hold(samples, hold_idx, hold_increment_s, dt, hold_kt)
            total_hold += hold_increment_s
        else:
            # Loop exhausted max_iterations without a clean break -- fail
            # loud rather than silently shipping an under-separated
            # schedule (this bit the first version of this module: hitting
            # the cap read as "converged" until live-simulation testing
            # caught two aircraft 0.7m apart).
            remaining = _first_conflict_index(t0, samples, finalized, dt, min_separation_m)
            if remaining is not None:
                raise RuntimeError(
                    f"schedule_with_separation: {acid} still has an unresolved "
                    f"separation conflict after {max_iterations} iterations "
                    f"({total_hold:.0f}s of hold already applied). Raise "
                    f"max_iterations or hold_increment_s."
                )
        finalized.append((acid, t0, samples))
        result.append((acid, t0, samples, total_hold))
    return result
