"""
Chay mo hinh workload ATWI cho DU 24 GIO tren ca 6 vi tri (Sector 1/5 cu va
PK1A/1B/5A/5B moi) -- lap day khoang trong cua ban bao cao truoc (ban truoc
chi chay ATWI cho khung 20 phut, va ghi ro la chua chay duoc cho 24h).

Giu NGUYEN cong thuc/he so/nguong cua mo hinh ATWI san co trong du an
(FTS Server/data/atwi_models.json + atwi_task_index.json), va giu NGUYEN
cua so 5 phut nhu cac lan truoc -- RAT QUAN TRONG: ATWI% rat nhay voi do dai
cua so (dem tau theo cua so tang cham hon nhieu so voi dung luong tang tuyen
tinh theo thoi gian), nen neu doi sang cua so 1 gio thi con so se thap gia
tao va khong the so sanh voi bao cao truoc.

Cac task suy ra tu hanh vi bay that (proxy) giu nguyen nguong nhu truoc:
doi huong >15 do, doi muc bay >500ft, doi toc do >15kt giua dau/cuoi cua so.
Han che cua proxy nay da duoc ghi ro trong bao cao va KHONG thay doi o day.
"""
import bisect
import csv
import json
import math
import re
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import Point, Polygon
from shapely.prepared import prep

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
OLD_GEOJSON = ROOT / "WebATM" / "static" / "data" / "vietnam_acc_sector_boundaries.geojson"
NEW_GEOJSON = ROOT / "WebATM" / "static" / "data" / "vatm_kmz" / "vatm_acc_fir_sectors.geojson"
ATWI_MODELS = ROOT / "FTS Server" / "data" / "atwi_models.json"
ATWI_TASKS = ROOT / "FTS Server" / "data" / "atwi_task_index.json"
TRACK_CSV = Path(
    r"C:/Users/trunglq/AppData/Local/Temp/claude/D--Coding-D---n-FTS-WebFTS-v4/"
    r"1c74b732-eedf-40e6-9e64-71071fab81b1/scratchpad/cat062/tracks_20261120_full.csv"
)
OUT_JSON = HERE / "sector_atwi_24h_result.json"

WINDOW_SEC = 300.0
SNAP_SEC = 30.0
LAT_MIN_NM, VERT_MIN_FT = 5.0, 1000.0
LAT_CRIT_NM, VERT_CRIT_FT = 3.0, 500.0

# --- Tieu chi xac nhan VI PHAM PHAN CACH THAT ---------------------------
# Khao sat truc tiep tren du lieu cho thay neu chi dung nguong hinh hoc
# 5 NM/1000 ft thi phan lon "vi pham" la GIA, do hai nguyen nhan:
#
#  (a) TRACK TRUNG LAP: SDPS phat song song hai track cho cung mot tau bay
#      (mot co callsign, mot chi co so hieu TRK####). Trong PK5B, 99 cap bi
#      gan co nghi van thi 94 cap la dang <CALLSIGN>/<TRK####> cach nhau
#      0.11-4.6 NM nhung chenh cao chi 0-50 ft. Hai tau bay THAT khong the
#      cung muc bay cach nhau 2 NM, lap lai hang chuc lan trong mot ngay.
#
#  (b) SAI SO LUONG TU HOA DO CAO: I062/135 co do phan giai 1/4 FL = 25 ft,
#      va tau bay dao dong quanh muc bay duoc cap. Bon cap DUY NHAT co du
#      dia chi Mode-S cua hai tau KHAC NHAU (AAR735/ABL104, PAL684/PTZNA,
#      CEB5757/CEB746, CKS231/VJC1957) deu chenh 925-975 ft -- tuc chinh la
#      phan cach cao RVSM 1000 ft HOP LE, chi hien thi thieu vai chuc foot.
#
# Vi vay chi dem la vi pham khi THOA MAN DONG THOI:
#   1. Ca hai track deu co dia chi Mode-S (icao24) va HAI dia chi KHAC NHAU
#      -> chung minh day thuc su la hai tau bay rieng biet;
#   2. Cach nhau ngang < 5 NM (ICAO Doc 4444);
#   3. Chenh cao < 900 ft -- tru 100 ft du phong cho sai so luong tu hoa va
#      dao dong muc bay, de khong quy ket nham phan cach RVSM hop le.
# Tieu chi nay co y bao thu (tha bo sot con hon bao dong gia), phu hop voi
# muc dich bao cao: KHONG duoc khang dinh co vi pham phan cach neu chua
# chac chan.
CONFIRM_VERT_FT = 900.0
HDG_CH, ALT_CH, SPD_CH = 15.0, 500.0, 15.0
TRK_SPLIT_GAP_S = 1200.0
BBOX_MARGIN = 0.5
GRID_DEG = 0.1  # ~6 NM, lon hon nguong phan cach 5 NM -> chi can quet 3x3 o


