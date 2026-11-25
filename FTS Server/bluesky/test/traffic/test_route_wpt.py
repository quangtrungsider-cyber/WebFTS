"""
Copyright (c) 2017 SPARKL Limited. All Rights Reserved.
For inclusion with BlueSky upstream code:
https://github.com/ProfHoekstra/bluesky/, distributed under
GNU General Public License v3.

Author <ahfarrell@sparkl.com> Andrew Farrell
Tests route module, wpt functionality

Rewritten 2026-11 against the current Route API:
  - Route(acid) now requires the owning aircraft's callsign (it registers
    itself in the module-level Route._routes registry keyed by that acid).
  - ADDWPT's stack-command entry points (addwptStack, before, after) look
    up their target route via that registry by acid, not via self -- so a
    Route instance must actually be the one attached to that aircraft
    (Route._routes[acid] / traf.ap.route[acidx]) for a call on it to have
    any visible effect. Every test below attaches its Route that way.
  - Every aircraft/route created here uses an RTE*-prefixed callsign so
    this file can never collide with the ids test_traffic.py creates,
    regardless of which file pytest happens to collect first (both share
    the session-scoped `traffic_` fixture).
"""
from . import assert_fl


def test_route_get_available_name(route_):
    """
    Test get_available_name function.

    Expects function to correctly append names already in use.

    Note this is a characterization test of real, slightly surprising
    behaviour: get_available_name() only prepends a fresh numeric suffix
    when the candidate collides with an existing *aircraft* id
    (bs.traf.id). When it instead collides with the caller-supplied list
    (the normal case -- checking against a route's own waypoint names),
    it unconditionally strips the last `len_` characters before appending
    a new suffix, assuming a suffix of that length is already there. For a
    short name with no such suffix this chews into the real name (e.g.
    'aname' colliding with the list below returns 'ana01', not 'aname02')
    -- this is current engine behaviour, not something invented for this
    test.
    """
    data = ['aname', 'aname01', 'bname', 'cname']
    name = route_.Route.get_available_name(data, 'aname')
    assert name == 'ana01'

    name = route_.Route.get_available_name(data, 'bname')
    assert name == 'bna01'

    name = route_.Route.get_available_name(data, 'dname')
    assert name == 'dname'

    data = ['aname']
    name = route_.Route.get_available_name(data, 'aname', 3)
    assert name == 'an001'


def test_addwpt_data(route_):
    """
    Tests the insertion/modification of waypoints.

    The addwpt_data function expects:
        - Overwrites (existing waypoint):
            True | False
        - Waypoint index:
            Integer
        - Waypoint name:
            String
        - Waypoint latitude:
            String
        - Waypoint longitude:
            String
        - Waypoint type:
            0 - Lat/long waypoint
            1 - VOR/NAV waypoint
            2 - Origin airport
            3 - Destination airport
            4 - Calculated waypoint
            5 - Runway
        - Altitude constraint:
            Integer
        - Speed constraint:
            Integer
    """
    # Route() now takes the owning aircraft's callsign; this route is never
    # attached to a real aircraft since addwpt_data is a plain instance
    # method (no acid-registry indirection), so that's not needed here.
    route = route_.Route('RTEDATA')

    # All init values must be empty lists
    assert route.wpname == route.wplat == route.wplon == route.wpalt == \
        route.wpspd == route.wptype == []

    # Add new waypoint and check if added correctly
    route.addwpt_data(False, 0, 'FOO', 10., -10., 0, 1000., 100.)
    assert route.wpname == ['FOO']
    assert route.wplat == [10.]
    assert route.wplon == [-10.]
    assert route.wpalt == [1000.]
    assert route.wpspd == [100.]
    assert route.wptype == [0]
    # Flyby is taken from route.swflyby (default True), not an explicit
    # per-call argument -- so both waypoints below come out True, unlike
    # the 2017 API which could flip it per call.
    assert route.wpflyby == [True]

    # Add another waypoint, see if both this and previous are in list
    route.addwpt_data(False, 0, 'BAZ', 20., -20., 0, 2000., 200.)
    assert route.wpname == ['BAZ', 'FOO']
    assert route.wplat == [20., 10.]
    assert route.wplon == [-20., -10.]
    assert route.wpalt == [2000., 1000.]
    assert route.wpspd == [200., 100.]
    assert route.wptype == [0, 0]
    assert route.wpflyby == [True, True]

    # This waypoint must overwrite FOO (which was previously at index 1)
    route.addwpt_data(True, 1, 'BAR', 30., -30., 0, 3000., 300.)
    assert route.wpname == ['BAZ', 'BAR']
    assert route.wplat == [20., 30.]
    assert route.wplon == [-20., -30.]
    assert route.wpalt == [2000., 3000.]
    assert route.wpspd == [200., 300.]
    assert route.wptype == [0, 0]
    assert route.wpflyby == [True, True]


