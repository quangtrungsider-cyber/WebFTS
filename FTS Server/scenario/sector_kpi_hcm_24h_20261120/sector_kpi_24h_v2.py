"""
Phan tich KPI 24h (ban v2 - sua loi phuong phap cua ban v1).

LOI PHUONG PHAP DA SUA (quan trong):
  Ban v1 (sector_kpi_24h.py) dem "aircraft_count" moi gio = SO TAU KHAC NHAU
  xuat hien trong gio do, roi ghi nhan la "dinh/gio". Day la LUU LUONG THONG
  QUA (throughput), KHONG phai so tau DONG THOI. Trong khi do bao cao khung
  20 phut truoc (sector_kpi_analyzer.py) lai dung "peak" = so tau DONG THOI
  tuc thoi (max instantaneous occupancy). Hai con so do luong hai dai luong
  KHAC HAN nhau nhung deu duoc goi la "dinh" -> khong the so sanh, va de
  hieu nham 64 tau/gio thanh 64 tau cung luc tren 1 vi tri kiem soat.

  Ban v2 tinh RO RANG CA HAI, bang phuong phap CHINH XAC (sweep-line tren
  khoang thoi gian vao/ra, khong lay mau xap xi):
    - throughput_hour : so tau khac nhau di qua trong gio (nang luc thong qua)
    - peak_simultaneous : so tau CUNG LUC nhieu nhat (tai nghiep vu tuc thoi)
    - mean_occupancy : so tau trung binh co mat (tich phan thoi gian / 3600)
                       = "aircraft-hours per hour", chi so tai chuan cua sector

CAC CAI TIEN KHAC SO VOI v1:
  - Chia gio theo moc GIO UTC THAT (08:00, 09:00...) thay vi theo moc mau dau
    tien (08:25) -> doc duoc, doi chieu duoc voi lich khai thac. Hai gio dau/
    cuoi bi cat cut duoc DANH DAU partial va LOAI khoi viec xac dinh dinh.
  - Dwell time bao cao ca trung vi va bach phan vi 95 (khong chi trung binh --
    trung binh bi keo lech boi vai chuyen bay chang dai).
  - Dem so lan VAO sector (handoff vao) rieng - chi so phoi hop chuyen giao.
  - Loc so bo theo bounding box cua 6 polygon truoc khi kiem tra point-in-
    polygon: gia nguyen DO CHINH XAC (diem ngoai bbox chac chan ngoai polygon)
    nhung nhanh hon nhieu lan. Loc theo CALLSIGN (giu tron ven chuoi mau cua
    may bay nao tung vao bbox), KHONG loc theo tung diem -- neu loc theo diem
    se lam mat moc "ra khoi sector" va noi nham 2 lan vao thanh 1.

Nguon du lieu: nhu v1 (ASTERIX Cat062 that, cat062_20nov26.pcap da giai ma).
"""
import csv
import json
import re
import statistics
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
OUT_JSON = HERE / "sector_kpi_24h_result_v2.json"

TRK_FALLBACK_SPLIT_GAP_S = 1200.0
BBOX_MARGIN_DEG = 0.5


def parse_alt_range_old(name):
    m = re.search(r"<=FL(\d+)$", name)
    if m:
        return (0, int(m.group(1)) * 100)
    m = re.search(r"FL(\d+)-FL(\d+)$", name)
    if m:
        return (int(m.group(1)) * 100, int(m.group(2)) * 100)
    return None


def load_positions():
    """Tra ve dict: ten vi tri -> list (poly_prepared, alt_lo_ft, alt_hi_ft)."""
    positions = {}

    d = json.load(open(OLD_GEOJSON, encoding="utf-8"))
    for key in ("HCM ACC Sector 1", "HCM ACC Sector 5"):
        bands = []
        for feat in d["features"]:
            name = feat["properties"]["name"]
            if name.startswith(key):
                lo, hi = parse_alt_range_old(name)
                bands.append((prep(Polygon(feat["geometry"]["coordinates"][0])), lo, hi))
        positions[key] = bands

    d2 = json.load(open(NEW_GEOJSON, encoding="utf-8"))
    rings = {f["properties"]["id"]: f["geometry"]["coordinates"][0]
             for f in d2["features"] if f["properties"]["id"].startswith(("PK1NEW_", "PK5NEW_"))}
    positions["PK1A New"] = [(prep(Polygon(rings["PK1NEW_1A"])), 0, 46000)]
    positions["PK1B New"] = [(prep(Polygon(rings["PK1NEW_1B1"])), 0, 46000),
                             (prep(Polygon(rings["PK1NEW_1B2"])), 0, 26500)]
    positions["PK5A New"] = [(prep(Polygon(rings["PK5NEW_5A1"])), 0, 46000),
                             (prep(Polygon(rings["PK5NEW_5A2"])), 26500, 46000),
                             (prep(Polygon(rings["PK5NEW_5A3"])), 30500, 46000)]
    positions["PK5B New"] = [(prep(Polygon(rings["PK5NEW_5B"])), 0, 46000)]
    return positions


