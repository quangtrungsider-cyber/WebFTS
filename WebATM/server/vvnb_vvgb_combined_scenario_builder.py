"""
Combines the VVNB (vvnb_scenario_builder) and VVGB RWY07 (vvgb_gb07_
scenario_builder) 10-hour capacity-test scenarios into one .scn, for
testing both airports' real published procedures operating side by side
once VVGB comes online. Both builders already produce non-colliding
callsigns (NBD*/NBA* vs GBD*/GBA*, further prefixed per hour as H0..H9) and
their own independent separation/scheduling -- this module only merges
their emitted stack-command lines under one shared header (ASAS OFF --
pure procedure-following, no auto-avoidance vectoring), sorted once by
spawn time so the file reads chronologically.

    vvnb_scenario_builder + vvgb_gb07_scenario_builder -> vvnb_vvgb_combined_scenario_builder
"""

from __future__ import annotations

from WebATM.server.vvgb_gb07_scenario_builder import (
    _ASAS_HEADER,
    _emit_arr as _gb07_emit_arr,
    _emit_dep as _gb07_emit_dep,
    build_gb07_multi_hour_scenario,
)
from WebATM.server.vvnb_scenario_builder import (
    _emit_arr as _vvnb_emit_arr,
    _emit_dep as _vvnb_emit_dep,
    build_vvnb_multi_hour_scenario,
)


def build_combined_scn(hours: int = 10) -> str:
    entries: list[tuple[int, list[str]]] = []

    for vf in build_vvnb_multi_hour_scenario(hours=hours):
        if vf.scheduled.movement == "dep":
            lines = _vvnb_emit_dep(vf)
            spawn = (vf.takeoff_seconds if vf.takeoff_seconds is not None else vf.scheduled.adjusted_minutes * 60) // 60
        else:
            lines = _vvnb_emit_arr(vf)
            spawn = vf.spawn_minutes
        entries.append((spawn, lines))

    for gf in build_gb07_multi_hour_scenario(hours=hours):
        if gf.scheduled.movement == "dep":
            lines = _gb07_emit_dep(gf)
            spawn = (gf.takeoff_seconds if gf.takeoff_seconds is not None else gf.scheduled.adjusted_minutes * 60) // 60
        else:
            lines = _gb07_emit_arr(gf)
            spawn = gf.spawn_minutes
        entries.append((spawn, lines))

    entries.sort(key=lambda e: e[0])
    body_lines: list[str] = list(_ASAS_HEADER)
    for _, lines in entries:
        body_lines.extend(lines)
    return "\n".join(body_lines)