def parse_alt_old(name):
    m = re.search(r"<=FL(\d+)$", name)
    if m:
        return (0, int(m.group(1)) * 100)
    m = re.search(r"FL(\d+)-FL(\d+)$", name)
    return (int(m.group(1)) * 100, int(m.group(2)) * 100) if m else None


def load_positions_and_bbox():
    positions, lats, lons = {}, [], []
    d = json.load(open(OLD_GEOJSON, encoding="utf-8"))
    for key in ("HCM ACC Sector 1", "HCM ACC Sector 5"):
        bands = []
        for feat in d["features"]:
            if feat["properties"]["name"].startswith(key):
                lo, hi = parse_alt_old(feat["properties"]["name"])
                ring = feat["geometry"]["coordinates"][0]
                bands.append((prep(Polygon(ring)), lo, hi))
                for lon, lat in ring:
                    lats.append(lat); lons.append(lon)
        positions[key] = bands
    d2 = json.load(open(NEW_GEOJSON, encoding="utf-8"))
    rings = {f["properties"]["id"]: f["geometry"]["coordinates"][0]
             for f in d2["features"] if f["properties"]["id"].startswith(("PK1NEW_", "PK5NEW_"))}
    for ring in rings.values():
        for lon, lat in ring:
            lats.append(lat); lons.append(lon)
    positions["PK1A New"] = [(prep(Polygon(rings["PK1NEW_1A"])), 0, 46000)]
    positions["PK1B New"] = [(prep(Polygon(rings["PK1NEW_1B1"])), 0, 46000),
                             (prep(Polygon(rings["PK1NEW_1B2"])), 0, 26500)]
    positions["PK5A New"] = [(prep(Polygon(rings["PK5NEW_5A1"])), 0, 46000),
                             (prep(Polygon(rings["PK5NEW_5A2"])), 26500, 46000),
                             (prep(Polygon(rings["PK5NEW_5A3"])), 30500, 46000)]
    positions["PK5B New"] = [(prep(Polygon(rings["PK5NEW_5B"])), 0, 46000)]
    bbox = (min(lats) - BBOX_MARGIN, max(lats) + BBOX_MARGIN,
            min(lons) - BBOX_MARGIN, max(lons) + BBOX_MARGIN)
    return positions, bbox


