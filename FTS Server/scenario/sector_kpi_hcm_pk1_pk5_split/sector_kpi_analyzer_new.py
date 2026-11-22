"""
Tinh KPI (so tau trong sector theo thoi gian, dwell time) cho cau truc
PK1A New / PK1B New / PK5A New / PK5B New (du thao tach PK1, PK5 ACC HCM),
tai dung CHINH track that da trich cho khung 07:30-07:50 UTC 05/06/2026
(giong het nguon da dung cho Sector 1 & Sector 5 cu) -- chi doi polygon
phan loai, khong doi luu luong.

4 "vi tri" (giong cach nhom cu "Phan khu 5 (Sector 5)" = 5 manh altitude):
  PK1A = PK1NEW_1A                              (GND-FL460)
  PK1B = PK1NEW_1B1 (GND-FL460) hop PK1NEW_1B2 (GND-FL265)
  PK5A = PK5NEW_5A1 (GND-FL460) hop 5A2 (FL265-460) hop 5A3 (FL305-460)
  PK5B = PK5NEW_5B                              (GND-FL460)
"""
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import Point, Polygon
from shapely.prepared import prep

HERE = Path(__file__).resolve().parent
GEOJSON = HERE.parent.parent.parent / "WebATM" / "static" / "data" / "vatm_kmz" / "vatm_acc_fir_sectors.geojson"
RAW_CSV = Path(
    r"C:/Users/trunglq/AppData/Local/Temp/claude/D--Coding-D---n-FTS-WebFTS-v4/"
    r"1c74b732-eedf-40e6-9e64-71071fab81b1/scratchpad/sector_kpi/raw_tracks_window.csv"
)
SIM_T0 = datetime(2026, 6, 5, 7, 20, 0, tzinfo=timezone.utc)

# (id_feature, alt_lo_ft, alt_hi_ft) -- khop dung voi add_pk1_pk5_new_sectors.py
POSITIONS = {
    "PK1A New": [("PK1NEW_1A", 0, 46000)],
    "PK1B New": [("PK1NEW_1B1", 0, 46000), ("PK1NEW_1B2", 0, 26500)],
    "PK5A New": [("PK5NEW_5A1", 0, 46000), ("PK5NEW_5A2", 26500, 46000), ("PK5NEW_5A3", 30500, 46000)],
    "PK5B New": [("PK5NEW_5B", 0, 46000)],
}


def load_polygons():
    d = json.load(open(GEOJSON, encoding="utf-8"))
    polys = {}
    for feat in d["features"]:
        fid = feat["properties"]["id"]
        if fid.startswith("PK1NEW_") or fid.startswith("PK5NEW_"):
            polys[fid] = prep(Polygon(feat["geometry"]["coordinates"][0]))
    return polys


def in_position(lon, lat, alt_ft, bands, polys):
    pt = Point(lon, lat)
    for fid, lo, hi in bands:
        if lo <= alt_ft <= hi and polys[fid].contains(pt):
            return True
    return False


def load_tracks():
    by_cs = {}
    with open(RAW_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                lat = float(row["lat"]); lon = float(row["lon"])
                fl = float(row["flight_level"])
            except (ValueError, KeyError):
                continue
            t = datetime.fromisoformat(row["received_at_utc"].replace("Z", "+00:00"))
            rel_t = (t - SIM_T0).total_seconds()
            by_cs.setdefault(row["callsign"], []).append((rel_t, lat, lon, fl * 100.0))
    for cs in by_cs:
        by_cs[cs].sort(key=lambda r: r[0])
    return by_cs


def analyze(bin_sec=60.0):
    polys = load_polygons()
    by_cs = load_tracks()
    result = {}

    for pos_name, bands in POSITIONS.items():
        occ_snapshot = {}
        dwell_events = {}

        for acid, pts in by_cs.items():
            inside_prev = False
            t_in = None
            for i, (t, lat, lon, alt_ft) in enumerate(pts):
                inside = in_position(lon, lat, alt_ft, bands, polys)
                if inside:
                    occ_snapshot.setdefault(t, set()).add(acid)
                if inside and not inside_prev:
                    t_in = t
                if inside_prev and not inside:
                    dwell_events.setdefault(acid, []).append([t_in, pts[i - 1][0]])
                inside_prev = inside
            if inside_prev and t_in is not None:
                dwell_events.setdefault(acid, []).append([t_in, pts[-1][0]])

        all_t = sorted(occ_snapshot)
        max_t = all_t[-1] if all_t else 0.0
        n_bins = int(max_t // bin_sec) + 1 if all_t else 0
        timeseries = []
        for b in range(n_bins):
            b_start, b_end = b * bin_sec, (b + 1) * bin_sec
            ids_in_bin = set()
            for t in all_t:
                if b_start <= t < b_end:
                    ids_in_bin |= occ_snapshot[t]
            timeseries.append({"bin_start_s": b_start, "bin_end_s": b_end, "aircraft_count": len(ids_in_bin)})

        peak_count = max((len(v) for v in occ_snapshot.values()), default=0)
        peak_t = next((t for t, v in occ_snapshot.items() if len(v) == peak_count), None)

        dwell_summary = []
        for acid, events in dwell_events.items():
            total = sum(e[1] - e[0] for e in events)
            dwell_summary.append({"callsign": acid, "entries": len(events), "total_dwell_s": round(total, 1)})
        dwell_summary.sort(key=lambda r: -r["total_dwell_s"])

        result[pos_name] = {
            "distinct_aircraft": len(dwell_events),
            "peak_count": peak_count,
            "peak_time_s": peak_t,
            "avg_dwell_s": round(sum(r["total_dwell_s"] for r in dwell_summary) / len(dwell_summary), 1) if dwell_summary else 0.0,
            "timeseries": timeseries,
            "dwell_detail": dwell_summary,
        }
    return result


if __name__ == "__main__":
    r = analyze()
    for name, data in r.items():
        print(f"\n=== {name} ===")
        print("so tau khac nhau:", data["distinct_aircraft"])
        print("dinh dong thoi:", data["peak_count"], "tai t=", data["peak_time_s"])
        print("dwell trung binh (s):", data["avg_dwell_s"])
    out = HERE / "sector_kpi_result_new.json"
    json.dump(r, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("\nDa ghi", out)
