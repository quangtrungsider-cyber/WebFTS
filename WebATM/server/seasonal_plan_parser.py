"""
Seasonal flight-plan (FPL) parser.

Reads a real seasonal flight schedule Excel export (e.g.
"LICH BAY MUA HE 2026 ld1.xlsx") and normalizes every row into a
FlightRecord: cleaned ETD, decoded weekday-operating pattern, tokenized
ATS route (airway names), and a normalized aircraft type code.

This is the first stage of the "FPL -> .scn" pipeline:
    seasonal_plan_parser -> route_resolver -> separation_rules -> flightplan_scenario_builder
"""

from __future__ import annotations

import datetime
import logging
from dataclasses import dataclass, field

logger = logging.getLogger("webatm")

# ---------------------------------------------------------------------------
# Aircraft type normalization
#
# The source export mixes real ICAO type designators with slot-coordination
# shorthand and data-entry artifacts (an integer 737 instead of "B737", the
# freighter/variant code "73H", etc). This table only touches entries we can
# justify; everything else passes through unchanged and any code not in
# KNOWN_TYPES is reported back in ParseResult.unmapped_types so it can be
# extended later against real data instead of guessed here.
# ---------------------------------------------------------------------------
TYPE_NORMALIZE = {
    "737": "B737",
    "73H": "B737",
    "74Y": "B744",
    "B74Y": "B744",
}

KNOWN_TYPES = {
    "A320", "A321", "A20N", "A21N", "A32N", "A359", "A333", "A339",
    "B738", "B737", "B739", "B744", "B777", "B772", "B773", "B77W", "B77X", "77X",
    "B787", "B788", "B789", "B747", "B734", "B763", "B764", "B767",
    "AT72", "AT76", "ATR",
}


@dataclass
class FlightRecord:
    no: int
    permission: str
    aircraft_type: str
    aircraft_type_raw: str
    callsign: str
    dep: str
    arr: str
    etd_minutes: int  # minutes since midnight, local schedule time
    airways: list[str]
    operating_days: set[int]  # ISO weekday numbers, 1=Mon .. 7=Sun
    valid_from: datetime.date | None
    valid_to: datetime.date | None

    @property
    def is_vietnam_flight(self) -> bool:
        return self.dep.upper().startswith("VV") or self.arr.upper().startswith("VV")


@dataclass
class ParseResult:
    flights: list[FlightRecord] = field(default_factory=list)
    total_rows: int = 0
    skipped_rows: int = 0
    unmapped_types: set[str] = field(default_factory=set)


def _clean_etd(raw) -> int | None:
    """Parse ETD into minutes-since-midnight. Handles the various shapes
    openpyxl can hand back for a "time-like" cell in this export: a string
    with a leading non-breaking space ("\xa00910"), a bare int/float (910),
    or an actual datetime.time/datetime.datetime object."""
    if raw is None:
        return None
    if isinstance(raw, datetime.datetime):
        return raw.hour * 60 + raw.minute
    if isinstance(raw, datetime.time):
        return raw.hour * 60 + raw.minute
    if isinstance(raw, (int, float)):
        digits = f"{int(raw):04d}"
    else:
        digits = str(raw).replace("\xa0", "").strip()
    digits = "".join(c for c in digits if c.isdigit())
    if not digits:
        return None
    digits = digits.zfill(4)[-4:]
    hh, mm = int(digits[:2]), int(digits[2:])
    if hh > 23 or mm > 59:
        return None
    return hh * 60 + mm


def _normalize_type(raw) -> tuple[str, str]:
    """Returns (normalized_type, raw_type_as_string)."""
    raw_s = str(raw).strip().upper() if raw is not None else ""
    return TYPE_NORMALIZE.get(raw_s, raw_s), raw_s


def _parse_operating_days(day_cells: tuple) -> set[int]:
    """Column N holds N itself (not 1) when the flight operates that ISO
    weekday, 0 otherwise -- confirmed against real rows: a daily flight
    sums to 1+2+...+7 = 28 across the 7 columns."""
    days = set()
    for col_idx, value in enumerate(day_cells, start=1):
        if isinstance(value, (int, float)) and value:
            days.add(col_idx)
    return days


def _parse_route(raw) -> list[str]:
    if not raw:
        return []
    return [seg.strip().upper() for seg in str(raw).split("/") if seg.strip()]


def parse_seasonal_plan(xlsx_path: str, *, vietnam_only: bool = True) -> ParseResult:
    """Parse a seasonal flight-plan Excel export into normalized FlightRecords.

    Expected layout (matches "LICH BAY MUA HE 2026 ld1.xlsx"):
        row 1: title, row 2: header, row 3+: data
        columns: No, PERMISSION, CRAFT, CALLSIGN, FROM, TO, ETD, ROUTE,
                 1, 2, 3, 4, 5, 6, 7, B.DATE, E.DATE
    """
    try:
        import openpyxl
    except ImportError as e:
        raise ImportError("openpyxl is required to parse Excel files. Please install openpyxl.") from e

    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = ws.iter_rows(values_only=True)
    next(rows)  # title row
    next(rows)  # header row

    result = ParseResult()
    for row in rows:
        result.total_rows += 1
        if row is None or row[3] is None:
            result.skipped_rows += 1
            continue

        no, permission, craft, callsign, dep, arr, etd, route = row[0:8]
        day_cells = row[8:15]
        b_date, e_date = row[15], row[16]

        etd_minutes = _clean_etd(etd)
        if etd_minutes is None or not dep or not arr:
            result.skipped_rows += 1
            continue

        atype, atype_raw = _normalize_type(craft)
        if atype and atype not in KNOWN_TYPES:
            result.unmapped_types.add(atype)

        rec = FlightRecord(
            no=no,
            permission=str(permission or ""),
            aircraft_type=atype,
            aircraft_type_raw=atype_raw,
            callsign=str(callsign).strip().upper(),
            dep=str(dep).strip().upper(),
            arr=str(arr).strip().upper(),
            etd_minutes=etd_minutes,
            airways=_parse_route(route),
            operating_days=_parse_operating_days(day_cells),
            valid_from=b_date.date() if isinstance(b_date, datetime.datetime) else None,
            valid_to=e_date.date() if isinstance(e_date, datetime.datetime) else None,
        )

        if vietnam_only and not rec.is_vietnam_flight:
            result.skipped_rows += 1
            continue

        result.flights.append(rec)

    logger.info(
        f"[SeasonalPlanParser] {xlsx_path}: {result.total_rows} rows -> "
        f"{len(result.flights)} kept, {result.skipped_rows} skipped, "
        f"{len(result.unmapped_types)} unmapped aircraft types: {sorted(result.unmapped_types)}"
    )
    return result
