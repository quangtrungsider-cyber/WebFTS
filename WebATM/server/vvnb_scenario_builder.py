"""
Thin backward-compatible wrapper around capacity_scenario_engine.py for
VVNB -- the real logic (SID/STAR routing, BADA speed schedules, staggered
takeoff roll, 3-minute arrival / 30-second dep-after-arr separation rules,
.scn emission) now lives there, shared with vvgb_gb07_scenario_builder.py.
This module exists so vvnb_vvgb_combined_scenario_builder.py and any other
existing caller keeps working unchanged.

    vvnb_procedures -> capacity_scenario_engine -> vvnb_scenario_builder
"""

from __future__ import annotations

from WebATM.server.capacity_scenario_engine import (
    CapacityFlight as VVNBFlight,
    CapacityScenarioConfig,
    build_hourly_scenario,
    build_multi_hour_scenario,
    get_procedures,
)
from WebATM.server.capacity_scenario_engine import _emit_arr as _engine_emit_arr
from WebATM.server.capacity_scenario_engine import _emit_dep as _engine_emit_dep
from WebATM.server.capacity_scenario_engine import emit_scn_body as _engine_emit_scn_body

_PROCS = get_procedures("VVNB")
DEP_PER_HOUR = sum(_PROCS.default_sid_mix.values())
ARR_PER_HOUR = sum(_PROCS.default_star_mix.values())
MOVEMENTS_PER_HOUR = DEP_PER_HOUR + ARR_PER_HOUR
DEP_RUNWAY = _PROCS.dep_runway
ARR_RUNWAY = _PROCS.arr_runway
_RNG_SEED = 20260727

# Matches the engine's ASAS-off header exactly (asas_on=False) -- these
# legacy entry points always ran with ASAS OFF (pure procedure-following).
_ASAS_HEADER = [
    "00:00:00.00>ASAS OFF",
    "",
]


def _default_config(seed: int, hours: int = 1) -> CapacityScenarioConfig:
    return CapacityScenarioConfig(
        sid_mix=dict(_PROCS.default_sid_mix),
        star_mix=dict(_PROCS.default_star_mix),
        hours=hours,
        seed=seed,
        asas_on=False,
    )


def build_vvnb_hourly_scenario(seed: int = _RNG_SEED) -> list[VVNBFlight]:
    return build_hourly_scenario(_PROCS, _default_config(seed), seed=seed)


def build_vvnb_multi_hour_scenario(hours: int = 10, seed: int = _RNG_SEED) -> list[VVNBFlight]:
    return build_multi_hour_scenario(_PROCS, _default_config(seed, hours=hours))


def _emit_dep(vf: VVNBFlight) -> list[str]:
    return _engine_emit_dep(_PROCS, vf)


def _emit_arr(vf: VVNBFlight) -> list[str]:
    return _engine_emit_arr(_PROCS, vf)


def emit_scn_body(flights: list[VVNBFlight]) -> str:
    return _engine_emit_scn_body(_PROCS, _default_config(_RNG_SEED), flights)
