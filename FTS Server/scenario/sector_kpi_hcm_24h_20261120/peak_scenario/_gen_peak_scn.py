"""
Sinh kich ban .scn tu track Cat062 that (79 may bay that, 2026-11-20
11:50-12:30 UTC, khung gio cao diem chung cho ca Sector 1/5 cu va
PK1A/1B/5A/5B moi) -- cung pattern da dung cho khung 07:30-07:50 05/06/2026
truoc do (CRE + MOVE, LNAV/VNAV OFF).

Nguon: ASTERIX Cat062 PCAP giai ma (cat062_20nov26.pcap) -> peak_window_tracks.csv
Cot ground_speed_kt cua bo nay DUNG la ground speed va DUNG don vi knot:
da kiem dinh tren 306.807 cap mau, ty le (toc do do tu vi tri lien tiep) /
(gia tri trong cot) = 1.003.

TOC DO: quy doi GS -> CAS bang windkit.gs_to_cas_kt() truoc khi ghi, vi
BlueSky doc tham so toc do cua CRE/MOVE la CAS. Nap thang GS vao se khien
tau bay o ~750 kt TAS, vuot toc do am thanh. Xem windkit/atmosphere.py.
"""
import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent.parent.parent))
from windkit import gs_to_cas_kt  # noqa: E402
RAW_CSV = Path(
    r"C:/Users/trunglq/AppData/Local/Temp/claude/D--Coding-D---n-FTS-WebFTS-v4/"
    r"1c74b732-eedf-40e6-9e64-71071fab81b1/scratchpad/cat062/peak_window_tracks.csv"
)
OUT_SCN = HERE / "HCM_PK1PK5_24H_PEAK_20261120_1150-1230.scn"

SIM_T0 = datetime(2026, 11, 20, 11, 50, 0, tzinfo=timezone.utc)
DEFAULT_TYPE = "A320"


def fmt_time(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    hh = int(seconds // 3600)
    mm = int((seconds % 3600) // 60)
    ss = seconds % 60
    return f"{hh:02d}:{mm:02d}:{ss:05.2f}"


def load_rows():
    by_cs = {}
    with open(RAW_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            cs = row["callsign"]
            try:
                lat = float(row["lat"])
                lon = float(row["lon"])
                fl = float(row["flight_level"])
                gs = float(row["ground_speed_kt"]) if row["ground_speed_kt"] else 250.0
                hdg = float(row["heading_deg"]) if row["heading_deg"] else 0.0
            except (ValueError, KeyError):
                continue
            t = datetime.fromisoformat(row["received_at_utc"])
            by_cs.setdefault(cs, []).append((t, lat, lon, fl, gs, hdg))
    for cs in by_cs:
        by_cs[cs].sort(key=lambda r: r[0])
    return by_cs


def main():
    by_cs = load_rows()
    lines = []
    total_cre = total_move = 0

    for cs in sorted(by_cs):
        pts = by_cs[cs]
        if len(pts) < 2:
            continue
        t0, lat0, lon0, fl0, gs0, hdg0 = pts[0]
        alt0_ft = fl0 * 100.0
        rel0 = (t0 - SIM_T0).total_seconds()
        cas0 = float(gs_to_cas_kt(gs0, alt0_ft))
        lines.append((rel0, f"CRE {cs},{DEFAULT_TYPE},{lat0:.6f},{lon0:.6f},{hdg0:.1f},{alt0_ft:.0f},{cas0:.1f}"))
        lines.append((rel0, f"LNAV {cs} OFF"))
        lines.append((rel0, f"VNAV {cs} OFF"))
        total_cre += 1

        for i in range(1, len(pts)):
            t, lat, lon, fl, gs, hdg = pts[i]
            tprev = pts[i - 1][0]
            altprev_ft = pts[i - 1][3] * 100.0
            alt_ft = fl * 100.0
            dt_sec = (t - tprev).total_seconds()
            if dt_sec <= 0:
                continue
            vspd_fpm = (alt_ft - altprev_ft) / (dt_sec / 60.0)
            rel = (t - SIM_T0).total_seconds()
            cas = float(gs_to_cas_kt(gs, alt_ft))
            lines.append((rel, f"MOVE {cs},{lat:.6f},{lon:.6f},{alt_ft:.0f},{hdg:.1f},{cas:.1f},{vspd_fpm:.0f}"))
            total_move += 1

    lines.sort(key=lambda x: x[0])
    with open(OUT_SCN, "w", encoding="utf-8") as f:
        f.write("# Kich ban KPI Sector 1/5 cu & PK1A/1B/5A/5B moi - tu track Cat062 that 20/11/2026\n")
        f.write("# Khung thuc: 11:50:00 - 12:30:00 UTC (gio cao diem chung trong khao sat 24h)\n")
        f.write(f"# {total_cre} may bay that, {total_move} lenh MOVE\n")
        f.write("# TOC DO: da quy doi GS that -> CAS (windkit.gs_to_cas_kt),\n")
        f.write("#         de TAS mo phong bang GS that. Mo phong khong nap gio.\n")
        for rel, cmd in lines:
            f.write(f"{fmt_time(rel)}>{cmd}\n")

    print(f"Da ghi {OUT_SCN}: {total_cre} may bay, {total_move} lenh MOVE")


if __name__ == "__main__":
    main()