def compute_bbox():
    """Bounding box bao tron 6 polygon (de loc so bo, co le an toan)."""
    lats, lons = [], []
    d = json.load(open(OLD_GEOJSON, encoding="utf-8"))
    for feat in d["features"]:
        if feat["properties"]["name"].startswith(("HCM ACC Sector 1", "HCM ACC Sector 5")):
            for lon, lat in feat["geometry"]["coordinates"][0]:
                lats.append(lat); lons.append(lon)
    d2 = json.load(open(NEW_GEOJSON, encoding="utf-8"))
    for feat in d2["features"]:
        if feat["properties"]["id"].startswith(("PK1NEW_", "PK5NEW_")):
            for lon, lat in feat["geometry"]["coordinates"][0]:
                lats.append(lat); lons.append(lon)
    return (min(lats) - BBOX_MARGIN_DEG, max(lats) + BBOX_MARGIN_DEG,
            min(lons) - BBOX_MARGIN_DEG, max(lons) + BBOX_MARGIN_DEG)


def load_tracks(bbox):
    """Hai luot: (1) tim callsign tung vao bbox; (2) nap TRON VEN chuoi mau
    cua nhung callsign do. Loc theo callsign chu khong theo diem de khong lam
    mat moc ra/vao sector."""
    lat_lo, lat_hi, lon_lo, lon_hi = bbox

    touching = set()
    with open(TRACK_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                lat = float(row["lat"]); lon = float(row["lon"])
            except ValueError:
                continue
            if lat_lo <= lat <= lat_hi and lon_lo <= lon <= lon_hi:
                touching.add(row["callsign"])
    print(f"  callsign tung vao bounding box: {len(touching)}")

    raw = defaultdict(list)
    with open(TRACK_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            cs = row["callsign"]
            if cs not in touching:
                continue
            try:
                lat = float(row["lat"]); lon = float(row["lon"])
                if not row["flight_level"]:
                    continue
                alt = float(row["flight_level"]) * 100.0
            except ValueError:
                continue
            t = datetime.fromisoformat(row["received_at_utc"]).timestamp()
            raw[cs].append((t, lat, lon, alt))

    by_cs = {}
    for cs, pts in raw.items():
        pts.sort(key=lambda r: r[0])
        if not cs.startswith("TRK"):
            by_cs[cs] = pts
            continue
        seg, idx = [], 0
        for p in pts:
            if seg and (p[0] - seg[-1][0]) > TRK_FALLBACK_SPLIT_GAP_S:
                by_cs[f"{cs}_seg{idx}"] = seg
                idx += 1
                seg = []
            seg.append(p)
        if seg:
            by_cs[f"{cs}_seg{idx}"] = seg
    print(f"  so 'track' sau khi tach ma so tai su dung: {len(by_cs)}")
    return by_cs


def inside(lon, lat, alt, bands):
    pt = Point(lon, lat)
    for poly, lo, hi in bands:
        if lo <= alt <= hi and poly.contains(pt):
            return True
    return False


def build_intervals(bands, by_cs):
    """Tra ve list (t_in, t_out, acid, observed_entry) - khoang thoi gian may
    bay nam trong vi tri. observed_entry=False nghia la may bay da o trong
    ngay tu mau dau tien (khong quan sat duoc luc vao -> khong tinh handoff)."""
    intervals = []
    for acid, pts in by_cs.items():
        prev_in = False
        t_in = None
        for i, (t, lat, lon, alt) in enumerate(pts):
            now_in = inside(lon, lat, alt, bands)
            if now_in and not prev_in:
                t_in = t
            elif prev_in and not now_in:
                intervals.append((t_in, pts[i - 1][0], acid, t_in != pts[0][0]))
            prev_in = now_in
        if prev_in and t_in is not None:
            intervals.append((t_in, pts[-1][0], acid, t_in != pts[0][0]))
    return intervals


def analyze(name, bands, by_cs, hour_bins):
    intervals = build_intervals(bands, by_cs)

    # --- Sweep-line CHINH XAC cho so tau dong thoi ---
    # Su kien: (thoi diem, delta). Xu ly -1 truoc +1 khi trung thoi diem de
    # khong dem nham truong hop 1 tau ra dung luc tau khac vao.
    events = []
    for t_in, t_out, _acid, _obs in intervals:
        events.append((t_in, 1))
        events.append((t_out, -1))
    for h in hour_bins:
        events.append((h, 0))  # diem do tai moc gio (count chi doi tai su kien)
    events.sort(key=lambda e: (e[0], e[1]))

    hour_peak = {h: 0 for h in hour_bins}
    cur = 0
    peak_global, peak_global_t = 0, None
    hour_idx = 0
    for t, delta in events:
        cur += delta
        while hour_idx + 1 < len(hour_bins) and t >= hour_bins[hour_idx + 1]:
            hour_idx += 1
        h = hour_bins[hour_idx]
        if cur > hour_peak[h]:
            hour_peak[h] = cur
        if cur > peak_global:
            peak_global, peak_global_t = cur, t

    # --- Luu luong thong qua + chiem dung trung binh theo gio ---
    hour_through = {h: set() for h in hour_bins}
    hour_occ_sec = {h: 0.0 for h in hour_bins}
    hour_entries = {h: 0 for h in hour_bins}
    for t_in, t_out, acid, observed in intervals:
        for h in hour_bins:
            lo, hi = h, h + 3600
            ov = min(t_out, hi) - max(t_in, lo)
            if ov > 0:
                hour_through[h].add(acid)
                hour_occ_sec[h] += ov
        if observed:
            hb = max([h for h in hour_bins if h <= t_in], default=hour_bins[0])
            hour_entries[hb] += 1

    dwell_by_acid = defaultdict(float)
    for t_in, t_out, acid, _ in intervals:
        dwell_by_acid[acid] += t_out - t_in
    dwells = sorted(dwell_by_acid.values())

    hourly = []
    for h in hour_bins:
        hourly.append({
            "hour_utc": datetime.fromtimestamp(h, tz=timezone.utc).isoformat(),
            "hour_epoch": h,
            "throughput": len(hour_through[h]),
            "peak_simultaneous": hour_peak[h],
            "mean_occupancy": round(hour_occ_sec[h] / 3600.0, 2),
            "entries": hour_entries[h],
        })

    return {
        "position": name,
        "distinct_aircraft": len(dwell_by_acid),
        "total_intervals": len(intervals),
        "observed_entries": sum(1 for i in intervals if i[3]),
        "peak_simultaneous": peak_global,
        "peak_simultaneous_time_utc": datetime.fromtimestamp(peak_global_t, tz=timezone.utc).isoformat() if peak_global_t else None,
        "dwell_mean_s": round(statistics.mean(dwells), 1) if dwells else 0.0,
        "dwell_median_s": round(statistics.median(dwells), 1) if dwells else 0.0,
        "dwell_p95_s": round(dwells[int(len(dwells) * 0.95)], 1) if dwells else 0.0,
        "dwell_max_s": round(max(dwells), 1) if dwells else 0.0,
        "hourly": hourly,
    }


def main():
    bbox = compute_bbox()
    print(f"Bounding box 6 polygon (co le {BBOX_MARGIN_DEG} do): lat {bbox[0]:.2f}..{bbox[1]:.2f}, lon {bbox[2]:.2f}..{bbox[3]:.2f}")
    positions = load_positions()
    by_cs = load_tracks(bbox)

    all_t = [p[0] for pts in by_cs.values() for p in pts]
    t_min, t_max = min(all_t), max(all_t)
    h_first = int(t_min // 3600) * 3600
    h_last = int(t_max // 3600) * 3600
    hour_bins = list(range(h_first, h_last + 3600, 3600))
    print(f"Khung du lieu: {datetime.fromtimestamp(t_min, tz=timezone.utc)} -> {datetime.fromtimestamp(t_max, tz=timezone.utc)}")
    print(f"So gio UTC: {len(hour_bins)} (gio dau va gio cuoi bi cat cut)")

    results = {"_meta": {
        "data_start_utc": datetime.fromtimestamp(t_min, tz=timezone.utc).isoformat(),
        "data_end_utc": datetime.fromtimestamp(t_max, tz=timezone.utc).isoformat(),
        "duration_hours": round((t_max - t_min) / 3600.0, 2),
        "partial_hours_utc": [datetime.fromtimestamp(hour_bins[0], tz=timezone.utc).isoformat(),
                              datetime.fromtimestamp(hour_bins[-1], tz=timezone.utc).isoformat()],
        "tracks_analyzed": len(by_cs),
    }}
    for name, bands in positions.items():
        print(f"  dang tinh {name} ...", flush=True)
        results[name] = analyze(name, bands, by_cs, hour_bins)

    json.dump(results, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\nDa ghi {OUT_JSON}\n")

    print(f"{'Vi tri':<20} {'So tau/24h':>10} {'LL/gio max':>11} {'Dong thoi max':>14} {'Chiem dung TB':>14} {'Dwell TV(ph)':>13}")
    for name in ["HCM ACC Sector 1", "PK1A New", "PK1B New", "HCM ACC Sector 5", "PK5A New", "PK5B New"]:
        r = results[name]
        full = [h for h in r["hourly"][1:-1]]
        max_through = max(h["throughput"] for h in full)
        mean_occ = statistics.mean(h["mean_occupancy"] for h in full)
        print(f"{name:<20} {r['distinct_aircraft']:>10} {max_through:>11} {r['peak_simultaneous']:>14} {mean_occ:>14.1f} {r['dwell_median_s']/60:>13.1f}")


if __name__ == "__main__":
    main()