def test_add_wp_orig(traffic_, route_):
    """
    Tests addition of origin waypoint.

    Expects new origin waypoints to be added correctly to list of
    waypoints (route).
    """
    traffic_.cre('RTEORIG', 'A320', 0., 0., 90, 1000., 100.)
    acidx = traffic_.id2idx('RTEORIG')

    # Attach a fresh route to this aircraft -- both the registry
    # (Route(acid) does this itself) and traf.ap.route must point at the
    # same object, since different code paths read from each.
    route = route_.Route('RTEORIG')
    traffic_.ap.route[acidx] = route

    # Add some dummy data
    route.addwpt_data(False, 0, 'BAZ', 20., -20., 0, 2000., 200.)
    route.addwpt_data(False, 1, 'BAR', 30., -30., 0, 3000., 300.)
    route.iactwp = 1
    route.nwp = 2

    #
    # Insert new orig as one does not exist already
    #
    idx = route.addwpt(
        acidx, 'BAR', route.orig, 52.29, 4.74, 50, 100, '', '')
    assert idx == 0
    assert route.wptype[idx] == route.orig
    assert route.nwp == 3
    # 'BAR' collides with the existing 'BAR' waypoint, so
    # get_available_name mangles it per the quirk documented in
    # test_route_get_available_name above -- 'B01', not 'BAR01'.
    assert route.wpname[idx] == 'B01'
    assert route.iactwp == 2

    #
    # Overwrite existing orig
    #
    idx = route.addwpt(
        acidx, 'BAR', route.orig, 52.29, 4.74, 50, 100)
    assert idx == 0
    assert route.wptype[idx] == route.orig
    assert route.nwp == 3
    assert route.wpname[idx] == 'B02'
    assert route.iactwp == 2


def test_add_wp_dest(traffic_, route_):
    """
    Tests addition of destination waypoint.

    Expects new destination waypoints to be added correctly to list of
    waypoints (route). Continues from the route built up in
    test_add_wp_orig, on the same RTEORIG aircraft.
    """
    acidx = traffic_.id2idx('RTEORIG')
    route = traffic_.ap.route[acidx]

    #
    # Insert dest
    #
    idx = route.addwpt(
        acidx, 'BAR', route.dest, 52.29, 4.74, 50, 100, '', '')

    assert idx == 3
    assert route.wptype[idx] == route.dest
    assert route.nwp == 4
    assert route.wpname[idx] == 'B01'
    assert route.iactwp == 2

    #
    # Overwrite existing orig/dest
    #
    idx = route.addwpt(
        acidx, 'BAR', route.dest, 52.29, 4.74, 50, 100)
    assert idx == 3
    assert route.wptype[idx] == route.dest
    assert route.nwp == 4
    assert route.wpname[idx] == 'B03'
    assert route.iactwp == 2


