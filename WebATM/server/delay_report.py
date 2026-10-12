"""
Hourly aircraft-delay report for a DayScenario, in the spirit of TAAM's
"Master Metrics" spreadsheet export (Airport Movements / Arrival Delay /
Departure Delay tables side by side, one row per hour of day).

This is a PRE-SIMULATION report: "Sequencing Delay" is the schedule push
already computed by separation_rules.apply_rules() (scheduled_minutes vs
adjusted_minutes), not a measurement from a completed BlueSky run -- the
app has no ground/gate simulation, so "Taxi Delay" is a static per-movement
reference figure, not a modeled value.

    flightplan_scenario_builder.DayScenario -> delay_report
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field

from openpyxl import Workbook
from openpyxl.styles import Font

from WebATM.server.flightplan_scenario_builder import DayScenario

# Reference taxi time (minutes), not a simulated/measured delay. Departure
# default is VVNB's real ATXOT/P20 taxi-out average (~15 min, see project
# memory); there's no equivalent taxi-in reference yet, so the arrival
# default is a rough placeholder.
_DEFAULT_DEP_TAXI_MIN = 15.0
_DEFAULT_ARR_TAXI_MIN = 5.0


@dataclass
class HourlyRow:
    hour: int  # 0..23, local hour of day (adjusted_minutes // 60 % 24)
    arrivals: int = 0
    departures: int = 0
    arr_delay_minutes: list[float] = field(default_factory=list)
    dep_delay_minutes: list[float] = field(default_factory=list)
    dep_taxi_delay_minutes: list[float] = field(default_factory=list)

    @property
    def total_movements(self) -> int:
        return self.arrivals + self.departures

    @property
    def arr_avg_sequencing_min(self) -> float:
        return _avg(self.arr_delay_minutes)

    @property
    def dep_avg_sequencing_min(self) -> float:
        return _avg(self.dep_delay_minutes)

    @property
    def dep_avg_taxi_min(self) -> float:
        """Real ground-queue (S1 trunk) congestion delay, computed by
        taxi_sim.simulate_ground_queue -- populated only when the flight
        had a real gate/taxi_route assigned (VVNB departures today)."""
        return _avg(self.dep_taxi_delay_minutes)


@dataclass
class DelayReport:
    airport: str
    date: datetime.date
    rows: list[HourlyRow]
    dep_taxi_min: float
    arr_taxi_min: float
    has_taxi_sim: bool = False


def _avg(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def build_delay_report(
    scenario: DayScenario,
    *,
    dep_taxi_min: float = _DEFAULT_DEP_TAXI_MIN,
    arr_taxi_min: float = _DEFAULT_ARR_TAXI_MIN,
) -> DelayReport:
    """Bucket every flight in `scenario` by the hour of its adjusted (post
    separation-rule) time, one HourlyRow per hour that has at least one
    movement. `delay_minutes` on each ScheduledFlight (already computed by
    separation_rules.apply_rules) becomes that hour's average sequencing
    delay. Departure taxi delay uses the real per-flight
    taxi_delay_minutes from taxi_sim.simulate_ground_queue when a flight
    has a gate assigned (VVNB today); otherwise it falls back to the
    static `dep_taxi_min`/`arr_taxi_min` reference figures."""
    rows_by_hour: dict[int, HourlyRow] = {}
    has_taxi_sim = False

    def row(hour: int) -> HourlyRow:
        return rows_by_hour.setdefault(hour, HourlyRow(hour=hour))

    for rf in scenario.flights:
        sf = rf.scheduled
        hour = (sf.adjusted_minutes // 60) % 24
        r = row(hour)
        if sf.movement == "dep":
            r.departures += 1
            r.dep_delay_minutes.append(float(sf.delay_minutes))
            if sf.gate:
                has_taxi_sim = True
                r.dep_taxi_delay_minutes.append(sf.taxi_delay_minutes)
        else:
            r.arrivals += 1
            r.arr_delay_minutes.append(float(sf.delay_minutes))

    rows = [rows_by_hour[h] for h in sorted(rows_by_hour)]
    return DelayReport(
        airport=scenario.airport, date=scenario.date, rows=rows,
        dep_taxi_min=dep_taxi_min, arr_taxi_min=arr_taxi_min,
        has_taxi_sim=has_taxi_sim,
    )


def _hour_label(hour: int) -> str:
    return f"{hour:02d}:00-{(hour + 1) % 24:02d}:00"


def _fmt_min(total_seconds_minutes: float) -> str:
    """Render a minutes value as H:MM:SS, matching the KL Master Metrics
    sample report's time-of-day-style delay columns."""
    total_seconds = round(total_seconds_minutes * 60)
    h, rem = divmod(total_seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}"


def write_delay_report_xlsx(report: DelayReport, output_path: str) -> None:
    """Write one sheet with 3 tables side by side -- Airport Movements,
    Arrival Delay, Departure Delay -- one row per hour, mirroring the
    layout of the TAAM/AirTOP "Master Metrics" spreadsheet export."""
    wb = Workbook()
    ws = wb.active
    ws.title = f"{report.airport} {report.date.isoformat()}"
    bold = Font(bold=True)

    ws.cell(row=1, column=1, value="Airport Movements").font = bold
    ws.cell(row=1, column=6, value="Arrival Delay").font = bold
    ws.cell(row=1, column=11, value="Departure Delay").font = bold

    movements_headers = ["Hour", "Arrivals", "Departures", "Total Movements"]
    arr_headers = ["Hour", "Arrivals", "Average Taxi Delay", "Average Sequencing Delay"]
    dep_headers = ["Hour", "Departures", "Average Taxi Delay", "Average Sequencing Delay"]

    for col, h in enumerate(movements_headers, start=1):
        ws.cell(row=2, column=col, value=h).font = bold
    for col, h in enumerate(arr_headers, start=6):
        ws.cell(row=2, column=col, value=h).font = bold
    for col, h in enumerate(dep_headers, start=11):
        ws.cell(row=2, column=col, value=h).font = bold

    for i, r in enumerate(report.rows):
        row_idx = 3 + i
        ws.cell(row=row_idx, column=1, value=_hour_label(r.hour))
        ws.cell(row=row_idx, column=2, value=r.arrivals)
        ws.cell(row=row_idx, column=3, value=r.departures)
        ws.cell(row=row_idx, column=4, value=r.total_movements)

        ws.cell(row=row_idx, column=6, value=_hour_label(r.hour))
        ws.cell(row=row_idx, column=7, value=r.arrivals)
        ws.cell(row=row_idx, column=8, value=_fmt_min(report.arr_taxi_min if r.arrivals else 0))
        ws.cell(row=row_idx, column=9, value=_fmt_min(r.arr_avg_sequencing_min))

        dep_taxi = r.dep_avg_taxi_min if report.has_taxi_sim else (report.dep_taxi_min if r.departures else 0)
        ws.cell(row=row_idx, column=11, value=_hour_label(r.hour))
        ws.cell(row=row_idx, column=12, value=r.departures)
        ws.cell(row=row_idx, column=13, value=_fmt_min(dep_taxi))
        ws.cell(row=row_idx, column=14, value=_fmt_min(r.dep_avg_sequencing_min))

    for col_letter, width in [("A", 12), ("F", 12), ("K", 12), ("H", 18), ("I", 22), ("M", 18), ("N", 22)]:
        ws.column_dimensions[col_letter].width = width

    wb.save(output_path)
