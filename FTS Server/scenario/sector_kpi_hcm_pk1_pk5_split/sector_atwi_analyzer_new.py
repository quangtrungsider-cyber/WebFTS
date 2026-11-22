"""
Mo hinh workload ATWI mo rong (giong het sector_atwi_analyzer.py da dung cho
Sector 1 & Sector 5 cu) ap dung cho 4 vi tri PK1A New / PK1B New / PK5A New /
PK5B New, dung CUNG track that (raw_tracks_window.csv) va CUNG cong
thuc/he so/nguong cua atwi_models.json + atwi_task_index.json.

Khac so voi ban cu (2 sector) chi o cho: tong quat hoa tu 2 len 4 vi tri, va
CROSS_SECTOR_COORD duoc tinh cho MOI CAP trong 4 vi tri (khong chi 1 cap).
"""
import csv
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import Point, Polygon
from shapely.prepared import prep

HERE = Path(__file__).resolve().parent
GEOJSON = HERE.parent.parent.parent / "WebATM" / "static" / "data" / "vatm_kmz" / "vatm_acc_fir_sectors.geojson"
ATWI_MODELS = HERE.parent.parent.parent / "FTS Server" / "data" / "atwi_models.json"
ATWI_TASKS = HERE.parent.parent.parent / "FTS Server" / "data" / "atwi_task_index.json"
RAW_CSV = Path(
    r"C:/Users/trunglq/AppData/Local/Temp/claude/D--Coding-D---n-FTS-WebFTS-v4/"
    r"1c74b732-eedf-40e6-9e64-71071fab81b1/scratchpad/sector_kpi/raw_tracks_window.csv"
)

SIM_T0 = datetime(2026, 6, 5, 7, 20, 0, tzinfo=timezone.utc)
WINDOW_SEC = 300.0
LATERAL_MIN_NM, VERTICAL_MIN_FT = 5.0, 1000.0
LATERAL_CRIT_NM, VERTICAL_CRIT_FT = 3.0, 500.0
HDG_CHANGE_DEG, ALT_CHANGE_FT, SPD_CHANGE_KT = 15.0, 500.0, 15.0

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


def haversine_nm(lat1, lon1, lat2, lon2):
    R_NM = 3440.065
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_NM * math.asin(math.sqrt(a))


