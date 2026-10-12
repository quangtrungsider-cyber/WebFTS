"""
Shared engine for procedure-based capacity-test scenarios: real SID/STAR/IAP
waypoint data, BADA-style climb/descent speed schedules, a staggered takeoff
roll (CRE stationary -> timed SPD/HDG -> timed LNAV/VNAV handoff -- verified
live that engaging VNAV at the same instant as a stationary CRE hangs the
sim), and the 3-minute arrival / 30-second departure-after-arrival separation
rules -- extracted from vvnb_scenario_builder.py and vvgb_gb07_scenario_
builder.py once both turned out to be near-identical except for their
procedure data and a handful of per-airport constants (runway ids, callsign
prefix, direction mix).

Adding a new airport = write its own `<icao>_procedures.py` data module (real
waypoint/altitude/speed data, transcribed from published SID/STAR/IAP
documents) + register it in PROCEDURE_REGISTRY below -- no engine changes.

    vvnb_procedures / vvgb_gb07_procedures -> capacity_scenario_engine
    capacity_scenario_engine <- vvnb_scenario_builder / vvgb_gb07_scenario_builder (thin wrappers)
    capacity_scenario_engine <- scn_generator.generate_scn_content (trafficDemand.source="procedure_capacity")
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Callable

from WebATM.server.bada_api import get_real_climb_schedule
from WebATM.server.scn_generator import AIRCRAFT_PERF, FLEET_MIX, _fmt
from WebATM.server.seasonal_plan_parser import FlightRecord
from WebATM.server.separation_rules import ScheduledFlight, apply_rules

_DEFAULT_SEED = 20260727

# Engine-level constants, deliberately NOT exposed as study parameters (kept
# simple per the "form đơn giản" scope decision) -- these are aircraft/route
# physics, not something a capacity study would normally vary.
_MIN_SAME_TRANSITION_SPAWN_GAP_MIN = 3
_ROLL_ACCEL_DELAY_S = 10  # CRE -> start rolling (SPD command)
_ROLL_LIFTOFF_DELAY_S = 35  # CRE -> route handoff (LNAV/VNAV), already moving


# ---------------------------------------------------------------------------
# Airport procedure registry
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AirportProcedures:
    """Everything the engine needs from one airport's procedure data module.
    `sid_route`/`star_route` must return objects with `.name`, `.lat`, `.lon`,
    `.alt_ft` -- an optional `.spd_kt` is read via getattr (VVNB's STAR data
    publishes real speeds; VVGB's doesn't, so BADA fills the gap -- see
    _addwpt_line_arr)."""

    icao: str
    callsign_prefix: str
    dep_runway: str
    arr_runway: str
    dep_threshold: object
    arr_threshold: object
    sid_transition_names: list[str]
    star_transition_names: list[str]
    sid_route: Callable[[str], list]
    star_route: Callable[[str], list]
    default_sid_mix: dict[str, int]
    default_star_mix: dict[str, int]
    # Every named real waypoint this airport's procedure data references
    # (name -> (lat, lon)), for the Waypoints/Routes-Airways data pages --
    # not just the ones on a given SID/STAR route.
    waypoints: dict[str, tuple[float, float]]
    # Whether this airport's published STAR data includes a speed column at
    # all (VVNB's does; VVGB's doesn't). When True, a waypoint with an
    # altitude constraint but no speed one is left alt-only (the real data
    # simply doesn't constrain speed there) -- BADA is NOT invented on top
    # of real data. When False, every altitude-constrained waypoint gets a
    # BADA descent speed, since no real speed data exists to prefer.
    arrival_speed_published: bool = False
    # Final post-climb altitude cap for departures once they've cleared the
    # published SID ("ALT FL200" for VVNB) -- None if the airport has no
    # such cap and departures should just keep climbing to a default cruise
    # level once the SID ends (VVGB, confirmed live: climbs on to ~FL290).
    dep_final_alt_cap: str | None = None
    # Number of waypoints, counted from the END of every star_route(), that
    # make up this airport's shared IAP final segment -- identical for
    # every STAR transition regardless of which one an arrival flew, since
    # that's the actual point where all of them geometrically converge onto
    # one final approach course. Used to separate arrivals from DIFFERENT
    # transitions properly at that real merge point, not just at the
    # runway threshold (see _enforce_merge_point_separation).
    iap_final_segment_len: int = 0
    # Real published magnetic course (deg) of the SID's own "INITIAL CLIMB"
    # leg, when the AIP transcription happens to include it -- e.g. VVPQ's
    # is 096, not the 100 int(dep_runway[:2])*10 would derive from the
    # runway's rounded-to-nearest-10-degrees designator. None (the default)
    # falls back to that designator-derived heading for airports whose SID
    # data wasn't transcribed with this figure (VVNB/VVGB) -- never invented
    # for those, only used where the real AIP number is actually on hand.
    dep_initial_course: float | None = None
    # Per-transition name of the real waypoint where that STAR/SID track
    # actually crosses the published TMA boundary (WebATM/static/data/
    # vatm_kmz/vatm_tma_ctr.geojson, feature "TMA <name>") -- confirmed by
    # point-in-polygon testing each transition's own real waypoints against
    # that real polygon, not invented. Used by _enforce_tma_capacity to know
    # how much of an arrival's/departure's flight is actually spent inside
    # the TMA (only that portion can be capacity-limited by "N aircraft
    # inside the TMA at once"). None for a STAR transition means its own
    # entry fix is ALREADY inside the TMA polygon (VVPQ's TUNPO, confirmed
    # this way) -- there's no real outside-TMA point on the transcribed
    # route left to hold at, so that transition's arrivals are treated as
    # "in TMA" for their entire modeled flight (delay can only be absorbed
    # by spawning them later, not by an outside-TMA hold).
    star_tma_gate: dict[str, str | None] = field(default_factory=dict)
    sid_tma_gate: dict[str, str] = field(default_factory=dict)
    # Metadata-only IAP labels this airport's arrivals can be tagged with
    # (surfaced in the .scn header and the Scenarios UI) -- empty for
    # airports with only one published final approach per runway (VVNB/
    # VVGB/VVPQ). Non-empty ONLY means the UI offers a choice; it does NOT
    # imply each label is backed by its own distinct flown geometry -- see
    # vvdn_procedures.py's module docstring for the one current case where
    # it isn't yet.
    iap_options: list[str] = field(default_factory=list)
    # Multi-runway support (VVPQ/VVLT both have two independent PARALLEL
    # runway pairs -- e.g. VVLT's 05L/05R and 23L/23R -- where each published
    # SID/STAR transition is tied to one specific runway in the real AIP
    # data, not interchangeable between the pair). When non-empty, these
    # override dep_runway/arr_runway/dep_threshold/arr_threshold on a
    # per-transition basis via runway_for_dep/runway_for_arr/
    # threshold_for_dep/threshold_for_arr below; airports that leave them
    # empty (every single-runway airport already registered) get back
    # exactly the old single dep_runway/arr_runway/*_threshold behavior,
    # unchanged.
    dep_runway_by_transition: dict[str, str] = field(default_factory=dict)
    arr_runway_by_transition: dict[str, str] = field(default_factory=dict)
    dep_threshold_by_runway: dict[str, object] = field(default_factory=dict)
    arr_threshold_by_runway: dict[str, object] = field(default_factory=dict)

    def runway_for_dep(self, transition: str) -> str:
        return self.dep_runway_by_transition.get(transition, self.dep_runway)

    def runway_for_arr(self, transition: str) -> str:
        return self.arr_runway_by_transition.get(transition, self.arr_runway)

    def threshold_for_dep(self, transition: str) -> object:
        rwy = self.runway_for_dep(transition)
        return self.dep_threshold_by_runway.get(rwy, self.dep_threshold)

    def threshold_for_arr(self, transition: str) -> object:
        rwy = self.runway_for_arr(transition)
        return self.arr_threshold_by_runway.get(rwy, self.arr_threshold)

    # Per-transition override for iap_final_segment_len -- needed because an
    # airport with two independent runway pairs (VVPQ's 10L/10R and 28L/28R,
    # VVLT's 05L/05R and 23L/23R) can have a DIFFERENT real number of shared
    # final-approach waypoints per pair (VVPQ: 4 for the 10-side RNP Z
    # RWY10L final segment vs 3 for the 28-side's own RNP Z RWY28L one) --
    # a single scalar would slice the wrong boundary for whichever pair
    # doesn't match it, silently breaking _enforce_merge_point_separation's
    # "last N waypoints are the shared final segment" assumption for that
    # pair. Empty (every single-runway-pair airport already registered)
    # falls back to the old single iap_final_segment_len, unchanged.
    iap_final_segment_len_by_transition: dict[str, int] = field(default_factory=dict)

    def iap_segment_len_for(self, transition: str) -> int:
        return self.iap_final_segment_len_by_transition.get(transition, self.iap_final_segment_len)

    # Same per-transition-override need as dep_runway_by_transition, for the
    # same reason: VVPQ's two runway pairs each publish their own real SID
    # "INITIAL CLIMB" course (10-side: 096; 28-side: 276) -- a single
    # dep_initial_course scalar would wrongly apply one pair's real course to
    # the other's departures. Empty falls back to the single scalar,
    # unchanged for every airport that only has one runway pair.
    dep_initial_course_by_transition: dict[str, float] = field(default_factory=dict)

    def dep_initial_course_for(self, transition: str) -> float | None:
        return self.dep_initial_course_by_transition.get(transition, self.dep_initial_course)


def _vvnb_procedures() -> AirportProcedures:
    from WebATM.server.vvnb_procedures import (
        RW11L_THRESHOLD,
        SID_TRANSITIONS,
        STAR_TRANSITIONS,
        _WP_COORDS,
        sid_route,
        star_route,
    )

    return AirportProcedures(
        icao="VVNB",
        callsign_prefix="NB",
        dep_runway="11R",
        arr_runway="11L",
        # Only the 11L threshold coordinate is published (the only runway
        # with real ILS/IAP data) -- reused as a stand-in for the nearby
        # parallel 11R departure runway, same approximation used throughout
        # vvnb_scenario_builder.py.
        dep_threshold=RW11L_THRESHOLD,
        arr_threshold=RW11L_THRESHOLD,
        sid_transition_names=list(SID_TRANSITIONS),
        star_transition_names=list(STAR_TRANSITIONS),
        sid_route=sid_route,
        star_route=star_route,
        default_sid_mix={"DILEN": 4, "NAKHA": 3, "NAH": 3, "MC": 4, "HUVAN_3A": 3, "HUVAN_3B": 3},
        default_star_mix={"BISON": 2, "MC": 2, "HUVAN": 2, "DILEN": 2, "NAKHA": 2, "VDO": 2, "GASSO": 2, "DOKLA": 2},
        waypoints=dict(_WP_COORDS),
        arrival_speed_published=True,
        dep_final_alt_cap="FL200",
        iap_final_segment_len=2,
    )


def _vvgb_procedures() -> AirportProcedures:
    from WebATM.server.vvgb_gb07_procedures import (
        RWY07_THRESHOLD,
        SID_TRANSITIONS,
        STAR_TRANSITIONS,
        _WP_COORDS,
        sid_route,
        star_route,
    )

    return AirportProcedures(
        icao="VVGB",
        callsign_prefix="GB",
        dep_runway="07",
        arr_runway="07",
        dep_threshold=RWY07_THRESHOLD,
        arr_threshold=RWY07_THRESHOLD,
        sid_transition_names=list(SID_TRANSITIONS),
        star_transition_names=list(STAR_TRANSITIONS),
        sid_route=sid_route,
        star_route=star_route,
        # ~70/30 South/other direction mix -- confirmed live that an even
        # split reads as a queue nose-to-tail toward NAKHA specifically.
        default_sid_mix={"NAH": 7, "BIVIM": 7, "NAKHA": 2, "TEBAK": 2, "NOB": 2},
        default_star_mix={"NAH": 4, "BIVIM": 4, "MC": 3, "NAKHA": 5},
        waypoints=dict(_WP_COORDS),
        iap_final_segment_len=3,
    )


def _vvpq_procedures() -> AirportProcedures:
    from WebATM.server.vvpq_procedures import (
        RW10L_THRESHOLD,
        RW10R_THRESHOLD,
        RW28L_THRESHOLD,
        RW28R_THRESHOLD,
        SID_RUNWAY_OF,
        SID_TRANSITIONS,
        STAR_FINAL_SEGMENT_LEN_OF,
        STAR_RUNWAY_OF,
        STAR_TRANSITIONS,
        _WP_COORDS,
        sid_route,
        star_route,
    )

    return AirportProcedures(
        icao="VVPQ",
        callsign_prefix="PQ",
        # Default (10-side) runway/threshold -- used for any transition not
        # present in the *_by_transition maps below. Both pairs are fully
        # covered by those maps, so this default is only reached if a future
        # transition name is added to SID_TRANSITIONS/STAR_TRANSITIONS
        # without a matching runway-map entry.
        dep_runway="10R",
        arr_runway="10L",
        dep_threshold=RW10R_THRESHOLD,
        arr_threshold=RW10L_THRESHOLD,
        sid_transition_names=list(SID_TRANSITIONS),
        star_transition_names=list(STAR_TRANSITIONS),
        sid_route=sid_route,
        star_route=star_route,
        # Even split across all published PBN transitions each direction --
        # no real traffic-mix study exists for VVPQ yet, unlike VVNB/VVGB's
        # mixes which reflect actual observed direction preferences.
        default_sid_mix={"NUMDI": 2, "OSOTA": 2, "RG": 2, "ADBOP": 2, "NUMDI_28": 2, "OSOTA_28": 1, "RG_28A": 1, "RG_28B": 1, "ADBOP_28": 1},
        default_star_mix={"NUMDI": 2, "OSOTA": 2, "TUNPO": 2, "ADBOP": 2, "NUMDI_28": 2, "OSOTA_28": 2, "TUNPO_28": 2, "ADBOP_28": 1},
        waypoints=dict(_WP_COORDS),
        arrival_speed_published=True,
        iap_final_segment_len=4,
        # VVPQ has two independent parallel runway pairs (10L/10R and
        # 28L/28R) with entirely separate real SID/STAR data -- see
        # vvpq_procedures.py's module docstring. Departures use the R-end,
        # arrivals the L-end of whichever pair a transition belongs to.
        dep_runway_by_transition={t: ("28R" if rwy == "28R" else "10R") for t, rwy in SID_RUNWAY_OF.items()},
        arr_runway_by_transition={t: ("28L" if rwy == "28L" else "10L") for t, rwy in STAR_RUNWAY_OF.items()},
        dep_threshold_by_runway={"10R": RW10R_THRESHOLD, "28R": RW28R_THRESHOLD},
        arr_threshold_by_runway={"10L": RW10L_THRESHOLD, "28L": RW28L_THRESHOLD},
        iap_final_segment_len_by_transition=dict(STAR_FINAL_SEGMENT_LEN_OF),
        # Real published SID "INITIAL CLIMB" course -- 096(096.2) for the
        # 10-side (identical across NUMDI/OSOTA/RG/ADBOP), 276(275.7) for
        # the 28-side (identical across all 5 28-side transitions).
        dep_initial_course=96,
        dep_initial_course_by_transition={t: 276 for t, rwy in SID_RUNWAY_OF.items() if rwy == "28R"},
        # Confirmed by testing every transition's own real waypoints against
        # the real "TMA PHU QUOC" polygon (vatm_tma_ctr.geojson): NUMDI/OSOTA
        # cross from outside to inside between their own entry fix and the
        # next one; TUNPO's own entry fix is already inside; ADBOP crosses
        # between MEBMI (outside) and BUVSU (inside).
        star_tma_gate={"NUMDI": "NUMDI", "OSOTA": "OSOTA", "TUNPO": None, "ADBOP": "MEBMI"},
        # Same check on the SID side: NUMDI/OSOTA cross outside at their own
        # final fix; RG crosses between SAMIX (inside) and VILIT (outside);
        # ADBOP crosses between PIKUD (inside) and DOVTA (outside).
        sid_tma_gate={"NUMDI": "NUMDI", "OSOTA": "OSOTA", "RG": "VILIT", "ADBOP": "DOVTA"},
    )


def _vvdn_procedures() -> AirportProcedures:
    from WebATM.server.vvdn_procedures import (
        DEFAULT_SID_MIX,
        DEFAULT_STAR_MIX,
        IAP_OPTIONS,
        RW35L_THRESHOLD,
        RW35R_THRESHOLD,
        SID_TRANSITIONS,
        STAR_TRANSITIONS,
        _all_waypoints,
        sid_route,
        star_route,
    )

    return AirportProcedures(
        icao="VVDN",
        callsign_prefix="DN",
        dep_runway="35R",
        arr_runway="35L",
        dep_threshold=RW35R_THRESHOLD,
        arr_threshold=RW35L_THRESHOLD,
        sid_transition_names=list(SID_TRANSITIONS),
        star_transition_names=list(STAR_TRANSITIONS),
        sid_route=sid_route,
        star_route=star_route,
        default_sid_mix=dict(DEFAULT_SID_MIX),
        default_star_mix=dict(DEFAULT_STAR_MIX),
        waypoints=_all_waypoints(),
        # DOTEN's checkpoint altitudes are real (see vvdn_procedures.py);
        # the per-checkpoint IAS figures reused from the standalone .scn
        # generator are per-aircraft-type simulation profiles, not a single
        # published speed column on a STAR chart -- so speed is left to the
        # BADA descent schedule (arrival_speed_published=False), same
        # treatment as VVGB.
        arrival_speed_published=False,
        iap_final_segment_len=2,
        iap_options=list(IAP_OPTIONS),
    )


def _vvcm_procedures() -> AirportProcedures:
    from WebATM.server.vvcm_procedures import (
        RWY27_THRESHOLD,
        SID_TRANSITIONS,
        STAR_TRANSITIONS,
        _WP_COORDS,
        sid_route,
        star_route,
    )

    return AirportProcedures(
        icao="VVCM",
        callsign_prefix="CM",
        dep_runway="27",
        arr_runway="27",
        dep_threshold=RWY27_THRESHOLD,
        arr_threshold=RWY27_THRESHOLD,
        sid_transition_names=list(SID_TRANSITIONS),
        star_transition_names=list(STAR_TRANSITIONS),
        sid_route=sid_route,
        star_route=star_route,
        # Single published transition each direction -- no real traffic-mix
        # study exists for VVCM yet, same honest-default convention as
        # VVPQ's even split.
        default_sid_mix={"ATSUK": 4},
        default_star_mix={"ATSUK": 4},
        waypoints=dict(_WP_COORDS),
        arrival_speed_published=True,
        iap_final_segment_len=3,
        # Real published SID "CF CM600" initial course, ATSUK 1D: 272(271.5)
        # magnetic/true in the AIP table.
        dep_initial_course=272,
    )


def _vvdl_procedures() -> AirportProcedures:
    from WebATM.server.vvdl_procedures import (
        RWY09_THRESHOLD,
        SID_TRANSITIONS,
        STAR_TRANSITIONS,
        _WP_COORDS,
        sid_route,
        star_route,
    )

    return AirportProcedures(
        icao="VVDL",
        callsign_prefix="DL",
        dep_runway="09",
        arr_runway="09",
        dep_threshold=RWY09_THRESHOLD,
        arr_threshold=RWY09_THRESHOLD,
        sid_transition_names=list(SID_TRANSITIONS),
        star_transition_names=list(STAR_TRANSITIONS),
        sid_route=sid_route,
        star_route=star_route,
        # Even split across all published transitions each direction -- no
        # real traffic-mix study exists for VVDL yet, same honest-default
        # convention as VVPQ/VVCM.
        default_sid_mix={"BMT": 3, "CRA": 3, "VETOM": 3},
        default_star_mix={"BMT_L": 1, "BMT_M": 1, "SOSPA": 1, "KADUM": 1, "LUTRI": 1, "VETOM": 1, "SAKOD": 1},
        waypoints=dict(_WP_COORDS),
        arrival_speed_published=True,
        iap_final_segment_len=4,
    )


def _vvlt_procedures() -> AirportProcedures:
    from WebATM.server.vvlt_procedures import (
        RWY_THRESHOLD,
        SID_RUNWAY_OF,
        SID_TRANSITIONS,
        STAR_RUNWAY_OF,
        STAR_TRANSITIONS,
        _WP_COORDS,
        sid_route,
        star_route,
    )

    return AirportProcedures(
        icao="VVLT",
        callsign_prefix="LT",
        dep_runway="23R",
        arr_runway="23L",
        dep_threshold=RWY_THRESHOLD,
        arr_threshold=RWY_THRESHOLD,
        sid_transition_names=list(SID_TRANSITIONS),
        star_transition_names=list(STAR_TRANSITIONS),
        sid_route=sid_route,
        star_route=star_route,
        # Even split across every published transition each direction -- no
        # real traffic-mix study exists for VVLT yet, same honest-default
        # convention as VVPQ/VVCM/VVDL.
        default_sid_mix={t: 1 for t in SID_TRANSITIONS},
        default_star_mix={t: 1 for t in STAR_TRANSITIONS},
        waypoints=dict(_WP_COORDS),
        arrival_speed_published=True,
        # Every STAR route already stops at this airport's own real terminal
        # IAF (see vvlt_procedures.py's module docstring limitation 2) -- the
        # last waypoint IS the real merge point, nothing further to split off.
        iap_final_segment_len=1,
        # VVLT has two independent parallel runway pairs (05L/05R and
        # 23L/23R) with entirely separate real SID/STAR data -- see
        # vvlt_procedures.py's module docstring. Departures use the R-end,
        # arrivals the L-end of whichever pair a transition belongs to.
        dep_runway_by_transition=dict(SID_RUNWAY_OF),
        arr_runway_by_transition=dict(STAR_RUNWAY_OF),
    )


PROCEDURE_REGISTRY: dict[str, Callable[[], AirportProcedures]] = {
    "VVNB": _vvnb_procedures,
    "VVGB": _vvgb_procedures,
    "VVPQ": _vvpq_procedures,
    "VVDN": _vvdn_procedures,
    "VVCM": _vvcm_procedures,
    "VVDL": _vvdl_procedures,
    "VVLT": _vvlt_procedures,
}


def get_procedures(icao: str) -> AirportProcedures:
    icao = icao.upper()
    if icao not in PROCEDURE_REGISTRY:
        raise ValueError(f"No procedure data registered for airport {icao!r} (known: {sorted(PROCEDURE_REGISTRY)})")
    return PROCEDURE_REGISTRY[icao]()


# ---------------------------------------------------------------------------
# Scenario config
# ---------------------------------------------------------------------------


@dataclass
class CapacityScenarioConfig:
    sid_mix: dict[str, int]
    star_mix: dict[str, int]
    hours: int = 1
    seed: int = _DEFAULT_SEED
    asas_on: bool = False
    min_arr_arr_gap_sec: int = 180
    dep_after_arr_gap_sec: int = 30
    min_runway_gap_sec: int = 60
    # Max arrivals / departures allowed inside the TMA at the same simulated
    # instant (see _enforce_tma_capacity) -- None (default) leaves this
    # constraint off entirely, unchanged from every scenario built before it
    # existed. Modeled as two independent caps (not one combined total)
    # because that's how the requirement was specified: arrivals and
    # departures occupy different, only-partially-overlapping parts of the
    # TMA and are worked by different controller responsibilities.
    max_arr_in_tma: int | None = None
    max_dep_in_tma: int | None = None

    @property
    def dep_per_hour(self) -> int:
        return sum(self.sid_mix.values())

    @property
    def arr_per_hour(self) -> int:
        return sum(self.star_mix.values())

    @classmethod
    def from_dict(cls, procs: AirportProcedures, raw: dict | None) -> "CapacityScenarioConfig":
        raw = raw or {}
        # "key omitted" (use this airport's defaults) and "key explicitly
        # {}" (caller wants zero of this movement type, e.g. a single-
        # arrival scenario with no departures) are different requests --
        # `raw.get("sidMix") or dict(...)` treated both the same (an empty
        # dict is falsy), silently substituting the default mix even when a
        # caller explicitly asked for none. Confirmed live: a "starMix":
        # {"DOTEN": 1}, "sidMix": {} request for a single-arrival VVDN
        # scenario still emitted a full set of departures until this was
        # fixed to check key presence instead of truthiness.
        sid_mix = dict(raw["sidMix"]) if "sidMix" in raw else dict(procs.default_sid_mix)
        star_mix = dict(raw["starMix"]) if "starMix" in raw else dict(procs.default_star_mix)
        unknown_sid = set(sid_mix) - set(procs.sid_transition_names)
        unknown_star = set(star_mix) - set(procs.star_transition_names)
        if unknown_sid:
            raise ValueError(f"Unknown SID transition(s) for {procs.icao}: {sorted(unknown_sid)}")
        if unknown_star:
            raise ValueError(f"Unknown STAR transition(s) for {procs.icao}: {sorted(unknown_star)}")
        return cls(
            sid_mix=sid_mix,
            star_mix=star_mix,
            hours=int(raw.get("hours") or 1),
            seed=int(raw.get("seed") or _DEFAULT_SEED),
            asas_on=bool(raw.get("asasOn") or False),
            min_arr_arr_gap_sec=int(raw.get("minArrArrGapSec") or 180),
            dep_after_arr_gap_sec=int(raw.get("depAfterArrGapSec") or 30),
            min_runway_gap_sec=int(raw.get("minRunwayGapSec") or 60),
            max_arr_in_tma=int(raw["maxArrInTma"]) if raw.get("maxArrInTma") else None,
            max_dep_in_tma=int(raw["maxDepInTma"]) if raw.get("maxDepInTma") else None,
        )


@dataclass
class CapacityFlight:
    scheduled: ScheduledFlight
    route: list
    transition: str
    spawn_minutes: int = 0
    takeoff_seconds: int | None = None


@dataclass(frozen=True)
class _SyntheticWaypoint:
    """A generated (not published-chart) waypoint -- same shape as each
    airport's own frozen Waypoint dataclass (name/lat/lon/alt_ft/spd_kt) so
    it duck-types identically through _addwpt_line_arr/_route_leg_times_min.
    Used only for the trombone-delay apex point (see
    _trombone_apex_waypoint) -- never presented as a real AIP fix."""
    name: str
    lat: float
    lon: float
    alt_ft: float | None = None
    spd_kt: float | None = None


# ---------------------------------------------------------------------------
# Helpers (bearing/distance, aircraft mix, BADA speed schedules)
# ---------------------------------------------------------------------------


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r_nm = 3440.065
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r_nm * math.asin(math.sqrt(a))


def _offset_point(lat: float, lon: float, bearing_deg: float, distance_nm: float) -> tuple[float, float]:
    """Direct geodesic: the point `distance_nm` from (lat, lon) along
    `bearing_deg` (spherical-earth approximation, plenty accurate at the
    tens-of-NM scale a trombone detour needs)."""
    r_nm = 3440.065
    br = math.radians(bearing_deg)
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    d_r = distance_nm / r_nm
    lat2 = math.asin(math.sin(lat1) * math.cos(d_r) + math.cos(lat1) * math.sin(d_r) * math.cos(br))
    lon2 = lon1 + math.atan2(
        math.sin(br) * math.sin(d_r) * math.cos(lat1),
        math.cos(d_r) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), (math.degrees(lon2) + 540) % 360 - 180


def _trombone_apex_waypoint(wp_a, wp_b, extra_nm: float, name: str) -> _SyntheticWaypoint:
    """One extra waypoint inserted between wp_a and wp_b that turns the
    direct A-to-B leg into a wide 'V' detour -- BlueSky has no built-in
    holding-pattern/racetrack command (confirmed by reading its stack
    command source), but Route.addwpt applies no geometric validation, so a
    real ATC 'pull a trombone' delay technique can be built from plain
    ADDWPT waypoints: fly A -> apex -> B instead of A -> B directly. The
    apex is offset perpendicular to the A-B track by however much distance
    makes the detour exactly `extra_nm` longer than the direct leg (solving
    2*sqrt((d/2)^2 + h^2) - d = extra_nm for h, where d = |AB|) -- so the
    generated delay is exact, not approximate. Offsets to the RIGHT of the
    inbound track (standard ATC holding-side convention) so it reads as a
    normal-looking sequencing maneuver rather than a random zigzag."""
    d_nm = _haversine_nm(wp_a.lat, wp_a.lon, wp_b.lat, wp_b.lon)
    half_hyp = (extra_nm + d_nm) / 2.0
    h_nm = math.sqrt(max(0.0, half_hyp**2 - (d_nm / 2.0) ** 2))
    track_bearing = _bearing(wp_a.lat, wp_a.lon, wp_b.lat, wp_b.lon)
    mid_lat, mid_lon = _offset_point(wp_a.lat, wp_a.lon, track_bearing, d_nm / 2.0)
    apex_lat, apex_lon = _offset_point(mid_lat, mid_lon, (track_bearing + 90) % 360, h_nm)
    # Carry the altitude/speed of the point the aircraft is established at
    # entering the detour (wp_a) through the apex -- it's still flying the
    # STAR here, not yet on the shared final segment past wp_b.
    return _SyntheticWaypoint(name=name, lat=apex_lat, lon=apex_lon, alt_ft=wp_a.alt_ft, spd_kt=getattr(wp_a, "spd_kt", None))


def _route_leg_times_min(route: list, entry_spd_kt: float) -> list[float]:
    """Cumulative real transit time (minutes) to reach each waypoint of one
    arrival's full STAR+IAP route, index-aligned with route (index 0 is the
    spawn point itself, at 0.0). Uses each waypoint's own published speed
    constraint where the data has one (getattr since VVGB's Waypoint
    doesn't even declare spd_kt) and carries the last known speed forward
    for legs without one -- the aircraft's SPD only actually changes where
    a waypoint publishes a new value (or at the final "SPD vapp" set at the
    scheduled landing minute), so a leg with no constraint is really flown
    at whatever speed was set earlier, not some blanket route-average. A
    single average-speed/total-distance estimate confirmed live to be
    badly wrong for routes that spend very different fractions of their
    distance at cruise vs. approach speed (VVPQ's ~115NM ADBOP transition
    vs. its ~26NM NUMDI one) -- this is also why entry_spd_kt (this
    aircraft's own min(250, vapp+60), matching _emit_arr) is a parameter
    rather than a shared constant: different aircraft types enter the STAR
    at different speeds, and that difference actually changes how long the
    same route real-world takes to fly.

    Returning the full cumulative profile (not just the final total) lets
    the caller split out how much of that time is spent BEFORE vs. AFTER
    this airport's shared IAP final segment (see iap_final_segment_len /
    _enforce_merge_point_separation) without walking the route twice."""
    cum = [0.0]
    prev_speed = entry_spd_kt
    total_hours = 0.0
    for i in range(len(route) - 1):
        wp1, wp2 = route[i], route[i + 1]
        leg_nm = _haversine_nm(wp1.lat, wp1.lon, wp2.lat, wp2.lon)
        spd1 = getattr(wp1, "spd_kt", None) or prev_speed
        spd2 = getattr(wp2, "spd_kt", None) or spd1
        leg_speed = (spd1 + spd2) / 2
        total_hours += leg_nm / leg_speed
        prev_speed = spd2
        cum.append(total_hours * 60)
    return cum


def _pick_aircraft_type(rng: random.Random, icao: str) -> str:
    # VVGB has no dedicated fleet-mix entry -- falls back to VVNB's (same
    # regional traffic), matching the exact fallback both original per-
    # airport builders already hardcoded.
    mix = FLEET_MIX.get(icao, FLEET_MIX.get("VVNB", FLEET_MIX["_default"]))
    types, weights = zip(*mix)
    return rng.choices(types, weights=weights, k=1)[0]


def _bada_climb_speed_kt(alt_ft: float, v2: float, icao_type: str | None = None) -> int:
    """Climb CAS schedule by altitude band -- SID data publishes an altitude
    constraint at each point but never a speed one, so a single blanket
    post-takeoff SPD would leave the rest of the climb completely
    unconstrained. Below FL100 this is the standard 250kt ATC low-altitude
    speed limit (a regulatory constraint, not a BADA aircraft figure, so it
    applies regardless of type); above it, the aircraft's own real published
    BADA climb CAS (APF's "AV" row CAScl2 -- see bada_api.get_real_climb_
    schedule) is used when available, falling back to the previous
    generic-band guess only for a type BADA has no data for."""
    if alt_ft < 3000:
        return round(v2 + 20)
    if alt_ft < 10000:
        return 250
    schedule = get_real_climb_schedule(icao_type) if icao_type else None
    if schedule:
        return schedule["casCl2Kt"]
    if alt_ft < 14000:
        return 280
    return 300


def _bada_descent_speed_kt(alt_ft: float, vapp: float) -> int:
    """Simplified BADA-style descent/approach CAS schedule, used only when a
    STAR waypoint has no published speed of its own (VVGB's data never
    does; VVNB's mostly does -- see _addwpt_line_arr)."""
    if alt_ft >= 14000:
        return 250
    if alt_ft >= 6000:
        return 230
    if alt_ft >= 3000:
        return round(vapp + 30)
    return round(vapp + 10)


def _addwpt_line_dep(t0: int, cs: str, wp_, v2: float, icao_type: str | None = None) -> str:
    if wp_.alt_ft is not None:
        spd = _bada_climb_speed_kt(wp_.alt_ft, v2, icao_type)
        return f"{_fmt(t0)}>{cs} ADDWPT {wp_.lat:.6f},{wp_.lon:.6f},{wp_.alt_ft:.0f},{spd}"
    return f"{_fmt(t0)}>{cs} ADDWPT {wp_.lat:.6f},{wp_.lon:.6f}"


def _addwpt_line_arr(t0: int, cs: str, wp_, vapp: float, speed_published: bool) -> str:
    """Prefers the waypoint's own published speed (VVNB's STAR data) when
    the airport's data format publishes speed at all. Falls back to the BADA
    descent schedule only when the airport's data never publishes speed
    (VVGB) -- when it DOES publish speed (VVNB) but this particular waypoint
    has none, that's the real data saying "unconstrained here", so it's left
    alt-only rather than inventing one. getattr since VVGB's Waypoint
    dataclass doesn't even declare a spd_kt field."""
    if wp_.alt_ft is None:
        return f"{_fmt(t0)}>{cs} ADDWPT {wp_.lat:.6f},{wp_.lon:.6f}"
    spd = getattr(wp_, "spd_kt", None)
    if spd is None:
        if not speed_published:
            spd = _bada_descent_speed_kt(wp_.alt_ft, vapp)
        else:
            return f"{_fmt(t0)}>{cs} ADDWPT {wp_.lat:.6f},{wp_.lon:.6f},{wp_.alt_ft:.0f}"
    return f"{_fmt(t0)}>{cs} ADDWPT {wp_.lat:.6f},{wp_.lon:.6f},{wp_.alt_ft:.0f},{spd:.0f}"


# ---------------------------------------------------------------------------
# Separation enforcement
# ---------------------------------------------------------------------------


def _enforce_arrival_separation(flights: list[ScheduledFlight], min_gap_min: int) -> None:
    arrivals = sorted((sf for sf in flights if sf.movement == "arr"), key=lambda sf: sf.adjusted_minutes)
    last_time: int | None = None
    for sf in arrivals:
        if last_time is not None and sf.adjusted_minutes < last_time + min_gap_min:
            sf.adjusted_minutes = last_time + min_gap_min
            sf.delay_minutes = sf.adjusted_minutes - sf.scheduled_minutes
        last_time = sf.adjusted_minutes


def _enforce_merge_point_separation(
    flights: list[ScheduledFlight],
    final_segment_transit_of: dict[str, float],
    transition_of: dict[str, str],
    same_transition_gap_min: int,
    cross_transition_gap_min: int,
) -> None:
    """Landing-time separation (_enforce_arrival_separation) only actually
    guarantees separation at the real geometric merge point (this airport's
    shared IAP final segment, flown identically regardless of which STAR
    an arrival came from) if every aircraft takes the same time to fly that
    final segment -- which isn't quite true, since different aircraft types
    have different vapp. Confirmed live for VVPQ's 4 STAR transitions
    (NUMDI/OSOTA/TUNPO via GUKNU, ADBOP via LASOV, all converging through
    PQ404) that landing-time-only enforcement let arrivals from DIFFERENT
    transitions cross that shared corridor far closer together than the
    real minimum, since each transition's own pre-merge leg lengths/speeds
    differ.

    Two arrivals from the SAME transition are in-trail on the identical
    track, so the base minimum gap already gives the intended real-world
    distance. Two from DIFFERENT transitions are converging toward the
    merge fix at an angle (VVPQ's STARs approach GUKNU/LASOV from
    completely different directions) -- for a converging, non-parallel pair
    the same time gap buys much LESS real separation than it would
    in-trail: confirmed live that a 3-minute crossing gap left some
    cross-transition pairs only ~1-2NM apart, well under the required 5NM,
    even though same-transition pairs were fine at that same gap.

    cross_transition_gap_min is exposed as its own parameter so a caller
    CAN widen it for exactly this reason -- but doing so trades directly
    against peak arrival throughput: confirmed live that widening it even
    modestly (4-5 minutes) stretched a 21-arrivals/hour, 4-transition
    schedule to 145-160+ minutes because MOST adjacent pairs, by simple
    probability with 4 transitions in the mix, end up cross-transition.
    Properly closing this gap without giving up throughput needs real
    trajectory/CPA-based conflict prediction (or actual radar vectoring,
    which is what real ATC uses here) -- out of scope for this generator,
    which schedules ahead of time rather than resolving conflicts as they
    arise. Callers currently pass the same value for both parameters,
    accepting the softer (not exact-overlap) cross-transition proximity
    that remains as a known limitation.

    Works on a derived 'merge crossing minute' = landing minute minus THIS
    flight's own real final-segment transit time, sorted across ALL
    arrivals regardless of transition, and can only push a landing time
    LATER (never earlier) so it doesn't undo whatever runway/dep-gap
    ordering the earlier landing-time passes already established."""
    arrivals = sorted(
        (sf for sf in flights if sf.movement == "arr"),
        key=lambda sf: sf.adjusted_minutes - final_segment_transit_of.get(sf.flight.callsign, 0.0),
    )
    last_crossing: float | None = None
    last_transition: str | None = None
    for sf in arrivals:
        cs = sf.flight.callsign
        final_transit = final_segment_transit_of.get(cs, 0.0)
        transition = transition_of.get(cs)
        crossing = sf.adjusted_minutes - final_transit
        if last_crossing is not None:
            gap_min = same_transition_gap_min if transition == last_transition else cross_transition_gap_min
            if crossing < last_crossing + gap_min:
                sf.adjusted_minutes += math.ceil((last_crossing + gap_min) - crossing)
                sf.delay_minutes = sf.adjusted_minutes - sf.scheduled_minutes
                crossing = sf.adjusted_minutes - final_transit
        last_crossing = crossing
        last_transition = transition


def _enforce_single_runway_sequencing(flights: list[ScheduledFlight], min_gap_min: int, arr_gap_min: int) -> None:
    _enforce_arrival_separation(flights, arr_gap_min)
    ordered = sorted(flights, key=lambda sf: sf.adjusted_minutes)
    last_time: int | None = None
    last_movement: str | None = None
    for sf in ordered:
        # arr -> dep is exempted from this coarse whole-minute floor -- it's
        # governed by the precise dep-after-arr second-level rule instead
        # (_compute_dep_release_seconds), which would otherwise always be
        # dominated by this rule's (usually larger) minute-level minimum.
        exempt = last_movement == "arr" and sf.movement == "dep"
        if last_time is not None and not exempt and sf.adjusted_minutes < last_time + min_gap_min:
            sf.adjusted_minutes = last_time + min_gap_min
            sf.delay_minutes = sf.adjusted_minutes - sf.scheduled_minutes
        last_time = sf.adjusted_minutes
        last_movement = sf.movement


def _enforce_tma_capacity(
    flights: list[ScheduledFlight],
    crossing_transit_of: dict[str, float],
    max_concurrent: int | None,
    movement: str,
) -> None:
    """Caps how many of `flights` (all one movement type -- call once for
    arrivals, once for departures) are inside the TMA at the same simulated
    instant. `crossing_transit_of[cs]` is how many minutes THIS flight
    spends inside the TMA: for an arrival, the real transit from its own
    TMA-gate fix to touchdown (equal to its FULL transit if it's already
    inside the TMA at its own entry fix -- see
    AirportProcedures.star_tma_gate); for a departure, the real transit from
    takeoff to its own TMA-exit fix (see sid_tma_gate). An arrival's window
    inside the TMA is [adjusted_minutes - transit, adjusted_minutes]
    (adjusted_minutes is its landing minute); a departure's is
    [adjusted_minutes, adjusted_minutes + transit] (adjusted_minutes is its
    takeoff minute).

    Classic greedy resource-scheduling: sorted by each flight's own
    (unconstrained) TMA-entry instant, keep a min-heap of currently-occupied
    exit instants; if the resource is already at capacity when a new flight
    wants to enter, delay ITS entry (never anyone else's) until the
    earliest-finishing occupant frees a slot. Delay-only (matches every
    other separation pass in this module) so it never fights an earlier
    pass's ordering."""
    if not max_concurrent:
        return
    import heapq

    def entry_of(sf: ScheduledFlight) -> float:
        d = crossing_transit_of.get(sf.flight.callsign, 0.0)
        return sf.adjusted_minutes - d if movement == "arr" else float(sf.adjusted_minutes)

    # Filter to the one movement type this call is capping -- the caller
    # always passes the full flight list (arrivals AND departures) plus a
    # crossing_transit_of that only has keys for the relevant movement, but
    # relying on that alone is wrong: a flight of the OTHER movement missing
    # from crossing_transit_of still gets a default duration of 0.0 from
    # entry_of/the .get() below, which put it in the SAME occupancy count as
    # a zero-length window and let it silently consume/compete for a slot
    # meant for the movement actually being capped -- confirmed live (this
    # cross-contamination is what caused the dep-cap pass to reopen an
    # already-fixed arrival violation, and vice versa).
    ordered = sorted((sf for sf in flights if sf.movement == movement), key=entry_of)
    occupied_until: list[float] = []  # min-heap of exit instants currently inside
    for sf in ordered:
        cs = sf.flight.callsign
        duration = crossing_transit_of.get(cs, 0.0)
        entry = entry_of(sf)
        while occupied_until and occupied_until[0] <= entry:
            heapq.heappop(occupied_until)
        if len(occupied_until) >= max_concurrent:
            entry = max(entry, occupied_until[0])
            heapq.heappop(occupied_until)
            new_adjusted = math.ceil(entry + duration) if movement == "arr" else math.ceil(entry)
            if new_adjusted > sf.adjusted_minutes:
                sf.adjusted_minutes = new_adjusted
                sf.delay_minutes = sf.adjusted_minutes - sf.scheduled_minutes
            entry = entry_of(sf)
        heapq.heappush(occupied_until, entry + duration)


def _dep_tma_gate_transit_min(procs: "AirportProcedures", route: list, transition: str) -> float:
    """Estimated minutes from takeoff to crossing OUT of the real TMA
    boundary on this SID transition (see AirportProcedures.sid_tma_gate).
    No published climb-speed schedule exists for VVPQ's SID data (only
    altitude constraints -- see SID_TRANSITIONS' comment), so unlike the
    arrival side (_route_leg_times_min, built from real per-waypoint speed
    constraints) this is a straight-line distance from the runway threshold
    to the gate fix over one flat assumed initial-climb groundspeed --
    approximate by construction, only used to size the TMA-departure-count
    cap, not flown or shown as a real speed constraint anywhere."""
    gate_name = procs.sid_tma_gate.get(transition)
    if not gate_name:
        return 0.0
    gate_wp = next((wp for wp in route if wp.name == gate_name), None)
    if gate_wp is None:
        return 0.0
    threshold = procs.threshold_for_dep(transition)
    dist_nm = _haversine_nm(threshold.lat, threshold.lon, gate_wp.lat, gate_wp.lon)
    assumed_climb_groundspeed_kt = 220.0
    return (dist_nm / assumed_climb_groundspeed_kt) * 60.0


def _compute_dep_release_seconds(flights: list[ScheduledFlight], dep_after_arr_gap_sec: int) -> dict[str, int]:
    """Second-level release time for each departure: max(its own scheduled
    minute*60, the immediately preceding arrival's landing second + gap).
    The minute-granular passes above can't express a sub-minute gap
    directly, so this is a final, precise top-up pass -- it never pulls a
    departure earlier, only pushes it later when the preceding arrival
    landed too recently."""
    ordered = sorted(flights, key=lambda sf: sf.adjusted_minutes)
    release_s: dict[str, int] = {}
    last_arr_landing_s: int | None = None
    for sf in ordered:
        if sf.movement == "arr":
            last_arr_landing_s = sf.adjusted_minutes * 60
            continue
        base_s = sf.adjusted_minutes * 60
        if last_arr_landing_s is not None:
            base_s = max(base_s, last_arr_landing_s + dep_after_arr_gap_sec)
        release_s[sf.flight.callsign] = base_s
    return release_s


# ---------------------------------------------------------------------------
# Scenario construction
# ---------------------------------------------------------------------------


def build_hourly_scenario(procs: AirportProcedures, config: CapacityScenarioConfig, seed: int) -> list[CapacityFlight]:
    rng = random.Random(seed)
    dep_per_hour = config.dep_per_hour
    arr_per_hour = config.arr_per_hour
    # Ceiling, not round: the engine only schedules at whole-minute
    # granularity, and a round-to-nearest can undershoot a real regulatory
    # minimum (e.g. requesting 130s -- 5NM at 140kt per CONOPS APP Phu Quoc
    # -- rounded to 120s, i.e. only ~4.67NM, silently violating it). Ceiling
    # guarantees the enforced gap is never tighter than requested.
    min_arr_arr_gap_min = max(1, math.ceil(config.min_arr_arr_gap_sec / 60))
    min_runway_gap_min = max(1, math.ceil(config.min_runway_gap_sec / 60))

    dep_scheduled: list[ScheduledFlight] = []
    arr_scheduled: list[ScheduledFlight] = []
    routes: dict[str, list] = {}
    transitions: dict[str, str] = {}

    # Sorted by name (not dict iteration order) so the same seed always
    # produces the same shuffled slot list regardless of how the mix dict
    # was constructed or transmitted -- confirmed live that a mix built
    # in-process (insertion order) vs one round-tripped through Flask's
    # jsonify (which alphabetizes keys) fed rng.shuffle() two different
    # starting sequences and produced different flight assignments for the
    # "same" seed + mix, breaking base-case/alternative-case reproducibility.
    dep_transition_slots = [t for t, n in sorted(config.sid_mix.items()) for _ in range(n)]
    rng.shuffle(dep_transition_slots)
    dep_count = 0
    for transition in dep_transition_slots:
        dep_count += 1
        cs = f"{procs.callsign_prefix}D{dep_count:02d}"
        base_minute = round((dep_count - 0.5) * 60 / dep_per_hour)
        etd = max(0, min(59, base_minute + rng.randint(-1, 1)))
        actype = _pick_aircraft_type(rng, procs.icao)
        rec = FlightRecord(
            no=dep_count, permission="X", aircraft_type=actype, aircraft_type_raw=actype,
            callsign=cs, dep=procs.icao, arr="ZZZZ", etd_minutes=etd,
            airways=[], operating_days=set(), valid_from=None, valid_to=None,
        )
        routes[cs] = procs.sid_route(transition)
        transitions[cs] = transition
        dep_scheduled.append(ScheduledFlight(flight=rec, movement="dep", scheduled_minutes=etd, runway=procs.runway_for_dep(transition)))

    arr_transition_slots = [t for t, n in sorted(config.star_mix.items()) for _ in range(n)]
    rng.shuffle(arr_transition_slots)
    arr_count = 0
    arr_transition_of: dict[str, str] = {}
    for transition in arr_transition_slots:
        arr_count += 1
        cs = f"{procs.callsign_prefix}A{arr_count:02d}"
        base_minute = round((arr_count - 0.5) * 60 / arr_per_hour)
        eta = max(0, min(59, base_minute + rng.randint(-1, 1)))
        actype = _pick_aircraft_type(rng, procs.icao)
        rec = FlightRecord(
            no=100 + arr_count, permission="X", aircraft_type=actype, aircraft_type_raw=actype,
            callsign=cs, dep="ZZZZ", arr=procs.icao, etd_minutes=eta,
            airways=[], operating_days=set(), valid_from=None, valid_to=None,
        )
        routes[cs] = procs.star_route(transition)
        transitions[cs] = transition
        arr_transition_of[cs] = transition
        arr_scheduled.append(ScheduledFlight(flight=rec, movement="arr", scheduled_minutes=eta, runway=procs.runway_for_arr(transition)))

    all_scheduled = apply_rules(dep_scheduled + arr_scheduled)
    _enforce_arrival_separation(all_scheduled, min_arr_arr_gap_min)
    _enforce_single_runway_sequencing(all_scheduled, min_runway_gap_min, min_arr_arr_gap_min)
    # Re-apply as the final authoritative step: the generic minute-level pass
    # above can push an arrival later (an interleaved departure only needs
    # its own minimum clearance), which can silently shrink that arrival's
    # gap to the NEXT arrival below the required minimum -- confirmed live.
    _enforce_arrival_separation(all_scheduled, min_arr_arr_gap_min)

    # Each arrival's own full leg-by-leg transit profile -- computed once
    # here and reused below both to separate different STAR transitions
    # properly at their real merge point (not just at the runway threshold)
    # and to derive each flight's spawn time, so the route never needs
    # walking twice.
    leg_times_of: dict[str, list[float]] = {}
    for sf in all_scheduled:
        if sf.movement != "arr":
            continue
        cs = sf.flight.callsign
        perf = AIRCRAFT_PERF.get(sf.flight.aircraft_type, AIRCRAFT_PERF["A321"])
        entry_spd = min(250, perf["vapp"] + 60)
        leg_times_of[cs] = _route_leg_times_min(routes[cs], entry_spd)

    final_segment_transit_of: dict[str, float] = {}
    for cs, cum in leg_times_of.items():
        route = routes[cs]
        split_idx = max(0, len(route) - procs.iap_segment_len_for(transitions[cs]))
        final_segment_transit_of[cs] = cum[-1] - cum[split_idx]

    # Departures get no flown detour for this delay (unlike arrivals) --
    # it's realized as a longer wait at the runway before takeoff clearance,
    # which is exactly how real ATC would hold a departure when the TMA
    # departure corridor is already saturated, and needs no route change
    # since the delay happens before the aircraft exists in the sim at all.
    dep_tma_transit_of: dict[str, float] = {
        sf.flight.callsign: _dep_tma_gate_transit_min(procs, routes[sf.flight.callsign], transitions[sf.flight.callsign])
        for sf in all_scheduled if sf.movement == "dep"
    }

    # TMA-gate-capacity and merge-point separation each only push a landing
    # time LATER when their own constraint needs it, but each one's push can
    # reopen a violation the OTHER one just fixed (a merge-point-driven
    # detour adds real time inside the TMA; a TMA-cap-driven push can
    # re-cluster arrivals at the merge point) -- confirmed live that a
    # single pass of each left the TMA-capacity cap violated (peak 6 against
    # a cap of 3). Alternate both to a fixed point (bounded iteration count,
    # not unbounded, since both are delay-only/monotonic so this always
    # converges quickly in practice): each round re-measures the REAL
    # in-TMA transit and merge-final-segment transit against the
    # currently-final routes (detours already inserted by earlier rounds
    # change those durations) and re-applies both constraints; a round that
    # changes nothing ends the loop early.
    hold_delay_of: dict[str, int] = {}
    gate_hold_delay_of: dict[str, int] = {}
    for _round in range(10):
        before_round = {sf.flight.callsign: sf.adjusted_minutes for sf in all_scheduled if sf.movement == "arr"}

        arr_tma_transit_now: dict[str, float] = {}
        for cs in arr_transition_of:
            perf = AIRCRAFT_PERF.get(next(sf.flight.aircraft_type for sf in all_scheduled if sf.flight.callsign == cs), AIRCRAFT_PERF["A321"])
            entry_spd = min(250, perf["vapp"] + 60)
            route = routes[cs]
            cum = _route_leg_times_min(route, entry_spd)
            gate_name = procs.star_tma_gate.get(arr_transition_of[cs])
            gate_idx = next((i for i, wp in enumerate(route) if wp.name == gate_name), 0) if gate_name else 0
            arr_tma_transit_now[cs] = cum[-1] - cum[gate_idx]

        _enforce_tma_capacity(all_scheduled, arr_tma_transit_now, config.max_arr_in_tma, movement="arr")
        _enforce_tma_capacity(all_scheduled, dep_tma_transit_of, config.max_dep_in_tma, movement="dep")
        _enforce_arrival_separation(all_scheduled, min_arr_arr_gap_min)

        for sf in all_scheduled:
            if sf.movement != "arr":
                continue
            cs = sf.flight.callsign
            if not procs.star_tma_gate.get(arr_transition_of[cs]):
                continue
            delta = sf.adjusted_minutes - before_round.get(cs, sf.adjusted_minutes)
            if delta > 0:
                gate_hold_delay_of[cs] = gate_hold_delay_of.get(cs, 0) + delta
                route = routes[cs]
                gate_name = procs.star_tma_gate.get(arr_transition_of[cs])
                gate_idx = next((i for i, wp in enumerate(route) if wp.name == gate_name), 0)
                if 1 <= gate_idx < len(route):
                    wp_a, wp_b = route[gate_idx - 1], route[gate_idx]
                    local_speed_kt = getattr(wp_a, "spd_kt", None) or getattr(wp_b, "spd_kt", None) or 220
                    extra_nm = (local_speed_kt / 60.0) * delta
                    apex = _trombone_apex_waypoint(wp_a, wp_b, extra_nm, name=f"{cs}TMAHOLD{_round}")
                    routes[cs] = route[:gate_idx] + [apex] + route[gate_idx:]

        before_merge = {sf.flight.callsign: sf.adjusted_minutes for sf in all_scheduled if sf.movement == "arr"}
        _enforce_merge_point_separation(
            all_scheduled, final_segment_transit_of, arr_transition_of,
            same_transition_gap_min=min_arr_arr_gap_min,
            cross_transition_gap_min=min_arr_arr_gap_min,
        )
        _enforce_arrival_separation(all_scheduled, min_arr_arr_gap_min)

        for sf in all_scheduled:
            if sf.movement != "arr":
                continue
            cs = sf.flight.callsign
            delta = sf.adjusted_minutes - before_merge.get(cs, sf.adjusted_minutes)
            if delta > 0:
                hold_delay_of[cs] = hold_delay_of.get(cs, 0) + delta
                route = routes[cs]
                split_idx = max(0, len(route) - procs.iap_segment_len_for(arr_transition_of[cs]))
                if 1 <= split_idx < len(route):
                    wp_a, wp_b = route[split_idx - 1], route[split_idx]
                    local_speed_kt = getattr(wp_a, "spd_kt", None) or 200
                    extra_nm = (local_speed_kt / 60.0) * delta
                    apex = _trombone_apex_waypoint(wp_a, wp_b, extra_nm, name=f"{cs}HOLD{_round}")
                    routes[cs] = route[:split_idx] + [apex] + route[split_idx:]

        after_round = {sf.flight.callsign: sf.adjusted_minutes for sf in all_scheduled if sf.movement == "arr"}
        if after_round == before_round:
            break

    dep_release_s = _compute_dep_release_seconds(all_scheduled, config.dep_after_arr_gap_sec)

    spawn_by_callsign: dict[str, int] = {}
    for sf in all_scheduled:
        if sf.movement != "arr":
            continue
        cs = sf.flight.callsign
        transit = max(1, round(leg_times_of[cs][-1]))
        # Deliberately NOT clamped to 0 here -- a long STAR (e.g. VVPQ's
        # ~115NM ADBOP, ~30min real transit) landing early in the hour needs
        # a spawn time before this hour even starts. Clamping to 0 here
        # confirmed live to silently override the real transit for almost
        # every flight on that transition: the floor forces its raw spawn
        # up to 0, and the same-transition 3-minute cascade below then just
        # walks every LATER flight on that transition up from that same
        # artificial floor too, regardless of how much real lead time its
        # own transit actually needed -- so changing the transit-speed
        # estimate had almost no effect on the actual generated schedule.
        # build_multi_hour_scenario clamps this (only for the first hour,
        # which has no earlier hour to borrow spawn time from) after adding
        # each hour's time offset.
        #
        # Also nets out hold_delay_of/gate_hold_delay_of here: `transit`
        # above is this flight's ORIGINAL (pre-detour) transit time, but
        # `sf.adjusted_minutes` is its landing minute AFTER merge-point AND
        # TMA-capacity separation pushed it later. Subtracting both delays
        # too cancels that push back out, landing spawn at the flight's
        # natural, undelayed time -- the extra minutes are now real flight
        # time spent flying the two detours just inserted into its route
        # (gate-hold first, merge-point trombone second), not time spent
        # waiting to be created. A TUNPO arrival's TMA-capacity delay is
        # deliberately NOT in gate_hold_delay_of (no real outside-TMA point
        # to hold at -- see star_tma_gate), so it's deliberately left OUT of
        # this subtraction too: that delay stays as extra time before
        # spawn/creation, i.e. held further back before ever entering the
        # scenario, the only honest way to express it given the real route.
        spawn_by_callsign[cs] = sf.adjusted_minutes - transit - hold_delay_of.get(cs, 0) - gate_hold_delay_of.get(cs, 0)

    by_transition: dict[str, list[str]] = {}
    for cs, transition in arr_transition_of.items():
        by_transition.setdefault(transition, []).append(cs)
    for transition, callsigns in by_transition.items():
        callsigns.sort(key=lambda cs: spawn_by_callsign[cs])
        last_spawn: int | None = None
        for cs in callsigns:
            if last_spawn is not None and spawn_by_callsign[cs] < last_spawn + _MIN_SAME_TRANSITION_SPAWN_GAP_MIN:
                spawn_by_callsign[cs] = last_spawn + _MIN_SAME_TRANSITION_SPAWN_GAP_MIN
            last_spawn = spawn_by_callsign[cs]

    return [
        CapacityFlight(
            scheduled=sf,
            route=routes[sf.flight.callsign],
            transition=transitions[sf.flight.callsign],
            spawn_minutes=spawn_by_callsign.get(sf.flight.callsign, sf.adjusted_minutes),
            takeoff_seconds=dep_release_s.get(sf.flight.callsign),
        )
        for sf in all_scheduled
    ]


def build_multi_hour_scenario(procs: AirportProcedures, config: CapacityScenarioConfig) -> list[CapacityFlight]:
    """Repeat the hourly pattern verbatim across `config.hours` consecutive
    hours -- same seed every hour, callsigns prefixed per hour, all times
    shifted, so the result is one continuous multi-hour .scn."""
    all_flights: list[CapacityFlight] = []
    for hour in range(config.hours):
        hour_flights = build_hourly_scenario(procs, config, seed=config.seed)
        offset_min = hour * 60

        # No earlier hour to borrow spawn time from in hour 0 -- a long
        # STAR's first landing(s) of the whole scenario inherently can't get
        # their full real lead time. Clamping EACH flight's spawn to 0
        # independently confirmed live to be wrong: it collapsed two
        # different ADBOP arrivals (whose raw spawn had legitimately gone
        # -6 and 0 respectively -- a real 6-minute stagger already
        # established by the same-transition cascade in
        # build_hourly_scenario) onto the exact same spawn instant, so they
        # then flew on top of each other (0.00NM apart) for the whole
        # route. Shifting every flight of a transition by the SAME amount
        # -- just enough that the earliest one lands at 0 -- keeps that
        # relative stagger intact instead of destroying it.
        #
        # Critically, this shift has to move the LANDING time too, not just
        # spawn: confirmed live that shifting spawn alone (landing left at
        # its original, too-early value) silently gave a long-haul arrival
        # (ADBOP, ~33min real transit) only ~5 minutes of actual flight time
        # because its landing minute was scheduled only 8 minutes into the
        # scenario -- it never got anywhere near VVPQ by its "landing" time
        # and would have gone on to badly violate separation with whatever
        # was scheduled to land next once it actually arrived ~25+ minutes
        # late. Shifting landing by the same amount preserves each flight's
        # real required transit exactly; the block below re-runs arrival
        # separation across the whole scenario afterward to confirm this
        # didn't reopen a conflict with another transition's unshifted
        # flights.
        shift_by_transition: dict[str, int] = {}
        if hour == 0:
            min_spawn_by_transition: dict[str, int] = {}
            for vf in hour_flights:
                if vf.scheduled.movement != "arr":
                    continue
                prev = min_spawn_by_transition.get(vf.transition, vf.spawn_minutes)
                min_spawn_by_transition[vf.transition] = min(prev, vf.spawn_minutes)
            shift_by_transition = {t: max(0, -m) for t, m in min_spawn_by_transition.items()}

        for vf in hour_flights:
            orig_sf = vf.scheduled
            orig_f = orig_sf.flight
            new_cs = f"H{hour}{orig_f.callsign}" if config.hours > 1 else orig_f.callsign
            shift = shift_by_transition.get(vf.transition, 0) if (hour == 0 and orig_sf.movement == "arr") else 0
            new_record = FlightRecord(
                no=orig_f.no, permission=orig_f.permission,
                aircraft_type=orig_f.aircraft_type, aircraft_type_raw=orig_f.aircraft_type_raw,
                callsign=new_cs, dep=orig_f.dep, arr=orig_f.arr,
                etd_minutes=orig_f.etd_minutes + offset_min + shift,
                airways=orig_f.airways, operating_days=orig_f.operating_days,
                valid_from=orig_f.valid_from, valid_to=orig_f.valid_to,
            )
            new_sf = ScheduledFlight(
                flight=new_record, movement=orig_sf.movement,
                scheduled_minutes=orig_sf.scheduled_minutes + offset_min,
                runway=orig_sf.runway, gate=orig_sf.gate, taxi_route=orig_sf.taxi_route,
                taxi_delay_minutes=orig_sf.taxi_delay_minutes,
                adjusted_minutes=orig_sf.adjusted_minutes + offset_min + shift,
                delay_minutes=orig_sf.delay_minutes + shift, applied_rule=orig_sf.applied_rule,
            )
            spawn_minutes = vf.spawn_minutes + offset_min + shift
            all_flights.append(CapacityFlight(
                scheduled=new_sf, route=vf.route, transition=vf.transition,
                spawn_minutes=spawn_minutes,
                takeoff_seconds=None if vf.takeoff_seconds is None else vf.takeoff_seconds + offset_min * 60,
            ))

    # Always re-verify across the FULL concatenated timeline, not just when
    # hours > 1: each hour above is scheduled and separation-enforced
    # independently, then shifted by hour*60 minutes, so a busy hour's own
    # last arrival landing right at its 60-minute mark can collide with the
    # next (identically shifted) hour's first arrivals -- confirmed live for
    # the VVPQ CONOPS APP 41mvt/h scenario (sub-130s gaps at the hour
    # boundary). The hour-0 cold-start landing-time shift above can ALSO
    # move a whole transition's arrivals by 20+ minutes, easily far enough
    # to newly collide with another transition's unshifted arrivals at the
    # shared merge point -- so re-run merge-point separation here too, not
    # just the plain landing-time one.
    min_arr_arr_gap_min = max(1, math.ceil(config.min_arr_arr_gap_sec / 60))
    all_sf = [cf.scheduled for cf in all_flights]
    before = {id(sf): sf.adjusted_minutes for sf in all_sf}

    final_segment_transit_of: dict[str, float] = {}
    arr_tma_transit_of: dict[str, float] = {}
    transition_of: dict[str, str] = {}
    for cf in all_flights:
        if cf.scheduled.movement != "arr":
            continue
        cs = cf.scheduled.flight.callsign
        transition_of[cs] = cf.transition
        perf = AIRCRAFT_PERF.get(cf.scheduled.flight.aircraft_type, AIRCRAFT_PERF["A321"])
        entry_spd = min(250, perf["vapp"] + 60)
        cum = _route_leg_times_min(cf.route, entry_spd)
        split_idx = max(0, len(cf.route) - procs.iap_segment_len_for(cf.transition))
        final_segment_transit_of[cs] = cum[-1] - cum[split_idx]
        gate_name = procs.star_tma_gate.get(cf.transition)
        gate_idx = next((i for i, wp in enumerate(cf.route) if wp.name == gate_name), 0) if gate_name else 0
        arr_tma_transit_of[cs] = cum[-1] - cum[gate_idx]

    dep_tma_transit_of: dict[str, float] = {
        cf.scheduled.flight.callsign: _dep_tma_gate_transit_min(procs, cf.route, cf.transition)
        for cf in all_flights if cf.scheduled.movement == "dep"
    }

    # Same TMA-capacity + merge-point re-verification as build_hourly_scenario,
    # run again across the FULL concatenated timeline for the same
    # hour-boundary reason as above -- any extra delay found here only
    # shows up as more spawn delay (see the loop below), not a new flown
    # detour, since no route mutation happens in this function (unlike
    # build_hourly_scenario) so arr_tma_transit_of/dep_tma_transit_of stay
    # valid across every round. Alternating the three passes to a fixed
    # point for the same reason as build_hourly_scenario's own loop:
    # confirmed live that a single pass of each left a residual violation
    # (concurrent arrivals still hit 4 against a cap of 3 after only one
    # round here, even though each HOUR alone already converged to exactly
    # 3 on its own) purely from the two hours' schedules interacting at the
    # 60-minute boundary.
    for _round in range(10):
        before_round = {sf.flight.callsign: sf.adjusted_minutes for sf in all_sf if sf.movement == "arr"}
        _enforce_arrival_separation(all_sf, min_arr_arr_gap_min)
        _enforce_tma_capacity(all_sf, arr_tma_transit_of, config.max_arr_in_tma, movement="arr")
        _enforce_tma_capacity(all_sf, dep_tma_transit_of, config.max_dep_in_tma, movement="dep")
        _enforce_arrival_separation(all_sf, min_arr_arr_gap_min)
        _enforce_merge_point_separation(
            all_sf, final_segment_transit_of, transition_of,
            same_transition_gap_min=min_arr_arr_gap_min,
            cross_transition_gap_min=min_arr_arr_gap_min,
        )
        _enforce_arrival_separation(all_sf, min_arr_arr_gap_min)
        after_round = {sf.flight.callsign: sf.adjusted_minutes for sf in all_sf if sf.movement == "arr"}
        if after_round == before_round:
            break

    for cf in all_flights:
        delta = cf.scheduled.adjusted_minutes - before[id(cf.scheduled)]
        if delta:
            cf.spawn_minutes += delta
    dep_release_s = _compute_dep_release_seconds(all_sf, config.dep_after_arr_gap_sec)
    for cf in all_flights:
        if cf.scheduled.movement == "dep":
            cs = cf.scheduled.flight.callsign
            if cs in dep_release_s:
                cf.takeoff_seconds = dep_release_s[cs]

    return all_flights


_REAL_HOLD_SPEED_KT = 200.0  # published speed AT GUKNU/LASOV (STAR_TRANSITIONS)
_REAL_HOLD_SPEED_FLOOR_KT = 160.0  # realistic ATC speed-control floor for a
# narrowbody well above vapp -- not a published number, a conservative
# operating assumption for how far real speed control can realistically go
# before a hold becomes the only remaining option.


def _resolve_merge_conflict_real(route: list, transition: str, needed_delay_min: float) -> tuple[list, float]:
    """Absorb `needed_delay_min` of real extra flight time using two actual
    ATC techniques, in the order a real controller would reach for them:
    (1) reduce the published speed on the leg feeding this transition's real
    hand-off fix (GUKNU or LASOV) as far as a realistic floor allows; (2) if
    that alone isn't enough, send the flight around that fix's own REAL
    published holding pattern (see vvpq_procedures.STAR_HOLD, transcribed
    from VVPQ.kmz) for as many additional full laps as needed to cover the
    rest. Never silently drops the conflict -- returns (possibly unchanged)
    route plus whatever portion of the delay this airport's real data
    couldn't resolve (0.0 in the normal case)."""
    from WebATM.server.vvpq_procedures import STAR_HOLD

    hand_off_name = "GUKNU" if transition in ("NUMDI", "OSOTA", "TUNPO") else "LASOV" if transition == "ADBOP" else None
    hand_off_idx = next((i for i, w in enumerate(route) if w.name == hand_off_name), None) if hand_off_name else None
    if hand_off_idx is None or hand_off_idx < 1:
        return route, needed_delay_min

    new_route = list(route)
    remaining = needed_delay_min

    spd_idx = next((i for i in range(hand_off_idx - 1, -1, -1) if new_route[i].spd_kt), None)
    if spd_idx is not None:
        wp_speed, wp_next = new_route[spd_idx], new_route[spd_idx + 1]
        dist_nm = _haversine_nm(wp_speed.lat, wp_speed.lon, wp_next.lat, wp_next.lon)
        old_time_min = dist_nm / wp_speed.spd_kt * 60
        max_extra = dist_nm / _REAL_HOLD_SPEED_FLOOR_KT * 60 - old_time_min
        if max_extra > 0:
            if remaining <= max_extra:
                new_speed = dist_nm / ((old_time_min + remaining) / 60)
                new_route[spd_idx] = _SyntheticWaypoint(wp_speed.name, wp_speed.lat, wp_speed.lon, wp_speed.alt_ft, round(new_speed, 1))
                remaining = 0.0
            else:
                new_route[spd_idx] = _SyntheticWaypoint(wp_speed.name, wp_speed.lat, wp_speed.lon, wp_speed.alt_ft, _REAL_HOLD_SPEED_FLOOR_KT)
                remaining -= max_extra

    if remaining > 0.05:
        hold_pts = STAR_HOLD[transition]
        loop_dist_nm = sum(_haversine_nm(hold_pts[i][0], hold_pts[i][1], hold_pts[i + 1][0], hold_pts[i + 1][1]) for i in range(len(hold_pts) - 1))
        loop_time_min = loop_dist_nm / _REAL_HOLD_SPEED_KT * 60
        n_loops = max(1, math.ceil(remaining / loop_time_min))
        hold_wps = [
            _SyntheticWaypoint(f"{hand_off_name}HLD", lat, lon, 1524.0, _REAL_HOLD_SPEED_KT)
            for _ in range(n_loops) for lat, lon in hold_pts[1:]
        ]
        new_route = new_route[:hand_off_idx + 1] + hold_wps + new_route[hand_off_idx + 1:]
        remaining = 0.0

    return new_route, remaining


@dataclass(frozen=True)
class RealFlightLeg:
    """One real leg from an actual daily flight schedule (airport-ops
    style, e.g. a FIDS export) -- as opposed to CapacityScenarioConfig's
    synthetic sid_mix/star_mix, every field here is a real published fact
    from that schedule, except `transition`, which the caller must supply
    (this airport's real SID/STAR data has no ATS route/airway string to
    resolve a transition from -- see the caller for how it derives one)."""
    kind: str  # "arr" or "dep"
    callsign: str
    aircraft_type: str  # already mapped to an AIRCRAFT_PERF key
    other_icao_or_city: str
    minutes: int  # scheduled local time, minutes since 00:00 of the scenario day
    transition: str


def build_real_schedule_scenario(procs: AirportProcedures, config: CapacityScenarioConfig, legs: list[RealFlightLeg]) -> list[CapacityFlight]:
    """Build a scenario from a REAL daily flight schedule instead of a
    synthetic SID/STAR mix: every callsign, aircraft type, and scheduled
    time is exactly what the source schedule published. Runs the exact same
    real-separation-rule stack as build_hourly_scenario (arrival spacing,
    single-runway sequencing, merge-point separation, dep-after-arr release
    seconds) so a genuinely unsafe pair of real times still gets pushed
    apart -- `scheduled_minutes` keeps the original published time for
    reference; `adjusted_minutes` is what's actually flown. Deliberately
    does NOT insert a trombone/gate-hold detour for any delay found (unlike
    build_hourly_scenario) -- the goal here is reproducing the published
    schedule as closely as safety allows, not stress-testing a capacity
    limit, so no synthetic maneuver is invented on top of it."""
    min_arr_arr_gap_min = max(1, math.ceil(config.min_arr_arr_gap_sec / 60))
    min_runway_gap_min = max(1, math.ceil(config.min_runway_gap_sec / 60))

    dep_scheduled: list[ScheduledFlight] = []
    arr_scheduled: list[ScheduledFlight] = []
    routes: dict[str, list] = {}
    transitions: dict[str, str] = {}

    for i, leg in enumerate(legs):
        cs = leg.callsign
        transitions[cs] = leg.transition
        if leg.kind == "arr":
            rec = FlightRecord(
                no=i + 1, permission="X", aircraft_type=leg.aircraft_type, aircraft_type_raw=leg.aircraft_type,
                callsign=cs, dep=leg.other_icao_or_city, arr=procs.icao, etd_minutes=leg.minutes,
                airways=[], operating_days=set(), valid_from=None, valid_to=None,
            )
            routes[cs] = procs.star_route(leg.transition)
            arr_scheduled.append(ScheduledFlight(flight=rec, movement="arr", scheduled_minutes=leg.minutes, runway=procs.runway_for_arr(leg.transition)))
        else:
            rec = FlightRecord(
                no=i + 1, permission="X", aircraft_type=leg.aircraft_type, aircraft_type_raw=leg.aircraft_type,
                callsign=cs, dep=procs.icao, arr=leg.other_icao_or_city, etd_minutes=leg.minutes,
                airways=[], operating_days=set(), valid_from=None, valid_to=None,
            )
            routes[cs] = procs.sid_route(leg.transition)
            dep_scheduled.append(ScheduledFlight(flight=rec, movement="dep", scheduled_minutes=leg.minutes, runway=procs.runway_for_dep(leg.transition)))

    all_scheduled = apply_rules(dep_scheduled + arr_scheduled)
    _enforce_arrival_separation(all_scheduled, min_arr_arr_gap_min)
    _enforce_single_runway_sequencing(all_scheduled, min_runway_gap_min, min_arr_arr_gap_min)
    _enforce_arrival_separation(all_scheduled, min_arr_arr_gap_min)

    leg_times_of: dict[str, list[float]] = {}
    for sf in all_scheduled:
        if sf.movement != "arr":
            continue
        cs = sf.flight.callsign
        perf = AIRCRAFT_PERF.get(sf.flight.aircraft_type, AIRCRAFT_PERF["A321"])
        entry_spd = min(250, perf["vapp"] + 60)
        leg_times_of[cs] = _route_leg_times_min(routes[cs], entry_spd)

    final_segment_transit_of: dict[str, float] = {}
    for cs, cum in leg_times_of.items():
        route = routes[cs]
        split_idx = max(0, len(route) - procs.iap_segment_len_for(transitions[cs]))
        final_segment_transit_of[cs] = cum[-1] - cum[split_idx]

    arr_transition_of = {cs: t for cs, t in transitions.items() if cs in leg_times_of}
    landing_before_merge: dict[str, int] = {sf.flight.callsign: sf.adjusted_minutes for sf in all_scheduled if sf.movement == "arr"}
    _enforce_merge_point_separation(
        all_scheduled, final_segment_transit_of, arr_transition_of,
        same_transition_gap_min=min_arr_arr_gap_min,
        cross_transition_gap_min=min_arr_arr_gap_min,
    )
    _enforce_arrival_separation(all_scheduled, min_arr_arr_gap_min)

    # A real published schedule occasionally puts two real flights on
    # DIFFERENT STAR transitions close enough together to actually converge
    # on the shared IAP final segment (same finding as
    # _enforce_merge_point_separation's own docstring) -- pushing the
    # SCHEDULE later isn't enough on its own if the flight still flies the
    # unmodified route, since BlueSky has no ASAS/RESOAUTO safety net running
    # here (see _asas_header). Every arrival whose landing time got pushed
    # actually gets that extra time FLOWN, using the same two techniques a
    # real controller reaches for: slow down first, real published hold
    # second -- never just a silent schedule shift with nothing done about
    # the underlying conflict.
    extra_delay_of: dict[str, float] = {}
    unresolved: dict[str, float] = {}
    original_routes: dict[str, list] = {cs: routes[cs] for cs in leg_times_of}
    entry_spd_of: dict[str, float] = {
        cs: AIRCRAFT_PERF.get(sf.flight.aircraft_type, AIRCRAFT_PERF["A321"])["vapp"] + 60
        for sf in all_scheduled if sf.movement == "arr" for cs in [sf.flight.callsign]
    }

    def _apply_resolution(cs: str) -> None:
        new_route, remaining = _resolve_merge_conflict_real(original_routes[cs], arr_transition_of[cs], extra_delay_of[cs])
        routes[cs] = new_route
        leg_times_of[cs] = _route_leg_times_min(new_route, min(250, entry_spd_of[cs]))
        if remaining > 0.05:
            unresolved[cs] = remaining
        else:
            unresolved.pop(cs, None)

    for sf in all_scheduled:
        if sf.movement != "arr":
            continue
        cs = sf.flight.callsign
        delta = sf.adjusted_minutes - landing_before_merge.get(cs, sf.adjusted_minutes)
        extra_delay_of[cs] = float(max(0, delta))
        if extra_delay_of[cs] > 0:
            _apply_resolution(cs)

    # The single-point PQ404-crossing gap enforced above (and its resolution
    # just applied) only guarantees separation AT that one shared fix -- two
    # arrivals from DIFFERENT STAR transitions can still pass close to each
    # other EARLIER, near GUKNU/LASOV itself, purely from route geometry
    # (their inbound tracks converge on that fix from different bearings)
    # even when their PQ404-crossing times are properly gapped. Confirmed
    # live for a real published schedule (9G1207/OSOTA vs 9G1961/TUNPO, both
    # via GUKNU): 14 minutes of PQ404-crossing gap, yet a genuine <1NM/111ft
    # encounter near GUKNU because nothing had checked separation THERE.
    # Runs an actual point-sampled closest-point-of-approach check across
    # every arrival pair's real flown profile (not just one reference
    # instant) and, for any pair still too close, adds more of the same
    # real speed-reduction/hold-loop resolution to whichever one would
    # otherwise be spawned later -- iterating since fixing one pair can
    # still leave (or newly create, if a hold loop shifts a lot of track)
    # another below minimum.
    def _interp_pos(route, cum, t_min):
        if t_min <= cum[0]:
            wp = route[0]
            return wp.lat, wp.lon, (wp.alt_ft or 0.0)
        if t_min >= cum[-1]:
            wp = route[-1]
            return wp.lat, wp.lon, (wp.alt_ft or 0.0)
        for i in range(len(cum) - 1):
            if cum[i] <= t_min <= cum[i + 1]:
                frac = (t_min - cum[i]) / (cum[i + 1] - cum[i]) if cum[i + 1] > cum[i] else 0.0
                wp1, wp2 = route[i], route[i + 1]
                lat = wp1.lat + (wp2.lat - wp1.lat) * frac
                lon = wp1.lon + (wp2.lon - wp1.lon) * frac
                a1 = wp1.alt_ft if wp1.alt_ft is not None else (wp2.alt_ft or 0.0)
                a2 = wp2.alt_ft if wp2.alt_ft is not None else a1
                return lat, lon, a1 + (a2 - a1) * frac
        wp = route[-1]
        return wp.lat, wp.lon, (wp.alt_ft or 0.0)

    def _cpa(cs_a: str, cs_b: str, spawn_of: dict[str, float]) -> tuple[float, float] | None:
        route_a, cum_a, spawn_a = routes[cs_a], leg_times_of[cs_a], spawn_of[cs_a]
        route_b, cum_b, spawn_b = routes[cs_b], leg_times_of[cs_b], spawn_of[cs_b]
        t_lo = max(spawn_a, spawn_b)
        t_hi = min(spawn_a + cum_a[-1], spawn_b + cum_b[-1])
        if t_hi <= t_lo:
            return None
        best = None
        t = t_lo
        step = 0.5
        while t <= t_hi:
            la, lo, alt_a = _interp_pos(route_a, cum_a, t - spawn_a)
            lb, lob, alt_b = _interp_pos(route_b, cum_b, t - spawn_b)
            d = _haversine_nm(la, lo, lb, lob)
            v = abs(alt_a - alt_b)
            if best is None or d < best[0]:
                best = (d, v)
            t += step
        return best

    def _spawn_estimate(cs: str) -> float:
        sf = next(sf for sf in all_scheduled if sf.flight.callsign == cs)
        return max(0.0, sf.adjusted_minutes - leg_times_of[cs][-1])

    HORIZ_MIN_NM, VERT_MIN_FT = 5.0, 900.0
    arr_callsigns = list(leg_times_of.keys())
    landing_of = {sf.flight.callsign: sf.adjusted_minutes for sf in all_scheduled if sf.movement == "arr"}
    for _round in range(8):
        spawn_now = {cs: _spawn_estimate(cs) for cs in arr_callsigns}
        worst = None
        for i in range(len(arr_callsigns)):
            for j in range(i + 1, len(arr_callsigns)):
                cs_a, cs_b = arr_callsigns[i], arr_callsigns[j]
                cpa = _cpa(cs_a, cs_b, spawn_now)
                if cpa is None:
                    continue
                d, v = cpa
                if d < HORIZ_MIN_NM and v < VERT_MIN_FT:
                    if worst is None or d < worst[0]:
                        worst = (d, v, cs_a, cs_b)
        if worst is None:
            break
        _, _, cs_a, cs_b = worst
        # Always delay whichever of the pair LANDS later, never by spawn
        # time -- a short-transit arrival's spawn clamps to 0 same as a
        # long-transit one scheduled to land early, so spawn order doesn't
        # reflect which flight actually has schedule room to absorb more
        # delay. Confirmed live this bug piled 4 extra GUKNU hold laps onto
        # the very FIRST landing of the whole window (adjusted_minutes=0)
        # instead of the flight actually causing the conflict, ballooning
        # its transit to 43 minutes while its DEL was still fixed at t=0.
        target = cs_a if landing_of[cs_a] >= landing_of[cs_b] else cs_b
        # Landing time itself has to move later, not just the route: a
        # pre-merge hold/speed-reduction alone leaves the shared IAP final
        # segment's absolute timing UNCHANGED as long as landing time is
        # fixed (by construction -- everything after the hold is pinned to
        # match the same touchdown instant), so it can't fix a conflict
        # that's actually on that shared final segment (confirmed live: the
        # captured close pass was at ~2500ft, PQ404's altitude, not GUKNU's
        # 5000ft -- squarely on the final segment, not the pre-merge leg).
        # Pushing landing_of (and re-deriving spawn from leg_times_of, same
        # as the resolver already does) actually separates it.
        for sf in all_scheduled:
            if sf.flight.callsign == target:
                sf.adjusted_minutes += 3
                sf.delay_minutes = sf.adjusted_minutes - sf.scheduled_minutes
                break
        extra_delay_of[target] = extra_delay_of.get(target, 0.0) + 3.0
        _apply_resolution(target)
        # Bumping one flight's landing time can shrink ITS gap to whichever
        # arrival is scheduled right after it below the plain minimum --
        # same re-apply reasoning as every other pass in this module.
        _enforce_arrival_separation(all_scheduled, min_arr_arr_gap_min)
        for sf in all_scheduled:
            if sf.movement == "arr":
                landing_of[sf.flight.callsign] = sf.adjusted_minutes

    dep_release_s = _compute_dep_release_seconds(all_scheduled, config.dep_after_arr_gap_sec)

    spawn_by_callsign: dict[str, int] = {}
    for sf in all_scheduled:
        if sf.movement != "arr":
            continue
        cs = sf.flight.callsign
        transit = max(1, round(leg_times_of[cs][-1]))
        # transit here already reflects any speed-reduction/hold-loop just
        # resolved above, so subtracting it from the (already pushed)
        # adjusted_minutes lands spawn at this flight's natural, undelayed
        # instant -- the resolution is flown, not waited-for. A published
        # arrival early in the day (e.g. an ADBOP arrival at 00:2x local,
        # ~30min real transit) can still need a spawn instant before the
        # scenario's own 00:00:00 origin -- clamped to 0 same as
        # build_multi_hour_scenario's hour-0 case.
        spawn_by_callsign[cs] = max(0, sf.adjusted_minutes - transit)

    if unresolved:
        import warnings
        warnings.warn(
            f"build_real_schedule_scenario: {len(unresolved)} arrival(s) still short on separation after "
            f"real speed-reduction + real-hold resolution (no real hand-off fix found for their transition): {unresolved}"
        )

    return [
        CapacityFlight(
            scheduled=sf, route=routes[sf.flight.callsign], transition=transitions[sf.flight.callsign],
            spawn_minutes=spawn_by_callsign.get(sf.flight.callsign, sf.adjusted_minutes),
            takeoff_seconds=dep_release_s.get(sf.flight.callsign),
        )
        for sf in all_scheduled
    ]


# ---------------------------------------------------------------------------
# .scn emission
# ---------------------------------------------------------------------------


def _asas_header(asas_on: bool) -> list[str]:
    if asas_on:
        return [
            "00:00:00.00>ASAS ON",
            "00:00:00.00>RESO MVP",
            "00:00:00.00>RPZ 3",
            "00:00:00.00>DHPZ 1000",
            "00:00:00.00>RESOAUTO ON",
            "",
        ]
    # Pure procedure-following test by default: aircraft fly exactly the
    # published SID/STAR/IAP route with no automatic conflict-avoidance
    # vectoring (confirmed live that RESOAUTO ON eventually hung the sim
    # clock during a multi-hour soak test).
    return ["00:00:00.00>ASAS OFF", ""]


def _emit_dep(procs: AirportProcedures, vf: CapacityFlight) -> list[str]:
    f = vf.scheduled.flight
    perf = AIRCRAFT_PERF.get(f.aircraft_type, AIRCRAFT_PERF["A321"])
    cs = f.callsign
    t_release = vf.takeoff_seconds if vf.takeoff_seconds is not None else vf.scheduled.adjusted_minutes * 60
    dep_runway = procs.runway_for_dep(vf.transition)
    initial_course = procs.dep_initial_course_for(vf.transition)
    rwy_hdg = initial_course if initial_course is not None else int(dep_runway[:2]) * 10
    t_roll = t_release + _ROLL_ACCEL_DELAY_S
    t_climb = t_release + _ROLL_LIFTOFF_DELAY_S
    thr = procs.threshold_for_dep(vf.transition)

    lines = [f"# --- {cs} DEP {procs.icao} RWY{dep_runway} (SID {vf.transition}) ({f.aircraft_type}) ---"]
    lines.append(f"{_fmt(t_release)}>CRE {cs},{f.aircraft_type},{thr.lat:.6f},{thr.lon:.6f},{rwy_hdg},0,0")
    lines.append(f"{_fmt(t_roll)}>{cs} HDG {rwy_hdg}")
    lines.append(f"{_fmt(t_roll)}>{cs} SPD {perf['v2']}")

    # Real published SID data sometimes leaves the very first fix(es) with no
    # altitude constraint at all (e.g. VVPQ's shared initial fix PQ600 -- the
    # AIP's own "INITIAL CLIMB" leg only publishes a straight-ahead minimum
    # before the turn, then nothing until the SID's first real crossing
    # restriction, which can be 9-11NM further out). Baking that borrowed
    # altitude into the first ADDWPT line alone isn't enough -- confirmed
    # live the climb stayed a shallow ~500fpm crawl (still under 1000ft past
    # 5NM) regardless of which waypoint carried it. What actually drives a
    # real climb rate is a standalone "ALT" clearance issued AFTER "VNAV ON"
    # -- this is the exact pattern VVNB already uses for its post-SID
    # dep_final_alt_cap ("ALT FL200" right after VNAV ON), confirmed live to
    # produce a normal ~1500fpm climb. VVPQ has no dep_final_alt_cap, so give
    # it the equivalent: the same real altitude the route already publishes
    # a bit further out, applied as an immediate post-VNAV climb clearance
    # instead of withheld until physically overhead that later fix -- same
    # real number, just surfaced as the initial ATC clearance a departure
    # would actually be given.
    first_alt = next((wp_.alt_ft for wp_ in vf.route if wp_.alt_ft is not None), None)
    early_climb_alt = first_alt if (vf.route and vf.route[0].alt_ft is None) else None

    for wp_ in vf.route:
        lines.append(_addwpt_line_dep(t_climb, cs, wp_, perf["v2"], f.aircraft_type))
    lines.append(f"{_fmt(t_climb)}>{cs} LNAV ON")
    lines.append(f"{_fmt(t_climb)}>{cs} VNAV ON")
    if procs.dep_final_alt_cap is not None:
        lines.append(f"{_fmt(t_climb)}>{cs} ALT {procs.dep_final_alt_cap}")
    elif early_climb_alt is not None:
        lines.append(f"{_fmt(t_climb)}>{cs} ALT {early_climb_alt:.0f}")
        lines.append(f"{_fmt(t_climb)}>{cs} SPD {_bada_climb_speed_kt(early_climb_alt, perf['v2'], f.aircraft_type)}")
    lines.append(f"{_fmt(t_climb + 3600)}>DEL {cs}")
    lines.append("")
    return lines


def _emit_arr(procs: AirportProcedures, vf: CapacityFlight) -> list[str]:
    f = vf.scheduled.flight
    perf = AIRCRAFT_PERF.get(f.aircraft_type, AIRCRAFT_PERF["A321"])
    cs = f.callsign
    landing_min = vf.scheduled.adjusted_minutes
    t0 = vf.spawn_minutes * 60

    first = vf.route[0]
    second = vf.route[1] if len(vf.route) > 1 else vf.route[0]
    hdg = round(_bearing(first.lat, first.lon, second.lat, second.lon))
    spawn_alt = f"FL{round((first.alt_ft or 20000) / 100):03d}"
    entry_spd = min(250, perf["vapp"] + 60)

    lines = [f"# --- {cs} ARR {procs.icao} RWY{procs.runway_for_arr(vf.transition)} (STAR {vf.transition}) ({f.aircraft_type}) ---"]
    lines.append(f"{_fmt(t0)}>CRE {cs},{f.aircraft_type},{first.lat:.6f},{first.lon:.6f},{hdg},{spawn_alt},{entry_spd}")
    # The shared IAP final segment (identical regardless of which STAR fed
    # into it) never publishes a numeric speed on its own approach chart --
    # unlike STAR speed restrictions, which commonly ARE charted. That's why
    # arrival_speed_published is True for VVPQ/VVNB (their STAR data really
    # does publish speeds) yet those IAP fixes still show spd_kt=None: it's
    # the chart genuinely having nothing there, not "fly whatever speed you
    # were last cleared to all the way to touchdown". Confirmed live (3
    # arrivals from 3 different STARs merging nose-to-tail on final) that
    # honoring arrival_speed_published there literally held ~200-204kt
    # unchanged from the STAR down to ~800ft, well past where a real
    # approach has usually decelerated toward vapp -- so this last stretch
    # always gets the real BADA-style descent schedule, regardless of the
    # airport-wide flag (which still governs the STAR portion above it).
    final_segment_start = max(1, len(vf.route) - procs.iap_segment_len_for(vf.transition))
    for i, wp_ in enumerate(vf.route[1:], start=1):
        speed_published = procs.arrival_speed_published and i < final_segment_start
        lines.append(_addwpt_line_arr(t0, cs, wp_, perf["vapp"], speed_published))
    lines.append(f"{_fmt(t0)}>{cs} SPD {entry_spd}")
    lines.append(f"{_fmt(t0)}>{cs} LNAV ON")
    lines.append(f"{_fmt(t0)}>{cs} VNAV ON")
    t_land = landing_min * 60
    lines.append(f"{_fmt(t_land)}>{cs} SPD {perf['vapp']}")
    # 8, not 5, minutes of margin after the *scheduled* landing minute --
    # confirmed live that a long STAR (VVPQ's ~115NM ADBOP) can still run
    # a few minutes behind its own schedule at touchdown even with a
    # realistic leg-by-leg transit estimate (_route_leg_times_min); a
    # 5-minute buffer once left only ~7 seconds before this DEL would have
    # removed the aircraft mid-final.
    lines.append(f"{_fmt(t_land + 8 * 60)}>DEL {cs}")
    lines.append("")
    return lines


def emit_scn_body(procs: AirportProcedures, config: CapacityScenarioConfig, flights: list[CapacityFlight]) -> str:
    entries: list[tuple[int, list[str]]] = []
    for vf in flights:
        if vf.scheduled.movement == "dep":
            lines = _emit_dep(procs, vf)
            spawn = (vf.takeoff_seconds if vf.takeoff_seconds is not None else vf.scheduled.adjusted_minutes * 60) // 60
        else:
            lines = _emit_arr(procs, vf)
            spawn = vf.spawn_minutes
        entries.append((spawn, lines))

    entries.sort(key=lambda e: e[0])
    body_lines: list[str] = list(_asas_header(config.asas_on))
    for _, lines in entries:
        body_lines.extend(lines)
    return "\n".join(body_lines)


def _align_first_spawn_to_zero(flights: list[CapacityFlight]) -> list[CapacityFlight]:
    """Shift every flight's schedule by a constant number of minutes so the
    EARLIEST event (an arrival's spawn, or a departure's takeoff release)
    lands at t=0 instead of wherever the generic hourly scheduler placed it.

    The scheduler's "spread N arrivals evenly across the hour" placement
    (base_minute = round((n-0.5)*60/arr_per_hour) in build_hourly_scenario)
    is exactly right for a real capacity test, but for a single-aircraft
    "simple scenario" (arr_per_hour=1) it always lands that one arrival near
    minute 30 -- confirmed live: the aircraft doesn't even spawn (CRE) until
    ~17 simulated minutes after IC, so a user who just loads the scenario
    and looks at t=0 sees nothing and reasonably assumes it's broken.

    A constant shift preserves every flight's relative spacing exactly (and
    therefore every separation rule build_hourly_scenario already enforced
    between them), so this is safe to apply even to a multi-flight schedule
    -- it just moves the whole timeline earlier, it doesn't reorder or
    re-space anything."""
    if not flights:
        return flights
    earliest_min = min(
        cf.spawn_minutes if cf.scheduled.movement == "arr"
        else (cf.takeoff_seconds // 60 if cf.takeoff_seconds is not None else cf.scheduled.adjusted_minutes)
        for cf in flights
    )
    if earliest_min <= 0:
        return flights
    for cf in flights:
        cf.scheduled.adjusted_minutes -= earliest_min
        if cf.scheduled.movement == "arr":
            cf.spawn_minutes -= earliest_min
        elif cf.takeoff_seconds is not None:
            cf.takeoff_seconds -= earliest_min * 60
    return flights


def build_and_emit(icao: str, raw_config: dict | None = None) -> str:
    """Single public entry point for the rest of the app (scn_generator.py's
    dispatcher): look up the airport's procedures, fill in a config (with
    per-airport defaults for anything not overridden), build the flight list,
    and emit the .scn body. raw_config["alignFirstSpawnToZero"]=True (used
    by the single-aircraft "simple scenario" builder) shifts the whole
    schedule so the first event happens at t=0 -- see
    _align_first_spawn_to_zero. Off by default so every existing capacity
    scenario (VVNB/VVGB/VVPQ) keeps its real within-the-hour timing."""
    procs = get_procedures(icao)
    config = CapacityScenarioConfig.from_dict(procs, raw_config)
    flights = build_multi_hour_scenario(procs, config)
    if (raw_config or {}).get("alignFirstSpawnToZero"):
        flights = _align_first_spawn_to_zero(flights)
    return emit_scn_body(procs, config, flights)
