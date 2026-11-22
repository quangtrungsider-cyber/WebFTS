"""
Tinh KPI (so tau theo gio, dwell time) suot 24h ngay 20/11/2026 cho:
  - Cau truc CU: HCM ACC Sector 1, Sector 5 (vietnam_acc_sector_boundaries.geojson,
    da doi chieu AIP SUP A37/23)
  - Cau truc MOI (du thao tach): PK1A New, PK1B New, PK5A New, PK5B New
    (vatm_acc_fir_sectors.geojson, PK1NEW_*/PK5NEW_*)

Nguon traffic: TOAN BO track thuc giai ma tu ASTERIX Cat062 PCAP
(cat062_20nov26.pcap, 2026-11-20 08:25:58 UTC -> 2026-11-21 08:01:36 UTC,
1.957.198 diem, 6850 callsign khac nhau) -- khong loc truoc theo khu vuc,
de phan loai sector tu lam viec do tren toan bo du lieu.
"""
import csv
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import Point, Polygon
from shapely.prepared import prep

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent.parent.parent
OLD_GEOJSON = PROJECT_ROOT / "WebATM" / "static" / "data" / "vietnam_acc_sector_boundaries.geojson"
NEW_GEOJSON = PROJECT_ROOT / "WebATM" / "static" / "data" / "vatm_kmz" / "vatm_acc_fir_sectors.geojson"
TRACK_CSV = Path(
    r"C:/Users/trunglq/AppData/Local/Temp/claude/D--Coding-D---n-FTS-WebFTS-v4/"
    r"1c74b732-eedf-40e6-9e64-71071fab81b1/scratchpad/cat062/tracks_20261120_full.csv"
)

DAY_START = datetime(2026, 11, 20, 0, 0, 0, tzinfo=timezone.utc)
BIN_SEC = 3600.0  # 1 gio


def parse_alt_range_old(name):
    m = re.search(r"<=FL(\d+)$", name)
    if m:
        return (0, int(m.group(1)) * 100)
    m = re.search(r"FL(\d+)-FL(\d+)$", name)
    if m:
        return (int(m.group(1)) * 100, int(m.group(2)) * 100)
    return None


def load_old_sectors():
    d = json.load(open(OLD_GEOJSON, encoding="utf-8"))
    sectors = {"HCM ACC Sector 1": [], "HCM ACC Sector 5": []}
    for feat in d["features"]:
        name = feat["properties"]["name"]
        for key in sectors:
            if name.startswith(key):
                alt = parse_alt_range_old(name)
                ring = feat["geometry"]["coordinates"][0]
                sectors[key].append((alt, prep(Polygon(ring))))
    return sectors


def load_new_positions():
    d = json.load(open(NEW_GEOJSON, encoding="utf-8"))
    polys = {}
    for feat in d["features"]:
        fid = feat["properties"]["id"]
        if fid.startswith("PK1NEW_") or fid.startswith("PK5NEW_"):
            polys[fid] = prep(Polygon(feat["geometry"]["coordinates"][0]))
    positions = {
        "PK1A New": [(polys["PK1NEW_1A"], 0, 46000)],
        "PK1B New": [(polys["PK1NEW_1B1"], 0, 46000), (polys["PK1NEW_1B2"], 0, 26500)],
        "PK5A New": [(polys["PK5NEW_5A1"], 0, 46000), (polys["PK5NEW_5A2"], 26500, 46000), (polys["PK5NEW_5A3"], 30500, 46000)],
        "PK5B New": [(polys["PK5NEW_5B"], 0, 46000)],
    }
    return positions


def in_any_band(lon, lat, alt_ft, bands):
    pt = Point(lon, lat)
    for entry in bands:
        # old sectors store (alt_tuple, poly); new positions store (poly, lo, hi)
        if len(entry) == 2:
            (lo, hi), poly = entry
        else:
            poly, lo, hi = entry
        if lo <= alt_ft <= hi and poly.contains(pt):
            return True
    return False


TRK_FALLBACK_SPLIT_GAP_S = 1200.0  # 20 phut


