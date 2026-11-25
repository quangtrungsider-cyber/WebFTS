"""
Sinh kich ban .scn tu track that cho khung gio cao diem PK2 (09:50-11:10 UTC,
dem 10 phut truoc/sau gio cao diem 10:00-11:00 UTC, mat do diem PK2 cao nhat
trong ngay 05/06/2026) -- de chay headless kiem tra quy dao/toc do hop le.

TOC DO: cot gs_kt trong han_tracks_20260605.csv DA duoc quy doi tu m/s sang
knot that boi _01_extract_tracks.py. BlueSky doc tham so toc do cua CRE/MOVE
la CAS nen phai quy doi GS that -> CAS bang windkit.gs_to_cas_kt() truoc khi
ghi, giong het cach da sua cho scenario ACC HCM va vag672_adsb_replay.scn.
"""
import csv
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
FTS = HERE.parent.parent
sys.path.insert(0, str(FTS))
from windkit import gs_to_cas_kt  # noqa: E402

TRACKS_CSV = HERE / "han_tracks_20260605.csv"
OUT_SCN = HERE / "HAN_PK2_PEAK_20260605_0950-1110.scn"

T0 = datetime(2026, 6, 5, 9, 50, 0, tzinfo=timezone.utc)
T1 = datetime(2026, 6, 5, 11, 10, 0, tzinfo=timezone.utc)
DEFAULT_TYPE = "A320"
MIN_DT_S = 1.0
# Nguon co nhieu cap diem gan nhu trung timestamp cho CUNG mot tau bay (da
# xac nhan: vi du BAV135 co 3 ban tin trong vong 1ms, do cao lech nhau vai
# chuc ft -- dac trung cua ADS-B nhieu tram thu). Bo qua cap diem co dt qua
# nho de tranh vspd = (alt1-alt0)/(dt/60) no ra hang ty ft/min.
MAX_PLAUSIBLE_GS_KT = 600.0
# Mot so ban tin co gs_kt phi ly (vd RRR4102 09:52:06Z: 1263.5 kt o FL279) --
# loi giai ma vi tri tam thoi cua nguon ADS-B (bit-error trong ban tin van
# toc), khong phai loi quy doi don vi. Loai bo truoc khi dung lam CAS cho
# kich ban, de khong tao ra tau bay "sieu thanh" gia tao trong headless run.


def fmt_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hh = int(seconds // 3600)
    mm = int((seconds % 3600) // 60)
    ss = seconds % 60
    return f"{hh:02d}:{mm:02d}:{ss:05.2f}"


def main():
    by_cs = defaultdict(list)
    with open(TRACKS_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            t = datetime.fromisoformat(row["received_at_utc"].replace("Z", "+00:00"))
            if not (T0 <= t <= T1):
                continue
            gs_kt = float(row["gs_kt"])
            if gs_kt > MAX_PLAUSIBLE_GS_KT:
                continue
            by_cs[row["callsign"]].append((
                t, float(row["lat"]), float(row["lon"]), float(row["alt_ft"]),
                gs_kt, float(row["heading_deg"]), row["sector"],
            ))
    for cs in by_cs:
        by_cs[cs].sort(key=lambda r: r[0])

    lines = []
    n_cre = n_move = 0
    for cs in sorted(by_cs):
        pts = by_cs[cs]
        if len(pts) < 2:
            continue
        t0, lat0, lon0, alt0, gs0, hdg0, _ = pts[0]
        rel0 = (t0 - T0).total_seconds()
        cas0 = float(gs_to_cas_kt(gs0, alt0))
        lines.append((rel0, f"CRE {cs},{DEFAULT_TYPE},{lat0:.6f},{lon0:.6f},{hdg0:.1f},{alt0:.0f},{cas0:.1f}"))
        lines.append((rel0, f"LNAV {cs} OFF"))
        lines.append((rel0, f"VNAV {cs} OFF"))
        n_cre += 1
        for i in range(1, len(pts)):
            t, lat, lon, alt, gs, hdg, _ = pts[i]
            tprev, _, _, altprev, *_ = pts[i - 1]
            dt = (t - tprev).total_seconds()
            if dt < MIN_DT_S:
                continue
            vspd = (alt - altprev) / (dt / 60.0)
            rel = (t - T0).total_seconds()
            cas = float(gs_to_cas_kt(gs, alt))
            lines.append((rel, f"MOVE {cs},{lat:.6f},{lon:.6f},{alt:.0f},{hdg:.1f},{cas:.1f},{vspd:.0f}"))
            n_move += 1

    lines.sort(key=lambda x: x[0])
    with open(OUT_SCN, "w", encoding="utf-8") as f:
        f.write("# Kich ban cao diem PK2 ACC Ha Noi - tu track that 05/06/2026\n")
        f.write(f"# Khung thuc: {T0.strftime('%H:%M')} - {T1.strftime('%H:%M')} UTC "
                "(dem 10 phut truoc/sau gio cao diem 10:00-11:00 UTC)\n")
        f.write(f"# {n_cre} may bay that, {n_move} lenh MOVE\n")
        f.write("# TOC DO: da quy doi GS that (m/s trong cot goc) -> CAS bang windkit.gs_to_cas_kt()\n")
        for rel, cmd in lines:
            f.write(f"{fmt_time(rel)}>{cmd}\n")

    print(f"Da ghi {OUT_SCN}: {n_cre} may bay, {n_move} lenh MOVE")


if __name__ == "__main__":
    main()
