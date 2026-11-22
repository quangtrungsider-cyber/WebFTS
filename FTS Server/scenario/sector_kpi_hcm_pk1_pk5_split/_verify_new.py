"""
Kiem chung DOC LAP ket qua sector_kpi_analyzer_new.py va
sector_atwi_analyzer_new.py cho PK1A/PK1B/PK5A/PK5B New.

Doc lai du lieu nguon tu dau, dung thuat toan ray-casting TU VIET (khong
dung shapely, khong tai dung ham cua 2 script tren), giong het phuong phap
da dung cho Sector 1 & Sector 5 cu.
"""
import csv
import json
import math
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
GEOJSON = HERE.parent.parent.parent / "WebATM" / "static" / "data" / "vatm_kmz" / "vatm_acc_fir_sectors.geojson"
RAW_CSV = Path(
    r"C:/Users/trunglq/AppData/Local/Temp/claude/D--Coding-D---n-FTS-WebFTS-v4/"
    r"1c74b732-eedf-40e6-9e64-71071fab81b1/scratchpad/sector_kpi/raw_tracks_window.csv"
)
KPI_RESULT = HERE / "sector_kpi_result_new.json"
ATWI_RESULT = HERE / "sector_atwi_result_new.json"
SIM_T0 = datetime(2026, 6, 5, 7, 20, 0, tzinfo=timezone.utc)

POSITIONS = {
    "PK1A New": [("PK1NEW_1A", 0, 46000)],
    "PK1B New": [("PK1NEW_1B1", 0, 46000), ("PK1NEW_1B2", 0, 26500)],
    "PK5A New": [("PK5NEW_5A1", 0, 46000), ("PK5NEW_5A2", 26500, 46000), ("PK5NEW_5A3", 30500, 46000)],
    "PK5B New": [("PK5NEW_5B", 0, 46000)],
}
LATERAL_MIN_NM, VERTICAL_MIN_FT = 5.0, 1000.0


def ray_cast_point_in_poly(x, y, ring):
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


def load_rings():
    d = json.load(open(GEOJSON, encoding="utf-8"))
    rings = {}
    for feat in d["features"]:
        fid = feat["properties"]["id"]
        if fid.startswith("PK1NEW_") or fid.startswith("PK5NEW_"):
            rings[fid] = feat["geometry"]["coordinates"][0]
    return rings


def in_position(lon, lat, alt_ft, bands, rings):
    return any(lo <= alt_ft <= hi and ray_cast_point_in_poly(lon, lat, rings[fid]) for fid, lo, hi in bands)


def haversine_nm(lat1, lon1, lat2, lon2):
    R = 3440.065
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def load_tracks():
    by_cs = {}
    with open(RAW_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                lat, lon, fl = float(row["lat"]), float(row["lon"]), float(row["flight_level"])
            except (ValueError, KeyError):
                continue
            t = datetime.fromisoformat(row["received_at_utc"].replace("Z", "+00:00"))
            by_cs.setdefault(row["callsign"], []).append(((t - SIM_T0).total_seconds(), lat, lon, fl * 100.0))
    for cs in by_cs:
        by_cs[cs].sort(key=lambda r: r[0])
    return by_cs


def main():
    rings = load_rings()
    by_cs = load_tracks()
    expect_fids = {"PK1NEW_1A", "PK1NEW_1B1", "PK1NEW_1B2", "PK5NEW_5A1", "PK5NEW_5A2", "PK5NEW_5A3", "PK5NEW_5B"}
    missing = expect_fids - set(rings)
    assert not missing, f"THIEU polygon: {missing}"

    kpi_prev = json.load(open(KPI_RESULT, encoding="utf-8"))
    atwi_prev = json.load(open(ATWI_RESULT, encoding="utf-8"))
    errors = []

    print("### 1. Kiem chung distinct_aircraft / peak_count / avg_dwell (KPI) ###")
    for pos_name, bands in POSITIONS.items():
        # Quy uoc moc thoat = THOI DIEM MAU CUOI CUNG CON O TRONG (giong het
        # sector_kpi_analyzer_new.py dung pts[i-1][0], KHONG phai mau dau
        # tien da ra ngoai) -- de so sanh dung "apples-to-apples", tranh bao
        # lech gia do khac quy uoc lam tron bien.
        dwell_total, occ_at_t = {}, {}
        for acid, pts in by_cs.items():
            inside_prev, t_in, total_dwell = False, None, 0.0
            for i, (t, lat, lon, alt_ft) in enumerate(pts):
                inside = in_position(lon, lat, alt_ft, bands, rings)
                if inside:
                    occ_at_t.setdefault(t, set()).add(acid)
                if inside and not inside_prev:
                    t_in = t
                if inside_prev and not inside:
                    total_dwell += pts[i - 1][0] - t_in
                inside_prev = inside
            if inside_prev and t_in is not None:
                total_dwell += pts[-1][0] - t_in
            if total_dwell > 0:
                dwell_total[acid] = total_dwell

        peak_count = max((len(v) for v in occ_at_t.values()), default=0)
        avg_dwell = round(sum(dwell_total.values()) / len(dwell_total), 1) if dwell_total else 0.0
        prev = kpi_prev[pos_name]
        checks = [("distinct_aircraft", len(dwell_total), prev["distinct_aircraft"]),
                  ("peak_count", peak_count, prev["peak_count"]),
                  ("avg_dwell_s", avg_dwell, prev["avg_dwell_s"])]
        print(f"\n  {pos_name}:")
        for field, newv, oldv in checks:
            ok = abs(newv - oldv) < 1e-6 if isinstance(newv, float) else newv == oldv
            print(f"    {field}: doc_lap={newv} analyzer={oldv} -> {'KHOP' if ok else 'LECH!!'}")
            if not ok:
                errors.append((pos_name, field, newv, oldv))

    print("\n### 2. Kiem chung CONFLICT_CHECK = 0 bang vet can moi cap mau that (+-10s) ###")
    for pos_name, bands in POSITIONS.items():
        samples = []
        for acid, pts in by_cs.items():
            for (t, lat, lon, alt_ft) in pts:
                if in_position(lon, lat, alt_ft, bands, rings):
                    samples.append((acid, t, lat, lon, alt_ft))
        samples.sort(key=lambda s: s[1])
        found = 0
        n = len(samples)
        for i in range(n):
            a = samples[i]
            for j in range(i + 1, n):
                b = samples[j]
                if b[1] - a[1] > 10.0:
                    break
                if a[0] == b[0]:
                    continue
                if haversine_nm(a[2], a[3], b[2], b[3]) < LATERAL_MIN_NM and abs(a[4] - b[4]) < VERTICAL_MIN_FT:
                    found += 1
        prev_cnt = atwi_prev[pos_name]["overallTaskCounts"]["CONFLICT_CHECK"]
        print(f"  {pos_name}: doc_lap(exhaustive)={found}  analyzer(sample 30s)={prev_cnt}")
        if found > 0 and prev_cnt == 0:
            errors.append((pos_name, "CONFLICT_CHECK", found, prev_cnt))

    print("\n" + "=" * 50)
    if errors:
        print(f"KIEM CHUNG PHAT HIEN {len(errors)} DIEM LECH:")
        for e in errors:
            print(" ", e)
        return 1
    print("KIEM CHUNG THANH CONG: toan bo so lieu doc lap khop")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
