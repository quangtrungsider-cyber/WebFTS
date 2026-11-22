"""
Kiem chung DOC LAP ket qua sector_kpi_24h.py cho 24h du lieu Cat062 that.

Doc lai toan bo du lieu nguon tu dau, dung thuat toan ray-casting TU VIET
(khong dung shapely, khong tai dung ham cua sector_kpi_24h.py). Vi khoi
luong du lieu lon (gan 2 trieu diem), kiem chung tap trung vao 2 vi tri
quan trong nhat de doi chieu: HCM ACC Sector 1 (cau truc cu) va PK5B New
(cau truc moi -- phat hien bat ngo nhat, can chac chan dung truoc khi dua
vao bao cao).
"""
import csv
import json
import re
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
RESULT_JSON = HERE / "sector_kpi_24h_result.json"
DAY_START = datetime(2026, 11, 20, 0, 0, 0, tzinfo=timezone.utc)
BIN_SEC = 3600.0


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


def parse_alt_range_old(name):
    m = re.search(r"<=FL(\d+)$", name)
    if m:
        return (0, int(m.group(1)) * 100)
    m = re.search(r"FL(\d+)-FL(\d+)$", name)
    return (int(m.group(1)) * 100, int(m.group(2)) * 100)


def load_old_sector1_rings():
    d = json.load(open(OLD_GEOJSON, encoding="utf-8"))
    bands = []
    for feat in d["features"]:
        name = feat["properties"]["name"]
        if name.startswith("HCM ACC Sector 1"):
            alt = parse_alt_range_old(name)
            bands.append((alt, feat["geometry"]["coordinates"][0]))
    return bands


def load_pk5b_ring():
    d = json.load(open(NEW_GEOJSON, encoding="utf-8"))
    for feat in d["features"]:
        if feat["properties"]["id"] == "PK5NEW_5B":
            return feat["geometry"]["coordinates"][0]
    raise RuntimeError("PK5NEW_5B not found")


def in_sector1(lon, lat, alt_ft, bands):
    return any(lo <= alt_ft <= hi and ray_cast(lon, lat, ring) for (lo, hi), ring in bands)


def main():
    s1_bands = load_old_sector1_rings()
    pk5b_ring = load_pk5b_ring()

    TRK_SPLIT_GAP_S = 1200.0
    raw_by_cs = defaultdict(list)
    with open(TRACK_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                lat = float(row["lat"]); lon = float(row["lon"])
                fl_str = row["flight_level"]
                if not fl_str:
                    continue
                fl = float(fl_str) * 100.0
            except ValueError:
                continue
            t = datetime.fromisoformat(row["received_at_utc"])
            rel_t = (t - DAY_START).total_seconds()
            raw_by_cs[row["callsign"]].append((rel_t, lat, lon, fl))
    by_cs = {}
    for cs, pts in raw_by_cs.items():
        pts.sort(key=lambda r: r[0])
        if not cs.startswith("TRK"):
            by_cs[cs] = pts
            continue
        seg, seg_idx = [], 0
        for p in pts:
            if seg and (p[0] - seg[-1][0]) > TRK_SPLIT_GAP_S:
                by_cs[f"{cs}_seg{seg_idx}"] = seg
                seg_idx += 1
                seg = []
            seg.append(p)
        if seg:
            by_cs[f"{cs}_seg{seg_idx}"] = seg

    all_t = [p[0] for pts in by_cs.values() for p in pts]
    t_min, t_max = min(all_t), max(all_t)

    prev = json.load(open(RESULT_JSON, encoding="utf-8"))
    errors = []

    for label, check_fn in [
        ("HCM ACC Sector 1", lambda lon, lat, alt: in_sector1(lon, lat, alt, s1_bands)),
        ("PK5B New", lambda lon, lat, alt: 0 <= alt <= 46000 and ray_cast(lon, lat, pk5b_ring)),
    ]:
        occ = defaultdict(set)
        dwell_events = {}
        for acid, pts in by_cs.items():
            inside_prev, t_in = False, None
            for i, (t, lat, lon, alt_ft) in enumerate(pts):
                inside = check_fn(lon, lat, alt_ft)
                if inside:
                    b = int((t - t_min) // BIN_SEC)
                    occ[b].add(acid)
                if inside and not inside_prev:
                    t_in = t
                if inside_prev and not inside:
                    dwell_events.setdefault(acid, []).append((t_in, pts[i - 1][0]))
                inside_prev = inside
            if inside_prev and t_in is not None:
                dwell_events.setdefault(acid, []).append((t_in, pts[-1][0]))

        distinct = len(dwell_events)
        peak = max((len(v) for v in occ.values()), default=0)
        total_dwell = [sum(e[1] - e[0] for e in evs) for evs in dwell_events.values()]
        avg_dwell = round(sum(total_dwell) / len(total_dwell), 1) if total_dwell else 0.0

        prevres = prev[label]
        print(f"\n=== {label} ===")
        checks = [("distinct_aircraft", distinct, prevres["distinct_aircraft"]),
                  ("peak_count", peak, prevres["peak_count"]),
                  ("avg_dwell_s", avg_dwell, prevres["avg_dwell_s"])]
        for field, newv, oldv in checks:
            ok = abs(newv - oldv) < 1e-6 if isinstance(newv, float) else newv == oldv
            print(f"  {field}: doc_lap={newv}  analyzer={oldv}  -> {'KHOP' if ok else 'LECH!!'}")
            if not ok:
                errors.append((label, field, newv, oldv))

    print("\n" + "=" * 50)
    if errors:
        print(f"KIEM CHUNG PHAT HIEN {len(errors)} DIEM LECH:")
        for e in errors:
            print(" ", e)
        return 1
    print("KIEM CHUNG THANH CONG")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
