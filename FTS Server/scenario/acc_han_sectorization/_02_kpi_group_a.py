"""
Tinh KPI Nhom A (KPI_ACC_HAN.md muc 2) cho ba phuong an phan tang PK2
(PA1=FL285, PA2=FL245, PA3=FL265), tu du lieu quy dao that 05/06/2026
(han_tracks_20260605.csv, sinh boi _01_extract_tracks.py).

Phuong phap do giong het sector_kpi_24h_v2.py da dung cho ACC HCM PK1/PK5
(sweep-line cho so dong thoi dinh, loc "cham mep" duoi 30s khoi thoi gian
luu lai phan khu) -- tranh dung lai loi do sai chi so (dinh/gio thay vi
dong thoi) tung mac phai o ban dau cua phan tich HCM ACC.

A1 -- can bang khoi luong cong viec 2L/2U: so dong thoi dinh, so lan vao/gio.
A2 -- thoi gian trong moi tang: trung binh va ty le duoi 3 phut.
A3 -- so lan chuyen giao 2L<->2U (TANG THEM so voi hien trang, vi PK2 hien
      tai la MOT phan khu nen so lan chuyen giao noi bo hien tai = 0).
A4 -- bay bang tam quanh muc phan tang: dem cac doan |alt - split| <= 1000ft
      duy tri >= 60s voi toc do doi cao gan 0, tren moi 100 chuyen PK2.
A5 -- kiem tra thuc nghiem: cac muc FL245/265/285 co duoc dung lam muc bay
      bang dai han (>= 5 phut lien tuc) trong du lieu that hay khong (de
      doi chieu voi khang dinh cua de cuong rang day khong phai muc bay
      bang RVSM).

PK1/PK3/PK4 duoc tach o FL285 co dinh trong ca ba phuong an (muc 4.2.2 de
cuong) nen chi tinh MOT LAN de lam boi canh so sanh do lon, khong phai muc
tieu quyet dinh.

QUAN TRONG: day la du lieu MOT NGAY (05/06/2026), khong phai khung
15/4-15/5/2026 ma KPI_ACC_HAN.md dan chieu lam moc chinh thuc -- ket qua la
so sanh minh hoa giua ba phuong an tren cung mot nguon du lieu, khong phai
con so trinh duyet chinh thuc.
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
TRACKS_CSV = HERE / "han_tracks_20260605.csv"
RULES = json.load(open(HERE / "pa_rules.json", encoding="utf-8"))

TOUCH_FILTER_S = RULES["kpi_group_a_thresholds"]["A2_touch_filter_s"]
TRK_SPLIT_GAP_S = 1200.0  # an toan: tach lai neu mot callsign co khoang trong > 20 phut
LEVEL_BAND_FT = 1000.0
LEVEL_MIN_DUR_S = 60.0
LEVEL_VS_THRESH_FPM = 150.0  # |toc do doi cao| duoi nguong nay coi la "bay bang"
MIN_DT_S = 1.0
# Du lieu nguon co nhieu cap diem gan nhu trung timestamp (sai khac vai
# micro giay) cho CUNG mot tau bay voi do cao khac nhau vai chuc ft -- dac
# trung cua ADS-B nhieu tram thu nhan trung mot ban tin nhung giai ma lech
# nhau chut it. Neu khong chan, (alt1-alt0)/(dt/60) voi dt~1e-6s cho ra toc
# do doi cao hang ty ft/min va lam sai lac hoan toan phan loai "bay bang".
# Da xac nhan A1/A3 (chi dung thoi diem vao/ra, khong dung dt) KHONG bi anh
# huong boi loi nay (kiem chung doc lap _05 khop tuyet doi).

PA_SPLITS = RULES["pk2_split_fl_by_scenario"]
FIXED = RULES["fixed_split_fl"]


def parse_ts(s: str) -> float:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def load_tracks():
    """Nap toan bo diem, nhom theo callsign, tach doan neu khoang trong qua lon."""
    raw = defaultdict(list)
    with open(TRACKS_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            t = parse_ts(row["received_at_utc"])
            raw[row["callsign"]].append((
                t, float(row["lat"]), float(row["lon"]),
                float(row["alt_ft"]), float(row["gs_kt"]), float(row["heading_deg"]),
                row["sector"],
            ))
    by_cs = {}
    for cs, pts in raw.items():
        pts.sort(key=lambda r: r[0])
        seg, idx = [], 0
        for p in pts:
            if seg and (p[0] - seg[-1][0]) > TRK_SPLIT_GAP_S:
                by_cs[f"{cs}__{idx}"] = seg
                idx += 1
                seg = []
            seg.append(p)
        if seg:
            by_cs[f"{cs}__{idx}"] = seg
    return by_cs


def label_point(sector, alt_ft, split_fl_by_sector):
    """Tra ve nhan phan khu con (vd '2L','2U') hoac None neu ngoai vung quan tam."""
    if sector not in split_fl_by_sector:
        return None
    split_ft = split_fl_by_sector[sector] * 100.0
    layer = "L" if alt_ft < split_ft else "U"
    return f"{sector[-1]}{layer}"  # 'PK2' -> '2L'/'2U'


def build_visits(by_cs, split_fl_by_sector):
    """Voi moi callsign, quet theo thoi gian va cat thanh cac 'visit' lien tuc
    trong cung mot nhan phan khu con. Tra ve list (label, t_in, t_out, acid,
    censored_in, censored_out, n_pts)."""
    visits = []
    for acid, pts in by_cs.items():
        cur_label = None
        cur_t0 = None
        cur_t_prev = None
        cur_n = 0
        first_t = pts[0][0]
        last_t = pts[-1][0]
        for t, lat, lon, alt, gs, hdg, sector in pts:
            lbl = label_point(sector, alt, split_fl_by_sector)
            if lbl != cur_label:
                if cur_label is not None:
                    visits.append([
                        cur_label, cur_t0, cur_t_prev, acid,
                        cur_t0 == first_t, cur_t_prev == last_t, cur_n,
                    ])
                cur_label = lbl
                cur_t0 = t
                cur_n = 0
            cur_t_prev = t
            cur_n += 1
        if cur_label is not None:
            visits.append([
                cur_label, cur_t0, cur_t_prev, acid,
                cur_t0 == first_t, cur_t_prev == last_t, cur_n,
            ])
    return visits


def sweep_peak_and_mean(intervals, t_lo, t_hi):
    """Sweep-line: tra ve (dinh dong thoi, so dong thoi trung binh theo thoi gian)."""
    events = []
    for t0, t1 in intervals:
        events.append((t0, 1))
        events.append((t1, -1))
    events.sort()
    cur = 0
    peak = 0
    area = 0.0
    prev_t = t_lo
    for t, delta in events:
        area += cur * max(0.0, t - prev_t)
        cur += delta
        peak = max(peak, cur)
        prev_t = t
    area += cur * max(0.0, t_hi - prev_t)
    mean_occ = area / max(1.0, (t_hi - t_lo))
    return peak, mean_occ


def entries_per_hour(intervals, t_lo, t_hi):
    hours = defaultdict(int)
    for t0, _ in intervals:
        h = int((t0 - t_lo) // 3600)
        hours[h] += 1
    if not hours:
        return 0, 0.0
    peak_h = max(hours.values())
    mean_h = sum(hours.values()) / max(1, (int((t_hi - t_lo) // 3600) + 1))
    return peak_h, mean_h


def dwell_stats(durations):
    if not durations:
        return {"n": 0, "mean_s": 0.0, "median_s": 0.0, "pct_under_3min": 0.0}
    durations = sorted(durations)
    n = len(durations)
    mean_s = sum(durations) / n
    median_s = durations[n // 2]
    pct_under = sum(1 for d in durations if d < 180.0) / n
    return {"n": n, "mean_s": mean_s, "median_s": median_s, "pct_under_3min": pct_under}


def kpi_for_sector_pair(visits, labels, t_lo, t_hi):
    """labels: ('2L','2U'). Tra ve dict KPI A1/A2 cho tung tang."""
    out = {}
    for lbl in labels:
        lbl_visits = [v for v in visits if v[0] == lbl]
        # Loc "cham mep" (<30s) KHONG tinh vao dwell time, nhung VAN tinh
        # vao so dong thoi (mot tau bay cham mep van chiem cho tai thoi
        # diem do).
        intervals = [(v[1], v[2]) for v in lbl_visits]
        peak, mean_occ = sweep_peak_and_mean(intervals, t_lo, t_hi)
        peak_entries_h, mean_entries_h = entries_per_hour(intervals, t_lo, t_hi)

        real_durations = [
            v[2] - v[1] for v in lbl_visits
            if (v[2] - v[1]) >= TOUCH_FILTER_S or (v[4] or v[5])
            # giu lai neu dai hon nguong cham mep, HOAC neu la mot dau bi
            # cat (censored) boi mep du lieu (khong phai tau bay cham mep
            # that su, ma la du lieu bi cat dau/cuoi ngay)
        ]
        dwell = dwell_stats(real_durations)
        out[lbl] = {
            "n_visits": len(lbl_visits),
            "n_distinct_aircraft": len({v[3].split("__")[0] for v in lbl_visits}),
            "peak_simultaneous": peak,
            "mean_simultaneous": round(mean_occ, 2),
            "peak_entries_per_hour": peak_entries_h,
            "mean_entries_per_hour": round(mean_entries_h, 2),
            "dwell": {k: (round(v, 1) if isinstance(v, float) else v) for k, v in dwell.items()},
        }
    return out


def handoffs_between(visits, label_a, label_b):
    """So lan chuyen giao truc tiep A<->B: hai 'visit' lien tiep cua CUNG MOT
    tau bay, nhan khac nhau giua {label_a,label_b}, khong co nhan nao khac
    xen giua (vi build_visits da nhom theo thu tu thoi gian cho tung acid
    nen hai visit lien tiep trong list cung acid la hai lan doi nhan lien
    tiep that su)."""
    by_acid = defaultdict(list)
    for v in visits:
        by_acid[v[3]].append(v)
    count = 0
    examples = []
    for acid, vs in by_acid.items():
        vs = sorted(vs, key=lambda v: v[1])
        for i in range(1, len(vs)):
            a, b = vs[i - 1][0], vs[i][0]
            if {a, b} == {label_a, label_b}:
                count += 1
                if len(examples) < 3:
                    examples.append((acid, a, b, vs[i - 1][2], vs[i][1]))
    return count, examples


def level_off_near_split(by_cs, sector, split_fl, t_lo, t_hi):
    """A4: dem so doan 'bay bang tam' trong dai +-1000ft quanh muc phan tang,
    duy tri >= LEVEL_MIN_DUR_S, cho cac tau bay dang trong qua trinh doi do
    cao (khong phai dang bay bang on dinh tu truoc). Tra ve (so doan, so
    chuyen PK2 trong khung thoi gian, so doan / 100 chuyen)."""
    split_ft = split_fl * 100.0
    lo_ft, hi_ft = split_ft - LEVEL_BAND_FT, split_ft + LEVEL_BAND_FT
    n_level_segments = 0
    n_flights_in_sector = 0
    for acid, pts in by_cs.items():
        pts_in = [p for p in pts if p[6] == sector]
        if not pts_in:
            continue
        n_flights_in_sector += 1
        run_start = None
        run_prev_t = None
        for i in range(1, len(pts_in)):
            t0, _, _, alt0, *_ = pts_in[i - 1]
            t1, _, _, alt1, *_ = pts_in[i]
            dt = t1 - t0
            if dt < MIN_DT_S or dt > 30.0:
                run_start = None
                continue
            vs_fpm = (alt1 - alt0) / (dt / 60.0)
            in_band = lo_ft <= alt1 <= hi_ft
            level = abs(vs_fpm) <= LEVEL_VS_THRESH_FPM
            if in_band and level:
                if run_start is None:
                    run_start = t0
                run_prev_t = t1
            else:
                if run_start is not None and (run_prev_t - run_start) >= LEVEL_MIN_DUR_S:
                    n_level_segments += 1
                run_start = None
        if run_start is not None and run_prev_t is not None and (run_prev_t - run_start) >= LEVEL_MIN_DUR_S:
            n_level_segments += 1
    per_100 = (n_level_segments / n_flights_in_sector * 100.0) if n_flights_in_sector else 0.0
    return n_level_segments, n_flights_in_sector, round(per_100, 1)


def a5_cruise_check(by_cs, sector, candidate_fls, t_lo, t_hi):
    """Kiem tra thuc nghiem A5: muc FLxxx co duoc dung de bay bang LIEN TUC
    >=5 phut trong du lieu that khong (neu co nhieu, mau thuan voi gia dinh
    'khong phai muc bay bang')."""
    results = {}
    for fl in candidate_fls:
        target_ft = fl * 100.0
        n_long_level = 0
        for acid, pts in by_cs.items():
            pts_in = [p for p in pts if p[6] == sector]
            run_start = None
            run_prev_t = None
            for i in range(1, len(pts_in)):
                t0, _, _, alt0, *_ = pts_in[i - 1]
                t1, _, _, alt1, *_ = pts_in[i]
                dt = t1 - t0
                if dt < MIN_DT_S or dt > 30.0:
                    run_start = None
                    continue
                vs_fpm = (alt1 - alt0) / (dt / 60.0)
                near = abs(alt1 - target_ft) <= 150.0
                level = abs(vs_fpm) <= LEVEL_VS_THRESH_FPM
                if near and level:
                    if run_start is None:
                        run_start = t0
                    run_prev_t = t1
                else:
                    if run_start is not None and (run_prev_t - run_start) >= 300.0:
                        n_long_level += 1
                    run_start = None
            if run_start is not None and run_prev_t is not None and (run_prev_t - run_start) >= 300.0:
                n_long_level += 1
        results[f"FL{fl}"] = n_long_level
    return results


def main():
    print("Dang nap va nhom track theo callsign...")
    by_cs = load_tracks()
    all_t = [p[0] for pts in by_cs.values() for p in pts]
    t_lo, t_hi = min(all_t), max(all_t)
    print(f"Khung thoi gian: {datetime.fromtimestamp(t_lo, tz=timezone.utc)} -> "
          f"{datetime.fromtimestamp(t_hi, tz=timezone.utc)} ({(t_hi - t_lo) / 3600:.1f} gio)")
    print(f"So doan track (sau khi tach theo khoang trong > {TRK_SPLIT_GAP_S:.0f}s): {len(by_cs)}")

    report = {"meta": {
        "data_date": "2026-06-05",
        "window_utc": [datetime.fromtimestamp(t_lo, tz=timezone.utc).isoformat(),
                        datetime.fromtimestamp(t_hi, tz=timezone.utc).isoformat()],
        "n_track_segments": len(by_cs),
        "han_che": "Du lieu 1 ngay (05/06/2026), khong phai khung 15/4-15/5/2026 chinh thuc.",
    }}

    # --- Boi canh: PK1/PK3/PK4 tach co dinh tai FL285 (giong nhau ca 3 PA) ---
    fixed_split = {"PK1": FIXED["PK1"], "PK3": FIXED["PK3"], "PK4": FIXED["PK4"]}
    visits_fixed = build_visits(by_cs, fixed_split)
    context = {}
    for pk, pair in (("PK1", ("1L", "1U")), ("PK3", ("3L", "3U")), ("PK4", ("4L", "4U"))):
        context[pk] = kpi_for_sector_pair(visits_fixed, pair, t_lo, t_hi)
    report["context_pk1_pk3_pk4_fixed_fl285"] = context
    print("\n=== Boi canh: PK1L/1U, 3L/3U, 4L/4U (FL285 co dinh, nhu nhau o ca 3 PA) ===")
    print(json.dumps(context, ensure_ascii=False, indent=2))

    # --- Nhom A cho PK2 theo tung phuong an ---
    report["pa_results"] = {}
    for pa_name, split_fl in PA_SPLITS.items():
        if pa_name.startswith("_"):
            continue
        print(f"\n=== {pa_name}: PK2 tach tai FL{split_fl} ===")
        split_map = {"PK2": split_fl}
        visits = build_visits(by_cs, split_map)
        a1_a2 = kpi_for_sector_pair(visits, ("2L", "2U"), t_lo, t_hi)

        ratio_peak = (max(a1_a2["2L"]["peak_simultaneous"], a1_a2["2U"]["peak_simultaneous"])
                      / max(1, min(a1_a2["2L"]["peak_simultaneous"], a1_a2["2U"]["peak_simultaneous"])))
        ratio_entries = (max(a1_a2["2L"]["peak_entries_per_hour"], a1_a2["2U"]["peak_entries_per_hour"])
                          / max(1, min(a1_a2["2L"]["peak_entries_per_hour"], a1_a2["2U"]["peak_entries_per_hour"])))

        n_handoff, handoff_examples = handoffs_between(visits, "2L", "2U")
        n_level, n_flights, level_per_100 = level_off_near_split(by_cs, "PK2", split_fl, t_lo, t_hi)

        result = {
            "split_fl": split_fl,
            "A1_workload_balance": {
                "2L": {k: a1_a2["2L"][k] for k in ("peak_simultaneous", "mean_simultaneous",
                                                     "peak_entries_per_hour", "mean_entries_per_hour")},
                "2U": {k: a1_a2["2U"][k] for k in ("peak_simultaneous", "mean_simultaneous",
                                                     "peak_entries_per_hour", "mean_entries_per_hour")},
                "ratio_peak_simultaneous_max_min": round(ratio_peak, 2),
                "ratio_peak_entries_max_min": round(ratio_entries, 2),
                "threshold": RULES["kpi_group_a_thresholds"]["A1_max_min_ratio"],
                "dat": ratio_peak <= RULES["kpi_group_a_thresholds"]["A1_max_min_ratio"]
                       and ratio_entries <= RULES["kpi_group_a_thresholds"]["A1_max_min_ratio"],
            },
            "A2_time_in_layer": {
                "2L": a1_a2["2L"]["dwell"],
                "2U": a1_a2["2U"]["dwell"],
                "dat_mean": (a1_a2["2L"]["dwell"]["mean_s"] >= RULES["kpi_group_a_thresholds"]["A2_mean_dwell_min_s"]
                             and a1_a2["2U"]["dwell"]["mean_s"] >= RULES["kpi_group_a_thresholds"]["A2_mean_dwell_min_s"]),
                "dat_pct_under_3min": (a1_a2["2L"]["dwell"]["pct_under_3min"] <= RULES["kpi_group_a_thresholds"]["A2_pct_under_3min_max"]
                                       and a1_a2["2U"]["dwell"]["pct_under_3min"] <= RULES["kpi_group_a_thresholds"]["A2_pct_under_3min_max"]),
            },
            "A3_additional_handoffs_2L_2U": {
                "total_per_day": n_handoff,
                "examples": [
                    {"acid": e[0], "tu": e[1], "sang": e[2]} for e in handoff_examples
                ],
            },
            "A4_level_off_near_split": {
                "n_level_segments": n_level,
                "n_flights_crossing_pk2": n_flights,
                "per_100_flights": level_per_100,
            },
        }
        report["pa_results"][pa_name] = result
        print(json.dumps(result, ensure_ascii=False, indent=2))

    # --- A5: kiem tra thuc nghiem cac muc FL co phai muc bay bang dai han ---
    print("\n=== A5 (kiem tra thuc nghiem): so doan bay bang >=5 phut tai moi muc, trong PK2 ===")
    a5 = a5_cruise_check(by_cs, "PK2", [245, 265, 285, 305], t_lo, t_hi)
    print(json.dumps(a5, ensure_ascii=False, indent=2))
    report["A5_cruise_level_check_pk2"] = a5

    out_path = HERE / "kpi_group_a_result.json"
    json.dump(report, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\nDa ghi {out_path}")


if __name__ == "__main__":
    main()