def test_add_wp_normal(traffic_, route_):
    """
    Tests insertion of en-route waypoints (i.e. not dest or origin).

    Unlike the 2017 version, this keeps the aircraft index (acidx) separate
    from each call's returned waypoint index (wpidx) instead of feeding the
    latter back in as the former. addwpt() ends by calling self.direct(iac,
    ...), and direct() -- like addwptStack/before/after -- is a stack
    command that looks up Route._routes[bs.traf.id[iac]] fresh rather than
    using self. Passing a stale waypoint index as the aircraft index (as
    the 2017 test did) now resolves to whatever OTHER aircraft happens to
    sit at that index and crashes with a ValueError the moment its route
    doesn't happen to contain the waypoint name being activated.
    """
    traffic_.cre('RTENORM', 'A320', 0., 0., 90, 1000., 100.)
    acidx = traffic_.id2idx('RTENORM')
    route = route_.Route('RTENORM')
    traffic_.ap.route[acidx] = route

    wpidx = route.addwpt(
        acidx, 'BAZ', route.wplatlon, 10., -10., 1000., 100., '', '')

    assert wpidx == 0
    assert route.nwp == 1

    assert route.wplat == [10.]
    assert route.wplon == [-10.]
    assert route.wpalt == [1000.]
    assert route.wpspd == [100.]
    assert route.wpname == ['BAZ']
    assert route.wptype == [0]

    wpidx = route.addwpt(    # don't worry too much re numbers here
        acidx, 'BAZ', route.runway, 20., -20., 2000., 200., 'BAZ', '')
    assert wpidx == 1

    assert route.wplat == [10., 20.]
    assert route.wplon == [-10., -20.]
    assert route.wpalt == [1000., 2000.]
    assert route.wpspd == [100., 200.]
    # Same get_available_name quirk as above: 'BAZ' colliding with itself
    # strips to 'B01', not 'BAZ01'.
    assert route.wpname == ['BAZ', 'B01']
    assert route.wptype == [0, 5]

    wpidx = route.addwpt(  # don't worry too much re numbers here
        acidx, 'FANBAN', route.wpnav, 30., -30., 3000., 300., '', 'BAZ')
    assert wpidx == -1

    wpidx = route.addwpt(  # don't worry too much re numbers here
        acidx, 'LIFFY', route.wpnav, 30., -30., 3000., 300., '', 'BAZ')
    assert wpidx == 0

    assert_fl(route.wplat[0], 53.48)
    assert_fl(route.wplon[0], -5.5)
    assert route.wpalt == [3000., 1000., 2000.]
    assert route.wpspd == [300., 100., 200.]
    assert route.wpname == ['LIFFY', 'BAZ', 'B01']
    assert route.wptype == [1, 0, 5]

    wpidx = route.addwpt(  # don't worry too much re numbers here
        acidx, 'EGKK', route.wpnav, 0., 0., 50., 50., '', '')
    assert wpidx == 3

    assert_fl(route.wplat[3], 51.14)
    assert_fl(route.wplon[3], -0.19)
    assert route.wpalt == [3000., 1000., 2000., 50.]
    assert route.wpspd == [300., 100., 200., 50.]
    assert route.wpname == ['LIFFY', 'BAZ', 'B01', 'EGKK']
    assert route.wptype == [1, 0, 5, 1]


def test_addwpt_stack_setflyby(traffic_, route_):
    """
    Tests Fly-By and Fly-over modes of addwpt.

    Expects only one or the other to be set at a time.

    addwptStack is a stack command (@staticmethod) that looks up its
    target route via Route._routes[acid] rather than via self, so it needs
    a real attached aircraft to have any effect -- calling it on an
    unattached Route is a no-op on that object (verified: it silently
    mutates whatever aircraft happens to sit at the given index instead).
    """
    traffic_.cre('RTEFLYBY', 'A320', 0., 0., 90, 1000., 100.)
    acidx = traffic_.id2idx('RTEFLYBY')
    route = route_.Route('RTEFLYBY')
    traffic_.ap.route[acidx] = route

    route.swflyby = False
    succ = route.addwptStack(acidx, 'FLY-BY')
    assert route.swflyby
    assert succ
    route.swflyby = False

    succ = route.addwptStack(acidx, 'FLYBY')
    assert route.swflyby
    assert succ
    route.swflyby = False

    succ = route.addwptStack(acidx, 'FLY-OVER')
    assert not route.swflyby
    assert succ
    route.swflyby = False

    succ = route.addwptStack(acidx, 'FLYOVER')
    assert not route.swflyby
    assert succ
    route.swflyby = False