def hdg_diff(a, b):
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def load_tracks():
    by_cs = {}
    with open(RAW_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                lat = float(row["lat"]); lon = float(row["lon"])
                fl = float(row["flight_level"]); gs = float(row["ground_speed_kt"])
                hdg = float(row["heading_deg"])
            except (ValueError, KeyError):
                continue
            t = datetime.fromisoformat(row["received_at_utc"].replace("Z", "+00:00"))
            rel_t = (t - SIM_T0).total_seconds()
            by_cs.setdefault(row["callsign"], []).append((rel_t, lat, lon, fl * 100.0, gs, hdg))
    for cs in by_cs:
        by_cs[cs].sort(key=lambda r: r[0])
    return by_cs


def load_atwi_config():
    model = json.load(open(ATWI_MODELS, encoding="utf-8"))[0]
    tasks = {t["code"]: t for t in json.load(open(ATWI_TASKS, encoding="utf-8"))}
    return model, tasks


def episodes_for(bands, by_cs, polys):
    eps = {}
    for acid, pts in by_cs.items():
        inside_prev, t_in = False, None
        for i, (t, lat, lon, alt_ft, gs, hdg) in enumerate(pts):
            inside = in_position(lon, lat, alt_ft, bands, polys)
            if inside and not inside_prev:
                t_in = t
            if inside_prev and not inside:
                censored = (t_in == pts[0][0])
                eps.setdefault(acid, []).append((t_in, pts[i - 1][0], censored))
            inside_prev = inside
        if inside_prev and t_in is not None:
            censored = (t_in == pts[0][0])
            eps.setdefault(acid, []).append((t_in, pts[-1][0], censored))
    return eps


def analyze_position(pos_name, bands, by_cs, polys, model, tasks, t_end, episodes, cross_in_window):
    n_windows = int(math.ceil(t_end / WINDOW_SEC))
    coeffs = model["coefficients"]
    atco_on_pos = max(1, int(model.get("atcoOnPosition", 1)))
    avail_sec_hr = max(1, int(model.get("availableSecondsPerAtcoPerHour", 3600)))
    thresholds = model.get("thresholds", {})

    timeseries = []
    overall_counts = {}

    for w in range(n_windows):
        w_start, w_end = w * WINDOW_SEC, min((w + 1) * WINDOW_SEC, t_end)
        dur = max(1.0, w_end - w_start)

        active = set()
        handoff_count = 0
        vector_count = alt_change_count = speed_count = 0
        window_points_by_acid = {}

        for acid, pts in by_cs.items():
            w_pts = [p for p in pts if w_start <= p[0] < w_end and in_position(p[2], p[1], p[3], bands, polys)]
            if not w_pts:
                continue
            active.add(acid)
            window_points_by_acid[acid] = w_pts
            first, last = w_pts[0], w_pts[-1]
            if hdg_diff(first[5], last[5]) > HDG_CHANGE_DEG:
                vector_count += 1
            if abs(last[3] - first[3]) > ALT_CHANGE_FT:
                alt_change_count += 1
            if abs(last[4] - first[4]) > SPD_CHANGE_KT:
                speed_count += 1

        for acid, eps in episodes.items():
            for (t_in, t_out, censored) in eps:
                if w_start <= t_in < w_end and not censored:
                    handoff_count += 1

        conflict_events, critical_events = set(), set()
        sample_times = [w_start + k * 30.0 for k in range(int(dur // 30.0) + 1)]
        for st in sample_times:
            positions = {}
            for acid, w_pts in window_points_by_acid.items():
                nearest = min(w_pts, key=lambda p: abs(p[0] - st))
                if abs(nearest[0] - st) <= 15.0:
                    positions[acid] = nearest
            acids = list(positions.keys())
            for i in range(len(acids)):
                for j in range(i + 1, len(acids)):
                    a, b = positions[acids[i]], positions[acids[j]]
                    lat_nm = haversine_nm(a[1], a[2], b[1], b[2])
                    vert_ft = abs(a[3] - b[3])
                    if lat_nm < LATERAL_MIN_NM and vert_ft < VERTICAL_MIN_FT:
                        conflict_events.add((round(st), tuple(sorted((acids[i], acids[j])))))
                        if lat_nm < LATERAL_CRIT_NM and vert_ft < VERTICAL_CRIT_FT:
                            critical_events.add((round(st), tuple(sorted((acids[i], acids[j])))))

        cross_cnt = cross_in_window(pos_name, w_start, w_end)

        counts = {
            "SURV_SCAN": len(active), "TRAFFIC_COUNT_MONITOR": len(active),
            "CONFLICT_CHECK": len(conflict_events), "STCA_RESPONSE": len(critical_events),
            "VECTOR_OR_DIRECT": vector_count, "ALTITUDE_CHANGE": alt_change_count,
            "SPEED_CONTROL": speed_count, "HANDOFF_COORD": handoff_count,
            "CROSS_SECTOR_COORD": cross_cnt,
            "RUNWAY_SEQUENCE": 0, "WEATHER_DEVIATION": 0, "MILITARY_COORD": 0,
            "SYSTEM_DEGRADED": 0, "AIRPORT_SURFACE_FEEDBACK": 0,
        }
        for code, c in counts.items():
            overall_counts[code] = overall_counts.get(code, 0) + c

        complexity_factor = min(3.0, len(active) / 10.0)
        load_sec, breakdown = 0.0, []
        for code, count in counts.items():
            if code not in tasks or count == 0:
                continue
            base = tasks[code]["baseEffortSec"]
            localized = base * (1.0 + coeffs.get("complexityCoeff", 0.15) * complexity_factor
                                 + coeffs.get("coordinationCoeff", 0.12) * (1.0 if counts["HANDOFF_COORD"] > 0 else 0.0))
            sec = localized * count
            load_sec += sec
            breakdown.append({"taskCode": code, "count": count, "totalSeconds": round(sec, 1)})

        capacity_sec = (dur / 3600.0) * atco_on_pos * avail_sec_hr
        atwi_pct = round(min(150.0, max(0.0, (load_sec / capacity_sec) * 100)), 2) if capacity_sec > 0 else 0.0
        band = "normal"
        if atwi_pct >= thresholds.get("highMax", 90):
            band = "critical"
        elif atwi_pct >= thresholds.get("watchMax", 75):
            band = "high"
        elif atwi_pct >= thresholds.get("normalMax", 60):
            band = "watch"

        timeseries.append({
            "windowIndex": w, "startTime": w_start, "endTime": w_end,
            "activeAircraftCount": len(active), "taskCounts": counts,
            "taskBreakdown": breakdown, "totalLoadSec": round(load_sec, 1),
            "capacitySec": round(capacity_sec, 1), "atwiPercent": atwi_pct, "band": band,
        })

    overall_load = sum(w["totalLoadSec"] for w in timeseries)
    overall_capacity = sum(w["capacitySec"] for w in timeseries)
    overall_atwi = round(min(150.0, max(0.0, overall_load / overall_capacity * 100)), 2) if overall_capacity > 0 else 0.0
    overall_band = "normal"
    if overall_atwi >= thresholds.get("highMax", 90):
        overall_band = "critical"
    elif overall_atwi >= thresholds.get("watchMax", 75):
        overall_band = "high"
    elif overall_atwi >= thresholds.get("normalMax", 60):
        overall_band = "watch"
    peak = max(timeseries, key=lambda w: w["atwiPercent"]) if timeseries else None

    return {
        "position": pos_name, "overallAtwiPercent": overall_atwi, "overallBand": overall_band,
        "overallTaskCounts": overall_counts, "peakWindow": peak, "timeseries": timeseries,
    }


def main():
    polys = load_polygons()
    by_cs = load_tracks()
    model, tasks = load_atwi_config()
    t_end = max(p[0] for pts in by_cs.values() for p in pts)

    episodes_by_pos = {name: episodes_for(bands, by_cs, polys) for name, bands in POSITIONS.items()}

    # Cross-position coordination: cung tau, thoat 1 vi tri roi vao vi tri
    # khac trong <=120s -- tinh cho MOI cap trong 4 vi tri.
    all_events = []  # (acid, t_exit, from_pos, to_pos)
    for acid in set().union(*[set(e) for e in episodes_by_pos.values()]):
        acid_eps = []
        for pos_name, eps in episodes_by_pos.items():
            for (t_in, t_out, censored) in eps.get(acid, []):
                acid_eps.append((pos_name, t_in, t_out))
        acid_eps.sort(key=lambda e: e[1])
        for i in range(len(acid_eps) - 1):
            cur, nxt = acid_eps[i], acid_eps[i + 1]
            if cur[0] != nxt[0] and 0 <= (nxt[1] - cur[2]) <= 120:
                all_events.append((acid, cur[2], cur[0], nxt[0]))

    def cross_in_window(pos_name, w_start, w_end):
        return sum(1 for (acid, t, frm, to) in all_events if frm == pos_name and w_start <= t < w_end)

    results = {}
    for name, bands in POSITIONS.items():
        results[name] = analyze_position(name, bands, by_cs, polys, model, tasks, t_end, episodes_by_pos[name], cross_in_window)

    out = HERE / "sector_atwi_result_new.json"
    json.dump(results, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("Da ghi", out)
    print("\nTong cross-position coordination events:", len(all_events))
    for name, res in results.items():
        print(f"\n=== {name} ===")
        print("  Overall ATWI%:", res["overallAtwiPercent"], res["overallBand"])
        pw = res["peakWindow"]
        print(f"  Peak window: t={pw['startTime']:.0f}-{pw['endTime']:.0f}s, ATWI%={pw['atwiPercent']}, aircraft={pw['activeAircraftCount']}")
        print("  Overall task counts:", res["overallTaskCounts"])


if __name__ == "__main__":
    main()
