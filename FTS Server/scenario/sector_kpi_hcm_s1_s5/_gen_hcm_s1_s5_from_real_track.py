"""
Sinh kich ban .scn tu track thuc 05/06/2026 (r72_tracks_20260605.csv) cho 59 chuyen
bay thuc te di qua HCM ACC Sector 1 va/hoac Sector 5 trong khung 07:30-07:50 UTC.

Nguon du lieu That (KHONG bia):
  - Track: D:\OneDrive.../vietnam_ats_routes_pack/r72_tracks_20260605.csv (radar/ADS-B)
  - Polygon sector + dai muc bay: WebATM/static/data/vietnam_acc_sector_boundaries.geojson
    (da doi chieu khop 100% voi AIRAC AIP SUP A37/23, 02/11/2023)

Gia dinh duoc ghi nhan ro rang (KHONG co trong du lieu nguon):
  - Loai tau bay: CSV khong co cot aircraft type -> dung mac dinh "A320" cho TOAN BO
    chuyen bay. Vi kich ban dung lenh MOVE (teleport, bo qua autopilot/performance
    model) de tai hien dung vi tri/toc do/huong that tu track, loai tau KHONG anh
    huong den do chinh xac vi tri/thoi gian dung cho KPI sector (so tau, dwell time).
    Day la gia dinh my hoc, khong anh huong ket qua dinh luong.

HAI LOI TOC DO DA SUA (ban dau sinh ra tau bay bay sai toc do):

  1. DON VI CUA COT NGUON. Cot ten la "ground_speed_kt" nhung gia tri thuc
     te la M/S, khong phai knot. Kiem dinh tren 275.816 cap mau o FL250+
     bang cach do toc do tu hai vi tri lien tiep roi so voi gia tri trong
     cot: neu coi cot la m/s thi ty le = 1.0039 (khop), con neu coi la knot
     thi ty le = 1.9513 (lech dung bang he so 1.944 kt/(m/s)).
     Vi du: gia tri 237 o FL330 doc la m/s = 461 kt, dung voi bay bang.

  2. CAS CHU KHONG PHAI GS. BlueSky doc tham so toc do cua CRE/MOVE la CAS,
     nen phai quy doi GS -> CAS truoc khi ghi (windkit.gs_to_cas_kt).

Cach dung lenh:
  - CRE tai thoi diem xuat hien dau tien cua moi callsign trong khung du lieu
  - LNAV/VNAV OFF ngay sau CRE (vo hieu hoa dieu khien tu dong, chi dung MOVE)
  - MOVE tai moi mau track tiep theo (cadence that ~4s/mau, KHONG noi suy them)
  - alt (ft) = flight_level * 100 ; hdg = heading_deg that
  - vspd (fpm) tinh tu chenh lech alt giua 2 mau / thoi gian (phut)
"""
import csv
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent.parent))
from windkit import gs_to_cas_kt  # noqa: E402
from windkit.units import ms_to_kt  # noqa: E402
RAW_CSV = Path(
    r"C:/Users/trunglq/AppData/Local/Temp/claude/D--Coding-D---n-FTS-WebFTS-v4/"
    r"1c74b732-eedf-40e6-9e64-71071fab81b1/scratchpad/sector_kpi/raw_tracks_window.csv"
)
OUT_SCN = HERE / "HCM_S1S5_KPI_20260605_0730-0750.scn"

SIM_T0 = datetime(2026, 6, 5, 7, 20, 0, tzinfo=timezone.utc)  # 10 phut dem truoc khung 07:30
DEFAULT_TYPE = "A320"


def parse_ts(s: str) -> datetime:
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)


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
        reader = csv.DictReader(f)
        for row in reader:
            cs = row["callsign"]
            try:
                lat = float(row["lat"])
                lon = float(row["lon"])
                fl = float(row["flight_level"])
                # Cot mang ten "_kt" nhung gia tri la m/s - xem phan dau tep.
                gs = float(ms_to_kt(float(row["ground_speed_kt"])))
                hdg = float(row["heading_deg"])
            except (ValueError, KeyError):
                continue
            t = parse_ts(row["received_at_utc"])
            by_cs.setdefault(cs, []).append((t, lat, lon, fl, gs, hdg))
    for cs in by_cs:
        by_cs[cs].sort(key=lambda r: r[0])
    return by_cs


def main():
    by_cs = load_rows()
    lines = []
    total_cre = 0
    total_move = 0

    for cs in sorted(by_cs):
        pts = by_cs[cs]
        if len(pts) < 2:
            continue  # khong du du lieu de dung lam kich ban chuyen dong
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
            lines.append((
                rel,
                f"MOVE {cs},{lat:.6f},{lon:.6f},{alt_ft:.0f},{hdg:.1f},"
                f"{float(gs_to_cas_kt(gs, alt_ft)):.1f},{vspd_fpm:.0f}",
            ))
            total_move += 1

    lines.sort(key=lambda x: x[0])

    with open(OUT_SCN, "w", encoding="utf-8") as f:
        f.write("# Kich ban KPI Sector 1 & Sector 5 HCM ACC - tu track thuc 05/06/2026\n")
        f.write("# Khung thuc: 07:20:00 - 08:00:00 UTC (dem 10 phut truoc/sau khung quan sat 07:30-07:50)\n")
        f.write(f"# {total_cre} may bay that, {total_move} lenh MOVE (nhip mau that ~4s)\n")
        for rel, cmd in lines:
            f.write(f"{fmt_time(rel)}>{cmd}\n")

    print(f"Da ghi {OUT_SCN}")
    print(f"Tong: {total_cre} may bay, {total_move} lenh MOVE, {len(lines)} dong lenh")


if __name__ == "__main__":
    main()
