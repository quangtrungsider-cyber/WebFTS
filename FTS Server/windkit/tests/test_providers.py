"""Wind field provider tests."""

from __future__ import annotations

import numpy as np
import pytest

from windkit import GriddedWindProvider, SyntheticUpperAirWindProvider
from windkit.units import KTS, ms_to_kt, pressure_hpa_to_fl


class TestSynthetic:
    def test_westerlies_blow_toward_east(self):
        w = SyntheticUpperAirWindProvider().get_wind(10.0, 108.0, 320.0)
        assert w.u > 0.0

    def test_speed_is_in_a_realistic_band_at_cruise(self):
        """Away from the jet, cruise winds should be tens of knots."""
        p = SyntheticUpperAirWindProvider()
        w = p.get_wind(lat=12.0, lon=108.0, fl=320.0)
        assert 20.0 < ms_to_kt(w.speed) < 90.0

    def test_jet_core_is_strongest_at_its_centre(self):
        p = SyntheticUpperAirWindProvider(jet_lat_deg=28.0, jet_halfwidth_deg=6.0)
        at_core = p.get_wind(28.0, 108.0, p.peak_fl).speed
        off_core = p.get_wind(12.0, 108.0, p.peak_fl).speed
        assert at_core > off_core
        assert 100.0 < ms_to_kt(at_core) < 220.0

    def test_westerlies_weaken_away_from_the_tropopause(self):
        p = SyntheticUpperAirWindProvider()
        peak = p.get_wind(12.0, 108.0, p.peak_fl).u
        low = p.get_wind(12.0, 108.0, 100.0).u
        assert low < peak

    def test_rossby_wave_reverses_half_a_wavelength_away(self):
        p = SyntheticUpperAirWindProvider(rossby_wavenumber=3.0)
        half = 180.0 / p.rossby_wavenumber
        a = p.get_wind(12.0, 0.0, p.peak_fl).v
        b = p.get_wind(12.0, half, p.peak_fl).v
        assert a == pytest.approx(-b, abs=1e-9)

    def test_rossby_wave_travels_with_time(self):
        p = SyntheticUpperAirWindProvider()
        a = p.get_wind(12.0, 20.0, p.peak_fl, time=0.0).v
        b = p.get_wind(12.0, 20.0, p.peak_fl, time=p.rossby_period_s / 4.0).v
        assert a != pytest.approx(b)
        full = p.get_wind(12.0, 20.0, p.peak_fl, time=p.rossby_period_s).v
        assert full == pytest.approx(a, abs=1e-9)  # one full period

    def test_shear_peaks_at_the_jet_edge(self):
        """Clear-air turbulence sits on the flanks, not in the core."""
        p = SyntheticUpperAirWindProvider(jet_lat_deg=28.0, jet_halfwidth_deg=6.0)
        core = p.get_wind(28.0, 108.0, p.peak_fl, with_shear=True).shear
        flank = p.get_wind(22.0, 108.0, p.peak_fl, with_shear=True).shear
        assert flank > core

    def test_shear_is_absent_unless_requested(self):
        p = SyntheticUpperAirWindProvider()
        assert p.get_wind(12.0, 108.0, 320.0).shear is None
        assert p.get_wind(12.0, 108.0, 320.0, with_shear=True).shear is not None

    def test_vectorised_matches_scalar(self):
        p = SyntheticUpperAirWindProvider()
        lats = np.array([5.0, 15.0, 25.0, 35.0])
        batch = p.get_wind(lats, 108.0, 340.0)
        for i, la in enumerate(lats):
            one = p.get_wind(float(la), 108.0, 340.0)
            assert batch.u[i] == pytest.approx(one.u)
            assert batch.v[i] == pytest.approx(one.v)


def _ramp_grid():
    """Grid whose u rises linearly with longitude so interpolation is checkable."""
    times = np.array([0.0, 3600.0])
    levels = np.array([200.0, 300.0, 400.0])
    lats = np.array([0.0, 10.0, 20.0])
    lons = np.array([100.0, 110.0, 120.0])
    u = np.zeros((2, 3, 3, 3))
    v = np.zeros_like(u)
    u[...] = lons.reshape(1, 1, 1, 3) - 100.0  # 0, 10, 20 m/s with longitude
    v[1] = 5.0  # second time step only
    return GriddedWindProvider(times, levels, lats, lons, u, v)


