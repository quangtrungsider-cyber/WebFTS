"""
Sinh kich ban mo phong tu du lieu Cat062 that -- BAN V2, DA SUA LOI TOC DO.

=== LOI TOC DO CUA BAN V1 VA CACH SUA ===

BlueSky hieu tham so toc do trong lenh CRE/MOVE la CAS (toc do chi thi hieu
chinh), KHONG phai GS (toc do mat dat):
    traffic.py cre() :  self.tas, self.cas, self.M = vcasormach(acspd, acalt)
                        self.gs = self.tas
    traffic.py move():  self.tas[idx], self.selspd[idx], _ = vcasormach(casmach, alt)

Ban v1 nap THANG gia tri GS that (lay tu I062/185 cua Cat062) vao tham so
nay. Hau qua kep:
  1. BlueSky coi do la CAS roi quy doi ra TAS, lam tau bay nhanh hon thuc te
     1.43-1.71 lan. Vi du FL350 nhap 480 kt -> bay o TAS 751 kt (sieu thanh).
  2. CAS 440-515 kt vuot xa gioi han khai thac cua A320, nen mo hinh hieu
     nang BADA ghim toc do lai -> mot so tau lai CHAM hon thuc te (do duoc
     0.34-0.57 lan). Tong hop: sai lech +-50% theo ca hai chieu.

Cach sua: quy doi nguoc GS -> CAS truoc khi ghi vao kich ban, dung CHINH ham
aero cua BlueSky de bao dam khu hoi khop tuyet doi:
        cas_nhap = vtas2cas(gs_that, do_cao)
    => BlueSky tinh lai tas = vcas2tas(cas_nhap, do_cao) = gs_that  (sai so 0.000 kt)

=== VI SAO DAT TAS = GS THAT ===
Mo phong KHONG nap truong gio (winddim = 0), nen trong BlueSky luon co
GS = TAS -- day cung la ly do nguoi dung quan sat thay "TAS va GS giong
nhau", va day la dung voi mo hinh khong gio, khong phai loi.
Khi khong co gio, muon TAI HIEN DUNG QUY DAO VA THOI GIAN that (vi du tau
bay phai vao/ra phan khu dung thoi diem that) thi phai dat TAS = GS that.
Luu y khi doc ket qua: gia tri TAS hien thi trong mo phong bang GS that cua
tau bay, KHONG phai TAS that cua no (TAS that = GS that tru thanh phan gio).
Doi voi muc dich do KPI phan khu (so tau, thoi gian trong phan khu) thi quy
dao va thoi gian moi la cai can dung, nen day la lua chon phu hop.
"""
import csv
import json
import math
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import Point, Polygon
from shapely.prepared import prep

HERE = Path(__file__).resolve().parent
FTS = HERE.parent.parent

sys.path.insert(0, str(FTS))
from windkit import gs_to_cas_kt  # noqa: E402

ROOT = FTS.parent
OLD_GEOJSON = ROOT / "WebATM" / "static" / "data" / "vietnam_acc_sector_boundaries.geojson"
NEW_GEOJSON = ROOT / "WebATM" / "static" / "data" / "vatm_kmz" / "vatm_acc_fir_sectors.geojson"
TRACK_CSV = Path(
    r"C:/Users/trunglq/AppData/Local/Temp/claude/D--Coding-D---n-FTS-WebFTS-v4/"
    r"1c74b732-eedf-40e6-9e64-71071fab81b1/scratchpad/cat062/tracks_20261120_full.csv"
)
OUT_DIR = HERE / "hourly_scenarios"
DEFAULT_TYPE = "A320"
MARGIN_S = 300.0        # dem 5 phut moi dau cho moi kich ban gio
TRK_SPLIT_GAP_S = 1200.0


def parse_alt_old(name):
    m = re.search(r"<=FL(\d+)$", name)
    if m:
        return (0, int(m.group(1)) * 100)
    m = re.search(r"FL(\d+)-FL(\d+)$", name)
    return (int(m.group(1)) * 100, int(m.group(2)) * 100) if m else None


def load_all_bands():
    """Gop ca 6 vi tri thanh mot danh sach de loc 'tau co lien quan'."""
    bands = []
    d = json.load(open(OLD_GEOJSON, encoding="utf-8"))
    for feat in d["features"]:
        n = feat["properties"]["name"]
        if n.startswith(("HCM ACC Sector 1", "HCM ACC Sector 5")):
            lo, hi = parse_alt_old(n)
            bands.append((prep(Polygon(feat["geometry"]["coordinates"][0])), lo, hi))
    d2 = json.load(open(NEW_GEOJSON, encoding="utf-8"))
    alt_map = {"PK1NEW_1A": (0, 46000), "PK1NEW_1B1": (0, 46000), "PK1NEW_1B2": (0, 26500),
               "PK5NEW_5A1": (0, 46000), "PK5NEW_5A2": (26500, 46000),
               "PK5NEW_5A3": (30500, 46000), "PK5NEW_5B": (0, 46000)}
    for feat in d2["features"]:
        fid = feat["properties"]["id"]
        if fid in alt_map:
            lo, hi = alt_map[fid]
            bands.append((prep(Polygon(feat["geometry"]["coordinates"][0])), lo, hi))
    return bands


def inside_any(lon, lat, alt, bands):
    pt = Point(lon, lat)
    return any(lo <= alt <= hi and poly.contains(pt) for poly, lo, hi in bands)


