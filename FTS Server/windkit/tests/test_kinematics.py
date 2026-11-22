"""Wind triangle tests.

Each case is checked against something independent of the formula under
test: a hand-computed value, vector closure, or the opposite solver.
"""

from __future__ import annotations

import numpy as np
import pytest

from windkit import (
    dir_speed_to_uv,
    solve_from_heading,
    solve_from_track,
    uv_to_dir_speed,
)
from windkit.units import kt_to_ms

TAS = kt_to_ms(450.0)


def test_pure_tailwind():
    """Wind from 270 on an easterly track adds straight onto ground speed."""
    w = kt_to_ms(50.0)
    u, v = dir_speed_to_uv(270.0, w)
    s = solve_from_track(track_deg=90.0, tas_ms=TAS, u_ms=u, v_ms=v)

    assert s.wca_deg == pytest.approx(0.0, abs=1e-9)
    assert s.gs_ms == pytest.approx(TAS + w)
    assert s.heading_deg == pytest.approx(90.0)
    assert s.headwind_ms == pytest.approx(-w)  # negative: a tailwind
    assert s.crosswind_ms == pytest.approx(0.0, abs=1e-9)
    assert s.feasible


def test_pure_headwind():
    """Same wind on a westerly track subtracts instead."""
    w = kt_to_ms(50.0)
    u, v = dir_speed_to_uv(270.0, w)
    s = solve_from_track(track_deg=270.0, tas_ms=TAS, u_ms=u, v_ms=v)

    assert s.wca_deg == pytest.approx(0.0, abs=1e-9)
    assert s.gs_ms == pytest.approx(TAS - w)
    assert s.heading_deg == pytest.approx(270.0)
    assert s.headwind_ms == pytest.approx(w)
    assert s.feasible


def test_pure_crosswind_drifts_into_wind():
    """A wind from the left needs a heading cranked to the left of track."""
    w = kt_to_ms(60.0)
    u, v = dir_speed_to_uv(0.0, w)  # from the north
    s = solve_from_track(track_deg=90.0, tas_ms=TAS, u_ms=u, v_ms=v)

    assert s.wca_deg < 0.0  # heading left of an easterly track
    assert s.wca_deg == pytest.approx(np.degrees(np.arcsin(-w / TAS)))
    # No along-track component, so ground speed is the remaining leg.
    assert s.gs_ms == pytest.approx(np.sqrt(TAS**2 - w**2))
    assert s.feasible


def test_vector_closure():
    """TAS vector plus wind vector must equal the ground speed vector.

    This checks the triangle itself rather than either formula.
    """
    rng = np.random.default_rng(20261122)
    track = rng.uniform(0.0, 360.0, 500)
    psi_w = rng.uniform(0.0, 360.0, 500)
    w = kt_to_ms(rng.uniform(0.0, 120.0, 500))
    u, v = dir_speed_to_uv(psi_w, w)

    s = solve_from_track(track, TAS, u, v)
    assert np.all(s.feasible)

    hdg = np.radians(s.heading_deg)
    east = TAS * np.sin(hdg) + u
    north = TAS * np.cos(hdg) + v

    # Resulting velocity must lie along the requested track...
    assert np.allclose(np.degrees(np.arctan2(east, north)) % 360.0, track)
    # ...with the magnitude the solver reported.
    assert np.allclose(np.hypot(east, north), s.gs_ms)


def test_round_trip_between_solvers():
    """Heading from the track solver must reproduce that track."""
    rng = np.random.default_rng(7)
    track = rng.uniform(0.0, 360.0, 300)
    u = kt_to_ms(rng.uniform(-90.0, 90.0, 300))
    v = kt_to_ms(rng.uniform(-60.0, 60.0, 300))

    fwd = solve_from_track(track, TAS, u, v)
    back = solve_from_heading(fwd.heading_deg, TAS, u, v)

    assert np.allclose(back.track_deg, track)
    assert np.allclose(back.gs_ms, fwd.gs_ms)
    assert np.allclose(back.drift_deg, -fwd.wca_deg, atol=1e-9)