class TestGridded:
    def test_exact_at_grid_points(self):
        g = _ramp_grid()
        w = g.get_wind(10.0, 110.0, 300.0, 0.0)
        assert w.u == pytest.approx(10.0)
        assert w.v == pytest.approx(0.0)

    def test_bilinear_midpoint(self):
        g = _ramp_grid()
        w = g.get_wind(10.0, 105.0, 300.0, 0.0)
        assert w.u == pytest.approx(5.0)

    def test_linear_in_time(self):
        g = _ramp_grid()
        w = g.get_wind(10.0, 110.0, 300.0, 1800.0)
        assert w.v == pytest.approx(2.5)

    def test_clamps_outside_the_domain(self):
        """Leaving the grid must hold the edge value, not fail."""
        g = _ramp_grid()
        inside = g.get_wind(10.0, 120.0, 300.0, 0.0)
        beyond = g.get_wind(10.0, 200.0, 300.0, 0.0)
        assert beyond.u == pytest.approx(inside.u)
        below = g.get_wind(-90.0, 50.0, 10.0, -1e6)
        assert np.isfinite(below.u) and np.isfinite(below.v)

    def test_rejects_mis_shaped_arrays(self):
        with pytest.raises(ValueError, match="shaped"):
            GriddedWindProvider([0.0], [300.0], [0.0, 10.0], [100.0],
                                np.zeros((1, 1, 1, 1)), np.zeros((1, 1, 1, 1)))

    def test_rejects_unsorted_axes(self):
        with pytest.raises(ValueError, match="ascending"):
            GriddedWindProvider([0.0], [300.0], [10.0, 0.0], [100.0],
                                np.zeros((1, 1, 2, 1)), np.zeros((1, 1, 2, 1)))

    def test_degenerate_axes_are_allowed(self):
        """A single time step or level is a normal case for a forecast slice."""
        g = GriddedWindProvider([0.0], [320.0], [0.0, 10.0], [100.0, 110.0],
                                np.full((1, 1, 2, 2), 7.0), np.zeros((1, 1, 2, 2)))
        assert g.get_wind(5.0, 105.0, 320.0, 999.0).u == pytest.approx(7.0)

    def test_log_pressure_vertical_interpolation(self):
        """Isobaric output interpolates in log-pressure, not linear height."""
        p_hpa = np.array([300.0, 250.0, 200.0])
        levels = pressure_hpa_to_fl(p_hpa)
        u = np.zeros((1, 3, 2, 2))
        u[0, 0], u[0, 1], u[0, 2] = 10.0, 20.0, 30.0
        g = GriddedWindProvider([0.0], levels, [0.0, 10.0], [100.0, 110.0],
                                u, np.zeros_like(u), level_pressure_hpa=p_hpa)
        # Midway in log-pressure between 300 and 250 hPa.
        fl_mid = pressure_hpa_to_fl(np.sqrt(300.0 * 250.0))
        assert g.get_wind(5.0, 105.0, float(fl_mid), 0.0).u == pytest.approx(15.0)

    def test_vectorised_query(self):
        g = _ramp_grid()
        w = g.get_wind(np.full(3, 10.0), np.array([100.0, 110.0, 120.0]), 300.0, 0.0)
        assert np.allclose(w.u, [0.0, 10.0, 20.0])


def test_providers_are_interchangeable():
    """Both backends satisfy the same interface, so callers can swap them."""
    for p in (
        SyntheticUpperAirWindProvider(),
        _ramp_grid(),
    ):
        w = p.get_wind(10.0, 110.0, 320.0, 0.0, with_shear=True)
        assert np.isfinite(w.u) and np.isfinite(w.v) and np.isfinite(w.shear)
        assert ms_to_kt(w.speed) >= 0.0


def test_units_constant_matches_engine():
    """Guards against the knot conversion drifting from the engine's value."""
    assert KTS == pytest.approx(0.514444)
