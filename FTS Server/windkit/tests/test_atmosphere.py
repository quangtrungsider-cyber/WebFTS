"""Airspeed conversion tests, checked against the engine's own functions.

These guard the mistake that put aircraft at 750 kt true airspeed into a
scenario: ground speed written straight into a field the engine reads as
calibrated airspeed.
"""

from __future__ import annotations

import numpy as np
import pytest

from windkit import cas_to_tas, gs_to_cas_kt, tas_to_cas
from windkit.units import FT, KTS

bs_aero = pytest.importorskip(
    "bluesky.tools.aero", reason="engine not importable in this environment"
)


@pytest.mark.parametrize("fl", [50, 100, 200, 300, 350, 400, 450])
@pytest.mark.parametrize("tas_kt", [200.0, 350.0, 450.0, 520.0])
def test_matches_engine_tas_to_cas(fl, tas_kt):
    h = fl * 100 * FT
    assert tas_to_cas(tas_kt * KTS, h) == pytest.approx(
        float(bs_aero.vtas2cas(tas_kt * KTS, h)), abs=1e-9
    )


@pytest.mark.parametrize("fl", [50, 200, 350, 450])
@pytest.mark.parametrize("cas_kt", [150.0, 250.0, 320.0])
def test_matches_engine_cas_to_tas(fl, cas_kt):
    h = fl * 100 * FT
    assert cas_to_tas(cas_kt * KTS, h) == pytest.approx(
        float(bs_aero.vcas2tas(cas_kt * KTS, h)), abs=1e-9
    )


def test_round_trip():
    fl = np.arange(50, 460, 10)
    tas = np.full(fl.shape, 460.0 * KTS)
    h = fl * 100 * FT
    assert np.allclose(cas_to_tas(tas_to_cas(tas, h), h), tas)


def test_scenario_speed_survives_the_engine():
    """What a generator writes must come back as the observed ground speed."""
    for fl, gs_kt in ((350, 480.0), (400, 460.0), (280, 500.0), (160, 400.0)):
        h = fl * 100 * FT
        written = gs_to_cas_kt(gs_kt, fl * 100)
        back = float(bs_aero.vcas2tas(written * KTS, h)) / KTS
        assert back == pytest.approx(gs_kt, abs=1e-6)


def test_writing_ground_speed_directly_would_be_supersonic():
    """Documents the bug this module exists to prevent."""
    h = 350 * 100 * FT
    inflated = float(bs_aero.vcas2tas(480.0 * KTS, h)) / KTS
    assert inflated > 700.0  # what the old generators produced
    assert gs_to_cas_kt(480.0, 35000.0) < 300.0  # what is written now


def test_zero_and_negative_speed_are_safe():
    assert gs_to_cas_kt(0.0, 35000.0) == 0.0
    assert np.all(gs_to_cas_kt(np.array([0.0, -5.0]), 35000.0) == 0.0)