def test_addwpt_stack_takeoffwp(traffic_, route_):
    """
    Test takeoff argument of addwpt command.

    Expect success with takeoff waypoint added to route.

    Created aircraft (RTETO) is persisted for the subsequent
    addwptStack/after/before tests below.
    """
    traffic_.cre('RTETO', 'A320', 0., 0., 90, 2000., 200.)
    idx = traffic_.id2idx('RTETO')
    route = route_.Route('RTETO')
    traffic_.ap.route[idx] = route

    args = ['TAKEOFF', 'EGKK', 'RW08R']

    succ = route.addwptStack(idx, *args)
    assert succ
    assert route.nwp == 1

    assert_fl(route.wplat[0], 51.15)
    assert_fl(route.wplon[0], -0.15)
    assert route.wpalt == [-999.]
    assert route.wpspd == [-999.]
    assert route.wpname == ['T/O-RTETO']
    assert route.wptype == [0]


def test_addwpt_stack(traffic_):
    """
    Test addition of multiple waypoints with altitude/speed constraints.

    Expect waypoints to be inserted into route with correct constraints
    and in correct order.
    """
    idx = traffic_.id2idx('RTETO')
    route = traffic_.ap.route[idx]

    args = ['LIFFY', 3000., 300.]

    succ = route.addwptStack(idx, *args)
    assert succ

    assert_fl(route.wplat[1], 53.48)
    assert_fl(route.wplon[1], -5.5)
    assert route.wpalt[1] == 3000.
    assert route.wpspd[1] == 300.
    assert route.wpname[1] == 'LIFFY'
    assert route.wptype[1] == 1

    args = ['EGKK', 50., 50.]

    succ = route.addwptStack(idx, *args)
    assert succ

    assert int(route.wplat[2]) == 51
    assert int(route.wplon[2]) == 0
    assert route.wpalt[2] == 50.
    assert route.wpspd[2] == 50.
    assert route.wpname[2] == 'EGKK'
    assert route.wptype[2] == 1


def test_after_addwpt_stack(traffic_, route_):
    """
    Test the AFTER command -- i.e. adding a waypoint after an already
    specified one.

    Expects waypoint to be added correctly. Since the waypoint is not a
    pre-defined one (must be added as lat/lon), it is named after the
    aircraft callsign.

    AFTER/BEFORE replaced the 2017 API's afteraddwptStack/
    beforeaddwptStack instance methods with Route.after()/Route.before(),
    stack commands with the literal syntax
    "AFTER acid, wpinroute ADDWPT (wpname/lat,lon),[alt],[spd]" -- the
    third positional argument below is that literal ADDWPT token, unused
    by the implementation itself but required by its signature.
    """
    idx = traffic_.id2idx('RTETO')
    route = traffic_.ap.route[idx]

    succ = route_.Route.after(idx, 'LIFFY', 'ADDWPT', '10.,-10.', 1000.0, 100.)
    assert succ
    assert route.nwp == 4

    assert route.wplat[2] == 10.
    assert route.wplon[2] == -10.
    assert route.wpalt[2] == 1000.
    assert route.wpspd[2] == 100.
    assert route.wpname[2] == 'RTETO001'
    assert route.wptype[2] == 0


def test_before_addwpt_stack(traffic_, route_):
    """
    Test the BEFORE command -- inserting a waypoint before an already
    specified waypoint.

    Expect waypoint to be inserted correctly before LIFFY.
    """
    idx = traffic_.id2idx('RTETO')
    route = traffic_.ap.route[idx]

    succ = route_.Route.before(idx, 'LIFFY', 'ADDWPT', '20.,-20.', 2000.0, 200.)
    assert succ
    assert route.nwp == 5

    assert route.wplat[1] == 20.
    assert route.wplon[1] == -20.
    assert route.wpalt[1] == 2000.
    assert route.wpspd[1] == 200.
    assert route.wpname[1] == 'RTETO002'
    assert route.wptype[1] == 0