def load_tracks_by_callsign():
    """Gom diem theo callsign. QUAN TRONG: cac callsign du phong dang
    "TRK<so_track>" (dung khi ban ghi Cat062 khong co callsign that) dung lai
    so track_number, ma so nay co the bi TAI SU DUNG cho nhieu chuyen bay
    khac nhau khi track cu ket thuc -- da phat hien thuc te 1 truong hop
    "TRK1096" nhay tu 23.86N xuong 10.90N (cach nhau ~1500km) trong 1 gap
    du lieu, chung to la 2+ chuyen bay khac nhau bi gop nham thanh 1. De
    tranh gop nham: neu khoang cach thoi gian giua 2 mau LIEN TIEP cung mot
    callsign dang "TRK..." vuot qua TRK_FALLBACK_SPLIT_GAP_S (20 phut --
    lon hon nhieu so voi gap toi da quan sat duoc tren mot chuyen bay that
    co callsign, ~156s), tach thanh 1 "callsign" rieng (them hau to _segN).
    Callsign that (khong phai TRK...) giu nguyen, khong tach, vi gap dai tren
    1 chuyen bay that la du lieu that (vung mat tin hieu), khong phai tai
    su dung ma so."""
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
            if seg and (p[0] - seg[-1][0]) > TRK_FALLBACK_SPLIT_GAP_S:
                by_cs[f"{cs}_seg{seg_idx}"] = seg
                seg_idx += 1
                seg = []
            seg.append(p)
        if seg:
            by_cs[f"{cs}_seg{seg_idx}"] = seg
    return by_cs


def analyze_position(name, bands, by_cs, t_min, t_max):
    n_bins = int((t_max - t_min) // BIN_SEC) + 1
    occ = defaultdict(set)  # bin_index -> set(callsign)   (snapshot dedup per bin, not per-sample)
    dwell_events = {}

    for acid, pts in by_cs.items():
        inside_prev = False
        t_in = None
        for i, (t, lat, lon, alt_ft) in enumerate(pts):
            if not (t_min <= t <= t_max):
                continue
            inside = in_any_band(lon, lat, alt_ft, bands)
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

    timeseries = []
    for b in range(n_bins):
        cnt = len(occ.get(b, set()))
        timeseries.append({"bin_index": b, "hour_start_s": t_min + b * BIN_SEC, "aircraft_count": cnt})

    dwell_summary = []
    for acid, events in dwell_events.items():
        total = sum(e[1] - e[0] for e in events)
        dwell_summary.append({"callsign": acid, "entries": len(events), "total_dwell_s": round(total, 1)})
    dwell_summary.sort(key=lambda r: -r["total_dwell_s"])

    peak = max(timeseries, key=lambda b: b["aircraft_count"]) if timeseries else None

    return {
        "position": name,
        "distinct_aircraft": len(dwell_events),
        "peak_count": peak["aircraft_count"] if peak else 0,
        "peak_hour_start_s": peak["hour_start_s"] if peak else None,
        "avg_dwell_s": round(sum(r["total_dwell_s"] for r in dwell_summary) / len(dwell_summary), 1) if dwell_summary else 0.0,
        "timeseries": timeseries,
        "dwell_detail": dwell_summary[:20],
    }


def main():
    old_sectors = load_old_sectors()
    new_positions = load_new_positions()
    by_cs = load_tracks_by_callsign()

    all_t = [p[0] for pts in by_cs.values() for p in pts]
    t_min, t_max = min(all_t), max(all_t)
    print(f"Khung thoi gian du lieu: {t_min/3600:.2f}h -> {t_max/3600:.2f}h tu moc 00:00 UTC 20/11/2026")

    results = {}
    for name, bands in old_sectors.items():
        results[name] = analyze_position(name, bands, by_cs, t_min, t_max)
    for name, bands in new_positions.items():
        results[name] = analyze_position(name, bands, by_cs, t_min, t_max)

    out = HERE / "sector_kpi_24h_result.json"
    json.dump(results, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("Da ghi", out)

    for name, res in results.items():
        print(f"\n=== {name} ===")
        print("  so tau khac nhau (24h):", res["distinct_aircraft"])
        hh = res["peak_hour_start_s"] / 3600.0 if res["peak_hour_start_s"] is not None else None
        print(f"  dinh/gio: {res['peak_count']} tai gio {hh:.0f}h00 UTC" if hh is not None else "  dinh/gio: N/A")
        print("  dwell trung binh (phut):", round(res["avg_dwell_s"] / 60, 1))


if __name__ == "__main__":
    main()