def test_excessive_crosswind_is_flagged_not_nan():
    """A crosswind beyond true airspeed makes the track unholdable."""
    slow = kt_to_ms(80.0)
    u, v = dir_speed_to_uv(0.0, kt_to_ms(200.0))  # 200 kt from the north
    s = solve_from_track(track_deg=90.0, tas_ms=slow, u_ms=u, v_ms=v)

    assert not s.feasible
    assert np.isfinite(s.heading_deg)
    assert np.isfinite(s.gs_ms)
    assert s.gs_ms >= 0.0


def test_headwind_stronger_than_airspeed_is_flagged():
    """Being blown backwards is reported, not returned as negative speed."""
    slow = kt_to_ms(60.0)
    u, v = dir_speed_to_uv(270.0, kt_to_ms(100.0))
    s = solve_from_track(track_deg=270.0, tas_ms=slow, u_ms=u, v_ms=v)

    assert not s.feasible
    assert s.gs_ms == pytest.approx(0.0)


def test_zero_wind_is_identity():
    s = solve_from_track(track_deg=123.4, tas_ms=TAS, u_ms=0.0, v_ms=0.0)
    assert s.heading_deg == pytest.approx(123.4)
    assert s.gs_ms == pytest.approx(TAS)

    h = solve_from_heading(heading_deg=123.4, tas_ms=TAS, u_ms=0.0, v_ms=0.0)
    assert h.track_deg == pytest.approx(123.4)
    assert h.drift_deg == pytest.approx(0.0)


def test_direction_component_round_trip():
    """Direction/speed and u/v must convert both ways without drift."""
    psi = np.array([0.0, 45.0, 90.0, 180.0, 270.0, 359.0])
    spd = kt_to_ms(np.array([5.0, 30.0, 60.0, 90.0, 120.0, 150.0]))
    u, v = dir_speed_to_uv(psi, spd)
    psi_back, spd_back = uv_to_dir_speed(u, v)

    assert np.allclose(psi_back, psi)
    assert np.allclose(spd_back, spd)


def test_wind_from_west_blows_toward_east():
    """Guards the sign convention: u positive means blowing toward east."""
    u, v = dir_speed_to_uv(270.0, kt_to_ms(50.0))
    assert u > 0.0
    assert v == pytest.approx(0.0, abs=1e-9)


def test_scalar_in_scalar_out_array_in_array_out():
    s = solve_from_track(90.0, TAS, 0.0, 0.0)
    assert isinstance(s.gs_ms, float)

    s = solve_from_track(np.array([90.0, 180.0]), TAS, 0.0, 0.0)
    assert isinstance(s.gs_ms, np.ndarray)
    assert s.gs_ms.shape == (2,)


def test_matches_engine_ground_speed_update():
    """Heading-mode solver must agree with the engine's own formula.

    Mirrors ``Traffic.update_groundspeed``: gsnorth = tas*cos(hdg) + windnorth,
    gseast = tas*sin(hdg) + windeast, gs = hypot, trk = atan2(gseast, gsnorth).
    """
    rng = np.random.default_rng(99)
    hdg = rng.uniform(0.0, 360.0, 200)
    u = kt_to_ms(rng.uniform(-80.0, 80.0, 200))
    v = kt_to_ms(rng.uniform(-80.0, 80.0, 200))

    gsnorth = TAS * np.cos(np.radians(hdg)) + v
    gseast = TAS * np.sin(np.radians(hdg)) + u
    expect_gs = np.sqrt(gsnorth**2 + gseast**2)
    expect_trk = np.degrees(np.arctan2(gseast, gsnorth)) % 360.0

    s = solve_from_heading(hdg, TAS, u, v)
    assert np.allclose(s.gs_ms, expect_gs)
    assert np.allclose(s.track_deg, expect_trk)
