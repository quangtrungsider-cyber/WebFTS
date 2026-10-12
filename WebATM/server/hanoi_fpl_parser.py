"""
Hanoi-area flight-plan CSV parser (VVNB + VVGB, "Hanoi East SOIR" study data).

Reads Hanoi_FlightPlan_Jan14_2026.csv: a clean, semicolon-delimited export
where every row already touches VVNB or VVGB and the `Waypoints` column
gives the real enroute fix chain directly -- no airway lookup needed (see
route_resolver.py, which resolves named *airways* for the seasonal-Excel
pipeline; this CSV skips that step entirely). `SID`/`STAR` columns are
present but unfilled ("? ?") -- hanoi_scenario_builder.py assigns them via
route_resolver.resolve_departure_procedure/resolve_arrival_procedure.

    hanoi_fpl_parser -> hanoi_scenario_builder
"""

from __future__ import annotations

import csv
import logging
from dataclasses import dataclass, field

logger = logging.getLogger("webatm")

HANOI_AIRPORTS = {"VVNB", "VVGB"}


@dataclass
class FlightRecord:
    flight_no: str
    callsign: str
    aircraft_type: str
    orig: str
    dest: str
    etd_minutes: int  # minutes since the earliest ETD day in the file
    eta_minutes: int
    waypoints: list[str] = field(default_factory=list)

    @property
    def touches_hanoi(self) -> bool:
        return self.orig in HANOI_AIRPORTS or self.dest in HANOI_AIRPORTS


@dataclass
class ParseResult:
    flights: list[FlightRecord] = field(default_factory=list)
    total_rows: int = 0
    skipped_rows: int = 0


def _parse_day_time(raw: str, base_day: int) -> int:
    """"DD,HH:MM" -> minutes since the start of `base_day` (handles the
    schedule crossing midnight into the next day)."""
    day_str, time_str = raw.split(",")
    hh, mm = time_str.split(":")
    day_offset = int(day_str) - base_day
    return day_offset * 1440 + int(hh) * 60 + int(mm)


def parse_hanoi_fpl(csv_path: str) -> ParseResult:
    """Parse the Hanoi FPL CSV. Every row in this export already touches
    VVNB or VVGB, but flights are still filtered defensively in case a
    future export includes unrelated traffic."""
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f, delimiter=";"))

    base_day = min(int(r["ETD"].split(",")[0]) for r in rows if r.get("ETD"))

    result = ParseResult(total_rows=len(rows))
    for row in rows:
        try:
            rec = FlightRecord(
                flight_no=row["Flight_No"].strip(),
                callsign=row["Callsign"].strip(),
                aircraft_type=row["Type"].strip().upper(),
                orig=row["Orig"].strip().upper(),
                dest=row["Dest"].strip().upper(),
                etd_minutes=_parse_day_time(row["ETD"], base_day),
                eta_minutes=_parse_day_time(row["ETA"], base_day),
                waypoints=[w for w in row["Waypoints"].strip().split() if w],
            )
        except (KeyError, ValueError) as e:
            logger.warning(f"[HanoiFplParser] skipping malformed row: {row} ({e})")
            result.skipped_rows += 1
            continue

        if not rec.touches_hanoi:
            result.skipped_rows += 1
            continue

        result.flights.append(rec)

    # Normalize so the scenario timeline starts at t=0 -- the file's day "01"
    # rows are only the last ~40 minutes before midnight (a handful of late
    # departures spilling over from the prior day), so the raw ETD/ETA
    # minutes would otherwise leave the .scn idle for the first ~23 hours.
    if result.flights:
        shift = min(f.etd_minutes for f in result.flights)
        for f in result.flights:
            f.etd_minutes -= shift
            f.eta_minutes -= shift

    logger.info(
        f"[HanoiFplParser] {csv_path}: {result.total_rows} rows -> "
        f"{len(result.flights)} kept, {result.skipped_rows} skipped"
    )
    return result
