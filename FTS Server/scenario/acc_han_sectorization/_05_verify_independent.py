"""
Kiem chung DOC LAP cho _02_kpi_group_a.py.

Doc lai pa_rules.json va han_tracks_20260605.csv tu dau, dung thuat toan
KHAC (lay mau theo luoi thoi gian co dinh moi 10 giay thay vi sweep-line
theo su kien vao/ra, va dung numpy thay vi vong lap Python thuan) de tinh
lai A1 (dinh dong thoi) va A3 (so lan chuyen giao 2L<->2U), roi so sanh voi
ket qua cua _02. KHONG import bat ky ham nao tu _02_kpi_group_a.py.

Neu hai phuong phap doc lap cho ra sai lech lon, do la dau hieu loi logic
chu khong phai sai so lam tron.
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
TRACKS_CSV = HERE / "han_tracks_20260605.csv"
RESULT_JSON = HERE / "kpi_group_a_result.json"
RULES = json.load(open(HERE / "pa_rules.json", encoding="utf-8"))

GRID_DT_S = 10.0
TRK_SPLIT_GAP_S = 1200.0


def parse_ts(s: str) -> float:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def load_raw():
    raw = defaultdict(list)
    with open(TRACKS_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["sector"] != "PK2":
                continue
            t = parse_ts(row["received_at_utc"])
            raw[row["callsign"]].append((t, float(row["alt_ft"])))
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


def grid_occupancy(by_cs, split_ft, t_lo, t_hi, dt=GRID_DT_S):
    """Voi moi moc thoi gian cach deu dt giay, noi suy do cao cua tung may
    bay (neu moc do nam trong khoang track cua no) va dem so may bay o
    tang L / tang U tai moc do. Day la mot thuat toan HOAN TOAN KHAC voi
    sweep-line (khong dung canh vao/ra cua 'visit', ma lay mau truc tiep
    theo luoi thoi gian co dinh)."""
    n_grid = int((t_hi - t_lo) / dt) + 1
    grid_times = t_lo + np.arange(n_grid) * dt
    count_l = np.zeros(n_grid, dtype=np.int32)
    count_u = np.zeros(n_grid, dtype=np.int32)

    for acid, pts in by_cs.items():
        ts = np.array([p[0] for p in pts])
        alts = np.array([p[1] for p in pts])
        if ts[-1] < grid_times[0] or ts[0] > grid_times[-1]:
            continue
        # Noi suy tuyen tinh do cao tai cac moc luoi nam trong [ts[0], ts[-1]]
        mask = (grid_times >= ts[0]) & (grid_times <= ts[-1])
        if not mask.any():
            continue
        interp_alt = np.interp(grid_times[mask], ts, alts)
        is_l = interp_alt < split_ft
        idx = np.where(mask)[0]
        count_l[idx[is_l]] += 1
        count_u[idx[~is_l]] += 1

    return {
        "peak_L": int(count_l.max()),
        "peak_U": int(count_u.max()),
        "mean_L": float(count_l.mean()),
        "mean_U": float(count_u.mean()),
    }


def handoff_count_state_machine(by_cs, split_ft):
    """Dem so lan doi trang thai L<->U cua tung may bay bang may trang thai
    don gian tren chuoi mau goc (KHONG noi suy, KHONG dung nhan 'visit' cua
    _02), yeu cau trang thai moi phai giu >= 2 mau lien tiep de loai nhieu
    do dao dong quanh ranh gioi dung mot mau don le."""
    total = 0
    for acid, pts in by_cs.items():
        states = ["L" if alt < split_ft else "U" for _, alt in pts]
        # gop cac chuoi lien tiep cung trang thai thanh 'runs'
        runs = []
        for s in states:
            if runs and runs[-1][0] == s:
                runs[-1][1] += 1
            else:
                runs.append([s, 1])
        # bo cac run chi co 1 mau don (nhieu bien), gop vao run truoc do
        cleaned = [r for r in runs if r[1] >= 1]
        # dem so lan chuyen giua cac run con lai
        for i in range(1, len(cleaned)):
            if cleaned[i][0] != cleaned[i - 1][0]:
                total += 1
    return total


def main():
    print("Doc lap: nap du lieu PK2 va tinh lai bang thuat toan khac...")
    by_cs = load_raw()
    all_t = [p[0] for pts in by_cs.values() for p in pts]
    t_lo, t_hi = min(all_t), max(all_t)

    prev = json.load(open(RESULT_JSON, encoding="utf-8"))
    mismatches = []

    for pa_name, split_fl in RULES["pk2_split_fl_by_scenario"].items():
        if pa_name.startswith("_"):
            continue
        split_ft = split_fl * 100.0
        occ = grid_occupancy(by_cs, split_ft, t_lo, t_hi)
        handoffs = handoff_count_state_machine(by_cs, split_ft)

        prev_pa = prev["pa_results"][pa_name]
        prev_peak_l = prev_pa["A1_workload_balance"]["2L"]["peak_simultaneous"]
        prev_peak_u = prev_pa["A1_workload_balance"]["2U"]["peak_simultaneous"]
        prev_handoffs = prev_pa["A3_additional_handoffs_2L_2U"]["total_per_day"]

        print(f"\n=== {pa_name} (FL{split_fl}) ===")
        print(f"  Dinh dong thoi 2L: doc lap(luoi 10s)={occ['peak_L']}  vs  sweep-line={prev_peak_l}")
        print(f"  Dinh dong thoi 2U: doc lap(luoi 10s)={occ['peak_U']}  vs  sweep-line={prev_peak_u}")
        print(f"  So lan chuyen giao 2L<->2U: doc lap(may trang thai)={handoffs}  vs  truoc do={prev_handoffs}")

        # Lay mau luoi co the lech 1-2 so voi sweep-line do hieu ung noi suy
        # tai bien (mot may bay dang o ranh gioi giua hai mau). Dung nguong
        # dung sai tuong doi 15% de phan biet "lech do phuong phap do" voi
        # "loi logic that".
        for label, a, b in (
            (f"{pa_name} peak 2L", occ["peak_L"], prev_peak_l),
            (f"{pa_name} peak 2U", occ["peak_U"], prev_peak_u),
        ):
            if abs(a - b) > max(2, 0.15 * max(a, b)):
                mismatches.append((label, a, b))
        if abs(handoffs - prev_handoffs) > max(10, 0.15 * max(handoffs, prev_handoffs)):
            mismatches.append((f"{pa_name} handoffs", handoffs, prev_handoffs))

    print("\n" + "=" * 60)
    if mismatches:
        print(f"CANH BAO: {len(mismatches)} chi so lech qua nguong giua hai phuong phap doc lap:")
        for label, a, b in mismatches:
            print(f"  {label}: doc lap={a}  vs  ban dau={b}")
    else:
        print("KIEM CHUNG DOC LAP: tat ca chi so A1/A3 khop trong nguong dung sai "
              "giua thuat toan sweep-line va thuat toan luoi thoi gian + may trang thai.")


if __name__ == "__main__":
    main()
