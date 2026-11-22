"""
Kiem chung DOC LAP ket qua sector_kpi_24h_v2.py.

Doc lap o CA HAI tang:
  1. Hinh hoc: ray-casting tu viet (khong dung shapely).
  2. Thuat toan dem tau dong thoi: LAY MAU DAY theo luoi 10 giay roi dem truc
     tiep, thay vi sweep-line tren su kien vao/ra nhu ban chinh. Hai phuong
     phap hoan toan khac nhau ve ban chat: sweep-line chinh xac tuyet doi tai
     moi su kien; lay mau 10s co the BO SOT dinh ton tai duoi 10 giay. Vi vay
     quy tac doi chieu dung o day la: ket qua lay mau phai <= ket qua sweep-
     line, va trong thuc te phai BANG neu dinh keo dai hon 10 giay (luon dung
     voi tau bay duong dai). Neu lay mau > sweep-line thi chac chan sweep-line
     sai.

Kiem 3 vi tri quan trong nhat voi ket luan: Sector 5 cu, PK5A New (manh tai
nang nhat sau tach) va Sector 1 cu.
"""
import csv
import json
import re
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent.parent.parent
OLD_GEOJSON = PROJECT_ROOT / "WebATM" / "static" / "data" / "vietnam_acc_sector_boundaries.geojson"
NEW_GEOJSON = PROJECT_ROOT / "WebATM" / "static" / "data" / "vatm_kmz" / "vatm_acc_fir_sectors.geojson"
TRACK_CSV = Path(
    r"C:/Users/trunglq/AppData/Local/Temp/claude/D--Coding-D---n-FTS-WebFTS-v4/"
    r"1c74b732-eedf-40e6-9e64-71071fab81b1/scratchpad/cat062/tracks_20261120_full.csv"
)
RESULT_JSON = HERE / "sector_kpi_24h_result_v2.json"
TRK_SPLIT_GAP_S = 1200.0
SAMPLE_STEP_S = 10.0


def ray_cast(x, y, ring):
    n = len(ring)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def parse_alt_old(name):
    m = re.search(r"<=FL(\d+)$", name)
    if m:
        return (0, int(m.group(1)) * 100)
    m = re.search(r"FL(\d+)-FL(\d+)$", name)
    return (int(m.group(1)) * 100, int(m.group(2)) * 100)


def load_bands():
    bands = {}
    d = json.load(open(OLD_GEOJSON, encoding="utf-8"))
    for key in ("HCM ACC Sector 1", "HCM ACC Sector 5"):
        lst = []
        for feat in d["features"]:
            if feat["properties"]["name"].startswith(key):
                lo, hi = parse_alt_old(feat["properties"]["name"])
                lst.append((feat["geometry"]["coordinates"][0], lo, hi))
        bands[key] = lst
    d2 = json.load(open(NEW_GEOJSON, encoding="utf-8"))
    rings = {f["properties"]["id"]: f["geometry"]["coordinates"][0]
             for f in d2["features"] if f["properties"]["id"].startswith(("PK1NEW_", "PK5NEW_"))}
    bands["PK5A New"] = [(rings["PK5NEW_5A1"], 0, 46000),
                         (rings["PK5NEW_5A2"], 26500, 46000),
                         (rings["PK5NEW_5A3"], 30500, 46000)]
    return bands


def load_tracks():
    raw = defaultdict(list)
    with open(TRACK_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                lat = float(row["lat"]); lon = float(row["lon"])
                if not row["flight_level"]:
                    continue
                alt = float(row["flight_level"]) * 100.0
            except ValueError:
                continue
            t = datetime.fromisoformat(row["received_at_utc"]).timestamp()
            raw[row["callsign"]].append((t, lat, lon, alt))
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


def main():
    bands_all = load_bands()
    by_cs = load_tracks()
    prev = json.load(open(RESULT_JSON, encoding="utf-8"))
    errors = []

    for pos_name in ("HCM ACC Sector 1", "HCM ACC Sector 5", "PK5A New"):
        bands = bands_all[pos_name]

        def is_in(lon, lat, alt):
            return any(lo <= alt <= hi and ray_cast(lon, lat, ring) for ring, lo, hi in bands)

        intervals = []
        dwell = defaultdict(float)
        for acid, pts in by_cs.items():
            prev_in, t_in = False, None
            for i, (t, lat, lon, alt) in enumerate(pts):
                now_in = is_in(lon, lat, alt)
                if now_in and not prev_in:
                    t_in = t
                elif prev_in and not now_in:
                    intervals.append((t_in, pts[i - 1][0]))
                    dwell[acid] += pts[i - 1][0] - t_in
                prev_in = now_in
            if prev_in and t_in is not None:
                intervals.append((t_in, pts[-1][0]))
                dwell[acid] += pts[-1][0] - t_in

        # Dem tau dong thoi bang LAY MAU DAY 10 giay (phuong phap khac han
        # sweep-line cua ban chinh)
        t_lo = min(i[0] for i in intervals)
        t_hi = max(i[1] for i in intervals)
        peak_sampled = 0
        t = t_lo
        ivs = sorted(intervals)
        while t <= t_hi:
            c = sum(1 for a, b in ivs if a <= t <= b)
            if c > peak_sampled:
                peak_sampled = c
            t += SAMPLE_STEP_S

        dwells = sorted(dwell.values())
        median = round(statistics.median(dwells), 1)

        p = prev[pos_name]
        print(f"\n=== {pos_name} ===")
        print(f"  distinct_aircraft : doc_lap={len(dwell):<6} v2={p['distinct_aircraft']:<6} -> {'KHOP' if len(dwell)==p['distinct_aircraft'] else 'LECH!!'}")
        print(f"  dwell_median_s    : doc_lap={median:<8} v2={p['dwell_median_s']:<8} -> {'KHOP' if abs(median-p['dwell_median_s'])<0.05 else 'LECH!!'}")
        print(f"  peak_simultaneous : lay_mau_10s={peak_sampled:<4} sweep_line_v2={p['peak_simultaneous']:<4} -> ", end="")
        if peak_sampled > p["peak_simultaneous"]:
            print("LOI! lay mau khong duoc phep vuot sweep-line")
            errors.append((pos_name, "peak_simultaneous", peak_sampled, p["peak_simultaneous"]))
        elif peak_sampled == p["peak_simultaneous"]:
            print("KHOP chinh xac")
        else:
            print(f"lay mau thap hon {p['peak_simultaneous']-peak_sampled} (hop le: dinh ton tai <10s)")

        if len(dwell) != p["distinct_aircraft"]:
            errors.append((pos_name, "distinct_aircraft", len(dwell), p["distinct_aircraft"]))
        if abs(median - p["dwell_median_s"]) >= 0.05:
            errors.append((pos_name, "dwell_median_s", median, p["dwell_median_s"]))

    print("\n" + "=" * 60)
    if errors:
        print(f"KIEM CHUNG THAT BAI: {len(errors)} diem lech")
        for e in errors:
            print("  ", e)
        return 1
    print("KIEM CHUNG THANH CONG: ket qua v2 dung tren ca 3 vi tri kiem tra")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
