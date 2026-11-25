"""
Copyright (c) 2017 SPARKL Limited. All Rights Reserved.
For inclusion with BlueSky upstream code:
https://github.com/ProfHoekstra/bluesky/, distributed under
GNU General Public License v3.

Author <ahfarrell@sparkl.com> Andrew Farrell
Tests TrafficArrays
"""

import pytest
import numpy as np
from bluesky.core import TrafficArrays


@pytest.fixture(scope="module")
def t_a(pytestconfig):
    """
    Suite-level setup and teardown function, for those test functions
    naming `t_a` in their parameter lists.
    """

    class TestChild(TrafficArrays):
        """
        Test class for testing TrafficArrays class, esp.
        handling of new children objects.
        """

        def __init__(self):
            """
            Initialises TestChild class registering
            and initialising two numpy arrays (one for booleans,
            one for integers)
            """
            super().__init__()

            # np.bool / np.int were removed in NumPy 1.24; use the builtins.
            with self.settrafarrays():
                self.np_array_bool = np.array([], dtype=bool)
                self.np_array_int = np.array([], dtype=int)

    class TestRoot(TrafficArrays):
        """
        Test class for testing TrafficArrays class, esp.
        handling of TrafficArrays root elements.
        """

        def __init__(self):
            """
            Initialises TestRoot class setting itself as root
            and registering a number of arrays.
            """
            super().__init__()

            # Traffic is the toplevel trafficarrays object
            TrafficArrays.setroot(self)

            with self.settrafarrays():
                self.fl_list = []
                self.int_list = []
                self.bool_list = []
                self.str_list = []

                self.test_child = TestChild()

    # Return initialised TestRoot object and name of TestChild class
    yield TestRoot(), TestChild.__name__


def _refill(root, n=3):
    """
    Put `root` into a known state of exactly `n` elements.

    The `t_a` fixture is module scoped, so tests share one object and the
    delete tests below must not inherit whatever length a previous test left
    behind.
    """
    root.reset()
    root.create(n)
    root.create_children(n)
    root.int_list = list(range(n))
    root.fl_list = [float(i) for i in range(n)]
    root.bool_list = [False] * n
    root.str_list = [chr(ord("a") + i) for i in range(n)]
    return root


def test_trafficarrays_init(t_a):
    """
    Test initial conditions of TrafficArrays object.
    """
    root, tcclass = t_a

    assert len(root._children) == 1
    assert not root._ArrVars

    assert root._children[0].__class__.__name__ == tcclass
    assert len({'str_list', 'bool_list', 'fl_list', 'int_list'}.intersection(
        set(root._LstVars))) == 4
    assert len(root._children[0]._ArrVars) == 2
    assert root._children[0].np_array_bool.__class__.__name__ == 'ndarray'


def test_trafficarrays_create(t_a):
    """
    Tests creation of new TrafficArrays object.

    Creates two new objects.
    """
    root, _tcclass = t_a
    root.create()
    root.create_children()

    assert len(root.fl_list) == 1
    assert len(root._children[0].np_array_bool) == 1

    root.fl_list[0] = 1.0
    root.int_list[0] = 1
    root.bool_list[0] = True
    root.str_list[0] = ""

    root.create(2)
    root.create_children(2)

    assert len(root.fl_list) == 3
    assert len(root._children[0].np_array_bool) == 3

    assert root.fl_list[-1] == 0.0
    assert root.int_list[-1] == 0
    assert not root.bool_list[-1]
    assert root.str_list[-1] == ""

    assert not root._children[0].np_array_bool[-1]
    assert root._children[0].np_array_int[-1] == 0


def test_trafficarrays_delete(t_a):
    """
    Tests deletion of TrafficArrays object.
    Expects index of object to be removed from
    int_list.
    """
    root, _tcclass = t_a

    root.int_list = [0, 1, 2]
    root.delete(1)

    assert root.int_list == [0, 2]
    assert len(root._children[0].np_array_bool) == 2


def test_trafficarrays_delete_duplicate_index(t_a):
    """
    A delete carrying the same index twice must still leave every array and
    list the same length.

    The stack expands "ACID DEL ACID" into a DEL holding that aircraft twice,
    so idx arrives as e.g. (0, 0). np.delete drops index 0 once, but the
    matching "del somelist[0]" ran twice and raised IndexError. Children are
    deleted before the parent, so that exception aborted the delete half way
    through: ap.bankdef came back empty while traf.alt and ntraf still counted
    the aircraft, and every later BADA performance update crashed on the empty
    array (perfbada.py -> phases() -> bank[gd2]).
    """
    root, _tcclass = t_a
    _refill(root)

    root.delete((1, 1))

    assert root.int_list == [0, 2]
    assert root.str_list == ["a", "c"]
    assert len(root._children[0].np_array_bool) == 2
    assert len(root._children[0].np_array_int) == 2


def test_trafficarrays_delete_boolean_mask(t_a):
    """
    A boolean mask must select by position, not be read as 0/1 indices.
    """
    root, _tcclass = t_a
    _refill(root)

    root.delete(np.array([False, True, True]))

    assert root.int_list == [0]
    assert root.str_list == ["a"]
    assert len(root._children[0].np_array_bool) == 1


def test_trafficarrays_reset(t_a):
    """
    Tests reset method which must dispose
    of all TrafficArrays objects, including all
    children and root.
    """
    root, _tcclass = t_a

    root.reset()

    assert not root.fl_list
    # NumPy 2 raises on the truthiness of an empty array instead of
    # quietly treating it as False.
    assert root._children[0].np_array_bool.size == 0