def load_tracks():
    raw = defaultdict(list)
    with open(TRACK_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                lat = float(row["lat"]); lon = float(row["lon"])
                if not row["flight_level"]:
                    continue
                alt = float(row["flight_level"]) * 100.0
                gs = float(row["ground_speed_kt"]) if row["ground_speed_kt"] else 0.0
                hdg = float(row["heading_deg"]) if row["heading_deg"] else 0.0
            except ValueError:
                continue
            if not (8.0 < lat < 18.0 and 105.0 < lon < 116.0):
                continue
            t = datetime.fromisoformat(row["received_at_utc"]).timestamp()
            raw[row["callsign"]].append((t, lat, lon, alt, gs, hdg))
    by_cs = {}
    for cs, pts in raw.items():
        pts.sort(key=lambda r: r[0])
        if not cs.startswith("TRK"):
            by_cs[cs] = pts
            continue
        seg, idx = [], 0
        for p in pts:
            if seg and (p[0] - seg[-1][0]) > TRK_SPLIT_GAP_S:
                by_cs[f"{cs}_seg{idx}"] = seg
                idx += 1
                seg = []
            seg.append(p)
        if seg:
            by_cs[f"{cs}_seg{idx}"] = seg
    return by_cs


def fmt_time(sec: float) -> str:
    sec = max(0.0, sec)
    return f"{int(sec // 3600):02d}:{int((sec % 3600) // 60):02d}:{sec % 60:05.2f}"


def write_scn(path, by_cs, members, t0, t1, title_lines):
    """Ghi 1 kich ban cho khoang [t0, t1]. members = tap callsign duoc dua vao."""
    lines = []
    n_cre = n_move = 0
    for cs in sorted(members):
        pts = [p for p in by_cs[cs] if t0 <= p[0] <= t1]
        if len(pts) < 2:
            continue
        t, lat, lon, alt, gs, hdg = pts[0]
        cas = float(gs_to_cas_kt(gs, alt))
        lines.append((t - t0, f"CRE {cs},{DEFAULT_TYPE},{lat:.6f},{lon:.6f},{hdg:.1f},{alt:.0f},{cas:.1f}"))
        lines.append((t - t0, f"LNAV {cs} OFF"))
        lines.append((t - t0, f"VNAV {cs} OFF"))
        n_cre += 1
        for i in range(1, len(pts)):
            t, lat, lon, alt, gs, hdg = pts[i]
            dt = t - pts[i - 1][0]
            if dt <= 0:
                continue
            vspd = (alt - pts[i - 1][3]) / (dt / 60.0)
            cas = float(gs_to_cas_kt(gs, alt))
            lines.append((t - t0, f"MOVE {cs},{lat:.6f},{lon:.6f},{alt:.0f},{hdg:.1f},{cas:.1f},{vspd:.0f}"))
            n_move += 1
    lines.sort(key=lambda x: x[0])
    with open(path, "w", encoding="utf-8") as f:
        for tl in title_lines:
            f.write(f"# {tl}\n")
        f.write(f"# {n_cre} may bay that, {n_move} lenh MOVE\n")
        f.write("# TOC DO: da quy doi GS that -> CAS bang vtas2cas() cua BlueSky,\n")
        f.write("#         de TAS mo phong = GS that (mo phong khong co gio).\n")
        for rel, cmd in lines:
            f.write(f"{fmt_time(rel)}>{cmd}\n")
    return n_cre, n_move


def main():
    OUT_DIR.mkdir(exist_ok=True)
    bands = load_all_bands()
    by_cs = load_tracks()
    print(f"Da nap {len(by_cs)} track trong khu vuc quan tam")

    # Xac dinh khoang thoi gian tau bay nam trong 1 trong 6 vi tri
    in_span = {}
    for cs, pts in by_cs.items():
        ts = [p[0] for p in pts if inside_any(p[2], p[1], p[3], bands)]
        if ts:
            in_span[cs] = (min(ts), max(ts))
    print(f"So track co di qua it nhat 1 trong 6 vi tri: {len(in_span)}")

    all_t = [p[0] for pts in by_cs.values() for p in pts]
    t_lo, t_hi = min(all_t), max(all_t)
    h_first = int(t_lo // 3600) * 3600
    h_last = int(t_hi // 3600) * 3600

    index = []
    for h in range(h_first, h_last + 3600, 3600):
        hs, he = h, h + 3600
        members = {cs for cs, (a, b) in in_span.items() if a < he and b > hs}
        if not members:
            continue
        label = datetime.fromtimestamp(h, tz=timezone.utc).strftime("%Y%m%d_%H%MZ")
        path = OUT_DIR / f"HCM_PK1PK5_{label}.scn"
        t0, t1 = hs - MARGIN_S, he + MARGIN_S
        n_cre, n_move = write_scn(
            path, by_cs, members, t0, t1,
            [f"Kich ban gio {datetime.fromtimestamp(h, tz=timezone.utc).strftime('%d/%m/%Y %H:%M')} UTC "
             f"(gio VN {datetime.fromtimestamp(h + 7 * 3600, tz=timezone.utc).strftime('%H:%M')})",
             "Nguon: ASTERIX Cat062 that (cat062_20nov26.pcap)",
             f"Khoang mo phong: {MARGIN_S/60:.0f} phut dem + 60 phut + {MARGIN_S/60:.0f} phut dem"])
        index.append({"hour_utc": datetime.fromtimestamp(h, tz=timezone.utc).isoformat(),
                      "hour_epoch": h, "file": path.name,
                      "aircraft": n_cre, "move_cmds": n_move,
                      "sim_duration_s": (t1 - t0)})
        print(f"  {path.name}: {n_cre} tau, {n_move} lenh MOVE")

    json.dump(index, open(OUT_DIR / "index.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\nDa sinh {len(index)} kich ban gio trong {OUT_DIR}")
    print(f"Tong so may bay: {sum(i['aircraft'] for i in index)}, tong lenh MOVE: {sum(i['move_cmds'] for i in index)}")


if __name__ == "__main__":
    main()