def load_tracks(bbox):
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
    raw = defaultdict(list)
    with open(TRACK_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            cs = row["callsign"]
            if cs not in touching or not row["flight_level"]:
                continue
            try:
                lat = float(row["lat"]); lon = float(row["lon"])
                alt = float(row["flight_level"]) * 100.0
                gs = float(row["ground_speed_kt"]) if row["ground_speed_kt"] else 0.0
                hdg = float(row["heading_deg"]) if row["heading_deg"] else 0.0
            except ValueError:
                continue
            t = datetime.fromisoformat(row["received_at_utc"]).timestamp()
            raw[cs].append((t, lat, lon, alt, gs, hdg, row.get("icao24", "")))
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


def inside(lon, lat, alt, bands):
    pt = Point(lon, lat)
    return any(lo <= alt <= hi and poly.contains(pt) for poly, lo, hi in bands)


def hav_nm(lat1, lon1, lat2, lon2):
    R = 3440.065
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def hdg_diff(a, b):
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def band(pct, th):
    if pct >= th.get("highMax", 90):
        return "critical"
    if pct >= th.get("watchMax", 75):
        return "high"
    if pct >= th.get("normalMax", 60):
        return "watch"
    return "normal"


def analyze(name, bands, by_cs, t0, t1, model, tasks):
    coeffs = model["coefficients"]
    atco = max(1, int(model.get("atcoOnPosition", 1)))
    avail = max(1, int(model.get("availableSecondsPerAtcoPerHour", 3600)))
    th = model.get("thresholds", {})

    # Buoc 1: loc ra cac mau NAM TRONG vi tri, va dung khoang vao/ra
    in_samples = {}   # acid -> list (t, lat, lon, alt, gs, hdg, icao24)
    entries = []      # thoi diem vao QUAN SAT DUOC
    for acid, pts in by_cs.items():
        keep, prev_in, t_in = [], False, None
        for i, p in enumerate(pts):
            t, lat, lon, alt, gs, hdg, _icao = p
            now_in = inside(lon, lat, alt, bands)
            if now_in:
                keep.append(p)
            if now_in and not prev_in:
                t_in = t
                if t_in != pts[0][0]:
                    entries.append(t_in)
            prev_in = now_in
        if keep:
            in_samples[acid] = keep
    times_index = {a: [p[0] for p in v] for a, v in in_samples.items()}
    entries.sort()

    n_win = int(math.ceil((t1 - t0) / WINDOW_SEC))
    windows = []
    for w in range(n_win):
        ws, we = t0 + w * WINDOW_SEC, min(t0 + (w + 1) * WINDOW_SEC, t1)
        dur = max(1.0, we - ws)

        active, vec, altc, spdc = set(), 0, 0, 0
        win_pts = {}
        for acid, pts in in_samples.items():
            ts = times_index[acid]
            lo = bisect.bisect_left(ts, ws)
            hi = bisect.bisect_left(ts, we)
            if lo >= hi:
                continue
            seg = pts[lo:hi]
            active.add(acid)
            win_pts[acid] = seg
            f, l = seg[0], seg[-1]
            if hdg_diff(f[5], l[5]) > HDG_CH:
                vec += 1
            if abs(l[3] - f[3]) > ALT_CH:
                altc += 1
            if abs(l[4] - f[4]) > SPD_CH:
                spdc += 1

        n_entry = bisect.bisect_left(entries, we) - bisect.bisect_left(entries, ws)

        # Kiem tra phan cach: lay anh chup moi 30s, bam o luoi 0.1 do roi chi
        # so sanh cac cap trong 3x3 o lan can (tuong duong vet can vi o luoi
        # rong hon nguong 5 NM)
        confl, crit, dup_excluded = set(), set(), set()
        n_snap = int(dur // SNAP_SEC) + 1
        for k in range(n_snap):
            st = ws + k * SNAP_SEC
            grid = defaultdict(list)
            for acid, seg in win_pts.items():
                near = min(seg, key=lambda p: abs(p[0] - st))
                if abs(near[0] - st) > 15.0:
                    continue
                grid[(int(near[1] / GRID_DEG), int(near[2] / GRID_DEG))].append((acid, near))
            for (gy, gx), items in grid.items():
                cand = []
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        cand.extend(grid.get((gy + dy, gx + dx), []))
                for i in range(len(items)):
                    a_id, a = items[i]
                    for b_id, b in cand:
                        if b_id <= a_id:
                            continue
                        dnm = hav_nm(a[1], a[2], b[1], b[2])
                        dft = abs(a[3] - b[3])
                        if dnm >= LAT_MIN_NM or dft >= VERT_MIN_FT:
                            continue
                        # Chi xac nhan khi chung minh duoc la HAI tau bay
                        # khac nhau VA chenh cao duoi nguong RVSM co du phong
                        two_distinct = bool(a[6]) and bool(b[6]) and a[6] != b[6]
                        if not two_distinct or dft >= CONFIRM_VERT_FT:
                            dup_excluded.add((round(st), a_id, b_id))
                            continue
                        confl.add((round(st), a_id, b_id))
                        if dnm < LAT_CRIT_NM and dft < VERT_CRIT_FT:
                            crit.add((round(st), a_id, b_id))

        counts = {
            "SURV_SCAN": len(active), "TRAFFIC_COUNT_MONITOR": len(active),
            "CONFLICT_CHECK": len(confl), "STCA_RESPONSE": len(crit),
            "VECTOR_OR_DIRECT": vec, "ALTITUDE_CHANGE": altc,
            "SPEED_CONTROL": spdc, "HANDOFF_COORD": n_entry,
        }
        cx = min(3.0, len(active) / 10.0)
        load = 0.0
        for code, cnt in counts.items():
            if code not in tasks or cnt == 0:
                continue
            base = tasks[code]["baseEffortSec"]
            loc = base * (1.0 + coeffs.get("complexityCoeff", 0.15) * cx
                          + coeffs.get("coordinationCoeff", 0.12) * (1.0 if n_entry > 0 else 0.0))
            load += loc * cnt
        cap = (dur / 3600.0) * atco * avail
        pct = round(min(150.0, max(0.0, load / cap * 100)), 2) if cap > 0 else 0.0
        windows.append({"start": ws, "end": we, "active": len(active),
                        "counts": counts, "loadSec": round(load, 1),
                        "dupExcluded": len(dup_excluded),
                        "atwiPercent": pct, "band": band(pct, th)})

    vals = [w["atwiPercent"] for w in windows]
    tot_load = sum(w["loadSec"] for w in windows)
    tot_cap = sum((w["end"] - w["start"]) / 3600.0 * atco * avail for w in windows)
    overall = round(min(150.0, max(0.0, tot_load / tot_cap * 100)), 2) if tot_cap else 0.0
    bands_count = defaultdict(int)
    for w in windows:
        bands_count[w["band"]] += 1
    peak_w = max(windows, key=lambda w: w["atwiPercent"])

    hourly = defaultdict(list)
    for w in windows:
        hourly[int(w["start"] // 3600) * 3600].append(w["atwiPercent"])
    hourly_out = [{"hour_utc": datetime.fromtimestamp(h, tz=timezone.utc).isoformat(),
                   "hour_epoch": h,
                   "atwi_mean": round(statistics.mean(v), 1),
                   "atwi_max": round(max(v), 1)} for h, v in sorted(hourly.items())]

    return {
        "position": name,
        "overallAtwiPercent": overall,
        "overallBand": band(overall, th),
        "medianWindowAtwi": round(statistics.median(vals), 1),
        "p95WindowAtwi": round(sorted(vals)[int(len(vals) * 0.95)], 1),
        "peakWindowAtwi": peak_w["atwiPercent"],
        "peakWindowTimeUtc": datetime.fromtimestamp(peak_w["start"], tz=timezone.utc).isoformat(),
        "peakWindowActive": peak_w["active"],
        "bandWindowCounts": dict(bands_count),
        "totalWindows": len(windows),
        "totalConflicts": sum(w["counts"]["CONFLICT_CHECK"] for w in windows),
        "totalStca": sum(w["counts"]["STCA_RESPONSE"] for w in windows),
        "totalDuplicateTrackPairsExcluded": sum(w["dupExcluded"] for w in windows),
        "totalHandoffs": sum(w["counts"]["HANDOFF_COORD"] for w in windows),
        "hourly": hourly_out,
    }


def main():
    positions, bbox = load_positions_and_bbox()
    print(f"Bbox: lat {bbox[0]:.2f}..{bbox[1]:.2f}, lon {bbox[2]:.2f}..{bbox[3]:.2f}")
    by_cs = load_tracks(bbox)
    print(f"So track phan tich: {len(by_cs)}")
    model = json.load(open(ATWI_MODELS, encoding="utf-8"))[0]
    tasks = {t["code"]: t for t in json.load(open(ATWI_TASKS, encoding="utf-8"))}
    print(f"Mo hinh ATWI: {model['name']} (v{model['metadata']['version']}, approvedForKpi={model['metadata']['approvedForKpi']})")

    all_t = [p[0] for pts in by_cs.values() for p in pts]
    t0 = int(min(all_t) // 3600) * 3600
    t1 = max(all_t)

    results = {}
    for name, bands in positions.items():
        print(f"  dang tinh ATWI 24h cho {name} ...", flush=True)
        results[name] = analyze(name, bands, by_cs, t0, t1, model, tasks)

    json.dump(results, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\nDa ghi {OUT_JSON}\n")
    print(f"{'Vi tri':<20} {'ATWI tong':>10} {'Trung vi':>9} {'P95':>7} {'Dinh':>7} {'Cua so qua tai':>15}")
    for n in ["HCM ACC Sector 1", "PK1A New", "PK1B New", "HCM ACC Sector 5", "PK5A New", "PK5B New"]:
        r = results[n]
        crit = r["bandWindowCounts"].get("critical", 0)
        print(f"{n:<20} {r['overallAtwiPercent']:>9.1f}% {r['medianWindowAtwi']:>8.1f}% {r['p95WindowAtwi']:>6.1f}% {r['peakWindowAtwi']:>6.1f}% {crit:>6}/{r['totalWindows']}")


if __name__ == "__main__":
    main()
