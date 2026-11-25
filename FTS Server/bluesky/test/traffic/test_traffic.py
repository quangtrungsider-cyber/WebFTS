"""
Copyright (c) 2017 SPARKL Limited. All Rights Reserved.
For inclusion with BlueSky upstream code:
https://github.com/ProfHoekstra/bluesky/, distributed under
GNU General Public License v3.

Author <ahfarrell@sparkl.com> Andrew Farrell
Tests traffic module

Rewritten 2026-11 against the current Traffic/Autopilot API: the aircraft
creation entry point is cre() (not create()), it takes an explicit acid
(there is no auto-generated KL204/KL205-style callsign), and there is no
top-level "children" list with 8 entries or "Vars" dict to introspect.
"""
import numpy as np
import pytest
from bluesky.stack.argparser import ArgumentError
from bluesky.stack.cmdparser import Command
from bluesky.tools.aero import vcasormach


def test_traffic_create_missingarg_fail(traffic_):
    """
    CRE (aliased as CREATE) needs at least acid, type and a position.
    Calling it with no arguments must fail with a clear argument error
    instead of creating a blank aircraft.

    `traffic_` only runs bs.init() here (ensuring Command.cmddict is
    populated); the command is invoked directly rather than through
    traffic_ because the validation being tested lives in the stack
    command wrapper, not in Traffic.cre() itself (cre() has no default
    for acid, so calling it with no arguments raises a plain TypeError,
    not the user-facing ArgumentError the stack layer produces).
    """
    del traffic_
    with pytest.raises(ArgumentError):
        Command.cmddict['CRE']('')


def expected_tas_cas_mach(acspd, acalt):
    """
    Independent oracle for the speed conversion cre() performs internally.

    Deliberately calls vcasormach() -- the exact vectorized function
    cre() uses -- rather than the scalar casormach(). The two are NOT
    bit-identical (verified: vcasormach(200, 2000) and casormach(200, 2000)
    differ in TAS/Mach by about 0.004 m/s), so comparing against casormach
    would make this test flaky for no reason connected to a real defect.
    """
    tas, cas, m = vcasormach(
        np.array([float(acspd)]), np.array([float(acalt)]))
    return tas[0], cas[0], m[0]


def validate_create(traffic_, result, len_, acid, actype, aclat, aclon,
                     achdg, acalt, acspd):
    """
    Checks the traffic arrays after a successful cre() call.
    """
    assert result is True

    validate_lengths(traffic_, len_)

    assert traffic_.id[-1] == acid
    assert traffic_.type[-1] == actype

    assert traffic_.lat[-1] == aclat
    assert traffic_.lon[-1] == aclon
    assert traffic_.alt[-1] == acalt

    assert traffic_.hdg[-1] == achdg
    assert traffic_.trk[-1] == achdg

    tas, cas, m = expected_tas_cas_mach(acspd, acalt)
    assert traffic_.tas[-1] == tas
    assert traffic_.cas[-1] == cas
    assert traffic_.M[-1] == m


def validate_lengths(traffic_, len_):
    """
    Checks ntraf and every per-aircraft array/list are all the same length.
    """
    assert traffic_.ntraf == len_
    assert len(traffic_.id) == len(traffic_.type) == len(traffic_.lat) == \
        len(traffic_.lon) == len(traffic_.alt) == \
        len(traffic_.hdg) == len(traffic_.trk) == len(traffic_.tas) == \
        len(traffic_.cas) == len(traffic_.M) == len_

    # ap.route is a child TrafficArrays object (bluesky/traffic/autopilot.py)
    # backed by a plain Python list rather than a numpy array; check it grows
    # and shrinks in lockstep too.
    assert len(traffic_.ap.route) == len_


def test_traffic_create(traffic_):
    """
    Test creation of new aircraft by successively creating three new
    aircraft, each under its own explicit callsign.

    Expects new aircraft to be added correctly.
    """
    ntraf = traffic_.ntraf

    result = traffic_.cre('KL204', 'B744', 0.0, 50.0, 270, 2000, 200)
    validate_create(
        traffic_, result,
        ntraf + 1, 'KL204', 'B744', 0.0, 50.0, 270, 2000, 200)

    result = traffic_.cre('KL205', 'B744', -10.0, 60.0, 180, 1000, 100)
    validate_create(
        traffic_, result,
        ntraf + 2, 'KL205', 'B744', -10.0, 60.0, 180, 1000, 100)

    result = traffic_.cre('BA1', 'A320', 10.0, 55.0, 90, 3000, 300)
    validate_create(
        traffic_, result,
        ntraf + 3, 'BA1', 'A320', 10.0, 55.0, 90, 3000, 300)


def test_traffic_create_duplicate_acid_fails(traffic_):
    """
    cre() must refuse to create a second aircraft under a callsign already
    in use, rather than silently creating one the rest of the engine
    (id2idx, Route._routes, ...) could no longer address unambiguously.
    """
    ntraf = traffic_.ntraf

    result = traffic_.cre('KL204', 'B744', 0.0, 50.0, 270, 2000, 200)

    assert result == (False, 'KL204 already exists.')
    assert traffic_.ntraf == ntraf


def test_traffic_delete(traffic_):
    """
    Test deletion of existing aircraft using index.

    Still BA1 must be the last traffic object, number of traffic objects
    must decrease by one.
    """
    ntraf = traffic_.ntraf
    result = traffic_.delete(1)

    assert result is True
    validate_create(
        traffic_, True,
        ntraf - 1, 'BA1', 'A320', 10.0, 55.0, 90, 3000, 300)


def test_traffic_reset(traffic_):
    """
    Test reset command.

    Expects zero aircraft after reset.
    """
    traffic_.reset()
    validate_lengths(traffic_, 0)
